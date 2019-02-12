---
title: AQS之condition与中断
date: 2018-07-26 23:45:25
tags:
categories: 并发
---

### condition用于生产者-消费者

我们常用 obj.wait()，obj.notify() 或 obj.notifyAll() 来实现生产者-消费者， 不过它们是基于对象监视器锁的。

condition基于ReentrantLock实现了该模式(ArrayBlockingQueue也是采用这个方式)，例子:
``` 
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantLock;

class BoundedBuffer {
    final Lock lock = new ReentrantLock();
    // condition 依赖于 lock 来产生
    final Condition notFull = lock.newCondition();
    final Condition notEmpty = lock.newCondition();

    final Object[] items = new Object[100];
    int putptr, takeptr, count;

    // 生产
    public void put(Object x) throws InterruptedException {
        lock.lock();
        try {
            while (count == items.length)
                notFull.await();  // 队列已满，等待，直到 not full 才能继续生产
            items[putptr] = x;
            if (++putptr == items.length) putptr = 0;
            ++count;
            notEmpty.signal(); // 生产成功，队列已经 not empty 了，发个通知出去
        } finally {
            lock.unlock();
        }
    }

    // 消费
    public Object take() throws InterruptedException {
        lock.lock();
        try {
            while (count == 0)
                notEmpty.await(); // 队列为空，等待，直到队列 not empty，才能继续消费
            Object x = items[takeptr];
            if (++takeptr == items.length) takeptr = 0;
            --count;
            notFull.signal(); // 被我消费掉一个，队列 not full 了，发个通知出去
            return x;
        } finally {
            lock.unlock();
        }
    }
}
```
condition 是依赖于 ReentrantLock 的，不管是调用 await 进入等待还是 signal 唤醒，都必须获取到锁才能进行操作。每个 ReentrantLock 实例可以通过调用多次 newCondition 产生多个 ConditionObject 的实例：
``` 
final ConditionObject newCondition() {
    return new ConditionObject();
}
```
`ConditionObject` 是 `Condition` 的实现类，在 `AbstractQueuedSynchronizer` 类中:
``` 
public class ConditionObject implements Condition, java.io.Serializable {
        private static final long serialVersionUID = 1173984872572414699L;
        // 条件队列的第一个节点
          // 不要管这里的关键字 transient，是不参与序列化的意思
        private transient Node firstWaiter;
        // 条件队列的最后一个节点
        private transient Node lastWaiter;
```

### 条件队列

AQS中使用了阻塞队列来等待锁， 这里还有另一个概念： 条件队列（condition queue）。如：
![](/images/aqs/aqs2-2.png)

这里需要知道几点:
1. 一个 ReentrantLock 实例可以通过多次调用 newCondition() 来产生多个 Condition 实例，这里对应 condition1 和 condition2。注意，ConditionObject 只有两个属性 firstWaiter 和 lastWaiter；
2. 每个 condition 有一个关联的条件队列，如线程 1 调用 condition1.await() 方法即可将当前线程 1 包装成 Node 后加入到条件队列中，然后阻塞在这里，不继续往下执行，条件队列是一个单向链表
3. 调用 condition1.signal() 会将condition1 对应的条件队列的 firstWaiter 移到阻塞队列的队尾，等待获取锁，获取锁后 await 方法返回，继续往下执行

#### await方法
``` 
// 首先，这个方法是可被中断的，不可被中断的是另一个方法 awaitUninterruptibly()
// 这个方法会阻塞，直到调用 signal 方法（指 signal() 和 signalAll()，下同），或被中断
public final void await() throws InterruptedException {
    if (Thread.interrupted())
        throw new InterruptedException();
    // 添加到 condition 的条件队列中
    Node node = addConditionWaiter();
    // 释放锁，返回值是释放锁之前的 state 值
    int savedState = fullyRelease(node);
    int interruptMode = 0;
    // 这里退出循环有两种情况，之后再仔细分析
    // 1. isOnSyncQueue(node) 返回 true，即当前 node 已经转移到阻塞队列了
    // 2. checkInterruptWhileWaiting(node) != 0 会到 break，然后退出循环，代表的是线程中断
    while (!isOnSyncQueue(node)) {
        LockSupport.park(this);
        if ((interruptMode = checkInterruptWhileWaiting(node)) != 0)
            break;
    }
    // 被唤醒后，将进入阻塞队列，等待获取锁
    if (acquireQueued(node, savedState) && interruptMode != THROW_IE)
        interruptMode = REINTERRUPT;
    if (node.nextWaiter != null) // clean up if cancelled
        unlinkCancelledWaiters();
    if (interruptMode != 0)
        reportInterruptAfterWait(interruptMode);
}
```

#### addConditionWaiter-将节点加入到条件队列

addConditionWaiter() 是将当前节点加入到条件队列
``` 
// 将当前线程对应的节点入队，插入队尾
private Node addConditionWaiter() {
    Node t = lastWaiter;
    // 如果条件队列的最后一个节点取消了，将其清除出去
    if (t != null && t.waitStatus != Node.CONDITION) {
        // 这个方法会遍历整个条件队列，然后会将已取消的所有节点清除出队列
        unlinkCancelledWaiters();
        t = lastWaiter;
    }
    Node node = new Node(Thread.currentThread(), Node.CONDITION);
    // 如果队列为空
    if (t == null)
        firstWaiter = node;
    else
        t.nextWaiter = node;
    lastWaiter = node;
    return node;
}
```
在addWaiter 方法中，有一个 unlinkCancelledWaiters() 方法，该方法用于清除队列中已经取消等待的节点。

当 await 的时候如果发生了取消操作，或者是在节点入队的时候，发现最后一个节点是被取消的，会调用一次这个方法：
``` 
// 等待队列是一个单向链表，遍历链表将已经取消等待的节点清除出去
// 纯属链表操作，很好理解，看不懂多看几遍就可以了
private void unlinkCancelledWaiters() {
    Node t = firstWaiter;
    Node trail = null;
    while (t != null) {
        Node next = t.nextWaiter;
        // 如果节点的状态不是 Node.CONDITION 的话，这个节点就是被取消的
        if (t.waitStatus != Node.CONDITION) {
            t.nextWaiter = null;
            if (trail == null)
                firstWaiter = next;
            else
                trail.nextWaiter = next;
            if (next == null)
                lastWaiter = trail;
        }
        else
            trail = t;
        t = next;
    }
}
```

#### fullyRelease-完全释放独占锁

回到 wait 方法，节点入队了以后，会调用 `int savedState = fullyRelease(node);` 方法释放锁，注意，这里是完全释放独占锁，因为 ReentrantLock 是可以重入的
``` 
// 首先，我们要先观察到返回值 savedState 代表 release 之前的 state 值
// 对于最简单的操作：先 lock.lock()，然后 condition1.await()。
//         那么 state 经过这个方法由 1 变为 0，锁释放，此方法返回 1
//         相应的，如果 lock 重入了 n 次，savedState == n
// 如果这个方法失败，会将节点设置为"取消"状态，并抛出异常 IllegalMonitorStateException
final int fullyRelease(Node node) {
    boolean failed = true;
    try {
        int savedState = getState();
        // 这里使用了当前的 state 作为 release 的参数，也就是完全释放掉锁，将 state 置为 0
        if (release(savedState)) {
            failed = false;
            return savedState;
        } else {
            throw new IllegalMonitorStateException();
        }
    } finally {
        if (failed)
            node.waitStatus = Node.CANCELLED;
    }
}
```

#### 等待进入阻塞队列
释放掉锁以后，接下来是这段，这边会自旋，如果发现自己还没到阻塞队列，那么挂起，等待被转移到阻塞队列：
``` 
int interruptMode = 0;
while (!isOnSyncQueue(node)) {
    // 线程挂起
    LockSupport.park(this);

    if ((interruptMode = checkInterruptWhileWaiting(node)) != 0)
        break;
}
```
isOnSyncQueue(Node node) 用于判断节点是否已经转移到阻塞队列了：
``` 
// 在节点入条件队列的时候，初始化时设置了 waitStatus = Node.CONDITION
// 前面我提到，signal 的时候需要将节点从条件队列移到阻塞队列，
// 这个方法就是判断 node 是否已经移动到阻塞队列了
final boolean isOnSyncQueue(Node node) {
    // 移动过去的时候，node 的 waitStatus 会置为 0，这个之后在说 signal 方法的时候会说到
    // 如果 waitStatus 还是 Node.CONDITION，也就是 -2，那肯定就是还在条件队列中
    // 如果 node 的前驱 prev 指向还是 null，说明肯定没有在 阻塞队列
    if (node.waitStatus == Node.CONDITION || node.prev == null)
        return false;
    // 如果 node 已经有后继节点 next 的时候，那肯定是在阻塞队列了
    if (node.next != null) 
        return true;

    // 这个方法从阻塞队列的队尾开始从后往前遍历找，如果找到相等的，说明在阻塞队列，否则就是不在阻塞队列

    // 可以通过判断 node.prev() != null 来推断出 node 在阻塞队列吗？答案是：不能。
    // 这个可以看上篇 AQS 的入队方法，首先设置的是 node.prev 指向 tail，
    // 然后是 CAS 操作将自己设置为新的 tail，可是这次的 CAS 是可能失败的。

    // 调用这个方法的时候，往往我们需要的就在队尾的部分，所以一般都不需要完全遍历整个队列的
    return findNodeFromTail(node);
}

// 从同步队列的队尾往前遍历，如果找到，返回 true
private boolean findNodeFromTail(Node node) {
    Node t = tail;
    for (;;) {
        if (t == node)
            return true;
        if (t == null)
            return false;
        t = t.prev;
    }
}
```
回到前面的循环，isOnSyncQueue(node) 返回 false 的话，那么进到 LockSupport.park(this); 这里线程挂起。

### 参考资料

- [AQS简介](http://cmsblogs.com/?p=2174)
- [java并发包的基石](https://www.cnblogs.com/chengxiao/p/7141160.html)
- [java AQS的实现原理](https://www.jianshu.com/p/279baac48960)
- [同步状态的获取和释放](http://cmsblogs.com/?p=2197)
- [阻塞和唤醒线程](http://cmsblogs.com/?p=2205)
- [java并发之AQS详解](https://www.cnblogs.com/waterystone/p/4920797.html)
- [LockSupport详解](https://leokongwq.github.io/2017/01/13/java-LockSupport.html)
- [java队列同步器AQS](https://blog.csdn.net/pange1991/article/details/80930394)
- [一行一行源码分析AQS二](https://javadoop.com/post/AbstractQueuedSynchronizer-2)