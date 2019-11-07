---
title: AQS下的并发工具类
date: 2019-10-23 19:57:21
tags:
categories: 并发
---
### CountDownLatch
`CountDownLatch`也叫闭锁, 它允许一个或多个线程一直等待，直到其他线程的操作执行完后再执行。

#### 使用示例

CountDownLatch的构造函数接收一个int类型的参数作为计数器，如果你想等待 ***N个点*** 完成，这里就传入N。当调用CountDownLatch的countDown方法时，N就会减1，CountDownLatch的await方法会阻塞当前线程，直到N变成零。

> 备注：由于CountDownLatch方法可以用在任何地方，这里说的N个点，可以是N个线程，也可以是1个线程里的N个执行步骤。用在多个线程时，只需要把CountDownLatch的引用传递到线程里即可。

示例(所有工人工作完成后在打印完成)：
```java 
public class CountDownLatchDemo {

    public static void main(String[] args) {

        CountDownLatch latch = new CountDownLatch(2);

        Thread t1 = new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    Thread.sleep(5000);
                } catch (InterruptedException ignore) {
                }
                // 休息 5 秒后(模拟线程工作了 5 秒)，调用 countDown()
                latch.countDown();
            }
        }, "t1");

        Thread t2 = new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    Thread.sleep(10000);
                } catch (InterruptedException ignore) {
                }
                // 休息 10 秒后(模拟线程工作了 10 秒)，调用 countDown()
                latch.countDown();
            }
        }, "t2");

        t1.start();
        t2.start();

        Thread t3 = new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    // 阻塞，等待 state 减为 0
                    latch.await();
                    System.out.println("线程 t3 从 await 中返回了");
                } catch (InterruptedException e) {
                    System.out.println("线程 t3 await 被中断");
                    Thread.currentThread().interrupt();
                }
            }
        }, "t3");
        Thread t4 = new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    // 阻塞，等待 state 减为 0
                    latch.await();
                    System.out.println("线程 t4 从 await 中返回了");
                } catch (InterruptedException e) {
                    System.out.println("线程 t4 await 被中断");
                    Thread.currentThread().interrupt();
                }
            }
        }, "t4");

        t3.start();
        t4.start();
    }
}
```
该例子， t3和t4会一直阻塞至 t1，t2全部完成后才会执行

#### 源码分析

##### 构造方法

需要传入一个不小于 0 的整数：
```java
public CountDownLatch(int count) {
    if (count < 0) throw new IllegalArgumentException("count < 0");
    this.sync = new Sync(count);
}
// 内部封装一个 Sync 类继承自 AQS
private static final class Sync extends AbstractQueuedSynchronizer {
    Sync(int count) {
        // 这样就 state == count 了
        setState(count);
    }
    ...
}
```

AQS 里面的 state 是一个整数值，这边用一个 int count 参数其实初始化就是设置了这个值，所有调用了 await 方法的等待线程会挂起，然后有其他一些线程会做 state = state - 1 操作，当 state 减到 0 的同时，那个线程会负责唤醒调用了 await 方法的所有线程。

对于 CountDownLatch，我们仅仅需要关心两个方法，一个是 countDown() 方法，另一个是 await() 方法。countDown() 方法每次调用都会将 state 减 1，直到 state 的值为 0；而 await 是一个阻塞方法，当 state 减为 0 的时候，await 方法才会返回。

##### await

await() 方法，它代表线程阻塞，等待 state 的值减为 0。

```java
public void await() throws InterruptedException {
    sync.acquireSharedInterruptibly(1);
}
public final void acquireSharedInterruptibly(int arg)
        throws InterruptedException {
    // 响应中断状态
    if (Thread.interrupted())
        throw new InterruptedException();
    // 此时state才初始化，所以这里为true
    if (tryAcquireShared(arg) < 0)
        doAcquireSharedInterruptibly(arg);
}
// 只有当 state == 0 的时候，这个方法才会返回 1
protected int tryAcquireShared(int acquires) {
    return (getState() == 0) ? 1 : -1;
}
```

接下来是 `doAcquireSharedInterruptibly` , 从方法名我们就可以看出，这个方法是获取共享锁，并且此方法是可中断的（中断的时候抛出 InterruptedException 退出这个方法）:

```java
private void doAcquireSharedInterruptibly(int arg)
    throws InterruptedException {
    // 1. 以共享模式入队
    final Node node = addWaiter(Node.SHARED);
    boolean failed = true;
    try {
        for (;;) {
            final Node p = node.predecessor();
            if (p == head) {
                // 同上，只要 state 不等于 0，那么这个方法返回 -1
                int r = tryAcquireShared(arg);
                // 如果 state=0， r的值为1
                if (r >= 0) {
                    setHeadAndPropagate(node, r);
                    p.next = null; // help GC
                    failed = false;
                    return;
                }
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


// ===  shouldParkAfterFailedAcquire
    private static boolean shouldParkAfterFailedAcquire(Node pred, Node node) {
        int ws = pred.waitStatus;
        // 如果前驱为 SIGNAL 直接返回true
        if (ws == Node.SIGNAL)
            return true;
        if (ws > 0) {
            // 如果取消了排队，则将前面所有取消的移除队列
            do {
                node.prev = pred = pred.prev;
            } while (pred.waitStatus > 0);
            pred.next = node;
        } else {
            // 将前驱节点设置为 SIGNAL，并进入下一次for循环
            compareAndSetWaitStatus(pred, ws, Node.SIGNAL);
        }
        return false;
    }
```

结合上述的demo分析源码过程：

(1) 首先线程t3经过第一步`addWaiter`入队，得到阻塞队列如下:

![](/images/aqs/countdown-1.png)


(2) 由于 `tryAcquireShared` 这个方法会返回 -1，所以 `if (r >= 0)` 这个分支不会进去。到 `shouldParkAfterFailedAcquire` 的时候，t3 将 head 的 waitStatus 值设置为 -1，并开始下一次循环,如下：

![](/images/aqs/countdown-2.png)

(3) 进入到 parkAndCheckInterrupt 的时候，t3 挂起, 再分析 t4 入队，t4 会将前驱节点 t3 所在节点的 waitStatus 设置为 -1，t4 入队后，应该是这样的：

![](/images/aqs/countdown-3.png)

这样t3和t4都被挂起了，等待唤醒

##### countDown 流程

```java
public void countDown() {
    sync.releaseShared(1);
}

public final boolean releaseShared(int arg) {
    // 只有当 state 减为 0 的时候，tryReleaseShared 才返回 true
    // 否则只是简单的 state = state - 1 那么 countDown 方法就结束了
    if (tryReleaseShared(arg)) {
        // 唤醒 await 的线程
        doReleaseShared();
        return true;
    }
    return false;
}
// 这个方法很简单，用自旋的方法实现 state 减 1
protected boolean tryReleaseShared(int releases) {
    for (;;) {
        int c = getState();
        // 如果直接是0，就返回了(代表并没有释放锁的过程)
        if (c == 0)
            return false;
        int nextc = c-1;
        if (compareAndSetState(c, nextc))
            return nextc == 0;
    }
}
```

countDown 方法就是每次调用都将 state 值减 1，如果 state 减到 0 了，那么就调用下面的方法进行唤醒阻塞队列中的线程：
```java
// 调用这个方法的时候，state == 0
private void doReleaseShared() {
    for (;;) {
        Node h = head;
        if (h != null && h != tail) {
            int ws = h.waitStatus;
            // 首先，头节点已经被第一个入队的线程设置为  Node.SIGNAL（-1） 了
            if (ws == Node.SIGNAL) {
                // 将头节点的 waitStatus 设置为0
                if (!compareAndSetWaitStatus(h, Node.SIGNAL, 0))
                    continue;            
                // 唤醒 head的后继节点
                unparkSuccessor(h);
            }
            else if (ws == 0 &&
                     !compareAndSetWaitStatus(h, 0, Node.PROPAGATE)) 
                continue;                
        }
        if (h == head)
            break;
    }
}
```
这里已经把head之后的第一个节点给唤醒了，返回到刚刚 await 中断的地方看 parkAndCheckInterrupt 返回false(线程没有中断的情况下):
```java
private void doAcquireSharedInterruptibly(int arg)
    throws InterruptedException {
    final Node node = addWaiter(Node.SHARED);
    boolean failed = true;
    try {
        for (;;) {
            final Node p = node.predecessor();
            if (p == head) {
                int r = tryAcquireShared(arg);
                if (r >= 0) {
                    setHeadAndPropagate(node, r); // 2. 这里是下一步
                    p.next = null; // help GC
                    failed = false;
                    return;
                }
            }
            if (shouldParkAfterFailedAcquire(p, node) &&
                // 1. 唤醒后这个方法返回, 进入下一次循环
                parkAndCheckInterrupt())
                throw new InterruptedException();
        }
    } finally {
        if (failed)
            cancelAcquire(node);
    }
}
```

然后就会调用 `setHeadAndPropagate(node, r)` 占领头节点，然后唤醒队列的其他线程:
```java
private void setHeadAndPropagate(Node node, int propagate) {
    Node h = head;
    setHead(node);

    // 这里的意思是唤醒当前 node 之后的节点
    // 即 t3 已经醒了，马上唤醒 t4,如果 t4 后面还有 t5，那么 t4 醒了以后，马上将 t5 给唤醒
    if (propagate > 0 || h == null || h.waitStatus < 0 ||
        (h = head) == null || h.waitStatus < 0) {
        Node s = node.next;
        if (s == null || s.isShared())
            // 又是这个方法，只是现在的 head 已经不是原来的空节点了，是 t3 的节点了
            doReleaseShared();
    }
}
```

接着回到 doReleaseShared，这里经过之前的流程第一个节点(t3)已经是头节点了 ：
```java
// 此时的 state 是0
private void doReleaseShared() {
    for (;;) {
        Node h = head;
        //  h == null: 说明阻塞队列为空
        //  h == tail: 说明头结点可能是刚刚初始化的头节点，队列并没有任何节点
        // 或者是普通线程节点，但是此节点既然是头节点了，那么代表已经被唤醒了，阻塞队列没有其他节点了
        // 所以这两种情况不需要进行唤醒后继节点
        if (h != null && h != tail) {
            int ws = h.waitStatus;
            // t4(下一个节点) 将头节点(此时是 t3)的 waitStatus 设置为 Node.SIGNAL（-1） 了
            if (ws == Node.SIGNAL) {
                // 这里 CAS 可能失败, 因为第一轮for循环唤醒 t4
                // 如果t4已经 setHeadAndPropagate 成为头节点了才跑到下面的 if (h == head)
                // 这时候会返回false并进入下一轮循环
                // 此时 t4 也进入了这个方法那么 t3 和 t4就只有一个能成功
                if (!compareAndSetWaitStatus(h, Node.SIGNAL, 0))
                    continue;            
                // 就是这里，唤醒 head 的后继节点，也就是阻塞队列中的第一个节点
                // 在这里，也就是唤醒 t4
                unparkSuccessor(h);
            }
            else if (ws == 0 &&
                     // 这个 CAS 失败的场景是：执行到这里的时候，刚好有一个节点入队，入队会将这个 ws 设置为 -1
                     !compareAndSetWaitStatus(h, 0, Node.PROPAGATE))
                continue;                
        }
        // h == head, 说明头节点还没有被刚刚用 unparkSuccessor 唤醒的线程（这里可以理解为 t4）占有，此时 break 退出循环(我觉得可能是为了避免死循环， 因为这里也是循环退出的条件)
        // h != head：头节点被刚刚唤醒的线程（t4）占有，那么这里重新进入下一轮循环，唤醒下一个节点
        // 从之前的代码可以看出，t4被唤醒后是会调用 setHeadAndPropagate 来唤醒接下来的节点的
        // 这里还是会进行下一次循环来唤醒 t5， 是基于吞吐量的考虑
        if (h == head)                   
            break;
    }
}
```


### CyclicBarrier

CyclicBarrier 字面意思回环栅栏，通过它可以实现让一组线程等待至某个状态之后再全部同时执行。
叫做回环是因为当所有等待线程都被释放以后，CyclicBarrier可以被重用。
叫做栅栏，大概是描述所有线程被栅栏挡住了，当都达到时，一起跳过栅栏执行，也算形象。我们可以把这个状态就叫做barrier。

![](/images/aqs/cyclicbarrier-2.png)

CyclicBarrier 的源码是基于 Condition 实现的

#### 使用例子

这里模拟的是旅游出发的时候， 导游等到每个人都到达了，出发前把签证发到每个人手上在一起出发。
```java
public class CyclicBarrierDemo {

    public static void main(String[] args) {
        CyclicBarrier cyclicBarrier = new CyclicBarrier(3, new TourGuideTask());
        Executor executor = Executors.newFixedThreadPool(3);
        //登哥最大牌，到的最晚
        executor.execute(new TravelTask(cyclicBarrier, "哈登", 5));
        executor.execute(new TravelTask(cyclicBarrier, "保罗", 3));
        executor.execute(new TravelTask(cyclicBarrier, "戈登", 1));
    }

    static class TravelTask implements Runnable {

        private CyclicBarrier cyclicBarrier;
        private String name;
        private int arriveTime;//赶到的时间

        public TravelTask(CyclicBarrier cyclicBarrier, String name, int arriveTime) {
            this.cyclicBarrier = cyclicBarrier;
            this.name = name;
            this.arriveTime = arriveTime;
        }

        @Override
        public void run() {
            try {
                //模拟达到需要花的时间
                Thread.sleep(arriveTime * 1000);
                System.out.println(name + "到达集合点");
                cyclicBarrier.await();
                System.out.println(name + "开始旅行啦～～");
            } catch (InterruptedException e) {
                e.printStackTrace();
            } catch (BrokenBarrierException e) {
                e.printStackTrace();
            }
        }
    }


    static class TourGuideTask implements Runnable {
        @Override
        public void run() {
            System.out.println("****导游分发护照签证****");
            try {
                //模拟发护照签证需要2秒
                Thread.sleep(2000);
            } catch (InterruptedException e) {
                e.printStackTrace();
            }
        }
    }
}
```

#### 基本属性

```java
public class CyclicBarrier {
    // CyclicBarrier 是可以重复使用的，每次从开始使用到穿过栅栏当做"一代"，或者"一个周期"
    private static class Generation {
        boolean broken = false;
    }

    // 栅栏的锁
    private final ReentrantLock lock = new ReentrantLock();

    // CyclicBarrier 是基于 Condition 的
    // Condition 是“条件”的意思，CyclicBarrier 的等待线程通过 barrier 的“条件”是大家都到了栅栏上
    private final Condition trip = lock.newCondition();

    // 参与的线程数
    private final int parties;

    // 如果设置了这个，代表越过栅栏之前，要执行相应的操作
    private final Runnable barrierCommand;

    // 当前所处的“代”
    private Generation generation = new Generation();

    // 还没有到栅栏的线程数，这个值初始为 parties，然后递减
    // 到栅栏的线程数 = parties - count
    private int count;

    // 构造函数
    // 第一个参数是一起执行的线程数
    // 第二个参数是当线程都处于 barrier 的时候，先执行的一个线程
    public CyclicBarrier(int parties, Runnable barrierAction) {
        if (parties <= 0) throw new IllegalArgumentException();
        this.parties = parties;
        this.count = parties;
        this.barrierCommand = barrierAction;
    }

    public CyclicBarrier(int parties) {
        this(parties, null);
    }
```

概念图:
![](/images/aqs/cyclicbarrier-3.png)

#### 源码分析

##### 开启新的一代(nextGeneration)

开启新的一代，类似于重新实例化一个 CyclicBarrier 实例

``` 
// 开启新的一代，当最后一个线程到达栅栏上的时候，调用这个方法来唤醒其他线程，同时初始化“下一代”
private void nextGeneration() {
    // 首先，需要唤醒所有的在栅栏上等待的线程
    trip.signalAll();
    // 更新 count 的值
    count = parties;
    // 重新生成“新一代”
    generation = new Generation();
}
```

##### 打破一个栅栏

``` 
private void breakBarrier() {
    // 设置状态 broken 为 true
    generation.broken = true;
    // 重置 count 为初始值 parties
    count = parties;
    // 唤醒所有已经在等待的线程
    trip.signalAll();
}
```

#### await-等待通过栅栏

等待通过栅栏方法 await 方法：
``` 
// 不带超时机制
public int await() throws InterruptedException, BrokenBarrierException {
    try {
        return dowait(false, 0L);
    } catch (TimeoutException toe) {
        throw new Error(toe); // cannot happen
    }
}
// 带超时机制，如果超时抛出 TimeoutException 异常
public int await(long timeout, TimeUnit unit)
    throws InterruptedException,
           BrokenBarrierException,
           TimeoutException {
    return dowait(true, unit.toNanos(timeout));
}
```

doawait:

```java
private int dowait(boolean timed, long nanos)
        throws InterruptedException, BrokenBarrierException,
               TimeoutException {
    final ReentrantLock lock = this.lock;
    // 先要获取到锁，然后在 finally 中要记得释放锁
    // 如果记得 Condition 部分的话，我们知道 condition 的 await 会释放锁，signal 的时候需要重新获取锁
    lock.lock();
    try {
        final Generation g = generation;
        // 检查栅栏是否被打破，如果被打破，抛出 BrokenBarrierException 异常
        if (g.broken)
            throw new BrokenBarrierException();
        // 检查中断状态，如果中断了，抛出 InterruptedException 异常
        if (Thread.interrupted()) {
            breakBarrier();
            throw new InterruptedException();
        }
        // index 是这个 await 方法的返回值
        // 注意到这里，这个是从 count 递减后得到的值
        int index = --count;

        // 如果等于 0，说明所有的线程都到栅栏上了，准备通过
        if (index == 0) {  // tripped
            boolean ranAction = false;
            try {
                // 如果在初始化的时候，指定了通过栅栏前需要执行的操作，在这里会得到执行
                final Runnable command = barrierCommand;
                if (command != null)
                    command.run();
                // 如果 ranAction 为 true，说明执行 command.run() 的时候，没有发生异常退出的情况
                ranAction = true;
                // 唤醒等待的线程，然后开启新的一代
                nextGeneration();
                return 0;
            } finally {
                if (!ranAction)
                    // 进到这里，说明执行指定操作的时候，发生了异常，那么需要打破栅栏
                    // 之前我们说了，打破栅栏意味着唤醒所有等待的线程，设置 broken 为 true，重置 count 为 parties
                    breakBarrier();
            }
        }

        // loop until tripped, broken, interrupted, or timed out
        // 如果是最后一个线程调用 await，那么上面就返回了
        // 下面的操作是给那些不是最后一个到达栅栏的线程执行的
        for (;;) {
            try {
                // 如果带有超时机制，调用带超时的 Condition 的 await 方法等待，直到最后一个线程调用 await
                if (!timed)
                    trip.await();
                else if (nanos > 0L)
                    nanos = trip.awaitNanos(nanos);
            } catch (InterruptedException ie) {
                // 如果到这里，说明等待的线程在 await（是 Condition 的 await）的时候被中断
                if (g == generation && ! g.broken) {
                    // 打破栅栏
                    breakBarrier();
                    // 打破栅栏后，重新抛出这个 InterruptedException 异常给外层调用的方法
                    throw ie;
                } else {
                    // 到这里，说明 g != generation, 说明新的一代已经产生，即最后一个线程 await 执行完成，
                    // 那么此时没有必要再抛出 InterruptedException 异常，记录下来这个中断信息即可
                    // 或者是栅栏已经被打破了，那么也不应该抛出 InterruptedException 异常，
                    // 而是之后抛出 BrokenBarrierException 异常
                    Thread.currentThread().interrupt();
                }
            }

              // 唤醒后，检查栅栏是否是“破的”
            if (g.broken)
                throw new BrokenBarrierException();

            // 这个 for 循环除了异常，就是要从这里退出了
            // 我们要清楚，最后一个线程在执行完指定任务(如果有的话)，会调用 nextGeneration 来开启一个新的代
            // 然后释放掉锁，其他线程从 Condition 的 await 方法中得到锁并返回，然后到这里的时候，其实就会满足 g != generation 的
            // 那什么时候不满足呢？barrierCommand 执行过程中抛出了异常，那么会执行打破栅栏操作，
            // 设置 broken 为true，然后唤醒这些线程。这些线程会从上面的 if (g.broken) 这个分支抛 BrokenBarrierException 异常返回
            // 当然，还有最后一种可能，那就是 await 超时，此种情况不会从上面的 if 分支异常返回，也不会从这里返回，会执行后面的代码
            if (g != generation)
                return index;

            // 如果醒来发现超时了，打破栅栏，抛出异常
            if (timed && nanos <= 0L) {
                breakBarrier();
                throw new TimeoutException();
            }
        }
    } finally {
        // 最后释放锁
        lock.unlock();
    }
}
```

栅栏被打破的情况:
1. 中断，如果某个等待的线程发生了中断，那么会打破栅栏，同时抛出 InterruptedException 异常
2. 超时，打破栅栏，同时抛出 TimeoutException 异常
3. 指定执行的操作抛出了异常

##### 栅栏上处于等待状态的线程

```java
public int getNumberWaiting() {
    final ReentrantLock lock = this.lock;
    lock.lock();
    try {
        // 前面说过， count是还未到栅栏的线程数
        return parties - count;
    } finally {
        lock.unlock();
    }
}
```

##### 重置一个栅栏

```java
public void reset() {
    final ReentrantLock lock = this.lock;
    lock.lock();
    try {
        // 打破现在的栅栏
        breakBarrier();  
        // 生成一个新的栅栏
        nextGeneration(); 
    } finally {
        lock.unlock();
    }
}
```

如果初始化时，指定了线程 parties = 4，前面有 3 个线程调用了 await 等待，在第 4 个线程调用 await 之前，如果调用 reset 方法，那么会发生什么？

首先，打破栅栏，那意味着所有等待的线程（3个等待的线程）会唤醒，await 方法会通过抛出 `BrokenBarrierException `异常返回。然后开启新的一代，重置了 count 和 generation，相当于一切归零了。

### Semaphore

Semaphore 类似一个资源池（可以类比线程池），每个线程需要调用 acquire() 方法获取资源，然后才能执行，执行完后，需要 release 资源，让给其他的线程用。

基本思路:创建 Semaphore 实例的时候，需要一个参数 permits，这个基本上可以确定是设置给 AQS 的 state 的，然后每个线程调用 acquire 的时候，执行 state = state - 1，release 的时候执行 state = state + 1，当然，acquire 的时候，如果 state = 0，说明没有资源了，需要等待其他线程 release。

#### 使用例子

semaphore 用来控制某类资源的线程数，比如数据库连接。读取几万个文件的数据到数据库中，由于文件读取是IO密集型任务，可以启动几十个线程并发读取，但是数据库连接数只有20个，这时就必须控制最多只有20
个线程能够拿到数据库连接进行操作。这个时候，就可以使用Semaphore做流量控制：

```java
public class Semaphore {
    private static final int COUNT = 80;
    private static Executor executor =  Executors.newFixedThreadPool(COUNT);
    private static Semaphore semaphore = new Semaphore(20);
    public static void main(String[] args) {
        for (int i=0; i< COUNT; i++) {
            executor.execute(new ThreadTest.Task());
        }
    }

    static class Task implements Runnable {
        @Override
        public void run() {
            try {
                //读取文件中...
                semaphore.acquire();
                // 存储数据中...
                semaphore.release();
            } catch (InterruptedException e) {
                e.printStackTrace();
            } finally {
            }
        }
    }
}
```


#### 构造方法

这里和 ReentrantLock 类似，用了公平策略和非公平策略, 默认是非公平锁:
```java
public Semaphore(int permits) {
    sync = new NonfairSync(permits);
}

public Semaphore(int permits, boolean fair) {
    sync = fair ? new FairSync(permits) : new NonfairSync(permits);
}
```

#### acquire

基本上跟 reentrantLock 的 acquire 方法一样， 只不过多了两个可以传参的方法， 如果需要一次获取超过一个资源，可以用这个
```java

// ============== 带 InterruptedException
public void acquire() throws InterruptedException {
    sync.acquireSharedInterruptibly(1);
}
public void acquireUninterruptibly() {
    sync.acquireShared(1);
}
public void acquire(int permits) throws InterruptedException {
    if (permits < 0) throw new IllegalArgumentException();
    sync.acquireSharedInterruptibly(permits);
}
public void acquireUninterruptibly(int permits) {
    if (permits < 0) throw new IllegalArgumentException();
    sync.acquireShared(permits);
}

// ============= 不带 InterruptedException
public void acquireUninterruptibly() {
    sync.acquireShared(1);
}
public final void acquireShared(int arg) {
    if (tryAcquireShared(arg) < 0)
        doAcquireShared(arg);
}
```

#### 非公平和公平的tryAcquireShared

Semaphore 分公平策略和非公平策略， 两种`tryAcquireShared`的实现：
```java
// 公平策略：
protected int tryAcquireShared(int acquires) {
    for (;;) {
        // 区别就在于是不是会先判断是否有线程在排队，然后才进行 CAS 减操作
        if (hasQueuedPredecessors())
            return -1;
        int available = getState();
        int remaining = available - acquires;
        if (remaining < 0 ||
            compareAndSetState(available, remaining))
            return remaining;
    }
}
// 非公平策略：
protected int tryAcquireShared(int acquires) {
    return nonfairTryAcquireShared(acquires);
}
final int nonfairTryAcquireShared(int acquires) {
    for (;;) {
        int available = getState();
        int remaining = available - acquires;
        if (remaining < 0 ||
            compareAndSetState(available, remaining))
            return remaining;
    }
}
```

其实也就是之前一样的，区别就是公平锁会判断是否有线程排队，而非公平锁是直接操作

#### doAcquireShared

由于 tryAcquireShared(arg) 返回小于 0 的时候，说明 state 已经小于 0 了（没资源了），此时 acquire 不能立马拿到资源，需要进入到阻塞队列等待, 执行doAcquireShared:
```java
private void doAcquireShared(int arg) {
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

这里跟之前的基本一模一样



#### release释放资源

线程被挂起后，就需要等待 release 释放资源：

```java
// 任务介绍，释放一个资源
public void release() {
    sync.releaseShared(1);
}
public final boolean releaseShared(int arg) {
    if (tryReleaseShared(arg)) {
        doReleaseShared();
        return true;
    }
    return false;
}

protected final boolean tryReleaseShared(int releases) {
    for (;;) {
        int current = getState();
        int next = current + releases;
        // 溢出，当然，我们一般也不会用这么大的数
        if (next < current) // overflow
            throw new Error("Maximum permit count exceeded");
        if (compareAndSetState(current, next))
            return true;
    }
}
```

tryReleaseShared 方法总是会返回 true, 接下来执行 doReleaseShared 唤醒等待线程:

```java
private void doReleaseShared() {
    for (;;) {
        Node h = head;
        if (h != null && h != tail) {
            int ws = h.waitStatus;
            if (ws == Node.SIGNAL) {
                if (!compareAndSetWaitStatus(h, Node.SIGNAL, 0))
                    continue;            // loop to recheck cases
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

这里跟 condition 的唤醒也基本差不多


### 参考资料
- [java并发工具类-CountDownLatch](https://juejin.im/post/5af3c17f51882567113b37d0)
- [死磕java并发-CountDownLatch](http://cmsblogs.com/?p=2253)
- [java中的并发工具类](https://www.jianshu.com/p/3cdeda81c517)
- [一行一行源码分析清楚 AbstractQueuedSynchronizer (三)](https://javadoop.com/post/AbstractQueuedSynchronizer-3)
- [Pharse 介绍](https://javadoop.com/post/phaser-tutorial)