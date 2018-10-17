---
title: AQS分析
date: 2018-06-26 23:45:25
tags:
categories: 并发
---

### AQS简介

`AQS(AbstractQueuedSynchronizer)`即队列同步器， 它是构建锁或者其他同步组件的基础框架（如ReentrantLock、ReentrantReadWriteLock、Semaphore等），它是JUC并发包中的核心基础组件。

在基于AQS构建的同步器中，只能在一个时刻发生阻塞，从而降低上下文切换的开销，提高了吞吐量。同时在设计AQS时充分考虑了可伸缩行，因此J.U.C中所有基于AQS构建的同步器均可以获得这个优势。

AQS通过内置的FIFO同步队列来完成资源获取线程的排队工作，如果当前线程获取同步状态失败（锁）时，AQS则会将当前线程以及等待状态等信息构造成一个节点（Node）并将其加入同步队列，同时会阻塞当前线程，当同步状态释放时，则会把节点中的线程唤醒，使其再次尝试获取同步状态


### CLH同步队列

![](/images/aqs_clh.png)


AQS内部维护着一个CLH同步队列， 这是一个FIFO的双向队列， AQS依赖它来完成同步状态的管理，当前线程如果获取同步状态失败时，AQS则会将当前线程已经等待状态等信息构造成一个节点（Node）并将其加入到CLH同步队列，同时会阻塞当前线程，当同步状态释放时，会把首节点唤醒（公平锁），使其再次尝试获取同步状态。

在CLH同步队列中，一个节点表示一个线程，它保存着线程的引用（thread）、状态（waitStatus）、前驱节点（prev）、后继节点（next），其定义如下：
```
 static final class Node {
        // 共享模式节点
        static final Node SHARED = new Node();
        // 独占模式节点
        static final Node EXCLUSIVE = null;

        // 因为超时或者中断，节点会被设置为取消状态
        // 被取消的节点时不会参与到竞争中的，他会一直保持取消状态不会转变为其他状态；
        static final int CANCELLED =  1;
        
        // 后继节点的线程处于等待状态
        // 而当前节点的线程如果释放了同步状态或者被取消
        // 将会通知后继节点，使后继节点的线程得以运行
        static final int SIGNAL    = -1;
        
        
        // 节点在等待队列中，节点线程等待在Condition上
        // 当其他线程对Condition调用了signal()后
        // 该节点将会从等待队列中转移到同步队列中
        static final int CONDITION = -2;
        
        // 表示下一次共享式同步状态获取将会无条件地传播下去
        static final int PROPAGATE = -3;

       //  等待状态
        volatile int waitStatus; 
        
        // 前驱节点
        volatile Node prev;

        // 后继节点
        volatile Node next;

        // 获取同步状态的线程
        volatile Thread thread;
        
        // 下一个节点
        Node nextWaiter;

        /**
         * Returns true if node is waiting in shared mode.
         */
        final boolean isShared() {
            return nextWaiter == SHARED;
        }

      // 返回前驱节点
        final Node predecessor() throws NullPointerException {
            Node p = prev;
            if (p == null)
                throw new NullPointerException();
            else
                return p;
        }

        Node() {
        }

        Node(Thread thread, Node mode) {     // Used by addWaiter
            this.nextWaiter = mode;
            this.thread = thread;
        }

        Node(Thread thread, int waitStatus) { // Used by Condition
            this.waitStatus = waitStatus;
            this.thread = thread;
        }
    }
```

Node结点是对每一个访问同步代码的线程的封装，其包含了需要同步的线程本身以及线程的状态，如是否被阻塞，是否等待唤醒，是否已经被取消等。变量waitStatus则表示当前被封装成Node结点的等待状态，共有4种取值CANCELLED、SIGNAL、CONDITION、PROPAGATE

- CANCELLED：值为1，在同步队列中等待的线程等待超时或被中断，需要从同步队列中取消
该Node的结点，其结点的waitStatus为CANCELLED，即结束状态，进入该状态后的结点将不会再变化。
- SIGNAL：值为-1，被标识为该等待唤醒状态的后继结点，当其前继结点的线程释放了同步锁或被取消，将会通知该后继结点的线程执行。说白了，就是处于唤醒状态，只要前继结点释放锁，就会通知标识为SIGNAL状态的后继结点的线程执行。
- CONDITION：值为-2，与Condition相关，该标识的结点处于等待队列中，结点的线程等待在Condition上，当其他线程调用了Condition的signal()方法后，CONDITION状态的结点将从等待队列转移到同步队列中，等待获取同步锁。
- PROPAGATE：值为-3，与共享模式相关，在共享模式中，该状态标识结点的线程处于可运行状态。
- 0:值为0，代表初始化状态。


CLH同步队列结构如下:

![](/images/clh.png)

#### 入队操作

``` 
    private Node addWaiter(Node mode) {
    // 新建node指定模式
        Node node = new Node(Thread.currentThread(), mode);
        // 快速尝试添加尾节点
        Node pred = tail;
        if (pred != null) {
            node.prev = pred;
            // CAS添加尾节点
            if (compareAndSetTail(pred, node)) {
                pred.next = node;
                return node;
            }
        }
        // CAS失败，调用endq添加尾节点
        enq(node);
        return node;
    }
```

addWaiter(Node node)先通过快速尝试设置尾节点，如果失败，则调用enq(Node node)方法设置尾节点

``` 
    private Node enq(final Node node) {
    // 自旋确保CAS成功
        for (;;) {
            Node t = tail;
            // 初始化尾节点
            if (t == null) { // 队列为空，创建一个空的标志结点作为head结点，并将tail也指向它。
                if (compareAndSetHead(new Node()))
                    tail = head;
            } else {
                node.prev = t;
                // 如果CAS设置尾节点成功则返回
                if (compareAndSetTail(t, node)) {
                    t.next = node;
                    return t;
                }
            }
        }
    }
```

在上面代码中，两个方法都是通过一个CAS方法compareAndSetTail(Node expect, Node update)来设置尾节点，该方法可以确保节点是线程安全添加的。在enq(Node node)方法中，AQS通过“死循环”的方式来保证节点可以正确添加，只有成功添加后，当前线程才会从该方法返回，否则会一直执行下去。

#### 出队操作

CLH同步队列遵循FIFO，首节点的线程释放同步状态后，将会唤醒它的后继节点（next），而后继节点将会在获取同步状态成功时将自己设置为首节点，这个过程非常简单，head执行该节点并断开原首节点的next和当前节点的prev即可，注意在这个过程是不需要使用CAS来保证的，因为只有一个线程能够成功获取到同步状态

### 同步状态的获取和释放

AQS的设计模式采用的模板方法模式，子类通过继承的方式，实现它的抽象方法来管理同步状态。

#### 独占式
独占式，同一时刻仅有一个线程持有同步状态。

##### 独占式同步状态的获取
``` 
    public final void acquire(int arg) {
        if (!tryAcquire(arg) && acquireQueued(addWaiter(Node.EXCLUSIVE), arg))
            selfInterrupt();
    }
```

各个方法定义如下：
- tryAcquire：去尝试获取锁，获取成功则设置锁状态并返回true，否则返回false。该方法自定义同步组件自己实现，该方法必须要保证线程安全的获取同步状态

- addWaiter：如果tryAcquire返回FALSE（获取同步状态失败），则调用该方法将当前线程加入到CLH同步队列尾部

- acquireQueued：当前线程会根据公平性原则来进行阻塞等待（自旋）,直到获取锁为止；并且返回当前线程在等待过程中有没有中断过

- selfInterrupt：产生一个中断

``` 
final boolean acquireQueued(final Node node, int arg) {
    boolean failed = true;
    try {
    // 中断标志
        boolean interrupted = false;
        for (;;) {
        // 找到前驱节点
            final Node p = node.predecessor();
            // 如果前驱节点是头结点，并且获取同步状态成功
            if (p == head && tryAcquire(arg)) {
            // 设置当前为头结点
                setHead(node);
                p.next = null; // help GC
                failed = false;
                return interrupted;
            }
            // 获取失败，线程等待
            if (shouldParkAfterFailedAcquire(p, node) &&
                parkAndCheckInterrupt())
                interrupted = true;
        }
    } finally {
        if (failed)
            cancelAcquire(node);
    }
}
```

从上面代码中可以看到，当前线程会一直尝试获取同步状态，当然前提是只有其前驱节点为头结点才能够尝试获取同步状态，理由：

- 保持FIFO同步队列原则。
- 头节点释放同步状态后，将会唤醒其后继节点，后继节点被唤醒后需要检查自己是否为头节点。
整个流程如下:

![](/images/exclusive_acquire.png)


##### 独占式响应中断的获取

AQS提供了`acquire(int arg)`方法以供独占式获取同步状态，但是该方法对中断不响应，对线程进行中断操作后，该线程会依然位于CLH同步队列中等待着获取同步状态。为了响应中断，AQS提供了`acquireInterruptibly(int arg)`方法，该方法在等待获取同步状态时，如果当前线程被中断了，会立刻响应中断抛出异常InterruptedException

``` 
public final void acquireInterruptibly(int arg)
        throws InterruptedException {
    if (Thread.interrupted())
        throw new InterruptedException();
    if (!tryAcquire(arg))
        doAcquireInterruptibly(arg);
}
```

首先校验该线程是否已经中断了，如果是则抛出InterruptedException，否则执行tryAcquire(int arg)方法获取同步状态，如果获取成功，则直接返回，否则执行doAcquireInterruptibly(int arg)。doAcquireInterruptibly(int arg)定义如下：
``` 
private void doAcquireInterruptibly(int arg)
    throws InterruptedException {
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
                throw new InterruptedException();
        }
    } finally {
        if (failed)
            cancelAcquire(node);
    }
}
```
doAcquireInterruptibly(int arg)方法与acquire(int arg)方法仅有两个差别:
1. 方法声明抛出InterruptedException异常
2. 在中断方法处不再是使用interrupted标志，而是直接抛出InterruptedException异常。

##### 独占式响应超时获取

AQS除了提供上面两个方法外，还提供了一个增强版的方法：`tryAcquireNanos(int arg,long nanos)`。该方法为`acquireInterruptibly`方法的进一步增强，它除了响应中断外，还有超时控制。即如果当前线程没有在指定时间内获取同步状态，则会返回false，否则返回true。如下：
``` 
public final boolean tryAcquireNanos(int arg, long nanosTimeout)
        throws InterruptedException {
    if (Thread.interrupted())
        throw new InterruptedException();
    return tryAcquire(arg) ||
        doAcquireNanos(arg, nanosTimeout);
}
```
doAcquireNanos实现如下:
``` 
private boolean doAcquireNanos(int arg, long nanosTimeout)
        throws InterruptedException {
        // 超时时间<0返回false
    if (nanosTimeout <= 0L)
        return false;
    // 超时时间
    final long deadline = System.nanoTime() + nanosTimeout;
    // 新增节点
    final Node node = addWaiter(Node.EXCLUSIVE);
    boolean failed = true;
    try {
        // 自旋
        for (;;) {
            // 前驱节点
            final Node p = node.predecessor();
            // 获取同步状态成功
            if (p == head && tryAcquire(arg)) {
                setHead(node);
                p.next = null; // help GC
                failed = false;
                return true;
            }
            // 获取失败， 做超时、中断判断
            
            // 重新计算超时时间
            nanosTimeout = deadline - System.nanoTime();
            // 已超时则返回false
            if (nanosTimeout <= 0L)
                return false;
            //  //如果没有超时，则等待nanosTimeout纳秒
            if (shouldParkAfterFailedAcquire(p, node) &&
                nanosTimeout > spinForTimeoutThreshold)
                LockSupport.parkNanos(this, nanosTimeout);
            // 线程是否中断
            if (Thread.interrupted())
                throw new InterruptedException();
        }
    } finally {
        if (failed)
            cancelAcquire(node);
    }
}
```
针对超时控制，程序首先记录唤醒时间deadline ，deadline = System.nanoTime() + nanosTimeout（时间间隔）。如果获取同步状态失败，则需要计算出需要休眠的时间间隔nanosTimeout（= deadline - System.nanoTime()），如果nanosTimeout <= 0 表示已经超时了，返回false，如果大于spinForTimeoutThreshold（1000L）则需要休眠nanosTimeout ，如果nanosTimeout <= spinForTimeoutThreshold ，就不需要休眠了，直接进入快速自旋的过程。原因在于 spinForTimeoutThreshold 已经非常小了，非常短的时间等待无法做到十分精确，如果这时再次进行超时等待，相反会让nanosTimeout 的超时从整体上面表现得不是那么精确，所以在超时非常短的场景中，AQS会进行无条件的快速自旋。

流程如下:

![](/images/doAcquireNanos.png)

##### 独占式同步状态释放

当线程获取同步状态后，执行完相应逻辑后就需要释放同步状态。AQS提供了release(int arg)方法释放同步状态：
``` 
public final boolean release(int arg) {
    if (tryRelease(arg)) {
        Node h = head;
        if (h != null && h.waitStatus != 0)
        // 唤醒后继节点
            unparkSuccessor(h);
        return true;
    }
    return false;
}
```

#### 共享式

共享式与独占式的最主要区别在于同一时刻独占式只能有一个线程获取同步状态，而共享式在同一时刻可以有多个线程获取同步状态。例如读操作可以有多个线程同时进行，而写操作同一时刻只能有一个线程进行写操作，其他操作都会被阻塞。

##### 共享式同步状态获取
``` 
public final void acquireShared(int arg) {
    if (tryAcquireShared(arg) < 0)
        doAcquireShared(arg);
}

private void doAcquireShared(int arg) {
      // 共享式节点
      final Node node = addWaiter(Node.SHARED);
      boolean failed = true;
      try {
          boolean interrupted = false;
          for (;;) {
              final Node p = node.predecessor();
              if (p == head) {
                  int r = tryAcquireShared(arg);
                  if (r >= 0) {
                      setHeadAndPropagate(node, r);
                      p.next = null; // help GC
                      if (interrupted)
                          selfInterrupt();
                      failed = false;
                      return;
                  }
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
```

##### 共享式同步状态释放

``` 
public final boolean releaseShared(int arg) {
        if (tryReleaseShared(arg)) {
            doReleaseShared();
            return true;
        }
        return false;
    }
```

### 阻塞和唤醒线程


#### 阻塞
在线程获取同步状态时如果获取失败，则加入CLH同步队列，通过通过自旋的方式不断获取同步状态，但是在自旋的过程中则需要判断当前线程是否需要阻塞，其主要方法在acquireQueued()：
``` 
if (shouldParkAfterFailedAcquire(p, node) && parkAndCheckInterrupt())
    interrupted = true;
```

通过这段代码我们可以看到，在获取同步状态失败后，线程并不是立马进行阻塞，需要检查该线程的状态，检查状态的方法为 shouldParkAfterFailedAcquire(Node pred, Node node) 方法，该方法主要靠前驱节点判断当前线程是否应该被阻塞，代码如下：
``` 
private static boolean shouldParkAfterFailedAcquire(Node pred, Node node) {
    // 前驱节点的等待状态
    int ws = pred.waitStatus;
    
    // 后继节点处于等待状态，直接返回true
    if (ws == Node.SIGNAL)
        return true;
    // 前驱节点状态 > 0 ，则为Cancelled,表明该节点已经超时或者被中断了，需要从同步队列中取消
    if (ws > 0) {
    
        do {
            node.prev = pred = pred.prev;
        } while (pred.waitStatus > 0);
        pred.next = node;
    } else {
    // //前驱节点状态为Condition()、propagate()
        compareAndSetWaitStatus(pred, ws, Node.SIGNAL);
    }
    return false;
}
```
这段代码主要检查当前线程是否需要被阻塞，具体规则如下：

1. 如果当前线程的前驱节点状态为SINNAL，则表明当前线程需要被阻塞，调用unpark()方法唤醒，直接返回true，当前线程阻塞
2. 如果当前线程的前驱节点状态为CANCELLED（ws > 0），则表明该线程的前驱节点已经等待超时或者被中断了，则需要从CLH队列中将该前驱节点删除掉，直到回溯到前驱节点状态 <= 0 ，返回false
3. 如果前驱节点非SINNAL，非CANCELLED，则通过CAS的方式将其前驱节点设置为SINNAL，返回false

如果 `shouldParkAfterFailedAcquire(Node pred, Node node)` 方法返回true，则调用`parkAndCheckInterrupt()`方法阻塞当前线程, `parkAndCheckInterrupt()` 方法主要是把当前线程挂起，从而阻塞住线程的调用栈，同时返回当前线程的中断状态。其内部则是调用`LockSupport`工具类的`park()`方法来阻塞该方法。
``` 
    private final boolean parkAndCheckInterrupt() {
        LockSupport.park(this);
        return Thread.interrupted();
    }
```


#### 唤醒

当线程释放同步状态后，则需要唤醒该线程的后继节点：
```
    public final boolean release(int arg) {
        if (tryRelease(arg)) {
            Node h = head;
            if (h != null && h.waitStatus != 0)
				//唤醒后继节点
                unparkSuccessor(h);
            return true;
        }
        return false;
    }

    private void unparkSuccessor(Node node) {
        //当前节点状态
        int ws = node.waitStatus;
        //当前状态 < 0 则设置为 0
        if (ws < 0)
            compareAndSetWaitStatus(node, ws, 0);

        //当前节点的后继节点
        Node s = node.next;
        //后继节点为null或者其状态 > 0 (超时或者被中断了)
        if (s == null || s.waitStatus > 0) {
            s = null;
            //从tail节点来找可用节点
            for (Node t = tail; t != null && t != node; t = t.prev)
                if (t.waitStatus <= 0)
                    s = t;
        }
        //唤醒后继节点
        if (s != null)
            LockSupport.unpark(s.thread);
    }
```
可能会存在当前线程的后继节点为null，超时、被中断的情况，如果遇到这种情况了，则需要跳过该节点，但是为何是从tail尾节点开始，而不是从node.next开始呢？原因在于node.next仍然可能会存在null或者取消了，所以采用tail回溯办法找第一个可用的线程。最后调用LockSupport的unpark(Thread thread)方法唤醒该线程。


#### LockSupport

当需要阻塞或者唤醒一个线程的时候，AQS都是使用LockSupport这个工具类来完成的, LockSupport是用来创建锁和其他同步类的基本线程阻塞原语

每个使用LockSupport的线程都会与一个许可关联，如果该许可可用，并且可在进程中使用，则调用park()将会立即返回，否则可能阻塞。如果许可尚不可用，则可以调用 unpark 使其可用。但是注意许可不可重入，也就是说只能调用一次park()方法，否则会一直阻塞。

LockSupport定义了一系列以park开头的方法来阻塞当前线程，unpark(Thread thread)方法来唤醒一个被阻塞的线程。如下：

![](/images/locksupport.jpg)


- park(Object blocker)方法的blocker参数，主要是用来标识当前线程在等待的对象，该对象主要用于问题排查和系统监控。

- park方法和unpark(Thread thread)都是成对出现的，同时unpark必须要在park执行之后执行，当然并不是说没有不调用unpark线程就会一直阻塞，park有一个方法，它带了时间戳（parkNanos
(long nanos)：为了线程调度禁用当前线程，最多等待指定的等待时间，除非许可可用）

- park和unpark都是通过UNSAFE（sun.misc.Unsafe UNSAFE）实现的：
``` 
public native void park(boolean var1, long var2);
public native void unpark(Object var1);
```
### 参考资料

- [AQS简介](http://cmsblogs.com/?p=2174)
- [java并发包的基石](https://www.cnblogs.com/chengxiao/p/7141160.html)
- [java AQS的实现原理](https://www.jianshu.com/p/279baac48960)
- [同步状态的获取和释放](http://cmsblogs.com/?p=2197)
- [阻塞和唤醒线程](http://cmsblogs.com/?p=2205)
- [java并发之AQS详解](https://www.cnblogs.com/waterystone/p/4920797.html)