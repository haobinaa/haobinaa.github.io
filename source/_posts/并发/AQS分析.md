---
title: AQS分析
date: 2018-06-26 23:45:25
tags:
categories: 并发
---

### AQS简介

`AQS(AbstractQueuedSynchronizer)`即队列同步器， 它是构建锁或者其他同步组件的基础框架（如ReentrantLock、ReentrantReadWriteLock、Semaphore等），它是JUC并发包中的核心基础组件。

AQS的主要使用方式是继承，子类通过继承同步器并实现它的抽象方法来管理同步状态。

AQS使用一个int类型的成员变量state来表示同步状态，当state>0时表示已经获取了锁，当state = 0时表示释放了锁。它提供了三个方法（getState()、setState(int newState)、compareAndSetState(int expect,int update)）来对同步状态state进行操作，当然AQS可以确保对state的操作是安全的。

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
        jj
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

Node结点是对每一个访问同步代码的线程的封装，其包含了需要同步的线程本身以及线程的状态，如是否被阻塞，是否等待唤醒，是否已经被取消等。变量waitStatus则表示当前被封装成Node结点的等待状态(与同步器的state是不同的)，共有4种取值CANCELLED、SIGNAL、CONDITION、PROPAGATE

- CANCELLED(1)：在同步队列中等待的线程等待超时或被中断，需要从同步队列中取消
该Node的结点，其结点的waitStatus为CANCELLED，即结束状态，进入该状态后的结点将不会再变化。
- SIGNAL(-1)：被标识为该等待唤醒状态的后继结点，当其前继结点的线程释放了同步锁或被取消，将会通知该后继结点的线程执行。说白了，就是处于唤醒状态，只要前继结点释放锁，就会通知标识为SIGNAL状态的后继结点的线程执行。
- CONDITION(-2)：与Condition相关，该标识的结点处于等待队列中，结点的线程等待在Condition上，当其他线程调用了Condition的signal()
方法后，CONDITION状态的结点将从等待队列转移到同步队列中，等待获取同步锁。
- PROPAGATE(-3)：与共享模式相关，在共享模式中，该状态标识结点的线程处于可运行状态。
- 默认状态(0):表示当前节点在队列中，等待获取锁 


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
            // CAS添加尾节点, 确保没有其他线程插入
            if (compareAndSetTail(pred, node)) {
                // 尾节点的next指向自己?
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
            if (t == null) { 
            // 队列为空，初始化head和tail
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

### acquire-release流程（独占式）

AQS的设计模式采用的模板方法模式，子类通过继承的方式，实现它的抽象方法来管理同步状态。

#### acquire

此方法是独占模式下线程获取共享资源的顶层入口。如果获取到资源，线程直接返回，否则进入等待队列，直到获取到资源为止，且整个过程忽略中断的影响。这也正是lock()的语义，当然不仅仅只限于lock()。获取到资源后，线程就可以去执行其临界区代码了。下面是acquire()的源码：

``` 
    public final void acquire(int arg) {
        if (!tryAcquire(arg) && acquireQueued(addWaiter(Node.EXCLUSIVE), arg))
            selfInterrupt();
    }
```
函数流程如下：
1. tryAcquire()尝试直接去获取资源，如果成功则直接返回；
2. addWaiter()将该线程加入等待队列的尾部，并标记为独占模式；
3. acquireQueued()使线程在等待队列中获取资源，一直获取到资源后才返回。如果在整个等待过程中被中断过，则返回true，否则返回false。
4. 如果线程在等待过程中被中断过，它是不响应的。只是获取资源后才再进行自我中断selfInterrupt()，将中断补上。

##### acquireQueued

在把node插入队列末尾后,它并不立即挂起该节点中线程,因为在插入它的过程中,前面的线程可能已经执行完成,所以它会先进行自旋操作acquireQueued(node, arg),尝试让该线程重新获取锁!当条件满足获取到了锁则可以从自旋过程中退出，否则继续。

``` 
final boolean acquireQueued(final Node node, int arg) {
    //标记是否成功拿到资源
    boolean failed = true;
    try {
        // 标记等待过程中是否被中断过
        boolean interrupted = false;
        // 自旋
        for (;;) {
        // 找到前驱节点
            final Node p = node.predecessor();
            // 如果前驱是head，即该结点已成老二，那么便有资格去尝试获取资源
            // （可能是老大释放完资源唤醒自己的，当然也可能被interrupt了）。
            if (p == head && tryAcquire(arg)) {
              // 拿到资源后，将head指向该结点。
              // 所以head所指的标杆结点，就是当前获取到资源的那个结点或null。
                setHead(node);
                // setHead中node.prev已置为null
                // 此处再将head.next置为null，为了方便GC回收以前的head结点
                // 就意味着之前拿完资源的结点出队了！
                p.next = null; 
                failed = false;
                //返回等待过程中是否被中断过
                return interrupted;
            }
            // 如果自己可以休息了，就进入waiting状态，直到被unpark()
            if (shouldParkAfterFailedAcquire(p, node) &&
                parkAndCheckInterrupt())
                // 如果等待过程中被中断过，哪怕只有那么一次，就将interrupted标记为true
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

###### shouldParkAfterFailedAcquire
此方法主要用于检查状态，看看自己是否真的可以去休息了（进入waiting状态)
``` 
private static boolean shouldParkAfterFailedAcquire(Node pred, Node node) {
    // 前驱节点的等待状态
    int ws = pred.waitStatus;
    
    // 后继节点处于等待状态，等待前驱节点唤醒自己，直接返回true(进入wating状态了)
    if (ws == Node.SIGNAL)
        return true;
    // 前驱节点状态 > 0 ，则为Cancelled,表明该节点已经超时或者被中断了，需要从同步队列中取消
    if (ws > 0) {
      // 如果前驱放弃了（状态为CANCELLED）
      // 那就一直往前找，直到找到最近一个正常等待的状态，并排在它的后边。
      // 备注：那些放弃的结点，由于被一直挤到它们前边，它们相当于形成一个无引用链，稍后就会被gc
        do {
            node.prev = pred = pred.prev;
        } while (pred.waitStatus > 0);
        pred.next = node;
    } else {
    // 如果前驱正常，那就把前驱的状态设置成SIGNAL，让前驱节点释放后通知一下
    // 备注有可能失败，可能可能前驱节点刚刚释放
        compareAndSetWaitStatus(pred, ws, Node.SIGNAL);
    }
    return false;
}
```
整个流程中，如果前驱结点的状态不是SIGNAL，那么自己就不能安心去休息（进入wating状态），需要去找个安心的休息点，同时可以再尝试下看有没有机会轮到自己拿号。

##### parkAndCheckInterrupt
果线程找好安全休息点后，那就可以安心去休息了。此方法就是让线程去休息，真正进入等待状态(wating)。

``` 
    private final boolean parkAndCheckInterrupt() {
       //调用park()使线程进入waiting状态
        LockSupport.park(this);
        //如果被唤醒，查看自己是不是被中断的。
        return Thread.interrupted();
    }
```
park()会让当前线程进入waiting状态。在此状态下，有两种途径可以唤醒该线程：1）被unpark()；2）被interrupt()。需要注意的是，Thread.interrupted()会清除当前线程的中断标记位。 

##### acquireQueued流程总结
1. 结点进入队尾后，检查状态，找到安全休息点
2. 调用park()进入waiting状态，等待unpark()或interrupt()唤醒自己
3. 被唤醒后，看自己是不是有资格能拿到号。如果拿到，head指向当前结点，并返回从入队到拿到号的整个过程中是否被中断过；如果没拿到，继续流程1


##### acquire流程总结
1. 调用自定义同步器的tryAcquire()尝试直接去获取资源，如果成功则直接返回；
2. 没成功，则addWaiter()将该线程加入等待队列的尾部，并标记为独占模式；
3. acquireQueued()使线程在等待队列中休息，有机会时（轮到自己，会被unpark()）会去尝试获取资源。获取到资源后才返回。如果在整个等待过程中被中断过，则返回true，否则返回false。
4. 如果线程在等待过程中被中断过，它是不响应的。只是获取资源后才再进行自我中断selfInterrupt()，将中断补上。

流程图：
![](/images/aqs_acquire.png)

#### release

根据tryRelease()的返回值来判断该线程是否已经完成释放掉资源, 自定义同步器的时候设计`tryRelease`需要注意这点
``` 
  public final boolean release(int arg) {
      if (tryRelease(arg)) {
          //找到头结点
          Node h = head;
          if (h != null && h.waitStatus != 0)
          //唤醒等待队列里的下一个线程
              unparkSuccessor(h);
          return true;
      }
      return false;
  }
```

##### tryRelease
此方法尝试去释放指定量的资源。
``` 
  protected boolean tryRelease(int arg) {
      throw new UnsupportedOperationException();
  }
```
跟tryAcquire()一样，这个方法是需要独占模式的自定义同步器去实现的。正常来说，tryRelease()都会成功的，因为这是独占模式，该线程来释放资源，那么它肯定已经拿到独占资源了，直接减掉相应量的资源即可(state-=arg)，也不需要考虑线程安全的问题。但要注意它的返回值，上面已经提到了，release()是根据tryRelease()的返回值来判断该线程是否已经完成释放掉资源了！所以自义定同步器在实现时，如果已经彻底释放资源(state=0)，要返回true，否则返回false。

##### unparkSuccessor
``` 
    private void unparkSuccessor(Node node) {
        //当前节点状态
        int ws = node.waitStatus;
        //当前状态 < 0 则设置为 0
        if (ws < 0)
            compareAndSetWaitStatus(node, ws, 0);

        // 找到下一个需要唤醒的节点
        Node s = node.next;
        //后继节点为null或者其状态 > 0 (已取消(CANCELLED))
        if (s == null || s.waitStatus > 0) {
            s = null;
            //从tail节点来找可用节点
            for (Node t = tail; t != null && t != node; t = t.prev)
            // <=0的结点，都是还有效的结点。
                if (t.waitStatus <= 0)
                    s = t;
        }
        //唤醒后继节点
        if (s != null)
            LockSupport.unpark(s.thread);
    }
```

用unpark()唤醒等待队列中最前边的那个未放弃线程，这里我们也用s来表示吧。此时，再和acquireQueued()联系起来，s被唤醒后，进入if (p == head && tryAcquire(arg))的判断（即使p!=head也没关系，它会再进入shouldParkAfterFailedAcquire()寻找一个安全点。这里既然s已经是等待队列中最前边的那个未放弃线程了，那么通过shouldParkAfterFailedAcquire()的调整，s也必然会跑到head的next结点，下一次自旋p==head就成立啦），然后s把自己设置成head标杆结点，表示自己已经获取到资源了，acquire()也返回了！！


##### realease总结

release()是独占模式下线程释放共享资源的顶层入口。它会释放指定量的资源，如果彻底释放了（即state=0）,它会唤醒等待队列里的其他线程来获取资源。



### acquireShared-releaseShared(共享式)


#### acquireShared
　此方法是共享模式下线程获取共享资源的顶层入口。它会获取指定量的资源，获取成功则直接返回，获取失败则进入等待队列，直到获取到资源为止，整个过程忽略中断。

``` 
    public final void acquireShared(int arg) {
    // 负数代表获取失败， 正数代表获取成功还有剩余资源
    // 0代表获取成功，但没有剩余资源
        if (tryAcquireShared(arg) < 0)
            doAcquireShared(arg);
    }
```
　这里tryAcquireShared()依然需要自定义同步器去实现。但是AQS已经把其返回值的语义定义好了：负值代表获取失败；0代表获取成功，但没有剩余资源；正数表示获取成功，还有剩余资源，其他线程还可以去获取。所以这里acquireShared()的流程就是：
1. tryAcquireShared()尝试获取资源，成功则直接返回；
2. 失败则通过doAcquireShared()进入等待队列，直到获取到资源为止才返回。

##### doAcquireShared
``` 
    private void doAcquireShared(int arg) {
        // 加入队列尾部
        final Node node = addWaiter(Node.SHARED);
        //是否成功标志
        boolean failed = true;
        try {
            //等待过程中是否被中断过的标志
            boolean interrupted = false;
            for (;;) {
                // 前驱节点
                final Node p = node.predecessor();
                //如果是head的下个节点，因为head是拿到资源的线程，此时node被唤醒
                // 很可能是head用完资源来唤醒自己的
                if (p == head) {
                //尝试获取资源
                    int r = tryAcquireShared(arg);
                    // 获取成功
                    if (r >= 0) {
                        //将head指向自己，还有剩余资源可以再唤醒之后的线程
                        setHeadAndPropagate(node, r);
                        p.next = null; // help GC
                        //如果等待过程中被打断过，此时将中断补上
                        if (interrupted)
                            selfInterrupt();
                        failed = false;
                        return;
                    }
                }
                //判断状态，寻找安全点，进入waiting状态，等着被unpark()或interrupt()
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
这个流程和acquireQueued类似，。只不过这里将补中断的selfInterrupt()放到doAcquireShared()里了，而独占模式是放到acquireQueued()之外。

跟独占模式比，还有一点需要注意的是，这里只有线程是head.next时（“老二”），才会去尝试获取资源，有剩余的话还会唤醒之后的队友。那么问题就来了，假如老大用完后释放了5个资源，而老二需要6个，老三需要1个，老四需要2个。老大先唤醒老二，老二一看资源不够，他是把资源让给老三呢，还是不让？答案是否定的！老二会继续park()等待其他线程释放资源，也更不会去唤醒老三和老四了。独占模式，同一时刻只有一个线程去执行，这样做未尝不可；但共享模式下，多个线程是可以同时执行的，现在因为老二的资源需求量大，而把后面量小的老三和老四也都卡住了。当然，这并不是问题，只是AQS保证严格按照入队顺序唤醒罢了（保证公平，但降低了并发）。

###### setHeadAndPropagate
``` 
    private void setHeadAndPropagate(Node node, int propagate) {
        Node h = head; // Record old head for check below
        //head指向自己
        setHead(node);
         //如果还有剩余量，继续唤醒下一个邻居线程
        if (propagate > 0 || h == null || h.waitStatus < 0 ||
            (h = head) == null || h.waitStatus < 0) {
            Node s = node.next;
            if (s == null || s.isShared())
                doReleaseShared();
        }
    }
```
此方法在setHead()的基础上多了一步，就是自己苏醒的同时，如果条件符合（比如还有剩余资源），还会去唤醒后继结点，毕竟是共享模式！

##### acquireShared总结
我们再梳理一下它的流程：
1. tryAcquireShared()尝试获取资源，成功则直接返回；
2. 失败则通过doAcquireShared()进入等待队列park()，直到被unpark()/interrupt()并成功获取到资源才返回。整个等待过程也是忽略中断的。其实跟acquire()的流程大同小异，只不过多了个自己拿到资源后，还会去唤醒后继队友的操作（这才是共享嘛）。


#### releaseShared
共享模式下线程释放共享资源,它会释放指定量的资源，如果成功释放且允许唤醒等待线程，它会唤醒等待队列里的其他线程来获取资源。

``` 
  public final boolean releaseShared(int arg) {
    // 尝试释放资源
      if (tryReleaseShared(arg)) {
      // 唤醒后继结点
          doReleaseShared();
          return true;
      }
      return false;
  }

```
　此方法的流程也比较简单，一句话：释放掉资源后，唤醒后继。跟独占模式下的release()相似，但有一点稍微需要注意：独占模式下的tryRelease()在完全释放掉资源（state=0）后，才会返回true去唤醒其他线程，这主要是基于独占下可重入的考量；而共享模式下的releaseShared()则没有这种要求，共享模式实质就是控制一定量的线程并发执行，那么拥有资源的线程在释放掉部分资源时就可以唤醒后继等待结点。例如，资源总量是13，A（5）和B（7）分别获取到资源并发运行，C（4）来时只剩1个资源就需要等待。A在运行过程中释放掉2个资源量，然后tryReleaseShared(2)返回true唤醒C，C一看只有3个仍不够继续等待；随后B又释放2个，tryReleaseShared(2)返回true唤醒C，C一看有5个够自己用了，然后C就可以跟A和B一起运行。而ReentrantReadWriteLock读锁的tryReleaseShared()只有在完全释放掉资源（state=0）才返回true，所以自定义同步器可以根据需要决定tryReleaseShared()的返回值。

##### doReleaseShared
此方法主要用于唤醒后继。
``` 
private void doReleaseShared() {
    for (;;) {
        Node h = head;
        if (h != null && h != tail) {
            int ws = h.waitStatus;
            if (ws == Node.SIGNAL) {
                if (!compareAndSetWaitStatus(h, Node.SIGNAL, 0))
                    continue;            // loop to recheck cases
                // 唤醒后继
                unparkSuccessor(h);
            }
            else if (ws == 0 &&
                     !compareAndSetWaitStatus(h, 0, Node.PROPAGATE))
                continue;                // loop on failed CAS
        }
        if (h == head)                   // loop if head changed
            break;
    }
}
```



### 独占式响应超时获取

AQS还提供了一个方法：`tryAcquireNanos(int arg,long nanos)`。该方法为`acquireInterruptibly`方法的进一步增强，它除了响应中断外，还有超时控制。即如果当前线程没有在指定时间内获取同步状态，则会返回false，否则返回true。如下：
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



### LockSupport

当需要阻塞或者唤醒一个线程的时候，AQS都是使用LockSupport这个工具类来完成的, LockSupport是用来创建锁和其他同步类的基本线程阻塞原语

#### 核心方法

因为LockSupport的核心方法都是基于Unsafe类中的park和unpark方法
``` 
    public native void unpark(Object var1);

    public native void park(boolean var1, long var2);
```
 
- park:阻塞线程,线程在一下三种情况下会被堵塞
  1. 调用unpark方法,释放该线程的许可
  2. 该线程被中断
  3. 设置的时间到了。并且，当time为绝对时间时，isAbsolute为true，否则，isAbsolute为false。当time为0时，表示无限等待，直到unpark发生。
- unpark:释放线程的许可，即激活调用park后阻塞的线程。
 
 
 
#### LockSupport原语总结

LockSupport用来创建锁和其他同步类的基本线程阻塞原语。简而言之，当调用LockSupport.park时，表示当前线程将会等待，直至获得许可，当调用LockSupport.unpark时，必须把等待获得许可的线程作为参数进行传递，好让此线程继续运行。






### 参考资料

- [AQS简介](http://cmsblogs.com/?p=2174)
- [java并发包的基石](https://www.cnblogs.com/chengxiao/p/7141160.html)
- [java AQS的实现原理](https://www.jianshu.com/p/279baac48960)
- [同步状态的获取和释放](http://cmsblogs.com/?p=2197)
- [阻塞和唤醒线程](http://cmsblogs.com/?p=2205)
- [java并发之AQS详解](https://www.cnblogs.com/waterystone/p/4920797.html)
- [LockSupport详解](https://leokongwq.github.io/2017/01/13/java-LockSupport.html)
- [java队列同步器AQS](https://blog.csdn.net/pange1991/article/details/80930394)