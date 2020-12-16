---
title: ForkJoinPool使用及原理
date: 2020-11-15 23:41:23
tags:
categories: 并发
---

### 原理简介

Fork/Join 框架是 Java7提供了的一个用于并行执行任务的框架， 是一个把大任务分割成若干个小任务，最终汇总每个小任务结果后得到大任务结果的框架。

ForkJoinPool主要用来使用分治法, 在处理任务队列中一个任务的时候，可以让其中的线程创建新的任务并挂起当前任务，此时的线程就可以选择队列中的子任务来执行。如果单纯使用 ThreadPoolExecutor 是无法优先执行子任务的。


#### 工作窃取(work-stealing)

forkjoin 最核心的地方就是利用了现代硬件设备多核,在一个操作时候会有空闲的 cpu,那么如何利用好这个空闲的 cpu 就成了提高性能的关键,工作窃取（work-stealing）算法是指某个线程从其他队列里窃取任务来执行。work-stealing 可以充分的利用线程进行并行计算， 减少了线程之间的竞争

假如我们需要做一个比较大的任务，我们可以把这个任务分割为若干互不依赖的子任务，为了减少线程间的竞争，于是把这些子任务分别放到不同的队列里，并为每个队列创建一个单独的线程来执行队列里的任务，线程和队列一一对应，比如A线程负责处理A队列里的任务。但是有的线程会先把自己队列里的任务干完，而其他线程对应的队列里还有任务等待处理。干完活的线程与其等着，不如去帮其他线程干活，于是它就去其他线程的队列里窃取一个任务来执行。而在这时它们会访问同一个队列，所以为了减少窃取任务线程和被窃取任务线程之间的竞争，通常会使用双端队列，被窃取任务线程永远从双端队列的头部拿任务执行，而窃取任务的线程永远从双端队列的尾部拿任务执行。


### 实现原理

- fork()：开启一个新线程（或是重用线程池内的空闲线程），将任务交给该线程处理。
- join()：等待该任务的处理线程处理完毕，获得返回值。

这里并不会每个 fork 都会创建新线程， 也不是每个 join 都会造成线程被阻塞， 而是采取了 `work-stealing 原理`

#### fork/join 整体任务调度流程

![](/images/thread/flowchart-of-forkjoin.png)



#### work-stealing 原理


![](/images/thread/work-stealing.png)

- ForkJoinPool 的每个工作线程都维护着一个工作队列（WorkQueue），这是一个双端队列（Deque），里面存放的对象是任务（ForkJoinTask）。
- 每个工作线程在运行中产生新的任务（通常是因为调用了 fork()）时，会放入工作队列的队尾，并且工作线程在处理自己的工作队列时，使用的是 LIFO 方式，也就是说每次从队尾取出任务来执行。
- 每个工作线程在处理自己的工作队列同时，会尝试窃取一个任务（或是来自于刚刚提交到 pool 的任务，或是来自于其他工作线程的工作队列），窃取的任务位于其他线程的工作队列的队首，也就是说工作线程在窃取其他工作线程的任务时，使用的是 FIFO 方式。
- 在遇到 join() 时，如果需要 join 的任务尚未完成，则会先处理其他任务，并等待其完成。
  在既没有自己的任务，也没有可以窃取的任务时，进入休眠
  



F/J框架的核心来自于它的工作窃取及调度策略，可以总结为以下几点：

1. 每个Worker线程利用它自己的任务队列维护可执行任务；
2. 任务队列是一种双端队列，支持LIFO的push和pop操作，也支持FIFO的take操作；
3. 任务fork的子任务，只会push到它所在线程（调用fork方法的线程）的队列；
4. 工作线程既可以使用LIFO通过pop处理自己队列中的任务，也可以FIFO通过poll处理自己队列中的任务，具体取决于构造线程池时的asyncMode参数；
5. 当工作线程自己队列中没有待处理任务时，它尝试去随机读取（窃取）其它任务队列的base端的任务；
6. 当线程进入join操作，它也会去处理其它工作线程的队列中的任务（自己的已经处理完了），直到目标任务完成（通过isDone方法）；
7. 当一个工作线程没有任务了，并且尝试从其它队列窃取也失败了，它让出资源（通过使用yields, sleeps或者其它优先级调整）并且随后会再次激活，直到所有工作线程都空闲了——此时，它们都阻塞在等待另一个顶层线程的调用。


### 核心组件

#### ForkJoinPool

ForkJoinPool 是 ExecutorService 的一个实现类，主要的工作如下:
1. 接收外部任务的提交(调用 `ForkJoinPool` 的  `invoke/execute/submit` 提交任务)
2. 接收 ForkJoinTask 自身 fork 出的子任务
3. WorkQueue 的初始化和管理
4. WorkThread 线程的创建和管理


ForkJoinPool 提交外部任务方法的区别:
- invoke: 同步方法，调用线程直到任务执行完成才会返回
- execute: 没有返回结果的异步方法, 调用线程会立即返回
- submit: 有返回结果的异步方法，调用线程会立即返回(返回的是 `Future` 实现类， 通过 get 获取结果)


ForkJoinPool 提供了三种构造方法，最终都是调用：
``` 
    private ForkJoinPool(int parallelism,
                         ForkJoinWorkerThreadFactory factory,
                         UncaughtExceptionHandler handler,
                         int mode,
                         String workerNamePrefix) {
        this.workerNamePrefix = workerNamePrefix;
        this.factory = factory;
        this.ueh = handler;
        this.config = (parallelism & SMASK) | mode;
        long np = (long)(-parallelism); // offset ctl counts
        this.ctl = ((np << AC_SHIFT) & AC_MASK) | ((np << TC_SHIFT) & TC_MASK);
    }
```

- parallelism: 默认为 CPU 核数
- factory: 默认是 `DefaultForkJoinWorkThreadFactory`, 用来创建工作线程`ForkJoinWorkThread`
- handler: 异常处理器
- config: 保存 parallelism 和 mode 信息
- ctl: 线程池核心控制字段

ForkJoinPool 支持两种 mode， `mode = asyncMode ? FIFO_QUEUE : LIFO_QUEUE`，这里的同步异步指的是工作线程工作的方式:
- 同步(默认)： 对于工作线程（Worker）自身队列中的任务，采用后进先出（LIFO）的方式执行，等同于"栈操作"
- 异步： 对于工作线程（Worker）自身队列中的任务，采用先进先出（FIFO）的方式执行, 等同于"队列操作"

#### ForkJoinTask

ForkJoinTask实现了 Future 接口，ForkJoinPool 线程池内部调度的其实都是 ForkJoinTask 任务（提交的是一个Runnable 或 Callable任务，也会被适配成ForkJoinTask)。Fork/Join 提供了两个抽象实现，使用的时候一般继承这两个类:
- RecursiveAction：表示没有返回结果的 ForkJoin 任务
- RecursiveTask：表示有返回结果的 ForkJoin 任务

#### ForkJoinWorkerThread

Fork/Join框架中，每个工作线程（Worker）都有一个自己的任务队列（WorkerQueue），ForkJoinWorkerThread 类作为ForkJoinPool中的工作线程：
``` 
public class ForkJoinWorkerThread extends Thread {
    
    final ForkJoinPool pool;                    // 该工作线程归属的线程池
    final ForkJoinPool.WorkQueue workQueue;     // 对应的任务队列
 
    protected ForkJoinWorkerThread(ForkJoinPool pool) {
        super("aForkJoinWorkerThread");         // 指定工作线程名称
        this.pool = pool;
        this.workQueue = pool.registerWorker(this);
    }
  
    // ...
}
```
ForkJoinWorkerThread 优先处理自身队列中的任务（LIFO或FIFO顺序，由线程池构造时的参数 mode 决定），自身队列为空时，以FIFO的顺序随机窃取其它队列中的任务。

#### WorkQueue 
``` 
volatile WorkQueue[] workQueues;
```
任务队列（WorkQueue）是ForkJoinPool与其它线程池区别最大的地方，在ForkJoinPool内部，维护着一个WorkQueue[]数组，它会在外部首次提交任务时(`submit/invoke/execute`)进行初始化.初始化时根据数组大小和线程随机数（ThreadLocalRandom.probe）等信息，计算出任务队列所在的数组索引（这个索引一定是偶数），如果索引处没有任务队列，则初始化一个，再将任务入队。也就是说，通过外部方法提交的任务一定是在偶数队列，没有绑定工作线程。

ForkJoinPool中的工作队列可以分为两类：
- 有工作线程（Worker）绑定的任务队列：数组下标始终是奇数，称为task queue，该队列中的任务均由工作线程调用产生（工作线程调用FutureTask.fork方法）；
- 没有工作线程（Worker）绑定的任务队列：数组下标始终是偶数，称为submissions queue，该队列中的任务全部由其它线程提交（也就是非工作线程调用execute/submit/invoke或者FutureTask.fork方法）

### 源码分析

#### 任务提交

##### 1. 外部任务提交(以 ForkJoinPool#submit 为例)
``` 
public <T> ForkJoinTask<T> submit(ForkJoinTask<T> task) {
    if (task == null)
        throw new NullPointerException();
    externalPush(task);
    return task;
}

final void externalPush(ForkJoinTask<?> task) {
    WorkQueue[] ws;
    WorkQueue q;
    int m;
    // 线程随机数， 避免不同线程竞争同一数组元素
    int r = ThreadLocalRandom.getProbe();
    int rs = runState;


    if ((ws = workQueues) != null && (m = (ws.length - 1)) >= 0 &&
        // SQMASK 为常量 0x007e, 二进制为 0111 1110, m & r 取一个 [0,m]的随机数，再与SQMASK将最低置0
        // 这样与出来必为偶数，所以通过externalPush方法提交的任务都添加到了偶数索引的任务队列中（没有绑定的工作线程）
        // 这里获取到一个队列的偶数索引
        (q = ws[m & r & SQMASK]) != null
        && r != 0 && rs > 0 
        && U.compareAndSwapInt(q, QLOCK, 0, 1)) {
        
        
        ForkJoinTask<?>[] a;
        int am, n, s;
        // 任务队列不为空
        if ((a = q.array) != null &&
            // top 是 push 指针， base 是 poll 指针
            // 这里的含义是命中的队列中有任务
            (am = a.length - 1) > (n = (s = q.top) - q.base)) {
            int j = ((am & s) << ASHIFT) + ABASE;
            U.putOrderedObject(a, j, task);
            U.putOrderedInt(q, QTOP, s + 1);
            U.putIntVolatile(q, QLOCK, 0);
            if (n <= 1)                 // 命中的队列里只有一个任务
                signalWork(ws, q);      // 创建或激活一个工作线程
            return;
        }
        U.compareAndSwapInt(q, QLOCK, 1, 0);
    }

    // 未命中任务队列时（WorkQueue == null 或 WorkQueue[i] == null）
    // 线程池有其他异常
    externalSubmit(task);
}
```
submit 调用 externalPush， 包含两部分:
1. 根据线程随机变量、任务队列数组信息，计算命中槽（即本次提交的任务应该添加到任务队列数组中的哪个队列），如果命中且队列中任务数<1，则创建或激活一个工作线程；
2. 未命中任务队列(workQueue == null || workQueue[i] == null)，调用 `externalSubmit` 初始化队列，并入队：



externalSubmit方法的逻辑很清晰，一共分为4种情况：
- CASE1：线程池已经关闭，则执行终止操作，并拒绝该任务的提交；
- CASE2：线程池未初始化，则进行初始化，主要就是初始化任务队列数组；
- CASE3：命中了任务队列，则将任务入队，并尝试创建/唤醒一个工作线程（Worker）；
- CASE4：未命中任务队列，初始化任务队列并在偶数索引处创建一个任务队列
``` 
/**
 * 1. 处理线程池提交任务时未命中队列的情况
 * 2. 处理异常情况.
 */
private void externalSubmit(ForkJoinTask<?> task) {
    int r;                                    // 线程相关的随机数
    if ((r = ThreadLocalRandom.getProbe()) == 0) {
        ThreadLocalRandom.localInit();
        r = ThreadLocalRandom.getProbe();
    }

    for (; ; ) {
        WorkQueue[] ws;
        WorkQueue q;
        int rs, m, k;
        boolean move = false;

        // CASE1: 线程池已关闭
        if ((rs = runState) < 0) {
            tryTerminate(false, false);     // help terminate
            throw new RejectedExecutionException();
        }
        // CASE2: 初始化线程池
        else if ((rs & STARTED) == 0 ||     // initialize
            ((ws = workQueues) == null || (m = ws.length - 1) < 0)) {
            int ns = 0;
            rs = lockRunState();
            try {
                if ((rs & STARTED) == 0) {
                    U.compareAndSwapObject(this, STEALCOUNTER, null,
                        new AtomicLong());

                    // 初始化工作队列数组, 数组大小必须为2的幂次
                    int p = config & SMASK;
                    int n = (p > 1) ? p - 1 : 1;
                    n |= n >>> 1;
                    n |= n >>> 2;
                    n |= n >>> 4;
                    n |= n >>> 8;
                    n |= n >>> 16;
                    n = (n + 1) << 1;
                    workQueues = new WorkQueue[n];
                    ns = STARTED;   // 线程池状态转化为STARTED
                }
            } finally {
                unlockRunState(rs, (rs & ~RSLOCK) | ns);
            }
        }
        // CASE3: 入队任务
        else if ((q = ws[k = r & m & SQMASK]) != null) {
            if (q.qlock == 0 && U.compareAndSwapInt(q, QLOCK, 0, 1)) {
                ForkJoinTask<?>[] a = q.array;
                int s = q.top;
                boolean submitted = false; // initial submission or resizing
                try {                      // locked version of push
                    if ((a != null && a.length > s + 1 - q.base) ||
                        (a = q.growArray()) != null) {
                        int j = (((a.length - 1) & s) << ASHIFT) + ABASE;
                        U.putOrderedObject(a, j, task);
                        U.putOrderedInt(q, QTOP, s + 1);
                        submitted = true;
                    }
                } finally {
                    U.compareAndSwapInt(q, QLOCK, 1, 0);
                }
                if (submitted) {
                    signalWork(ws, q);
                    return;
                }
            }
            move = true;                   // move on failure
        }
        // CASE4: 创建一个任务队列
        else if (((rs = runState) & RSLOCK) == 0) {
            q = new WorkQueue(this, null);
            q.hint = r;
            q.config = k | SHARED_QUEUE;        // k为任务队列在队列数组中的索引: k == r & m & SQMASK, 在CASE3的IF判断中赋值
            q.scanState = INACTIVE;             // 任务队列状态为INACTIVE
            rs = lockRunState();
            if (rs > 0 && (ws = workQueues) != null &&
                k < ws.length && ws[k] == null)
                ws[k] = q;                 // else terminated
            unlockRunState(rs, rs & ~RSLOCK);
        } else
            move = true;                   // move if busy
        if (move)
            r = ThreadLocalRandom.advanceProbe(r);
    }
}
```


##### 2.工作线程fork任务

fork 的任务即子任务 ，`ForkJoinTask.fork` ：
1. 当调用线程为工作线程时， 直接添加到其自身队列
2. 如果是外部线程调用的 fork， 则调用 `externalPush` （外部线程提交任务）
``` 
public final ForkJoinTask<V> fork() {
    Thread t;
    if ((t = Thread.currentThread()) instanceof ForkJoinWorkerThread)   // 如果调用线程为【工作线程】
        ((ForkJoinWorkerThread) t).workQueue.push(this);           // 直接添加到线程的自身队列中
    else
        ForkJoinPool.common.externalPush(this);                    // 外部（其它线程）提交的任务
    return this;
}
```


WorkQueue.push 将任务存入自身队列的栈顶:

1. 如果当前 WorkQueue 为新建的等待队列(`top - base <= 1`)，则调用`signalWork`方法为当前 WorkQueue 新建或唤醒一个工作线程；
2. 如果 WorkQueue 中的任务数组容量过小(`top -base >= array.length - 1`)，则调用growArray方法对其进行两倍扩容，
```
final void push(ForkJoinTask<?> task) {
    ForkJoinTask<?>[] a;
    ForkJoinPool p;
    int b = base, s = top, n;
    if ((a = array) != null) {    // ignore if queue removed
        int m = a.length - 1;     // fenced write for task visibility
        U.putOrderedObject(a, ((m & s) << ASHIFT) + ABASE, task);
        U.putOrderedInt(this, QTOP, s + 1);       // 任务存入栈顶(top+1)
        // top -base <= 1 表示当前 workQueue 为新建的的等待队列
        if ((n = s - b) <= 1) {
            if ((p = pool) != null)
                p.signalWork(p.workQueues, this);   // 唤醒或创建一个工作线程
         // 任务数组容量过小， 则扩容两倍     
        } else if (n >= m)
            growArray();           
    }
}
```

#### 创建工作线程

任务提交后，会调用signalWork方法创建或唤醒一个工作线程，该方法的核心其实就两个分支：
1. 工作线程数不足：创建一个工作线程；
2. 工作线程数足够：唤醒一个空闲（阻塞）的工作线程。

``` 
/**
 * 尝试创建或唤醒一个工作线程.
 *
 * @param ws 任务队列数组
 * @param q  当前操作的任务队列WorkQueue
 */
final void signalWork(WorkQueue[] ws, WorkQueue q) {
    long c;
    int sp, i;
    WorkQueue v;
    Thread p;
    while ((c = ctl) < 0L) {                       // too few active
        // CASE1: 工作线程数不足
        if ((sp = (int) c) == 0) {
            if ((c & ADD_WORKER) != 0L)
                tryAddWorker(c);                    // 增加工作线程
            break;
        }

        // CASE2: 存在空闲工作线程，则唤醒
        if (ws == null)                            // unstarted/terminated
            break;
        if (ws.length <= (i = sp & SMASK))         // terminated
            break;
        if ((v = ws[i]) == null)                   // terminating
            break;
        int vs = (sp + SS_SEQ) & ~INACTIVE;        // next scanState
        int d = sp - v.scanState;                  // screen CAS
        long nc = (UC_MASK & (c + AC_UNIT)) | (SP_MASK & v.stackPred);
        if (d == 0 && U.compareAndSwapLong(this, CTL, c, nc)) {
            v.scanState = vs;                      // activate v
            if ((p = v.parker) != null)
                U.unpark(p);
            break;
        }
        if (q != null && q.base == q.top)          // no more work
            break;
    }
}
```

创建工作线程的方法tryAddWorker，其实就是设置下字段值（活跃/总工作线程池数），然后调用createWorker真正创建一个工作线程：
``` 
private void tryAddWorker(long c) {
    boolean add = false;
    do {

        // 设置活跃工作线程数、总工作线程池数
        long nc = ((AC_MASK & (c + AC_UNIT)) |
            (TC_MASK & (c + TC_UNIT)));
        if (ctl == c) {
            int rs, stop;                 // check if terminating
            if ((stop = (rs = lockRunState()) & STOP) == 0)
                add = U.compareAndSwapLong(this, CTL, c, nc);
            unlockRunState(rs, rs & ~RSLOCK);
            if (stop != 0)
                break;

            // 创建工作线程
            if (add) {
                createWorker();
                break;
            }
        }
    } while (((c = ctl) & ADD_WORKER) != 0L && (int) c == 0);
}

private boolean createWorker() {
    ForkJoinWorkerThreadFactory fac = factory;
    Throwable ex = null;
    ForkJoinWorkerThread wt = null;
    try {
        
        // 使用线程池工厂创建线程
        if (fac != null && (wt = fac.newThread(this)) != null) {
            wt.start();     // 启动线程
            return true;
        }
    } catch (Throwable rex) {
        ex = rex;
    }
    
    // 创建出现异常，则注销该工作线程
    deregisterWorker(wt, ex);
    return false;
}
```

如果创建过程中出现异常，则调用`deregisterWorker`注销线程：
``` 
final void deregisterWorker(ForkJoinWorkerThread wt, Throwable ex) {
    WorkQueue w = null;
    // 1.移除workQueue
    if (wt != null && (w = wt.workQueue) != null) {     // 获取ForkJoinWorkerThread的等待队列
        WorkQueue[] ws;                           
        int idx = w.config & SMASK;                     // 计算workQueue索引
        int rs = lockRunState();                        // 获取runState锁和当前池运行状态
        if ((ws = workQueues) != null && ws.length > idx && ws[idx] == w)
            ws[idx] = null;                             // 移除workQueue
        unlockRunState(rs, rs & ~RSLOCK);   // 解除runState锁
    }
    // 2.减少CTL数
    long c;                                       // decrement counts
    do {
    } while (!U.compareAndSwapLong
        (this, CTL, c = ctl, ((AC_MASK & (c - AC_UNIT)) |
            (TC_MASK & (c - TC_UNIT)) |
            (SP_MASK & c))));
    // 3.处理被移除workQueue内部相关参数
    if (w != null) {
        w.qlock = -1;                             // ensure set
        w.transferStealCount(this);
        w.cancelAll();                            // cancel remaining tasks
    }
    // 4.如果线程未终止，替换被移除的workQueue并唤醒内部线程
    for (; ; ) {                                    // possibly replace
        WorkQueue[] ws;
        int m, sp;
        // 尝试终止线程池
        if (tryTerminate(false, false) || w == null || w.array == null ||
            (runState & STOP) != 0 || (ws = workQueues) == null ||
            (m = ws.length - 1) < 0)              // already terminating
            break;
        // 唤醒被替换的线程，依赖于下一步
        if ((sp = (int) (c = ctl)) != 0) {         // wake up replacement
            if (tryRelease(c, ws[sp & m], AC_UNIT))
                break;
        }
        // 创建工作线程替换
        else if (ex != null && (c & ADD_WORKER) != 0L) {
            tryAddWorker(c);                      // create replacement
            break;
        } else                                      // don't need replacement
            break;
    }
    // 5.处理异常
    if (ex == null)                               // help clean on way out
        ForkJoinTask.helpExpungeStaleExceptions();
    else                                          // rethrow
        ForkJoinTask.rethrow(ex);
}
```

ForkJoinWorkerThread 在被 ForkJoinWorkerThreadFactory 创建的过程中会保存线程池信息和与自己绑定的任务队列信息。
它通过`ForkJoinPool.registerWorker`方法将自己注册到线程池中(在任务队列数组WorkQueue[]找到一个空的奇数位，然后在该位置创建WorkQueue)：
``` 
protected ForkJoinWorkerThread(ForkJoinPool pool) {
    // Use a placeholder until a useful name can be set in registerWorker
    super("aForkJoinWorkerThread");
    this.pool = pool;
    this.workQueue = pool.registerWorker(this);

}

// ForkJoinPool#registerWorker
final WorkQueue registerWorker(ForkJoinWorkerThread wt) {
    UncaughtExceptionHandler handler;
    wt.setDaemon(true);                           // configure thread
    if ((handler = ueh) != null)
        wt.setUncaughtExceptionHandler(handler);

    // 创建一个工作队列, 并于该工作线程绑定
    WorkQueue w = new WorkQueue(this, wt);
    int i = 0;                                    // 记录队列在任务队列数组中的索引, 始终为奇数
    int mode = config & MODE_MASK;
    int rs = lockRunState();
    try {
        WorkQueue[] ws;
        int n;
        if ((ws = workQueues) != null && (n = ws.length) > 0) {
            int s = indexSeed += SEED_INCREMENT;  // unlikely to collide
            int m = n - 1;
            // 经计算后, i为奇数
            i = ((s << 1) | 1) & m;               
            if (ws[i] != null) {                  // 槽冲突, 即WorkQueue[i]位置已经有了任务队列

                // 重新计算索引i
                int probes = 0;                   // step by approx half n
                int step = (n <= 4) ? 2 : ((n >>> 1) & EVENMASK) + 2;
                // 找到一个 workQueue[i] 为空的槽位
                while (ws[i = (i + step) & m] != null) {
                    if (++probes >= n) {
                        workQueues = ws = Arrays.copyOf(ws, n <<= 1);
                        m = n - 1;
                        probes = 0;
                    }
                }
            }

            // 设置队列状态为SCANNING
            w.hint = s;                           // use as random seed
            w.config = i | mode;
            w.scanState = i;                      // publication fence
            ws[i] = w;
        }
    } finally {
        unlockRunState(rs, rs & ~RSLOCK);
    }
    wt.setName(workerNamePrefix.concat(Integer.toString(i >>> 1)));
    return w;
}
```

#### 3. 任务执行（runWorker）

ForkJoinWorkerThread启动后，会执行它的run方法，该方法内部调用了`ForkJoinPool.runWorker`方法来执行任务：
``` 
public void run() {
    if (workQueue.array == null) {  // only run once
        Throwable exception = null;
        try {
            onStart();              // 钩子方法
            pool.runWorker(workQueue);
        } catch (Throwable ex) {
            exception = ex;
        } finally {
            try {
                onTermination(exception);
            } catch (Throwable ex) {
                if (exception == null)
                    exception = ex;
            } finally {
                pool.deregisterWorker(this, exception);
            }
        }
    }
}


// ForkJoinPool#runWorker
final void runWorker(WorkQueue w) {
    w.growArray();                   // 初始化任务队列
    int seed = w.hint;               // initially holds randomization hint
    int r = (seed == 0) ? 1 : seed;  // avoid 0 for xorShift
    for (ForkJoinTask<?> t; ; ) {

        // CASE1: 尝试获取一个任务
        if ((t = scan(w, r)) != null)
            w.runTask(t);                       // 获取成功, 执行任务
        // CASE2: 获取失败, 阻塞等待任务入队
        else if (!awaitWork(w, r))              // 等待失败, 跳出该方法后, 工作线程会被注销
            break;
        r ^= r << 13;
        r ^= r >>> 17;
        r ^= r << 5; // xorshift
    }
}
```
runWorker方法的核心流程如下
1. scan：尝试获取一个任务；
2. runTask：执行取得的任务；
3. awaitWork：没有任务则阻塞。

##### scan（任务窃取流程）

1. 随机选择一个任务队列 `workQueue[i]`（ 不会选择 workQueue[0]）
2. 获取 base 位置的任务
3. 获取成功则更新 base 指针(+1操作)， 如果获取的任务数>1(base - top < -1)，则 `signalWork` 拉起一个其他工作线程

``` 
private ForkJoinTask<?> scan(WorkQueue w, int r) {
    WorkQueue[] ws;
    int m;
    if ((ws = workQueues) != null && (m = ws.length - 1) > 0 && w != null) {
        int ss = w.scanState;                     // initially non-negative
        for (int origin = r & m, k = origin, oldSum = 0, checkSum = 0; ; ) {
            WorkQueue q;
            ForkJoinTask<?>[] a;
            ForkJoinTask<?> t;
            int b, n;
            long c;

            // 根据随机数r定位一个任务队列
            if ((q = ws[k]) != null) {      // 获取workQueue
                // base - top < 0 队列(栈)中有任务
                if ((n = (b = q.base) - q.top) < 0 &&
                  // 切队列不为空
                    (a = q.array) != null) {     
                    long i = (((a.length - 1) & b) << ASHIFT) + ABASE;
                    // 取base位置任务
                    if ((t = ((ForkJoinTask<?>)
                        U.getObjectVolatile(a, i))) != null &&  
                        q.base == b) {

                        // 成功获取到任务
                        if (ss >= 0) {
                            if (U.compareAndSwapObject(a, i, t, null)) {
                                q.base = b + 1;         // 更新base位
                                if (n < -1)
                                    signalWork(ws, q);  // 创建或唤醒工作线程来运行任务
                                return t;
                            }
                        } else if (oldSum == 0 &&   // try to activate
                            w.scanState < 0)
                            tryRelease(c = ctl, ws[m & (int) c], AC_UNIT);  // 唤醒栈顶工作线程
                    }

                    // base位置任务为空或base位置偏移，随机移位重新扫描
                    if (ss < 0)                   // refresh
                        ss = w.scanState;
                    r ^= r << 1;
                    r ^= r >>> 3;
                    r ^= r << 10;
                    origin = k = r & m;           // move and rescan
                    oldSum = checkSum = 0;
                    continue;
                }
                checkSum += b;
            }
            if ((k = (k + 1) & m) == origin) {    // continue until stable
                // 运行到这里说明已经扫描了全部的 workQueues，但并未扫描到任务
                if ((ss >= 0 || (ss == (ss = w.scanState))) &&
                    oldSum == (oldSum = checkSum)) {
                    if (ss < 0 || w.qlock < 0)    // already inactive
                        break;

                    // 对当前WorkQueue进行灭活操作
                    int ns = ss | INACTIVE;       // try to inactivate
                    long nc = ((SP_MASK & ns) |
                        (UC_MASK & ((c = ctl) - AC_UNIT)));
                    w.stackPred = (int) c;         // hold prev stack top
                    U.putInt(w, QSCANSTATE, ns);
                    if (U.compareAndSwapLong(this, CTL, c, nc))
                        ss = ns;
                    else
                        w.scanState = ss;         // back out
                }
                checkSum = 0;
            }
        }
    }
    return null;
}
```

##### awaitWork(阻塞等待)

如果scan方法未扫描到任务，会调用`awaitWork`等待获取任务：
``` 
private boolean awaitWork(WorkQueue w, int r) {
    if (w == null || w.qlock < 0)                  // w is terminating
        return false;
    for (int pred = w.stackPred, spins = SPINS, ss; ; ) {
        if ((ss = w.scanState) >= 0)               // 正在扫描，跳出循环
            break;
        else if (spins > 0) {
            r ^= r << 6;
            r ^= r >>> 21;
            r ^= r << 7;
            if (r >= 0 && --spins == 0) {           // randomize spins
                WorkQueue v;
                WorkQueue[] ws;
                int s, j;
                AtomicLong sc;
                if (pred != 0 && (ws = workQueues) != null &&
                    (j = pred & SMASK) < ws.length &&
                    (v = ws[j]) != null &&          // see if pred parking
                    (v.parker == null || v.scanState >= 0))
                    spins = SPINS;                  // continue spinning
            }
        } else if (w.qlock < 0)                     // 当前workQueue已经终止，返回false recheck after spins
            return false;
        else if (!Thread.interrupted()) {           // 判断线程是否被中断，并清除中断状态
            long c, prevctl, parkTime, deadline;
            int ac = (int) ((c = ctl) >> AC_SHIFT) + (config & SMASK);      // 活跃线程数
            if ((ac <= 0 && tryTerminate(false, false)) ||      // 无active线程，尝试终止
                (runState & STOP) != 0)             // pool terminating
                return false;
            if (ac <= 0 && ss == (int) c) {         // is last waiter
                // 计算活跃线程数（高32位）并更新为下一个栈顶的scanState（低32位）
                prevctl = (UC_MASK & (c + AC_UNIT)) | (SP_MASK & pred);
                int t = (short) (c >>> TC_SHIFT);   // shrink excess spares
                if (t > 2 && U.compareAndSwapLong(this, CTL, c, prevctl))//总线程过量
                    return false;                   // else use timed wait
                // 计算空闲超时时间
                parkTime = IDLE_TIMEOUT * ((t >= 0) ? 1 : 1 - t);
                deadline = System.nanoTime() + parkTime - TIMEOUT_SLOP;
            } else
                prevctl = parkTime = deadline = 0L;
            Thread wt = Thread.currentThread();
            U.putObject(wt, PARKBLOCKER, this);     // emulate LockSupport
            w.parker = wt;                              // 设置parker，准备阻塞
            if (w.scanState < 0 && ctl == c)            // recheck before park
                U.park(false, parkTime);             // 阻塞指定的时间

            U.putOrderedObject(w, QPARKER, null);
            U.putObject(wt, PARKBLOCKER, null);
            if (w.scanState >= 0)                       // 正在扫描，说明等到任务，跳出循环
                break;
            if (parkTime != 0L && ctl == c &&
                deadline - System.nanoTime() <= 0L &&
                U.compareAndSwapLong(this, CTL, c, prevctl))    // 未等到任务，更新ctl，返回false
                return false;                                      // shrink pool
        }
    }
    return true;
}
```

##### runTask(任务执行)

窃取到任务后，调用`WorkQueue.runTask`方法执行任务：
1. 执行`ForkJoinTask#doExec`， 这个是由子类`RecursiveTask`和`RecursiveAction`来实现的， 最终执行 `compute`
2. 如果任务队列有任务（base - top <= 0, 判断 mode (从 config 中 取出
3. `WorkQueue#execLocalTasks` 扫描任务队列执行
4. 如果 mode 是 FIFO(默认), 从 base -> top 遍历任务， 执行 `ForkJoinTask#doExec`
5. 如果 mode 是 LIFO， 则从 top -> base 遍历任务
``` 
final void runTask(ForkJoinTask<?> task) {
    if (task != null) {
        scanState &= ~SCANNING;             // mark as busy
        (currentSteal = task).doExec();     // 更新currentSteal并执行任务
        U.putOrderedObject(this, QCURRENTSTEAL, null); // release for GC
        execLocalTasks();                   // 依次执行本地任务
        ForkJoinWorkerThread thread = owner;
        if (++nsteals < 0)                  // collect on overflow
            transferStealCount(pool);       // 增加偷取任务数
        scanState |= SCANNING;
        if (thread != null)
            thread.afterTopLevelExec();     // 执行钩子函数
    }
}

// ForkJoinTask#doExec
final int doExec() {
    int s;
    boolean completed;
    if ((s = status) >= 0) {
        try {
             // exec为抽象方法, 由子类实现（RecursiveTask 和 RecursiveAction 来执行 compute 方法）
            completed = exec();    
        } catch (Throwable rex) {
            return setExceptionalCompletion(rex);
        }
        if (completed)
            s = setCompletion(NORMAL);
    }
    return s;
}
// WorkQueue#execLocalTasks
final void execLocalTasks() {
    int b = base, m, s;
    ForkJoinTask<?>[] a = array;
    if (b - (s = top - 1) <= 0 && a != null &&
        (m = a.length - 1) >= 0) {
        if ((config & FIFO_QUEUE) == 0) {   // LIFO, 从top -> base 遍历执行任务
            for (ForkJoinTask<?> t; ; ) {
                if ((t = (ForkJoinTask<?>) U.getAndSetObject
                    (a, ((m & s) << ASHIFT) + ABASE, null)) == null)
                    break;
                U.putOrderedInt(this, QTOP, s);
                t.doExec();
                if (base - (s = top - 1) > 0)
                    break;
            }
        } else  // LIFO,  从base -> top 遍历执行任务
            pollAndExecAll();
    }

}
```
从execLocalTasks可以看出，构建线程池时的asyncMode(从 config 中取出)，决定了工作线程执行自身队列中的任务的方式。如果 asyncMode == true，则以FIFO的方式执行任务；否则，以LIFO的方式执行任务。

#### 任务结果的获取

`ForkJoinTask.join()`可以用来获取任务的执行结果。 流程如下:

![](/images/thread/task-join.png)


##### 代码分析
``` 
public final V join() {
    int s;
    if ((s = doJoin() & DONE_MASK) != NORMAL)
        reportException(s);
    return getRawResult();
}

// doJoin
private int doJoin() {
    int s;
    Thread t;
    ForkJoinWorkerThread wt;
    ForkJoinPool.WorkQueue w;
    return (s = status) < 0 ? s :
        ((t = Thread.currentThread()) instanceof ForkJoinWorkerThread) ?
            (w = (wt = (ForkJoinWorkerThread) t).workQueue).tryUnpush(this) && (s = doExec()) < 0 ? s :
                wt.pool.awaitJoin(w, this, 0L) :
            externalAwaitDone();
}
```

doJoin方法会判断调用线程是否是工作线程：

1.如果是非工作线程调用的join，则最终调用externalAwaitDone()阻塞等待任务的完成。

2.如果是工作线程调用的join，则存在以下情况：
- 如果需要join的任务已经完成，直接返回运行结果；
- 如果需要join的任务刚刚好是当前线程所拥有的队列的top位置，则立即执行它。
- 如果该任务不在top位置,则调用`awaitJoin`方法等待

awaitJoin完整代码如下：
``` 
final int awaitJoin(WorkQueue w, ForkJoinTask<?> task, long deadline) {
    int s = 0;
    if (task != null && w != null) {
        ForkJoinTask<?> prevJoin = w.currentJoin;   // 获取给定Worker的join任务
        U.putOrderedObject(w, QCURRENTJOIN, task);  // 把currentJoin替换为给定任务
        
        // 判断是否为CountedCompleter类型的任务
        CountedCompleter<?> cc = (task instanceof CountedCompleter) ?
            (CountedCompleter<?>) task : null;
        for (; ; ) {
            if ((s = task.status) < 0)              // 已经完成|取消|异常 跳出循环
                break;

            if (cc != null)                         // CountedCompleter任务由helpComplete来完成join
                helpComplete(w, cc, 0);
            else if (w.base == w.top || w.tryRemoveAndExec(task))  //尝试执行
                helpStealer(w, task);               // 队列为空或执行失败，任务可能被偷，帮助偷取者执行该任务

            if ((s = task.status) < 0)              // 已经完成|取消|异常，跳出循环
                break;
            
            // 计算任务等待时间
            long ms, ns;
            if (deadline == 0L)
                ms = 0L;
            else if ((ns = deadline - System.nanoTime()) <= 0L)
                break;
            else if ((ms = TimeUnit.NANOSECONDS.toMillis(ns)) <= 0L)
                ms = 1L;

            if (tryCompensate(w)) {                         // 执行补偿操作
                task.internalWait(ms);                      // 补偿执行成功，任务等待指定时间
                U.getAndAddLong(this, CTL, AC_UNIT);     // 更新活跃线程数
            }
        }
        U.putOrderedObject(w, QCURRENTJOIN, prevJoin);      // 循环结束，替换为原来的join任务
    }
    return s;
}
```
- tryRemoveAndExec: 当工作线程正在等待join的任务时，它会从top位开始自旋向下查找该任务：
  - 如果找到则移除他
  - 如果找不到，说明说明任务可能被偷，则调用helpStealer方法反过来帮助偷取者执行它自己的任务。
- helpStealer
  - 先定位的偷取者的任务队列；
  - 从偷取者的base索引开始，每次偷取一个任务执行。
- tryCompensate： tryCompensate主要用来补偿工作线程因为阻塞而导致的算力损失，当工作线程自身的队列不为空，且还有其它空闲工作线程时，如果自己阻塞了，则在此之前会唤醒一个工作线程。

### 参考资料
- [ForkJoinPool 原理](https://segmentfault.com/a/1190000016781127)
- [ForkJoinPool 实现](https://segmentfault.com/a/1190000016877931)
- [A Java Fork/Join Framework - Doug Lea]