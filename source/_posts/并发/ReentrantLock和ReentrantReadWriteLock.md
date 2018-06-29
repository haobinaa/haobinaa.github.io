---
title: ReentrantLock和ReentrantReadWriteLock
date: 2018-06-28 09:28:33
tags:
categories: 并发
---
### ReentrantLock

`ReentrantLock`是一个可重入的互斥锁定 Lock，它具有与使用 synchronized 方法和语句所访问的隐式监视器锁定相同的一些基本行为和语义，但功能更强大。ReentrantLock 将由最近成功获得锁定，并且还没有释放该锁定的线程所拥有。当锁定没有被另一个线程所拥有时，调用 lock 的线程将成功获取该锁定并返回。如果当前线程已经拥有该锁定，此方法将立即返回。可以使用 isHeldByCurrentThread() 和 getHoldCount() 方法来检查此情况是否发生。

ReentrantLock还提供了公平锁也非公平锁的选择，构造方法接受一个可选的公平参数（默认非公平锁），当设置为true时，表示公平锁，否则为非公平锁。公平锁与非公平锁的区别在于公平锁的锁获取是有顺序的。但是公平锁的效率往往没有非公平锁的效率高，在许多线程访问的情况下，公平锁表现出较低的吞吐量。

- 公平锁(Fair): 直接加入同步队列
- 非公平锁(Nonfair)：尝试获取锁,若成功立刻返回,失败则加入同步队列

ReentrantLock结构:

![](/images/ReentrantLock.png)

#### Lock定义

`Lock接口`定义了锁的行为
``` 
public interface Lock {
	//上锁(不响应Thread.interrupt()直到获取锁)
    void lock();
	//上锁(响应Thread.interrupt())
    void lockInterruptibly() throws InterruptedException;
	//尝试获取锁(以nonFair方式获取锁)
    boolean tryLock();
  	//在指定时间内尝试获取锁(响应Thread.interrupt(),支持公平/二阶段非公平)
    boolean tryLock(long time, TimeUnit unit) throws InterruptedException;
	//解锁
    void unlock();
	//获取Condition
    Condition newCondition();
}
```

#### Lock过程

ReentrantLock里面大部分的功能都是委托给Sync来实现的，同时Sync内部定义了lock()抽象方法由其子类去实现，默认实现了nonfairTryAcquire(int acquires)方法，可以看出它是非公平锁的默认实现方式。
``` 
public ReentrantLock() {
    sync = new NonfairSync();
}
public ReentrantLock(boolean fair) {
    sync = fair ? new FairSync() : new NonfairSync();
}
```

##### 公平锁(FairSync实现)
这里贴上AQS的`acuqire`方法
``` 
public final void acquire(int arg) {
	if (!tryAcquire(arg) &&acquireQueued(addWaiter(Node.EXCLUSIVE), arg))
		selfInterrupt();
}

```
公平锁的过程：
``` 
// AQS的acquire方法
final void lock() {
    acquire(1);
}
// 重写tryAcquire模板方法
protected final boolean tryAcquire(int acquires) {
        // 获取当前线程
        final Thread current = Thread.currentThread();
        int c = getState();
        //当前锁没被占用
        if (c == 0) {
            if (!hasQueuedPredecessors() && //1.判断同步队列中是否有节点在等待
                compareAndSetState(0, acquires)) { //2.如果没有节点等待,修改state值(表明当前锁已被占用)
                setExclusiveOwnerThread(current); //3.如果2的CAS成功,修改当前占用锁的线程为当前线程
                return true;
            }
        }
        //占用锁线程==当前线程(重入)
        else if (current == getExclusiveOwnerThread()) {
            int nextc = c + acquires;
            if (nextc < 0)
                throw new Error("Maximum lock count exceeded");
            //修改status
            setState(nextc);
            return true;
        }
        //直接获取锁失败
        return false;
    }
}
```

##### 非公平锁
``` 
final void lock() {
	//在acquire()之前先尝试获取锁
	if (compareAndSetState(0, 1))
		setExclusiveOwnerThread(Thread.currentThread());
	else
		acquire(1);
}

protected final boolean tryAcquire(int acquires) {
 	return nonfairTryAcquire(acquires);
 }
 
final boolean nonfairTryAcquire(int acquires) {
// 过程基本与公平锁一样
    final Thread current = Thread.currentThread();
    int c = getState();
    if (c == 0) {
    //与公平锁唯一区别: 这里不会去判断队列中是否为空
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


##### 公平锁与非公平锁区别

| 区别点         | lock阶段  |  tryAcuqire阶段                                         |
| ------------- | --------- | ------------------------------------------------------- |
| FairSync      | 直接acquire()           |  当前若无线程持有锁,如果同步队列为空,获取锁 |
| NonFairSync  | 先尝试获取锁,再acquire() | 当前若无线程持有锁,获取锁                  |


#### unLock过程

在`ReentrantLock`中：
``` 
public void unlock() {
    sync.release(1);
}
```
调用了AQS的`release`
``` 
  public final boolean release(int arg) {
      if (tryRelease(arg)) {
          Node h = head;
          if (h != null && h.waitStatus != 0)
              unparkSuccessor(h);
          return true;
      }
      return false;
  }
```
 其中在Sync内部类中`tryRelease`的实现:
 ``` 
 protected final boolean tryRelease(int releases) {
     int c = getState() - releases;
     //持有锁的线程==当前线程
     if (Thread.currentThread() != getExclusiveOwnerThread())
         throw new IllegalMonitorStateException();
     boolean free = false;
     //重入锁全部释放
     if (c == 0) {
         free = true;
         //置空持有锁线程
         setExclusiveOwnerThread(null);
     }
     //state==0(此时持有锁,不用cas)
     setState(c);
     return free;
 }
 ```
 
 ### ReentrantReadWriteLock
 
 重入锁ReentrantLock是排他锁，排他锁在同一时刻仅有一个线程可以进行访问，但是在大多数场景下，大部分时间都是提供读服务，而写服务占有的时间较少。然而读服务不存在数据竞争问题，如果一个线程在读时禁止其他线程读势必会导致性能降低。所以就提供了读写锁

 #### 读写锁
 
 读写锁维护着一对锁，一个读锁和一个写锁。通过分离读锁和写锁，使得并发性比一般的排他锁有了较大的提升：在同一时间可以允许多个读线程同时访问，但是在写线程访问时，所有读线程和写线程都会被阻塞。
 
 读写锁的特性:
 - 公平性：支持公平性和非公平性， 吞吐量还是非公平优于公平
 - 重入性：该锁支持重入锁，以读写线程为例：读线程在获取读锁之后，能够再次读取读锁，而写线程在获取写锁之后可以同时再次获取读锁和写锁 。
 - 锁降级：遵循获取写锁、获取读锁在释放写锁的次序，写锁能够降级成为读锁
 
 读写锁接口`ReadWriteLock`：
 ``` 
 public interface ReadWriteLock {
     Lock readLock();
 
     Lock writeLock();
 }
 ```
 
 #### ReentrantLock内部工作原理
 
 ReentrantReadWriteLock与ReentrantLock一样，其锁主体依然是Sync，它的读锁、写锁都是依靠Sync来实现的。所以ReentrantReadWriteLock实际上只有一个锁，只是在获取读取锁和写入锁的方式上不一样而已，它的读写锁其实就是两个类：ReadLock、writeLock，这两个类都是lock实现。
 
 写锁的自定义同步器需要在同步状态（一个整型变量）上维护多个读线程和一个写线程的状态，使得该状态的设计成为读写锁实现的关键。如果在一个整型变量上维护多种状态，就一定需要“按位切割使用”这个变量，读写锁将变量切分成了两个部分，高16
 位表示读，低16位表示写，划分方式如下图所示 :
 
 ![](/images/ReentrantWriteReadLock.png)
 
 
 通过位运算，读写锁可以迅速确定读和写自身的状态,假设当前同步状态值为S，写状态等于S&0x0000FFFF（将高16位全部抹去），读状态等于S>>>16（无符号补0右移16位）。当写状态增加1时，等于S+1，当读状态增加1时，等于S
 +(1<<16)，也就是S+0x00010000。根据状态的划分能得出一个推论：S不等于0时，当写状态（S&0x0000FFFF）等于0时，则读状态（S>>>16）大于0，即读锁已被获取。代码如下:
 ``` 
static final int SHARED_SHIFT   = 16;
static final int SHARED_UNIT    = (1 << SHARED_SHIFT);
static final int MAX_COUNT      = (1 << SHARED_SHIFT) - 1;
static final int EXCLUSIVE_MASK = (1 << SHARED_SHIFT) - 1;

 /** Returns the number of shared holds represented in count  */
 static int sharedCount(int c)    { return c >>> SHARED_SHIFT; }
 /** Returns the number of exclusive holds represented in count  */
 static int exclusiveCount(int c) { return c & EXCLUSIVE_MASK; }
 ```


#### 写锁的获取与释放

#####  获取
写锁是一个支持重进入的排它锁。如果当前线程已经获取了写锁，则增加写状态。如果当前线程在获取写锁时，读锁已经被获取（读状态不为0）或者该线程不是已经获取写锁的线程，则当前线程进入等待状态， `Sync`的`tryAcquire`:
``` 
protected final boolean tryAcquire(int acquires) {
      Thread current = Thread.currentThread();
      int c = getState();
      int w = exclusiveCount(c);
      if (c != 0) {
          // 存在读锁或者当前获取线程不是已经获取锁的线程
          if (w == 0 || current != getExclusiveOwnerThread())
              return false;
          if (w + exclusiveCount(acquires) > MAX_COUNT)
              throw new Error("Maximum lock count exceeded");
          // Reentrant acquire
          setState(c + acquires);
          return true;
      }
      if (writerShouldBlock() ||
          !compareAndSetState(c, c + acquires))
          return false;
      setExclusiveOwnerThread(current);
      return true;
  }
```
该方法除了重入条件（当前线程为获取了写锁的线程）之外，增加了一个读锁是否存在的判断。如果存在读锁，则写锁不能被获取，原因在于：读写锁要确保写锁的操作对读锁可见，如果允许读锁在已被获取的情况下对写锁的获取，那么正在运行的其他读线程就无法感知到当前写线程的操作。因此，只有等待其他读线程都释放了读锁，写锁才能被当前线程获取，而写锁一旦被获取，则其他读写线程的后续访问均被阻塞。写锁的释放与ReentrantLock的释放过程基本类似，每次释放均减少写状态，当写状态为0时表示写锁已被释放，从而等待的读写线程能够继续访问读写锁，同时前次写线程的修改对后续读写线程可见

##### 释放
写锁的释放流程:`WriteLock.unlock`
``` 
public void unlock() {
    sync.release(1);
}
```
可以看出还是调用的AQS的release方法:
``` 
public final boolean release(int arg) {
    if (tryRelease(arg)) {
        Node h = head;
        if (h != null && h.waitStatus != 0)
            unparkSuccessor(h);
        return true;
    }
    return false;
}
```
Sync中的`tryRelease`：
``` 
protected final boolean tryRelease(int releases) {
    if (!isHeldExclusively())
        throw new IllegalMonitorStateException();
    int nextc = getState() - releases;
    boolean free = exclusiveCount(nextc) == 0;
    if (free)
        setExclusiveOwnerThread(null);
    setState(nextc);
    return free;
}
```
写锁释放锁的整个过程和独占锁ReentrantLock相似，每次释放均是减少写状态，当写状态为0时表示 写锁已经完全释放了，从而等待的其他线程可以继续访问读写锁，获取同步状态，同时此次写线程的修改对后续的线程可见


#### 读锁的获取和释放

读锁是一个支持重进入的共享锁，它能够被多个线程同时获取，在没有其他写线程访问（或者写状态为0）时，读锁总会被成功地获取，而所做的也只是（线程安全的）增加读状态。如果当前线程已经获取了读锁，则增加读状态。如果当前线程在获取读锁时，写锁已被其他线程获取，则进入等待状态


##### 获取
ReadLock.lock:
``` 
public void lock() {
    sync.acquireShared(1);
}

#### AQS中的acquireShared
public final void acquireShared(int arg) {
    if (tryAcquireShared(arg) < 0)
        doAcquireShared(arg);
}
```
tryAcqurireShared(int arg)尝试获取读同步状态，该方法主要用于获取共享式同步状态，获取成功返回 >= 0的返回结果，否则返回 < 0 的返回结果, 在`Sync`中定义如下：
``` 
protected final int tryAcquireShared(int unused) {
    Thread current = Thread.currentThread();
    int c = getState();
     //exclusiveCount(c)计算写锁
    //如果存在写锁，且锁的持有者不是当前线程，直接返回-1
    //存在锁降级问题
    if (exclusiveCount(c) != 0 &&
        getExclusiveOwnerThread() != current)
        return -1;
    //读锁
    int r = sharedCount(c);
    
    
    /*
     * readerShouldBlock():读锁是否需要等待（公平锁原则）
     * r < MAX_COUNT：持有线程小于最大数（65535）
     * compareAndSetState(c, c + SHARED_UNIT)：设置读取锁状态
     */
    if (!readerShouldBlock() &&
        r < MAX_COUNT &&
        compareAndSetState(c, c + SHARED_UNIT)) {
        if (r == 0) {
            firstReader = current;
            firstReaderHoldCount = 1;
        } else if (firstReader == current) {
            firstReaderHoldCount++;
        } else {
            HoldCounter rh = cachedHoldCounter;
            if (rh == null || rh.tid != getThreadId(current))
                cachedHoldCounter = rh = readHolds.get();
            else if (rh.count == 0)
                readHolds.set(rh);
            rh.count++;
        }
        return 1;
}
```
整个流程如下:
1. 因为存在锁降级情况，如果存在写锁且锁的持有者不是当前线程则直接返回失败，否则继续
2. 依据公平性原则，判断读锁是否需要阻塞，读锁持有线程数小于最大值（65535），且设置锁状态成功，执行以下代码（HoldCounter部分），并返回1。如果不满足改条件，执行`fullTryAcquireShared()`。`fullTryAcquireShared(Thread current)`会根据“是否需要阻塞等待”，“读取锁的共享计数是否超过限制”等等进行处理。如果不需要阻塞等待，并且锁的共享计数没有超过限制，则通过CAS尝试获取锁，并返回1

##### 释放
整个流程与读锁类似， `Sync`中`tryReleaseShared`：
``` 
        protected final boolean tryReleaseShared(int unused) {
            Thread current = Thread.currentThread();
            //如果想要释放锁的线程为第一个获取锁的线程
            if (firstReader == current) {
                //仅获取了一次，则需要将firstReader 设置null，否则 firstReaderHoldCount - 1
                if (firstReaderHoldCount == 1)
                    firstReader = null;
                else
                    firstReaderHoldCount--;
            } 
            //获取rh对象，并更新“当前线程获取锁的信息”
            else {
                HoldCounter rh = cachedHoldCounter;
                if (rh == null || rh.tid != getThreadId(current))
                    rh = readHolds.get();
                int count = rh.count;
                if (count <= 1) {
                    readHolds.remove();
                    if (count <= 0)
                        throw unmatchedUnlockException();
                }
                --rh.count;
            }
            //CAS更新同步状态
            for (;;) {
                int c = getState();
                int nextc = c - SHARED_UNIT;
                if (compareAndSetState(c, nextc))
                    // Releasing the read lock has no effect on readers,
                    // but it may allow waiting writers to proceed if
                    // both read and write locks are now free.
                    return nextc == 0;
            }
        }
```

#### HoldCounter

在读锁获取锁和释放锁的过程中，我们一直都可以看到一个变量rh （HoldCounter ）, 一次共享锁的操作就相当于在该计数器的操作。获取共享锁，则该计数器 + 1，释放共享锁，该计数器 - 1。只有当线程获取共享锁后才能对共享锁进行释放、重入操作。所以HoldCounter的作用就是当前线程持有共享锁的数量，这个数量必须要与线程绑定在一起，否则操作其他线程锁就会抛出异常。
``` 
static final class HoldCounter {
    int count = 0;
    final long tid = getThreadId(Thread.currentThread());
}
```
HoldCounter 定义非常简单，就是一个计数器count 和线程 id tid 两个变量。按照这个意思我们看到HoldCounter 是需要和某给线程进行绑定了，我们知道如果要将一个对象和线程绑定仅仅有tid是不够的，而且从上面的代码我们可以看到HoldCounter 仅仅只是记录了tid，根本起不到绑定线程的作用。那么怎么实现呢？答案是ThreadLocal，定义如下：
``` 
static final class ThreadLocalHoldCounter
    extends ThreadLocal<HoldCounter> {
    public HoldCounter initialValue() {
        return new HoldCounter();
    }
}
```
通过上面代码HoldCounter就可以与线程进行绑定了。故而，HoldCounter应该就是绑定线程上的一个计数器，而ThradLocalHoldCounter则是线程绑定的ThreadLocal。从上面我们可以看到ThreadLocal将HoldCounter绑定到当前线程上，同时HoldCounter也持有线程Id，这样在释放锁的时候才能知道ReadWriteLock里面缓存的上一个读取线程（cachedHoldCounter）是否是当前线程。这样做的好处是可以减少ThreadLocal.get()的次数，因为这也是一个耗时操作。需要说明的是这样HoldCounter绑定线程id而不绑定线程对象的原因是避免HoldCounter和ThreadLocal互相绑定而GC难以释放它们（尽管GC能够智能的发现这种引用而回收它们，但是这需要一定的代价），所以其实这样做只是为了帮助GC快速回收对象而已。

#### 锁降级

锁降级就意味着写锁是可以降级为读锁的，但是需要遵循先获取写锁、获取读锁在释放写锁的次序。注意如果当前线程先获取写锁，然后释放写锁，再获取读锁这个过程不能称之为锁降级，锁降级一定要遵循那个次序。

在获取读锁的方法`tryAcquireShared(int unused)`中，有一段代码就是来判读锁降级的：
``` 
  int c = getState();
  //exclusiveCount(c)计算写锁
  //如果存在写锁，且锁的持有者不是当前线程，直接返回-1
  //存在锁降级问题，后续阐述
  if (exclusiveCount(c) != 0 &&
          getExclusiveOwnerThread() != current)
      return -1;
  //读锁
  int r = sharedCount(c);
```

锁降级中读锁的获取释放为必要？肯定是必要的。试想，假如当前线程A不获取读锁而是直接释放了写锁，这个时候另外一个线程B获取了写锁，那么这个线程B对数据的修改是不会对当前线程A可见的。如果获取了读锁，则线程B在获取写锁过程中判断如果有读锁还没有释放则会被阻塞，只有当前线程A释放读锁后，线程B才会获取写锁成功。

### 参考资料

- [J.U.C重入锁：ReentrantLock](http://cmsblogs.com/?p=2210)
- [ReentrantLock详解](https://juejin.im/post/5ae1b4f0f265da0b7b359d7a)
- [java多线程读写锁ReentrantReadWriteLock](https://blog.csdn.net/fuyuwei2015/article/details/72597192)
- [java并发编程艺术]