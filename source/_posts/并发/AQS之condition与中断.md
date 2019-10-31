---
title: AQS之condition与中断
date: 2019-07-26 23:45:25
tags:
categories: 并发
---

### condition用于生产者-消费者

我们常用 obj.wait()，obj.notify() 或 obj.notifyAll() 来实现生产者-消费者， 不过它们是基于对象监视器锁的。

condition基于ReentrantLock实现了该模式(ArrayBlockingQueue也是采用这个方式)，例子:

```java
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
            items[putptr] = x; // 生产一个
            if (++putptr == items.length) putptr = 0; // 如果已经到了数组的尾部，则从头开始(循环数组)
            ++count; // 总量加1， 生产成功
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
            Object x = items[takeptr]; // 消费一个
            if (++takeptr == items.length) takeptr = 0; // 同样是循环数组
            --count; // 总量减1 消费成功
            notFull.signal(); // 消费掉一个，队列 not full 了，发个通知出去
            return x;
        } finally {
            lock.unlock();
        }
    }
}
```
condition 是依赖于 ReentrantLock 的，不管是调用 `await` 进入等待还是 `signal` 唤醒，都必须获取到锁才能进行操作。每个 ReentrantLock 实例可以通过调用多次 newCondition 产生多个 `ConditionObject` 的实例。


`ConditionObject` 是 `Condition` 的实现类，在 `AbstractQueuedSynchronizer` 类中:
```java
public class ConditionObject implements Condition, java.io.Serializable {
        private static final long serialVersionUID = 1173984872572414699L;
        // 条件队列的第一个节点
          // 不要管这里的关键字 transient，是不参与序列化的意思
        private transient Node firstWaiter;
        // 条件队列的最后一个节点
        private transient Node lastWaiter;
        // ......
}
```

### 条件队列

AQS中使用了阻塞队列来等待锁， 这里还有另一个概念： 条件队列（condition queue）。如：
![](/images/aqs/aqs2-2.png)

在AQS中Node的属性有:
``` 
volatile int waitStatus; // 可取值 0、CANCELLED(1)、SIGNAL(-1)、CONDITION(-2)、PROPAGATE(-3)
volatile Node prev;
volatile Node next;
volatile Thread thread;
Node nextWaiter;
```
其中`prev`和`next`用来实现阻塞队列的双向链表， `nextWaiter`用来实现条件队列的单向链表

结合图片, 流程如下:

1. 条件队列和阻塞队列的节点，都是 Node 的实例，因为条件队列的节点是需要转移到阻塞队列中去的

2. 一个 ReentrantLock 实例可以通过多次调用 `newCondition()` 来产生多个 Condition 实例，这里对应 condition1 和 condition2。注意，ConditionObject 只有两个属性 `firstWaiter`(条件队列第一个节点) 和 `lastWaiter`(条件队列最后一个节点)；

3. 每个 condition 有一个关联的条件队列，如线程 1 调用 `condition1.await()` 方法即可将当前线程 1 包装成 Node 后加入到条件队列中，然后阻塞在这里，不继续往下执行，条件队列是一个单向链表

3. 调用 `condition1.signal()` 会将 condition1 对应的条件队列的 firstWaiter 移到阻塞队列的队尾，等待获取锁，获取锁后 await 方法返回，继续往下执行


#### await方法

```java
// 这个方法会阻塞，直到调用 signal 方法（指 signal() 和 signalAll() ），或被中断
public final void await() throws InterruptedException {
    // 这个方法是可中断的，一开始就会判断中断状态
    if (Thread.interrupted())
        throw new InterruptedException();
    
    // 添加到 condition 的条件队列中
    Node node = addConditionWaiter();
    
    // 释放锁，返回值是释放锁之前的 state 值
    int savedState = fullyRelease(node);
    int interruptMode = 0;
    
    // 这里退出循环有两种情况
    // 1. isOnSyncQueue(node) 返回 true，即当前 node 已经转移到阻塞队列了
    // 2. checkInterruptWhileWaiting(node) != 0 会到 break，然后退出循环，代表的是线程中断
    while (!isOnSyncQueue(node)) {
        // 如果不在阻塞队列中，线程挂起等待在这里
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

##### addConditionWaiter-将节点加入到条件队列(condition queue)

addConditionWaiter() 是将当前节点加入到条件队列
```java
// 将当前线程对应的节点入队，插入队尾
private Node addConditionWaiter() {
    Node t = lastWaiter;
    // 如果条件队列的最后一个节点取消了，将其清除出去
    // 这里的判断条件是不为 CONDITION 即代表取消排队
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

`unlinkCancelledWaiters()` 方法用于清除队列中已经取消等待的节点。当 await 的时候如果发生了取消操作，或者是在节点入队的时候，发现最后一个节点是被取消的，会调用一次这个方法：
```java
// 等待队列是一个单向链表，遍历链表将已经取消等待的节点清除出去
// 纯属链表操作，很好理解，看不懂多看几遍就可以了
private void unlinkCancelledWaiters() {
    Node t = firstWaiter;
    // 保存上个节点
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

##### fullyRelease-完全释放独占锁

节点入队了以后，会调用 `int savedState = fullyRelease(node);` 方法释放锁，注意，这里是完全释放独占锁，因为 ReentrantLock 是可以重入的, 所以 state 的值是可能大于1的
```java
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
        // 如果线程在不持有锁的情况下调用， release这里是会抛出异常的， release释放锁有如下判断:
        //    if (Thread.currentThread() != getExclusiveOwnerThread())
        //                throw new IllegalMonitorStateException();
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

##### 等待进入阻塞队列(自旋等待)

释放掉锁以后，接下来会自旋，如果发现自己还没到阻塞队列，那么挂起，等待被转移到阻塞队列：

```java
int interruptMode = 0;
// 如果不在阻塞队列中了
while (!isOnSyncQueue(node)) {
    // 线程挂起
    LockSupport.park(this);
    if ((interruptMode = checkInterruptWhileWaiting(node)) != 0)
        break;
}
```

`isOnSyncQueue(Node node)` 用于判断节点是否已经转移到阻塞队列了：

```java
// 在节点入条件队列的时候，初始化时设置了 waitStatus = Node.CONDITION
// 前面提到，signal 的时候需要将节点从条件队列移到阻塞队列，
// 这个方法就是判断 node 是否已经移动到阻塞队列了
final boolean isOnSyncQueue(Node node) {
    // 移动过去的时候，node 的 waitStatus 会置为 0，这个之后在说 signal 方法的时候会说到
    // 如果 waitStatus 还是 Node.CONDITION，也就是 -2，那肯定就是还在条件队列中
    // 如果 node 的前驱 prev 指向还是 null，说明肯定没有在阻塞队列(prev属性是阻塞队列中使用到的)
    // 这里解释一下，阻塞队列是双向链表所以 prev 不为 null
    if (node.waitStatus == Node.CONDITION || node.prev == null)
        return false;
    // 如果 node 已经有后继节点 next 的时候，那肯定是在阻塞队列了
    // 同样 next 属性也是阻塞队列用到的
    if (node.next != null) 
        return true;

    // 这个方法从阻塞队列的队尾开始从后往前遍历找，如果找到相等的，说明在阻塞队列，否则就是不在阻塞队列
    // 可以通过判断 node.prev() != null 来推断出 node 在阻塞队列吗？答案是：不能。
    // 在 AQS 的入队方法，首先设置的是 node.prev 指向 tail，
    // 然后是 CAS 操作将自己设置为新的 tail，可是这次的 CAS 是可能失败的。
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

回到前面的循环，`isOnSyncQueue(node)` 返回 false 的话，那么进到 LockSupport.park(this); 这里线程挂起。

#### signal 唤醒线程，转移阻塞队列

在`await`中，使用 `LockSupport.park(this)`将线程挂起了，等待唤醒

唤醒操作通常由另一个线程来操作，就像生产者-消费者模式中，如果线程因为等待消费而挂起，那么当生产者生产了一个东西后，会调用 signal 唤醒正在等待的线程来消费

```java
// 唤醒等待了最久的线程
// 其实就是，将这个线程对应的 node 从条件队列转移到阻塞队列
public final void signal() {
    // 调用 signal 方法的线程必须持有当前的独占锁
    if (!isHeldExclusively())
        throw new IllegalMonitorStateException();
    Node first = firstWaiter;
    if (first != null)
        doSignal(first);
}

// 从条件队列队头往后遍历，找出第一个需要转移的 node
// 因为前面我们说过，有些线程会取消排队，但是还在队列中
private void doSignal(Node first) {
    do {
        // 将 firstWaiter 指向 first 节点后面的第一个
        // 如果将队头移除后，后面没有节点在等待了，那么需要将 lastWaiter 置为 null
        if ( (firstWaiter = first.nextWaiter) == null)
            lastWaiter = null;
        // 因为 first 马上要被移到阻塞队列了，和条件队列的链接关系在这里断掉
        first.nextWaiter = null;
    } while (!transferForSignal(first) &&
             (first = firstWaiter) != null);
      // 这里 while 循环，如果 first 转移不成功，那么选择 first 后面的第一个节点进行转移，依此类推
}


// 将节点从条件队列转移到阻塞队列
// true 代表成功转移
// false 代表在 signal 之前，节点已经取消了
final boolean transferForSignal(Node node) {
    // CAS 如果失败，说明此 node 的 waitStatus 已不是 Node.CONDITION，说明节点已经取消，
    // 既然已经取消，也就不需要转移了，方法返回，转移后面一个节点
    // 否则，将 waitStatus 置为 0
    if (!compareAndSetWaitStatus(node, Node.CONDITION, 0))
        return false;

    // enq(node): 自旋进入阻塞队列的队尾
    // 注意，这里的返回值 p 是 node 在阻塞队列的前驱节点
    Node p = enq(node);
    int ws = p.waitStatus;
    // ws > 0 说明 node 在阻塞队列中的前驱节点取消了等待锁，直接唤醒 node 对应的线程。
    // 唤醒之后会怎么样，后面再解释
    // 如果 ws <= 0, 那么 compareAndSetWaitStatus 将会被调用，
    // AQS 篇介绍的时候说过，节点入队后，需要把前驱节点的状态设为 Node.SIGNAL(-1)
    if (ws > 0 || !compareAndSetWaitStatus(p, ws, Node.SIGNAL))
        // 如果前驱节点取消或者 CAS 失败，会进到这里唤醒线程
        LockSupport.unpark(node.thread);
    return true;
}
```
正常情况下，`ws > 0 || !compareAndSetWaitStatus(p, ws, Node.SIGNAL)` 这里应该 ws <= 0，而且 compareAndSetWaitStatus(p, ws, Node.SIGNAL) 会返回 true，所以一般也不会进去 if 语句块中唤醒 node 对应的线程。然后这个方法返回 true，也就意味着 signal 方法结束了，节点进入了阻塞队列。

假设发生了阻塞队列中的前驱节点取消等待，或者 CAS 失败，只要唤醒线程，让其进到下一步即可。

#### signal唤醒后，await检查中断状态

上一步 signal 之后，我们的线程由条件队列转移到了阻塞队列，之后就准备获取锁了(阻塞队列执行完毕就会唤醒排队的node)。只要重新获取到锁了以后，继续往下看 await 执行。

等线程从挂起中恢复过来, 返回 await中:
```java
int interruptMode = 0;
while (!isOnSyncQueue(node)) {
    // 线程挂起
    LockSupport.park(this);

    if ((interruptMode = checkInterruptWhileWaiting(node)) != 0)
        break;
}
```
interruptMode 可以取值为 REINTERRUPT（1），THROW_IE（-1），0 ：
- REINTERRUPT： 代表 await 返回的时候，需要重新设置中断状态
- THROW_IE： 代表 await 返回的时候，需要抛出 InterruptedException 异常
- 0 ：说明在 await 期间，没有发生中断

有以下三种情况会让 `LockSupport.park(this)` 这句返回继续往下执行：
1. 常规路劲。signal -> 转移节点到阻塞队列 -> 获取了锁（unpark）
2. 线程中断。在 park 的时候，另外一个线程对这个线程进行了中断
3. signal 的时候我们说过，转移以后的前驱节点取消了，或者对前驱节点的CAS操作失败了


线程唤醒后第一步是调用 checkInterruptWhileWaiting(node) 这个方法，此方法用于判断是否在线程挂起期间发生了中断，如果发生了中断，是 signal 调用之前中断的，还是 signal 之后发生的中断:
```java
// 1. 如果在 signal 之前已经中断，返回 THROW_IE
// 2. 如果是 signal 之后中断，返回 REINTERRUPT
// 3. 没有发生中断，返回 0
private int checkInterruptWhileWaiting(Node node) {
    return Thread.interrupted() ?
        (transferAfterCancelledWait(node) ? THROW_IE : REINTERRUPT) :
        0;
}
```

这里Thread.interrupted()：如果当前线程已经处于中断状态，那么该方法返回 true，同时将中断状态重置为 false，所以，才有后续的 重新中断（REINTERRUPT） 的使用

如果发生中断则判断是 signal 之前还是之后发生的中断：
```java
// 只有线程处于中断状态，才会调用此方法
// 如果需要的话，将这个已经取消等待的节点转移到阻塞队列
// 返回 true：如果此线程在 signal 之前被取消，
final boolean transferAfterCancelledWait(Node node) {
    // 用 CAS 将节点状态设置为 0 
    // 如果这步 CAS 成功，说明是 signal 方法之前发生的中断，因为如果 signal 先发生的话，signal 中会将 waitStatus 设置为 0
    if (compareAndSetWaitStatus(node, Node.CONDITION, 0)) {
        // 将节点放入阻塞队列
        // 这里我们看到，即使中断了，依然会转移到阻塞队列
        enq(node);
        return true;
    }

    // 到这里是因为 CAS 失败，肯定是因为 signal 方法已经将 waitStatus 设置为了 0
    // signal 方法会将节点转移到阻塞队列，但是可能还没完成，这边自旋等待其完成
    // 当然，这种事情还是比较少的吧：signal 调用之后，没完成转移之前，发生了中断
    while (!isOnSyncQueue(node))
        Thread.yield();
    return false;
}
```

到这里就可以看出，整个 while 循环的退出条件:
1. 发生中断， 将节点放入阻塞队列返回false， 退出 while
2. signal 已经将节点转移到了阻塞队列

##### 获取独占锁

while 循环出来以后，下面是这段代码：
```java
if (acquireQueued(node, savedState) && interruptMode != THROW_IE)
    interruptMode = REINTERRUPT;
```
由于 while 出来后，我们确定节点已经进入了阻塞队列，准备获取锁。

这里的 acquireQueued(node, savedState) 的第一个参数 node 之前已经经过 enq(node) 进入了队列，参数 savedState 是之前释放锁前的 state，这个方法返回的时候，代表当前线程获取了锁，而且 state == savedState了。

并且根据前面的逻辑，不管有没有发生中断，都会进入到阻塞队列，而 acquireQueued(node, savedState) 的返回值就是代表线程是否被中断。如果返回 true，说明被中断了，而且 interruptMode != 
THROW_IE，说明在 signal 之前就发生中断了，这里将 interruptMode 设置为 REINTERRUPT，用于待会重新中断。

下面:
``` 
if (node.nextWaiter != null) // clean up if cancelled
    unlinkCancelledWaiters();
if (interruptMode != 0)
    reportInterruptAfterWait(interruptMode);
```
之前说过，如果有节点取消，也会调用 unlinkCancelledWaiters 这个方法，就是这里了。

##### 处理中断状态(interruptMode)

在这里已经可以看出 interruptMode 的作用：
- 0： 什么都不做，没有被中断过
- THROW_IE(-1)： await 方法抛出 InterruptedException 异常，因为它代表在 await() 期间发生了中断
- REINTERRUPT(1)：新中断当前线程，因为它代表 await() 期间没有被中断，而是 signal() 以后发生的中断

```java
private void reportInterruptAfterWait(int interruptMode)
    throws InterruptedException {
    if (interruptMode == THROW_IE)
        throw new InterruptedException();
    else if (interruptMode == REINTERRUPT)
        selfInterrupt();
}
```

### AQS 取消排队

#### 独占锁取消排队

可以使用中断取消对锁的竞争，回到`acquireQueued`中:
```java
final boolean acquireQueued(final Node node, int arg) {
    boolean failed = true;
    try {
        boolean interrupted = false;
        for (;;) {
            final Node p = node.predecessor();
            if (p == head && tryAcquire(arg)) {
                setHead(node);
                p.next = null; // help GC
                failed = false;
                return interrupted;
            }
            if (shouldParkAfterFailedAcquire(p, node) &&
                parkAndCheckInterrupt())
                interrupted = true;
        }
    } finally {
        if (failed)
            cancelAcquire(node);
    }
}

// =============== 在看看parkAndCheckInterrupt
private final boolean parkAndCheckInterrupt() {
    LockSupport.park(this);
    return Thread.interrupted();
}
```

可以看到如果我们要取消一个线程的排队，我们需要在另外一个线程中对其进行中断。比如某线程调用 lock() 长时间不返回，我想中断它。一旦对其进行中断，此线程会从 LockSupport.park(this); 中唤醒，然后 Thread.interrupted(); 返回 true。

但是即使中断唤醒了这个线程，也仅仅是设置了 ` interrupted = true` 一个状态标记， 而且，由于 `Thread.interrupted(); 会清除中断状态(重置中断状态为false)`，第二次进 parkAndCheckInterrupt 的时候，返回会是 false。

所以 lock() 处理中断的方法就是，你中断归中断，我抢锁还是照样抢锁，几乎没关系，只是我抢到锁了以后，设置线程的中断状态而已，也不抛出任何异常出来。调用者获取锁后，可以去检查是否发生过中断，也可以不理会




#### ReentrantLock带中断的lock

ReentrantLock 可以lock并抛出`InterruptedException`:
```java
public void lockInterruptibly() throws InterruptedException {
    sync.acquireInterruptibly(1);
}

public final void acquireInterruptibly(int arg)
        throws InterruptedException {
    // 如果线程中断，直接抛出中断异常
    if (Thread.interrupted())
        throw new InterruptedException();
    if (!tryAcquire(arg))
        doAcquireInterruptibly(arg);
}

// 继续看 doAcquireInterruptibly
private void doAcquireInterruptibly(int arg) throws InterruptedException {
    final Node node = addWaiter(Node.EXCLUSIVE);
    boolean failed = true;
    try {
        for (;;) {
            final Node p = node.predecessor();
            if (p == head && tryAcquire(arg)) {
                setHead(node);
                p.next = null; // help GC
                failed = false;
                return;
            }
            if (shouldParkAfterFailedAcquire(p, node) &&
                parkAndCheckInterrupt())
                // 就是这里了，一旦异常，马上结束这个方法，抛出异常。
                // 这里不再只是标记这个方法的返回值代表中断状态
                // 而是直接抛出异常，而且外层也不捕获，一直往外抛到 lockInterruptibly
                throw new InterruptedException();
        }
    } finally {
        // 如果通过 InterruptedException 异常出去，那么 failed 就是 true 了
        if (failed)
            cancelAcquire(node);
    }
}

// cancelAcquire 节点取消，并设置 waitStatus 为 Node.CANCELLED
private void cancelAcquire(Node node) {
    if (node == null)
        return;
    node.thread = null;
    // 找一个合适的前驱。其实就是将它前面的队列中已经取消的节点都清除
    Node pred = node.prev;
    while (pred.waitStatus > 0)
        node.prev = pred = pred.prev;
    Node predNext = pred.next;

    // 设置节点状态为取消
    node.waitStatus = Node.CANCELLED;
    // 如果是尾节点，则把自己从阻塞队列移除
    if (node == tail && compareAndSetTail(node, pred)) {
        compareAndSetNext(pred, predNext, null);
    } else {
        int ws;
        // 如果不是尾节点，并且前驱节点不为CANCEL
        // 将自己移除阻塞节点
        if (pred != head &&
            ((ws = pred.waitStatus) == Node.SIGNAL || (ws <= 0 && compareAndSetWaitStatus(pred, ws, Node.SIGNAL))) 
            && pred.thread != null) {
            Node next = node.next;
            // 如果有next节点， 将自己从阻塞队列移除
            if (next != null && next.waitStatus <= 0)
                compareAndSetNext(pred, predNext, next);
        } else {
            // 如果前驱节点已经取消则唤醒后继节点
            unparkSuccessor(node);
        }
        node.next = node; // help GC
    }
}
```

这个带中断的lock:`lockInterruptibly`被中断后，就会将 waitStatus 设置为 CANCELLED ， 并移出阻塞队列

与 lock 的区别就是， lock 即使被中断， 还是会抢锁，而 lockInterruptibly 则将自己移除阻塞队列，不再抢锁

### java线程中断

#### 线程中断

java 中断某个线程，这个线程就停止运行了。中断代表线程状态，每个线程都关联了一个中断状态，是一个 true 或 false 的 boolean 值，初始值为 false。

Thread 类中关于中断的几个方法:
```java
// Thread 类中的实例方法，持有线程实例引用即可检测线程中断状态
public boolean isInterrupted() {}

// Thread 中的静态方法，检测调用这个方法的线程是否已经中断
// 注意：这个方法返回中断状态的同时，会将此线程的中断状态重置为 false
// 所以，如果我们连续调用两次这个方法的话，第二次的返回值肯定就是 false 了(第一次调用已经重置了中断状态为false, 前提是两次调用中间没有发生其他设置线程中断的语句)
public static boolean interrupted() {}

// Thread 类中的实例方法，用于设置一个线程的中断状态为 true
public void interrupt() {}
```

我们说中断一个线程，其实就是设置了线程的 interrupted status 为 true，至于说被中断的线程怎么处理这个状态，那是那个线程自己的事。如以下代码,就会响应中断：
```java
while (!Thread.interrupted()) {
   doWork();
   System.out.println("我做完一件事了，准备做下一件，如果没有其他线程中断我的话");
}
```

一般除了 jdk 源码外，很少有专门对中断对处理


#### jdk自动感知中断的情况

1. Object类的 wait, Thread类的 join, sleep。这三类方法的线程被中断的时候，会自动感知到。如果线程阻塞在这些方法上（我们知道，这些方法会让当前线程阻塞），这个时候如果其他线程对这个线程进行了中断，那么这个线程会从这些方法中立即返回，抛出 InterruptedException 异常，同时重置中断状态为 false

2. NIO 中 select方法。 一旦中断，select会立即返回

3. LockSupport.park 也能自动感知中断, 但并不会将中断状态设置为false


#### InterruptedException

这是一个特殊的异常，不是说 JVM 对其有特殊的处理，而是它的使用场景比较特殊。通常，我们可以看到，像 Object 中的 wait() 方法，ReentrantLock 中的 lockInterruptibly() 方法，Thread 中的 sleep() 方法等等，这些方法都带有 throws InterruptedException，我们通常称这些方法为阻塞方法（blocking method。

阻塞方法一个很明显的特征是，它们需要花费比较长的时间（不是绝对的，只是说明时间不可控），还有它们的方法结束返回往往依赖于外部条件，如 wait 方法依赖于其他线程的 notify，lock 方法依赖于其他线程的 unlock等等。

当我们看到方法上带有 throws InterruptedException 时，我们就要知道，这个方法应该是阻塞方法，我们如果希望它能早点返回的话，我们往往可以通过中断来实现。

#### 处理中断

正常我们处理中断一般如下:
```java
try {
    Thread.sleep(10000);
} catch (InterruptedException e) {
    // ignore
}
```

这里我们并不知道是真的 sleep 了10s还是1s就被中断了，这里的代码将中断异常吞了。

AQS中处理中断如下:
```java
// 带中断的 lock
public void lockInterruptibly() throws InterruptedException {
    sync.acquireInterruptibly(1);
}
```

正常的lock方法不响应中断。如果 thread1 调用了 lock() 方法，过了很久还没抢到锁，这个时候 thread2 对其进行了中断，thread1 是不响应这个请求的，它会继续抢锁，当然它不会把“被中断”这个信息扔掉。如下:
```java
public final void acquire(int arg) {
    if (!tryAcquire(arg) &&
        acquireQueued(addWaiter(Node.EXCLUSIVE), arg))
        // 我们看到，这里也没做任何特殊处理，就是记录下来中断状态。
        // 这样，如果外层方法需要去检测的时候，至少我们没有把这个信息丢了
        selfInterrupt();// Thread.currentThread().interrupt();
}
```
而对于 lockInterruptibly() 方法，因为其方法上面有 throws InterruptedException ，这个信号告诉我们，如果我们要取消线程抢锁，直接中断这个线程即可，它会立即返回，抛出 InterruptedException 异常

并且在 Condition 代码中，如果方法会抛出`InterruptedException`，那么方法体第一句就是:
```java
public final void await() throws InterruptedException {
    if (Thread.interrupted())
        throw new InterruptedException();
     ...... 
}
```


### 参考资料

- [AQS简介](http://cmsblogs.com/?p=2174)
- [java并发包的基石](https://www.cnblogs.com/chengxiao/p/7141160.html)
- [java AQS的实现原理](https://www.jianshu.com/p/279baac48960)
- [阻塞和唤醒线程](http://cmsblogs.com/?p=2205)
- [java并发之AQS详解](https://www.cnblogs.com/waterystone/p/4920797.html)
- [LockSupport详解](https://leokongwq.github.io/2017/01/13/java-LockSupport.html)
- [java队列同步器AQS](https://blog.csdn.net/pange1991/article/details/80930394)
- [一行一行源码分析AQS二](https://javadoop.com/post/AbstractQueuedSynchronizer-2)
- [interrupt和LockSupport.park()深入理解](https://cgiirw.github.io/2018/05/27/Interrupt_Ques/)
- [java8 Thread&Lock](https://javadoop.com/post/Threads-And-Locks-md#toc5)