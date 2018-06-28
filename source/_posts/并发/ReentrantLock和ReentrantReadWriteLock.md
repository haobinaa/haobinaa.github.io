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
### 参考资料

- [J.U.C重入锁：ReentrantLock](http://cmsblogs.com/?p=2210)
- [ReentrantLock详解](https://juejin.im/post/5ae1b4f0f265da0b7b359d7a)
- [java多线程读写锁ReentrantReadWriteLock](https://blog.csdn.net/fuyuwei2015/article/details/72597192)