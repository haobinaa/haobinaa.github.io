---
title: ReentrantLock与AQS
date: 2018-06-28 09:28:33
tags:
categories: 并发
---
## 概述

AbstractQueuedSynchronizer（以下简写AQS）这个抽象类，因为它是 Java 并发包的基础工具类，是实现 ReentrantLock、CountDownLatch、Semaphore、FutureTask 等类的基础。

本文借助`ReentrantLock`的实现来更好的理解AQS这个并发框架的基石， 源码环境基于JDK7

### AQS结构

#### AQS的基本属性

AQS有四个基本的属性:

- `private transient volatile Node head`: 头结点，当前持有锁的线程
- `private transient volatile Node tail`: 阻塞的尾节点，每个新的节点进来，都插入到最后，也就形成了一个链表
- `private volatile int state`: 表当前锁的状态，0代表没有被占用，大于0代表有线程持有当前锁。重入每次加1
- `private transient Thread exclusiveOwnerThread`: 代表当前持有独占锁的线程,继承自`AbstractOwnableSynchronizer`



#### 等待队列Node结构

AQS的等待队列如图所示:
![](/images/aqs/aqs-0.png)

等待队列中每个线程被包装成一个 node，数据结构是链表， Node的定义如下:
``` 
static final class Node {
    // 标识节点当前在共享模式下
    static final Node SHARED = new Node();
    // 标识节点当前在独占模式下
    static final Node EXCLUSIVE = null;
    
    // ======== 下面的几个int常量是给waitStatus用的 ===========
    // 代码此线程取消了争抢这个锁
    static final int CANCELLED =  1;
    // 当前node的后继节点对应的线程需要被唤醒
    static final int SIGNAL    = -1;
    // condition条件
    static final int CONDITION = -2;
    // 传播条件，暂时不知道作用
    static final int PROPAGATE = -3;
    
    // =====================================================
    // 取值为上面的1、-1、-2、-3，或者0
    // 如果这个值 大于0 代表此线程取消了等待，
    volatile int waitStatus;
    // 前驱节点的引用
    volatile Node prev;
    // 后继节点的引用
    volatile Node next;
    // 这个就是线程本尊
    volatile Thread thread;
}
```
Node的数据结构也是四个属性组成: `thread + waitStatus + pre + next`

### ReentrantLock锁的使用

一般使用ReentrantLock的范式如下:
``` 
public class LockTest {
    // 使用static，这样每个线程拿到的是同一把锁
    private static ReentrantLock reentrantLock = new ReentrantLock(true);

    public void doSomething() {
        reentrantLock.lock();
        // 通常，lock 之后紧跟着 try 语句
        try {
            // 这块代码同一时间只能有一个线程进来(获取到锁的线程)，
            // 其他的线程在lock()方法上阻塞，等待获取到锁，再进来
            // 执行代码...
        } finally {
            // 释放锁
            reentrantLock.unlock();
        }
    }
}
```
ReentrantLock 在内部用了内部类 Sync 来管理锁，所以真正的获取锁和释放锁是由 Sync 的实现类来控制的:
``` 
abstract static class Sync extends AbstractQueuedSynchronizer {
}
```
Sync 有两个实现，分别为 NonfairSync（非公平锁）和 FairSync（公平锁），默认是非公平锁:
``` 
public ReentrantLock(boolean fair) {
    sync = fair ? new FairSync() : new NonfairSync();
}
```

以公平锁的示例，源码流程

#### 线程抢锁(公平锁示例)
```java

static final class FairSync extends Sync {
    private static final long serialVersionUID = -3000897897090466540L;
      // 争锁
    final void lock() {
        acquire(1);
    }
    // acuire来自父类AQS的Sync，直接贴过来这边
    // 我们看到，这个方法，如果tryAcquire(arg) 返回true, 也就结束了。
    // 否则，acquireQueued方法会将线程压到队列中
    public final void acquire(int arg) { 
        // 首先调用tryAcquire(1)一下，尝试获取锁
        // 因为有可能直接就成功了呢，也就不需要进队列排队了，
        // 对于公平锁的语义就是：如果没有人持有锁，根本没必要进队列等待(又是挂起，又是等待被唤醒的)
        if (!tryAcquire(arg) &&
            // tryAcquire(arg)没有成功，这个时候需要把当前线程挂起，放到阻塞队列中。
            acquireQueued(addWaiter(Node.EXCLUSIVE), arg)) {
              selfInterrupt();
        }
    }

    // 尝试直接获取锁，返回值是boolean，代表是否获取到锁
    // 返回true：1.没有线程在等待锁；2.重入锁，线程本来就持有锁，也就可以理所当然可以直接获取
    protected final boolean tryAcquire(int acquires) {
        final Thread current = Thread.currentThread();
        int c = getState();
        // state == 0 此时此刻没有线程持有锁
        if (c == 0) {
            // 虽然此时此刻锁是可以用的，但是这是公平锁，既然是公平，就得讲究先来后到，
            // 看看有没有别人在队列中等了半天了
            if (!hasQueuedPredecessors() &&
                // 如果没有线程在等待，那就用CAS尝试一下，成功了就获取到锁了，
                // 不成功的话，只能说明一个问题，就在刚刚几乎同一时刻有个线程抢先了
                compareAndSetState(0, acquires)) {

                // 到这里就是获取到锁了，标记一下，告诉大家，现在是我占用了锁
                setExclusiveOwnerThread(current);
                return true;
            }
        }
          // 会进入这个else if分支，说明是重入了，需要操作：state=state+1
        else if (current == getExclusiveOwnerThread()) {
            int nextc = c + acquires;
            if (nextc < 0)
                throw new Error("Maximum lock count exceeded");
            setState(nextc);
            return true;
        }
        // 如果到这里，说明前面的if和else if都没有返回true，说明没有获取到锁
        return false;
    }

 public final boolean hasQueuedPredecessors() {
   Node h = head;
   Node s;
  // 双向链表中，第一个节点为虚节点，其实并不存储任何信息，只是占位。真正的第一个有数据的节点，是在第二个节点开始的。
  // 当h != t时： 如果(s = h.next) == null，等待队列正在有线程进行初始化，但只是进行到了Tail指向Head，没有将Head指向Tail，此时队列中有元素，需要返回True
  // 如果(s = h.next) != null，说明此时队列中至少有一个有效节点。说明等待队列的第一个有效节点线程与当前线程不同，当前线程必须加入进等待队列
   return h != t &&
           ((s = h.next) == null || s.thread != Thread.currentThread());
 }

    // 假设tryAcquire(arg) 返回false，那么代码将执行：
    // acquireQueued(addWaiter(Node.EXCLUSIVE), arg)
    // 这个方法，首先需要执行：addWaiter(Node.EXCLUSIVE)

    // 此方法的作用是把线程包装成node，同时进入到队列中
    // 参数mode此时是Node.EXCLUSIVE，代表独占模式
    private Node addWaiter(Node mode) {
        // 把当前线程包装成Node，并设置为独占模式
        Node node = new Node(Thread.currentThread(), mode);
        
        // 以下几行代码想把当前node加到链表的最后面去，也就是进到阻塞队列的最后
        Node pred = tail;
        // tail!=null => 队列不为空
        if (pred != null) { 
            // 设置原尾节点为当前的前驱节点
            node.prev = pred; 
            // 用CAS把自己设置为队尾, 如果成功后，tail == node了
            if (compareAndSetTail(pred, node)) { 
                // 成为尾节点后，与原链表形成双向链表
                // 上面已经有 node.prev = pred
                // 加上下面这句，也就实现了和之前的尾节点双向连接了
                pred.next = node;
                // 线程入队了，可以返回了
                return node;
            }
        }
        // 如果会到这里，
        // 说明 pred==null(队列是空的) 或者 CAS 成为尾节点失败(有线程在竞争入队)
        // 采用自旋入队
        enq(node);
        return node;
    }

    // 采用自旋的方式入队
    // 之前说过，到这个方法只有两种可能：等待队列为空，或者有线程竞争入队，
    // 自旋在这边的语义是：CAS设置tail过程中，竞争一次竞争不到，就多次竞争，总会排到的
    private Node enq(final Node node) {
        for (;;) {
            Node t = tail;
            // 之前说过，队列为空也会进来这里
            if (t == null) { 
                // 初始化head节点
                // 注意head和tail初始化的时候都是null
                // 还是一步CAS，现在可能是很多线程同时进来
                if (compareAndSetHead(new Node()))
                    // 给后面用：这个时候head节点的waitStatus==0(没有人占用)
                    // 这个时候有了head，但是tail还是null，设置一下，
                    // 注意：这里只是设置了tail=head，这里没return，所以，设置完了以后，继续for循环，下次就到下面的else分支了
                    tail = head;
            } else {
                // 下面几行，和上一个方法 addWaiter 是一样的，
                // 只是这个套在无限循环里，反正就是将当前线程排到队尾，有线程竞争的话排不上重复排
                node.prev = t;
                if (compareAndSetTail(t, node)) {
                    t.next = node;
                    return t;
                }
            }
        }
    }


// 现在，又回到这段代码
// if (!tryAcquire(arg) 
//        && acquireQueued(addWaiter(Node.EXCLUSIVE), arg)) 
//     selfInterrupt();

// 下面这个方法，参数node，经过addWaiter(Node.EXCLUSIVE)，此时已经进入阻塞队列
// 注意一下：如果acquireQueued(addWaiter(Node.EXCLUSIVE), arg))返回true的话，
// 意味着上面这段代码将进入selfInterrupt()，所以正常情况下，下面应该返回false(之前tryAcquire失败了)
// 这个方法非常重要，真正的线程挂起，然后被唤醒后去获取锁，都在这个方法里了
final boolean acquireQueued(final Node node, int arg) {
    boolean failed = true;
    try {
        boolean interrupted = false;
        for (;;) {
            // 前驱节点
            final Node p = node.predecessor();
            // p == head 说明当前节点虽然进到了阻塞队列，但是是阻塞队列的第一个，因为它的前驱是head
            // 所以当前节点可以去试抢一下锁
           // 注意，阻塞队列不包含head节点，head一般指的是占有锁的线程，head后面的才称为阻塞队列
            // 这里我们说一下，为什么可以去试着获取锁：
            // 1. 首先，它是队头，这个是第一个条件，其次，当前的head有可能是刚刚初始化的node，
            // enq(node) 方法里面有提到，head初始化的适合(也就是 new Node())并没有设置任何线程
            // 也就是说，当前的head不属于任何一个线程，所以作为队头，可以去试一试，
            // tryAcquire已经分析过了, 忘记了请往前看一下，就是简单用CAS试操作一下state
            if (p == head && tryAcquire(arg)) {
                // 获取到锁，把当前线程设置为head
                setHead(node);
                p.next = null; // help GC
                failed = false;
                return interrupted;
            }
            // 到这里，说明上面的if分支没有成功，要么当前node本来就不是队头，
            // 要么就是tryAcquire(arg)没有抢赢别人
            // shouldParkAfterFailedAcquire 判断是否需要挂起当前节点
            // parkAndCheckInterrupt 前面判断返回true，就挂起当前节点
            if (shouldParkAfterFailedAcquire(p, node) &&
                parkAndCheckInterrupt())
                interrupted = true;
        }
    } finally {
        if (failed)
            cancelAcquire(node);
    }
}

// 到这里就是没有抢到锁
// 这个方法判断当前线程是否需要挂起
// 第一个参数是前驱节点，第二个参数才是代表当前线程的节点
private static boolean shouldParkAfterFailedAcquire(Node pred, Node node) {
     // 前驱节点的 waitStatus
    int ws = pred.waitStatus;
    // 前驱节点的 waitStatus == -1 ，说明前驱节点状态正常，当前线程需要挂起，直接可以返回true
    if (ws == Node.SIGNAL)
        return true;

    // 前驱节点 waitStatus大于0（CANCEL） ，之前说过，大于0 说明前驱节点取消了排队
    // 进入阻塞队列排队的线程会被挂起，而唤醒的操作是由前驱节点完成的。
    // 所以下面这块代码说的是将当前节点的prev指向waitStatus<=0的节点，
    // 简单说，就是为了找到正常排队的节点，因为你还得依赖它来唤醒
    // 如果前驱节点取消了排队，找前驱节点的前驱节点做父节点，往前循环总能找到一个排队的
    if (ws > 0) {
        do {
            // 前驱节点取消排队，指向前驱节点的前驱节点
            node.prev = pred = pred.prev;
        } while (pred.waitStatus > 0);
        pred.next = node;
    } else {
        // 前驱节点的waitStatus不等于-1和1，那也就是只可能是0，-2，-3
        // 在前面的源码中没有设置waitStatus的,所以每个新的node入队时，waitStatu都是0
        // 正常情况下，前驱节点是之前的 tail，那么它的 waitStatus 应该是 0
        // 用CAS将前驱节点的waitStatus设置为Node.SIGNAL(也就是-1)
        compareAndSetWaitStatus(pred, ws, Node.SIGNAL);
    }
    return false;
}

// 上个方法结束根据返回值我们简单分析下：
// 如果返回true, 说明前驱节点的waitStatus==-1，那么当前线程需要被挂起，等待以后被唤醒
// 我们也说过，以后是被前驱节点唤醒，就等着前驱节点拿到锁，然后释放锁的时候叫你好了
// 如果返回false, 说明当前不需要被挂起，为什么呢？往后看

// 跳回到前面是这个方法
// if (shouldParkAfterFailedAcquire(p, node) &&
//                parkAndCheckInterrupt())
//                interrupted = true;

// 1. 如果shouldParkAfterFailedAcquire(p, node)返回true，
// 那么需要执行parkAndCheckInterrupt()
// 这个方法很简单，因为前面返回true，所以需要挂起线程，这个方法就是负责挂起线程的
// 这里用了LockSupport.park(this)来挂起线程，然后就停在这里了，等待被唤醒=======
private final boolean parkAndCheckInterrupt() {
    LockSupport.park(this);
    return Thread.interrupted();
}

// 2. 接下来说说如果shouldParkAfterFailedAcquire(p, node)返回false的情况
// 仔细看shouldParkAfterFailedAcquire(p, node)，我们可以发现，其实第一次进来的时候，一般都不会返回true的，
// 因为前驱节点的waitStatus=-1是依赖于后继节点设置的。
// 也就是说，我都还没给前驱设置-1呢，怎么可能是true呢，但是要看到，这个方法是套在循环里的，
// 所以第二次进来的时候状态就是-1了。
}
```


##### 运行流程

1.线程1调用 `reentrantLock.lock()`，tryAcquire(1) 直接就返回 true。 此时只是设置了 state=1，连 head 都没有初始化，更谈不上什么阻塞队列了

2.线程2在线程1没有调用`unlock`的情况下调用`lock`， 线程B首先会初始化head，同时线程2也会插入阻塞队列并挂起(`enq方法`)
图解如下:

(1)线程 2 初始化 head 节点，此时 head==tail, waitStatus==0
![](/images/aqs/aqs-1.png)

(2)线程 2 入队,此时节点的 waitStatus，我们知道 head 节点是线程 2 初始化的，此时的 waitStatus 没有设置， java 默认会设置为 0，但是到 `shouldParkAfterFailedAcquire` 这个方法的时候，线程 2 会把前驱节点，也就是 head 的waitStatus设置为-1。此时线程2 的 waitStatus 没有设置所以是0
![](/images/aqs/aqs-2.png)

(3)如果线程3此时再进来，直接插到线程2的后面就可以了，此时线程 3 的 waitStatus 是 0，到 shouldParkAfterFailedAcquire 方法的时候把前驱节点线程 2 的 waitStatus 设置为 -1
![](/images/aqs/aqs-3.png)

总结:
 waitStatus 中 SIGNAL(-1) 状态的意思是：代表后继节点需要被唤醒。也就是说这个 waitStatus 其实代表的不是自己的状态，而是后继节点的状态，我们知道，每个 node 在入队的时候，都会把前驱节点的状态改为 SIGNAL，然后阻塞，等待被前驱唤醒。

#### 解锁操作

正常情况下，如果线程没获取到锁，线程会被 `LockSupport.park(this)` 挂起停止，等待被唤醒。

```
public void unlock() {
    sync.release(1);
}

// AQS 的 release
public final boolean release(int arg) {
    if (tryRelease(arg)) {
        Node h = head;
        if (h != null && h.waitStatus != 0)
            unparkSuccessor(h);
        return true;
    }
    return false;
}

// 回到ReentrantLock看tryRelease方法
// 如果完全释放锁就会返回true
// 否则 重入次数 state减少1
protected final boolean tryRelease(int releases) {
    int c = getState() - releases;
    if (Thread.currentThread() != getExclusiveOwnerThread())
        throw new IllegalMonitorStateException();
    // 是否完全释放锁
    boolean free = false;
    // 其实就是重入的问题，如果c==0，也就是说没有嵌套锁了，可以释放了，否则还不能释放掉
    if (c == 0) {
        free = true;
        setExclusiveOwnerThread(null);
    }
    setState(c);
    return free;
}

// 唤醒后继节点
// 从上面调用处知道，参数node是head头结点
private void unparkSuccessor(Node node) {
    int ws = node.waitStatus;
    // 如果head节点当前waitStatus<0, 将其修改为0
    if (ws < 0)
        compareAndSetWaitStatus(node, ws, 0);
    // 下面的代码就是唤醒后继节点，但是有可能后继节点取消了等待（waitStatus==1）
    Node s = node.next;
    // 如果后继节点取消了等待
    if (s == null || s.waitStatus > 0) {
        s = null;
        // 从后往前找，找到所有 waitStatus<=0 排在最前面的节点
        for (Node t = tail; t != null && t != node; t = t.prev)
            if (t.waitStatus <= 0)
                s = t;
    }
    if (s != null)
        // 唤醒线程
        LockSupport.unpark(s.thread);
}
```

唤醒线程以后，被唤醒的线程将从以下代码中继续往前走, 直到释放head:
``` 
private final boolean parkAndCheckInterrupt() {
    LockSupport.park(this); // 刚刚线程被挂起在这里了
    return Thread.interrupted();
}
```

### 非公平锁和公平锁


ReentrantLock 默认采用非公平锁，除非你在构造方法中传入参数 true
``` 
public ReentrantLock() {
    sync = new NonfairSync();
}
public ReentrantLock(boolean fair) {
    sync = fair ? new FairSync() : new NonfairSync();
}
```

#### 公平锁的Lock

```java
static final class FairSync extends Sync {
    final void lock() {
        acquire(1);
    }
    
    public final void acquire(int arg) {
        if (!tryAcquire(arg) &&
            acquireQueued(addWaiter(Node.EXCLUSIVE), arg))
            selfInterrupt();
    }
    
    // 公平锁的 tryAcquire 会判断是否有线程等待
    protected final boolean tryAcquire(int acquires) {
        final Thread current = Thread.currentThread();
        int c = getState();
        if (c == 0) {
            // 1. 和非公平锁相比，这里多了一个判断：是否有线程在等待
            if (!hasQueuedPredecessors() &&
                compareAndSetState(0, acquires)) {
                setExclusiveOwnerThread(current);
                return true;
            }
        }
        else if (current == getExclusiveOwnerThread()) {
            int nextc = c + acquires;
            if (nextc < 0)
                throw new Error("Maximum lock count exceeded");
            setState(nextc);
            return true;
        }
        return false;
    }
}
```

#### 非公平锁的Lock

```
static final class NonfairSync extends Sync {
    final void lock() {
        // 2. 和公平锁相比，这里会直接先进行一次CAS，成功就返回了
        if (compareAndSetState(0, 1))
            setExclusiveOwnerThread(Thread.currentThread());
        else
            acquire(1);
    }
    // AbstractQueuedSynchronizer.acquire(int arg)
    public final void acquire(int arg) {
        if (!tryAcquire(arg) &&
            acquireQueued(addWaiter(Node.EXCLUSIVE), arg))
            selfInterrupt();
    }
    protected final boolean tryAcquire(int acquires) {
        return nonfairTryAcquire(acquires);
    }
}
// 非公平锁尝试获取锁
final boolean nonfairTryAcquire(int acquires) {
    final Thread current = Thread.currentThread();
    int c = getState();
    // 非公平锁若判断锁已经被释放，则直接抢占锁
    if (c == 0) {
        if (compareAndSetState(0, acquires)) {
            setExclusiveOwnerThread(current);
            return true;
        }
    }
    else if (current == getExclusiveOwnerThread()) {
        int nextc = c + acquires;
        if (nextc < 0) // overflow
            throw new Error("Maximum lock count exceeded");
        setState(nextc);
        return true;
    }
    return false;
}
```

#### 总结

公平锁和非公平锁只有两处不同：
1. 非公平锁在调用 lock 后，首先就会调用 CAS 进行一次抢锁，如果这个时候恰巧锁没有被占用，那么直接就获取到锁返回了。

2. 非公平锁在 CAS 失败后，和公平锁一样都会进入到 tryAcquire 方法，在 tryAcquire 方法中，如果发现锁这个时候被释放了（state == 0），非公平锁会直接 CAS 抢锁，但是公平锁会判断等待队列是否有线程处于等待状态，如果有则不去抢锁，乖乖排到后面

相对来说，非公平锁会有更好的性能，因为它的吞吐量比较大。当然，非公平锁让获取锁的时间变得更加不确定，可能会导致在阻塞队列中的线程长期处于饥饿状态。

### 参考资料

- [J.U.C重入锁：ReentrantLock](http://cmsblogs.com/?p=2210)
- [ReentrantLock详解](https://juejin.im/post/5ae1b4f0f265da0b7b359d7a)
- [java多线程读写锁ReentrantReadWriteLock](https://blog.csdn.net/fuyuwei2015/article/details/72597192)
- [一行一行源码分析AQS](https://javadoop.com/post/AbstractQueuedSynchronizer)
- [java并发编程艺术]