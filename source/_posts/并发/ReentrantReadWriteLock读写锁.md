---
title: ReentrantReadWriteLock读写锁
date: 2020-03-14 19:51:49
tags:
categories: 并发
---

### ReentrantReadWriteLock 结构

```

final Sync sync;

// 构造函数
public ReentrantReadWriteLock(boolean fair) {
    sync = fair ? new FairSync() : new NonfairSync();
    readerLock = new ReadLock(this);
    writerLock = new WriteLock(this);
}

// 读锁
public static class ReadLock implements Lock, java.io.Serializable {
    private final Sync sync;

    protected ReadLock(ReentrantReadWriteLock lock) {
        sync = lock.sync;
    }

   public void lock() {
        // 共享模式
        sync.acquireShared(1);
   }

    public void lockInterruptibly() throws InterruptedException {
        sync.acquireSharedInterruptibly(1);
    }


    public boolean tryLock() {
        return sync.tryReadLock();
    }


    public boolean tryLock(long timeout, TimeUnit unit)
            throws InterruptedException {
        return sync.tryAcquireSharedNanos(1, unit.toNanos(timeout));
    }


    public void unlock() {
        sync.releaseShared(1);
    }


    public Condition newCondition() {
        throw new UnsupportedOperationException();
    }
    
}

// 写锁
public static class WriteLock implements Lock, java.io.Serializable {
    private final Sync sync;

    protected WriteLock(ReentrantReadWriteLock lock) {
        sync = lock.sync;
    }

    public void lock() {
        // 独占模式
        sync.acquire(1);
    }


    public void lockInterruptibly() throws InterruptedException {
        sync.acquireInterruptibly(1);
    }


    public boolean tryLock( ) {
        return sync.tryWriteLock();
    }

    public boolean tryLock(long timeout, TimeUnit unit)
            throws InterruptedException {
        return sync.tryAcquireNanos(1, unit.toNanos(timeout));
    }


    public void unlock() {
        sync.release(1);
    }

    public Condition newCondition() {
        return sync.newCondition();
    }

}

// sync 继承于 AQS
abstract static class Sync extends AbstractQueuedSynchronizer {
    ......
}


static final class FairSync extends Sync {
    final boolean writerShouldBlock() {
        return hasQueuedPredecessors();
    }
    final boolean readerShouldBlock() {
        return hasQueuedPredecessors();
    }
}

static final class NonfairSync extends Sync {
    final boolean writerShouldBlock() {
        return false; // writers can always barge
    }
    final boolean readerShouldBlock() {
        return apparentlyFirstQueuedIsExclusive();
    }
}
```

这里可以看到：
1. 读、写锁分别对应 `ReadLock` 和 `WriteLock` 两个实例
2. 读、写锁内部使用了同一个 `Sync` 实例， 分为公平模式和非公平模式
3. `Sync` 实例继承于 AQS
4. `ReadLock` 使用共享模式， `WriteLock`使用独占模式

#### 独占模式

看看 `WriteLock` 的独占模式
``` 
// AQS 独占方式
public void lock() {
    sync.acquire(1);
}
// aquire 过程
public final void acquire(int arg) {
    if (!tryAcquire(arg) &&
        acquireQueued(addWaiter(Node.EXCLUSIVE), arg))
        selfInterrupt();
}
```
1. tryAcquire 判断 state，为0则直接占有
2. acquireQueued 将当前节点进入阻塞队列，并挂起当前线程， 等待前驱节点唤醒
3. 被唤醒后将自己设为head，并将state设为1

这就是一个普通的AQS的独占模式的流程

#### 共享模式

`ReadLock` 的共享模式
``` 
public void lock() {
    sync.acquireShared(1);
}

public final void acquireShared(int arg) {
    // 小于0代表没有获取到共享锁， 步骤1
    if (tryAcquireShared(arg) < 0)
        doAcquireShared(arg);
}

private void doAcquireShared(int arg) {
    final Node node = addWaiter(Node.SHARED);
    boolean failed = true;
    try {
        boolean interrupted = false;
        for (;;) {
            final Node p = node.predecessor();
            if (p == head) {
                // 步骤3
                int r = tryAcquireShared(arg);
                if (r >= 0) {
                    // 步骤4
                    setHeadAndPropagate(node, r);
                    p.next = null; // help GC
                    if (interrupted)
                        selfInterrupt();
                    failed = false;
                    return;
                }
            }
            if (shouldParkAfterFailedAcquire(p, node) &&
                // 步骤2
                parkAndCheckInterrupt())
                interrupted = true;
        }
    } finally {
        if (failed)
            cancelAcquire(node);
    }
}
```
(1) tryAcquireShared 小于 0 代表没有获取到共享锁
(2) doAcquireShared 将当前节点进入阻塞队列中等待被唤醒，步骤2是挂起自己
(3) 被唤醒后就可以拿到共享锁了, 步骤三
(4) 然后 setHeadAndPropagate 唤醒其他线程

这里注意独占模式和共享模式的区别:
- 对于独占模式来说，通常就是 0 代表可获取锁，1 代表锁被别人获取了，重入例外
- 而共享模式下，每个线程都可以对 state 进行加减操作(独占模式操作state的时候会判断当前线程是否是站有锁的线程)

### 原理分析

再 `ReadWriteLock` 中 state 同时被独占模式和共享模式操作，实现的手段是将 state 这个 32 位的 int 值分为高 16 位和低 16位，分别用于共享模式和独占模式。

#### sync 类

直接看关键的内部`Sync`类:
``` 
abstract static class Sync extends AbstractQueuedSynchronizer {
    // 下面这块说的就是将 state 一分为二，高 16 位用于共享模式，低16位用于独占模式
    static final int SHARED_SHIFT   = 16;
    static final int SHARED_UNIT    = (1 << SHARED_SHIFT);
    static final int MAX_COUNT      = (1 << SHARED_SHIFT) - 1;
    static final int EXCLUSIVE_MASK = (1 << SHARED_SHIFT) - 1;
    // 取 c 的高 16 位值，代表读锁的获取次数(包括重入)
    static int sharedCount(int c)    { return c >>> SHARED_SHIFT; }
    // 取 c 的低 16 位值，代表写锁的重入次数，因为写锁是独占模式
    static int exclusiveCount(  int c) { return c & EXCLUSIVE_MASK; }

    // 这个嵌套类的实例用来记录每个线程持有的读锁数量(读锁重入)
    static final class HoldCounter {
        // 持有的读锁数
        int count = 0;
        // 线程 id
        final long tid = getThreadId(Thread.currentThread());
    }

    // ThreadLocal 的子类
    static final class ThreadLocalHoldCounter
        extends ThreadLocal<HoldCounter> {
        public HoldCounter initialValue() {
            return new HoldCounter();
        }
    }
    /**
      * 组合使用上面两个类，用一个 ThreadLocal 来记录当前线程持有的读锁数量
      */ 
    private transient ThreadLocalHoldCounter readHolds;

    // 用于缓存，记录"最后一个获取读锁的线程"的读锁重入次数，
    // 所以不管哪个线程获取到读锁后，就把这个值占为已用，这样就不用到 ThreadLocal 中查询 map 了
    // 这个是用于提升性能
    private transient HoldCounter cachedHoldCounter;

    // 第一个获取读锁的线程(并且其未释放读锁)，以及它持有的读锁数量 
    // 这个也是为了提升性能
    private transient Thread firstReader = null;
    private transient int firstReaderHoldCount;

    Sync() {
        // 初始化 readHolds 这个 ThreadLocal 属性，用来记录该线程读锁的次数
        readHolds = new ThreadLocalHoldCounter();
        // 为了保证 readHolds 的内存可见性
        setState(getState());
    }
    ...
}
```
1. state 的高 16 位代表读锁的获取次数，包括重入次数，获取到读锁一次加 1，释放掉读锁一次减 1。
2. state 的低 16 位代表写锁的获取次数，因为写锁是独占锁，同时只能被一个线程获得，所以它代表重入次数
3. 每个线程都需要维护自己的`HoldCounter`，记录该线程获取的读锁次数，这样才能知道到底是不是读锁重入，用 ThreadLocal 属性`readHolds`维护


#### 读锁获取

``` 
// ReadLock
public void lock() {
    sync.acquireShared(1);
}
// AQS
public final void acquireShared(int arg) {
    if (tryAcquireShared(arg) < 0)
        doAcquireShared(arg);
}
```

这一切都是AQS的流程，`Sync`实现了`tryAcquireShared`, 再AQS的定义中，`tryAcquireShared`返回值小于0代表没有获取到共享锁，大于0代表获取到了

``` 
protected final int tryAcquireShared(int unused) {

    Thread current = Thread.currentThread();
    int c = getState();

    // exclusiveCount(c) 不等于 0，说明有线程持有写锁，
    //    而且不是当前线程持有写锁，那么当前线程获取读锁失败
    //         （另，如果持有写锁的是当前线程，是可以继续获取读锁的）
    if (exclusiveCount(c) != 0 &&
        getExclusiveOwnerThread() != current)
        return -1;

    // 读锁的获取次数
    int r = sharedCount(c);

    // 读锁获取是否需要被阻塞
    if (!readerShouldBlock() &&
        // 判断是否会溢出
        r < MAX_COUNT &&
        // 下面这行 CAS 是将 state 属性的高 16 位加 1，低 16 位不变，如果成功就代表获取到了读锁
        compareAndSetState(c, c + SHARED_UNIT)) {

        // =======================
        //   进到这里就是获取到了读锁
        // =======================

        if (r == 0) {
            // r == 0 说明此线程是第一个获取读锁的，或者说在它前面获取读锁的都释放了
            //  记录 firstReader 为当前线程，及其持有的读锁数量：1
            firstReader = current;
            firstReaderHoldCount = 1;
        } else if (firstReader == current) {
            // 进来这里，说明是 firstReader 重入获取读锁（这非常简单，count 加 1 结束）
            firstReaderHoldCount++;
        } else {
            // 前面我们说了 cachedHoldCounter 用于缓存最后一个获取读锁的线程
            // 如果 cachedHoldCounter 缓存的不是当前线程，设置为缓存当前线程的 HoldCounter
            HoldCounter rh = cachedHoldCounter;
            if (rh == null || rh.tid != getThreadId(current))
                cachedHoldCounter = rh = readHolds.get();
            else if (rh.count == 0) 
                // 到这里，那么就是 cachedHoldCounter 缓存的是当前线程，但是 count 为 0，
                readHolds.set(rh);

            // count 加 1
            rh.count++;
        }
        // return 大于 0 的数，代表获取到了共享锁
        return 1;
    }
    // 往下看
    return fullTryAcquireShared(current);
}
```
如果要执行`fullTryAcquireShared`， 就不能进入if分支，则需要`readerShouldBlock`返回true，这里有两种可能:
(1) 在 FairSync 中 `hasQueuedPredecessors()`(公平模式有其他节点再等待锁，不能直接就获取锁)
(2 在 NonFairSync 中`apparentlyFirstQueuedIsExclusive()`，即判断阻塞队列中`head
`的第一个后继节点是否是来获取写锁的，如果是的话，让这个写锁先来，避免写锁饥饿(这里是给了写锁更高的优先级，所以如果碰上获取写锁的线程马上就要获取到锁了，获取读锁的线程不应该和它抢。如果head.next
不是写锁，那么就随便抢了，因为是非公平模式)

另外还有一种情况就是`compareAndSetState(c, c + SHARED_UNIT)`的CAS操作失败了也会进入`fullTryAcquireShared`，这代表着操作state存在竞争，可能是读锁竞争也可能是写锁竞争

接下来就是`fullTryAcquireShared`的流程:
``` 
final int fullTryAcquireShared(Thread current) {
    HoldCounter rh = null;
    // 这里 for 循环
    for (;;) {
        int c = getState();
        // 如果其他线程持有了写锁，自然这次是获取不到读锁了，返回-1，执行 doAcquireShared 阻塞排队
        if (exclusiveCount(c) != 0) {
            if (getExclusiveOwnerThread() != current)
                return -1;
            // else we hold the exclusive lock; blocking here
            // would cause deadlock.
        } else if (readerShouldBlock()) {
            /**
              * 进来这里，说明：
              *  1. exclusiveCount(c) == 0：写锁没有被占用
              *  2. readerShouldBlock() 为 true，说明阻塞队列中有其他线程在等待(或下一个是写锁)
              * 既然有其他再等待，就需要执行阻塞操作了
              */
            // firstReader 线程重入读锁，直接到下面的 CAS
            if (firstReader == current) {
                
            } else {
                if (rh == null) {
                    rh = cachedHoldCounter;
                    if (rh == null || rh.tid != getThreadId(current)) {
                        // cachedHoldCounter 缓存最后一个读锁的holderCount
                        // cachedHoldCounter 缓存的不是当前线程
                        // 那么到 ThreadLocal 中获取当前线程的 HoldCounter
                        // 如果当前线程从来没有初始化过 ThreadLocal 中的值，get() 会执行初始化
                        rh = readHolds.get();
                        // 如果发现 count == 0，也就是说，纯属上一行代码初始化的，那么执行 remove
                        if (rh.count == 0)
                            readHolds.remove();
                    }
                }
                if (rh.count == 0)
                    // 返回 -1 执行阻塞排队
                    return -1;
            }
        }
        // 判断 state 是否溢出
        if (sharedCount(c) == MAX_COUNT)
            throw new Error("Maximum lock count exceeded");
         // 这里 CAS 成功，那么就意味着成功获取读锁了
        if (compareAndSetState(c, c + SHARED_UNIT)) {
            // 下面需要做的是设置 firstReader 或 cachedHoldCounter
            if (sharedCount(c) == 0) {
                // 如果发现 sharedCount(c) 等于 0，就将当前线程设置为 firstReader
                firstReader = current;
                firstReaderHoldCount = 1;
            } else if (firstReader == current) {
                firstReaderHoldCount++;
            } else {
                // 下面这几行，就是将 cachedHoldCounter 设置为当前线程
                if (rh == null)
                    rh = cachedHoldCounter;
                if (rh == null || rh.tid != getThreadId(current))
                    rh = readHolds.get();
                else if (rh.count == 0)
                    readHolds.set(rh);
                rh.count++;
                cachedHoldCounter = rh;
            }
            // 返回大于 0 的数，代表获取到了读锁
            return 1;
        }
    }
}
```

#### 读锁的释放

``` 
// ReadLock
public void unlock() {
    sync.releaseShared(1);
}
// Sync
public final boolean releaseShared(int arg) {
    if (tryReleaseShared(arg)) {
        doReleaseShared(); // 这句代码其实唤醒 获取写锁的线程，往下看就知道了
        return true;
    }
    return false;
}

// Sync
protected final boolean tryReleaseShared(int unused) {
    Thread current = Thread.currentThread();
    if (firstReader == current) {
        if (firstReaderHoldCount == 1)
            // firstReader 代表当前第一个获取读锁的线程
            // 如果等于 1，那么这次解锁后就不再持有锁了，把 firstReader 置为 null，给后来的线程用
            firstReader = null;
        else
            // 重入次数减一
            firstReaderHoldCount--;
    } else {
        // 判断 cachedHoldCounter 是否缓存的是当前线程，不是的话要到 ThreadLocal 中取
        HoldCounter rh = cachedHoldCounter;
        if (rh == null || rh.tid != getThreadId(current))
            rh = readHolds.get();

        int count = rh.count;
        if (count <= 1) {
            // 这一步将 ThreadLocal remove 掉，防止内存泄漏。因为已经不再持有读锁了
            readHolds.remove();
            if (count <= 0)
                // 就是那种，lock() 一次，unlock() 好几次的逗比
                throw unmatchedUnlockException();
        }
        // count 减 1
        --rh.count;
    }
    // 保证cas操作成功
    for (;;) {
        int c = getState();
        // nextc 是 state 高 16 位减 1 后的值,也就是释放一次读锁的值
        int nextc = c - SHARED_UNIT;
        if (compareAndSetState(c, nextc))
            // 如果 nextc == 0，那就是 state 全部 32 位都为 0，也就是读锁和写锁都空了
            // 此时这里返回 true 的话，其实是帮助唤醒后继节点中的获取写锁的线程
            return nextc == 0;
    }
}
```

读锁的释放过程
(1) 将 hold count 减 1，如果减到 0 的话，还要将 ThreadLocal 中的 remove 掉防止内存泄漏
(2) 在 for 循环中将 state 的高 16 位减 1，如果发现读锁和写锁都释放光了，那么唤醒后继的获取写锁的线程

#### 写锁的获取

写锁是独占的，如果发现有读锁占用也是要阻塞等待的:
``` 
// WriteLock
public void lock() {
    sync.acquire(1);
}
// AQS
public final void acquire(int arg) {
    if (!tryAcquire(arg) &&
        // 如果 tryAcquire 失败，那么进入到阻塞队列等待
        acquireQueued(addWaiter(Node.EXCLUSIVE), arg))
        selfInterrupt();
}

// Sync
protected final boolean tryAcquire(int acquires) {

    Thread current = Thread.currentThread();
    int c = getState();
    int w = exclusiveCount(c);
    if (c != 0) {

        // 看下这里返回 false 的情况：
        //   c != 0 && w == 0: 写锁可用，但是有线程持有读锁(也可能是自己持有)
        //   c != 0 && w !=0 && current != getExclusiveOwnerThread(): 其他线程持有写锁
        //   也就是说，只要有读锁或写锁被占用，这次就不能获取到写锁
        if (w == 0 || current != getExclusiveOwnerThread())
            return false;

        if (w + exclusiveCount(acquires) > MAX_COUNT)
            throw new Error("Maximum lock count exceeded");

        // 这里不需要 CAS，仔细看就知道了，能到这里的，只可能是写锁重入，不然在上面的 if 就拦截了
        setState(c + acquires);
        return true;
    }

    // 如果写锁获取不需要 block，那么进行 CAS，成功就代表获取到了写锁
    if (writerShouldBlock() ||
        !compareAndSetState(c, c + acquires))
        return false;
    setExclusiveOwnerThread(current);
    return true;
}
```

writerShouldBlock 的判断:
(1) 如果非公平锁永远返回 false， 因为非公平模式永远不需要排队，直接 CAS 尝试获取锁就行
(2) 公平模式还是`hasQueuedPredecessors`, 判断是否有线程排队


#### 写锁的释放

``` 
/ WriteLock
public void unlock() {
    sync.release(1);
}

// AQS
public final boolean release(int arg) {
    // 1. 释放锁
    if (tryRelease(arg)) {
        // 2. 如果独占锁释放"完全"，唤醒后继节点
        Node h = head;
        if (h != null && h.waitStatus != 0)
            unparkSuccessor(h);
        return true;
    }
    return false;
}

// Sync 
// 释放锁，是线程安全的，因为写锁是独占锁，具有排他性
// 实现很简单，state 减 1 就是了
protected final boolean tryRelease(int releases) {
    if (!isHeldExclusively())
        throw new IllegalMonitorStateException();
    int nextc = getState() - releases;
    boolean free = exclusiveCount(nextc) == 0;
    if (free)
        setExclusiveOwnerThread(null);
    setState(nextc);
    // 如果 exclusiveCount(nextc) == 0，也就是说包括重入的，所有的写锁都释放了，
    // 那么返回 true，这样会进行唤醒后继节点的操作。
    return free;
}
```

独占锁的释放很简单，直接state减1就好

### StampedLock

`ReadWriteLock` 可以解决多线程读写的问题， 但是读的时候， 写线程需要等待读线程释放了才能获取写锁，即读的时候不能写，这是一种悲观的策略。

jdk8 引入了新的读写锁:`StampedLock`， 进一步提升了并发执行效率。

`StampedLock`和`ReadWriteLock`相比，改进之处在于：读的过程中也允许获取写锁后写入。采用的是一种乐观锁的方式去判断。

和`ReadWriteLoc`相比，写入的加锁是完全一样的，不同的是读取。首先通过`tryOptimisticRead()`获取一个乐观读锁，并返回版本号。接着进行读取，读取完成后通过`validate()`去验证版本号，如果在读取过程中没有写入，版本号不变，验证成功，就可以放心地继续后续操作。如果在读取过程中有写入，版本号会发生变化，验证将失败。在失败的时候，再通过获取悲观读锁再次读取。由于写入的概率不高，程序在绝大部分情况下可以通过乐观读锁获取数据，极少数情况下使用悲观读锁获取数据。

