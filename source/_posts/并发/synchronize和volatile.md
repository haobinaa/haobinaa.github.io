---
title: synchronize和volatile
date: 2020-11-19 11:31:32
tags: 
categories: 并发
description: 并发问题，MESI缓存一致性协议
---
### 并发概览

#### 并发产生的问题

Java 种并发会产生三大问题:
1. 重排序
    - 编译器(JIT)优化导致重排序
    - 指令重排序(CPU层面的指令优化， 与编译器优化类似)
    - 内存乱序(由于缓存的存在， 导致程序从行为上看起来是乱序的)
2. 内存可见性(JMM 内存模型)
3. 原子性(volatile特性， 如 long 和 double 本身是 64 位的， 他的赋值被分为了两个 32 位， 并发操作下会得到一个意料之外的值)

#### Java 对并发的规范约束

并发问题使得我们的代码有可能会产生各种各样的执行结果，显然这是我们不能接受的，所以 Java 编程语言规范需要规定一些基本规则，JVM 实现者会在这些规则的约束下来实现 JVM，然后开发者也要按照规则来写代码，这样写出来的并发代码我们才能准确预测执行结果

##### Synchronization Order

JVM 的同步规范, 参考[Oracle Thread and Locks](https://docs.oracle.com/javase/specs/jls/se7/html/jls-17.html):

- 对于监视器 m 的解锁与所有后续操作对于 m 的加锁同步

- 对 volatile 变量 v 的写入，与所有其他线程后续对 v 的读同步

- 启动线程的操作与线程中的第一个操作同步。

- 对于每个属性写入默认值(0， false，null)与每个线程对其进行的第一步操作同步。(尽管在创建对象完成之前对对象属性写入默认值有点奇怪，但从概念上来说，每个对象都是在程序启动时用默认值初始化来创建的)

- 线程 T1 的最后操作与线程 T2 发现线程 T1 已经结束同步( 线程 T2 可以通过 `T1.isAlive()` 或 `T1.join()` 方法来判断 T1 是否已经终结)

- 如果线程 T1 中断了 T2，那么线程 T1 的中断操作与其他所有线程发现 T2 被中断了同步（通过抛出 InterruptedException 异常，或者调用 Thread.interrupted 或 Thread.isInterrupted ）

##### Happens-before Order

两个操作可以用 happens-before 来确定它们的执行顺序，如果一个操作 x happens-before 于另一个操作 y (记作: hb(x,y))，那么我们说第一个操作对于第二个操作是可见的。

- 如果操作 x 和操作 y 是同一个线程的两个操作，并且在代码上操作 x 先于操作 y 出现，那么有 hb(x, y)
  - 解释: 在单线程里面代码是顺序执行的

- 对象构造方法的最后一行指令 happens-before 于 finalize() 方法的第一行指令。
  - 解释: 构造函数先于 finalize 执行

- 如果操作 x 与随后的操作 y 构成同步，那么 hb(x, y)。
  - 解释: 这条规则就是 synchronization order 规则， 也就是上面一节的内容
 
- hb(x, y) 和 hb(y, z)，那么可以推断出 hb(x, z)

### synchronized

线程 a 对于进入 synchronized 块之前或在 synchronized 中对于共享变量的操作，对于后续的持有同一个监视器锁(monitor)的线程 b 可见。

- synchronized 保障变量的可见性:
一个线程在获取到监视器锁以后才能进入 `synchronized` 控制的代码块，一旦进入代码块，会从主存中重新读取共享变量的值，退出代码块的时候的，会将该线程写缓冲区中的数据刷到主内存中。

- Java中每一个对象都可以作为锁，这是 synchronized 实现同步的基础：
  - 普通同步方法，锁是当前实例对象(synchronized method)
  - 静态同步方法，锁是当前类的 class 对象(synchronize static method, synchronized(Obj.class))
  - 同步方法块，锁是括号里面的对象(synchronized(this), synchronized(obj))


#### 实现原理


##### java 对象头

JVM 对象在堆中的内存布局分为三个部分: 对象头，实例数据，对齐填充

Hotspot虚拟机的对象头主要包括两部分数据：`Mark Word`、`Klass Pointer`。其中`Klass Point`是是对象指向它的类元数据的指针，`Mark Word`用于存储对象自身的运行时标志数据，它是实现轻量级锁和偏向锁的关键。

JVM 中采用2个字(jvm 字等于位数)来存储对象头(如果对象是数组则会分配3个字，多出来的1个字记录的是数组长度)

`Mark Word`在默认情况下存储着对象的HashCode、分代年龄、锁标记位等以下是32位JVM的Mark Word存储结构：

![](/images/jvm/ObjectHead.png)

#####  Monitor

monitor 对象(也称为监视器锁), 是 MarkWord 中重量级锁指向的，每个对象都存在一个 monitor 与之关联, 当一个 monitor 被某个线程持有后，它便处于锁定状态。

monitor是由ObjectMonitor实现的，其主要数据结构如下:
``` 
ObjectMonitor() {
    _header       = NULL;
    _count        = 0; //记录个数
    _owner        = NULL; // 指向持有锁的线程
    _WaitSet      = NULL; // 处于wait状态的线程，会被加入到_WaitSet
    _EntryList    = NULL ; // 处于等待锁block状态的线程，会被加入到该列表
    ....... 
    // 省略一些属性
}
```

ObjectMonitor中有两个队列，_WaitSet 和 _EntryLis，用来保存ObjectWaiter对象列表( 每个等待锁的线程都会被封装成ObjectWaiter对象).

1. 当多个线程同时访问一段同步代码时，首先会进入 _EntryList 集合
2. 线程获取到对象的 monitor 后把monitor中的owner变量设置为当前线程同时monitor中的计数器count加1
3. 若线程调用 wait() 方法，将释放当前持有的monitor，owner变量恢复为null，count自减1,同时该线程进入 WaitSe t集合中等待被唤醒
4. 若当前线程执行完毕也将释放monitor(锁)并复位变量的值，以便其他线程进入获取monitor(锁)

##### synchronize 底层原理

- 同步代码块
``` 
  public void syncTask(){
       //同步代码库
       synchronized (this){
           doSomething....
       }
   }
```
针对于同步代码块来说，使用的实现是`monitorenter`和`monitorexit`指令，其中`monitorenter`指令指向同步代码块的开始位置，`monitorexit`指令则指明同步代码块的结束位置。当执行到`moniterenter`指令时，会尝试获取`monitor`。上述代码翻译成字节码大概如下:
``` 
monitorenter // 进入同步方法
........   // 执行逻辑
monitorexit // 退出同步方法块
```

- 同步方法
``` 
 public synchronized void syncTask(){
        doSomething......
   }
```

方法级的同步是隐式，即无需通过字节码指令来控制的，它实现在方法调用和返回操作之中。JVM可以从方法常量池中的方法表结构(method_info Structure) 中的 `ACC_SYNCHRONIZED` 访问标志区分一个方法是否同步方法。当方法调用时，调用指令将会检查方法的 `ACC_SYNCHRONIZED` 访问标志是否被设置, 如果设置了在去获取`monitor`


#### 锁的分类

![](/images/jvm/synchronize-lock.png)

#### 无锁

无锁是指没有对资源进行锁定，所有的线程都能访问并修改同一个资源，但同时只有一个线程能修改成功。

无锁的特点是修改操作会在循环内进行，线程会不断的尝试修改共享资源。如果没有冲突就修改成功并退出，否则就会继续循环尝试。如果有多个线程修改同一个值，必定会有一个线程能修改成功，而其他修改失败的线程会不断重试直到修改成功。

CAS原理及应用即是无锁的实现


##### 偏向锁

在大多数情况下，锁总是由同一线程多次获得，不存在多线程竞争，所以出现了偏向锁。其目标就是在只有一个线程执行同步代码块时能够提高性能 。
当一个线程访问同步代码块并获取锁时，会在Mark Word里存储锁偏向的线程ID。在线程进入和退出同步块时不再通过CAS操作来加锁和解锁，而是检测Mark Word里是否存储着指向当前线程的偏向锁。引入偏向锁是为了在无多线程竞争的情况下尽量减少不必要的轻量级锁执行路径，因为轻量级锁的获取及释放依赖多次CAS原子指令，而偏向锁只需要在置换ThreadID的时候依赖一次CAS原子指令即可。。

偏向锁只有遇到其他线程尝试竞争偏向锁时，持有偏向锁的线程才会释放锁，线程不会主动释放偏向锁。偏向锁的撤销，需要等待全局安全点（在这个时间点上没有字节码正在执行），它会首先暂停拥有偏向锁的线程，判断锁对象是否处于被锁定状态。撤销偏向锁后恢复到无锁（标志位为“01”）或轻量级锁（标志位为“00”）的状态。

##### 轻量级锁

当锁是偏向锁的时候，被另外的线程所访问，偏向锁就会升级为轻量级锁，其他线程会通过自旋的形式尝试获取锁，不会阻塞，从而提高性能。

在代码进入同步块的时候，如果同步对象锁状态为无锁状态（锁标志位为“01”状态，是否为偏向锁为“0”），虚拟机首先将在当前线程的栈帧中建立一个名为锁记录（Lock Record）的空间，用于存储锁对象目前的Mark Word的拷贝，然后拷贝对象头中的Mark Word复制到锁记录中。

拷贝成功后，虚拟机将使用CAS操作尝试将对象的Mark Word更新为指向Lock Record的指针，并将Lock Record里的owner指针指向对象的Mark Word。

如果这个更新动作成功了，那么这个线程就拥有了该对象的锁，并且对象Mark Word的锁标志位设置为“00”，表示此对象处于轻量级锁定状态。

如果轻量级锁的更新操作失败了，虚拟机首先会检查对象的Mark Word是否指向当前线程的栈帧，如果是就说明当前线程已经拥有了这个对象的锁，那就可以直接进入同步块继续执行，否则说明多个线程竞争锁。

若当前只有一个等待线程，则该线程通过自旋进行等待。但是当自旋超过一定的次数，或者一个线程在持有锁，一个在自旋，又有第三个来访时，轻量级锁升级为重量级锁。



##### 重量级锁

升级为重量级锁时，锁标志的状态值变为“10”，此时Mark Word中存储的是指向重量级锁的指针，此时等待锁的线程都会进入阻塞状态。


##### 锁升级过程总结理解

- 偏向锁: 只有一个线程进入临界区
- 轻量级锁: 多个线程交替进入临界区
- 重量级锁： 多个线程同时进入临界区

这里贴上知乎的一个回答，个人觉得理解起来清晰易懂:
>  情况一：只有Thread#1会进入临界区；
   情况二：Thread#1和Thread#2交替进入临界区；
   情况三：Thread#1和Thread#2同时进入临界区。
  上述的情况一是偏向锁的适用场景，此时当Thread#1进入临界区时，JVM会将lockObject的对象头Mark Word的锁标志位设为“01”，同时会用CAS操作把Thread#1的线程ID记录到Mark Word中，此时进入偏向模式。所谓“偏向”，指的是这个锁会偏向于Thread#1，若接下来没有其他线程进入临界区，则Thread#1再出入临界区无需再执行任何同步操作。也就是说，若只有Thread#1会进入临界区，实际上只有Thread#1初次进入临界区时需要执行CAS操作，以后再出入临界区都不会有同步操作带来的开销。
  然而情况一是一个比较理想的情况，更多时候Thread#2也会尝试进入临界区。若Thread#2尝试进入时Thread#1已退出临界区，即此时lockObject处于未锁定状态，这时说明偏向锁上发生了竞争（对应情况二），此时会撤销偏向，Mark Word中不再存放偏向线程ID，而是存放hashCode和GC分代年龄，同时锁标识位变为“01”（表示未锁定），这时Thread#2会获取lockObject的轻量级锁。因为此时Thread#1和Thread#2交替进入临界区，所以偏向锁无法满足需求，需要膨胀到轻量级锁。再说轻量级锁什么时候会膨胀到重量级锁。
   若一直是Thread#1和Thread#2交替进入临界区，那么没有问题，轻量锁hold住。一旦在轻量级锁上发生竞争，即出现“Thread#1和Thread#2同时进入临界区”的情况，轻量级锁就hold不住了。 （根本原因是轻量级锁没有足够的空间存储额外状态，此时若不膨胀为重量级锁，则所有等待轻量锁的线程只能自旋，可能会损失很多CPU时间）

#### 锁的优化

##### 锁消除 

如果通过逃逸分析(这里不做过多解释逃逸分析，在我的博客[类加载机制与对象的创建]中有过详细说明)证实，只被一个线程访问，在编译这个代码段的时候就不生成 Synchronized 关键字，仅仅生成代码对应的机器码。

##### 锁粗化

假设有几个在程序上相邻的同步块（代码段/共享资源）上，每个同步块使用的是同一个锁实例。

那么 JIT 会在编译的时候将这些同步块合并成一个大同步块，并且使用同一个锁实例。这样避免一个线程反复申请/释放锁。


##### 适应锁

当一个线程持申请锁时，该锁正在被其他线程持有。那么申请锁的线程会进入等待，等待的线程会被暂停，暂停的线程会产生上下文切换。由于上下文切换是比较消耗系统资源的，所以这种暂停线程的方式比较适合线程处理时间较长的情况。

前面一个线程执行的时间较长，才能弥补后面等待线程上下文切换的消耗。如果说线程执行较短，那么也可以采取忙等（Busy Wait）的状态。这种方式不会暂停线程，通过代码中的 while 循环检查锁是否被释放，一旦释放就持有锁的执行权。

这种方式虽然不会带来上下文的切换，但是会消耗 CPU 的资源。为了综合较长和较短两种线程等待模式，JVM 会根据运行过程中收集到的信息来判断，锁持有时间是较长时间或者较短时间。然后再采取线程暂停或忙等的策略。

#### synchronize 不保障重排序

以单例模式的 double check 检查问题， 看一下如下单例的写法:
``` 
public class Singleton {
    private static Singleton instance = null;
    private Singleton() {
    }

    public static Singleton getInstance() {
        if (instance == null) { // 1. 第一次检查
            synchronized (Singleton.class) { // 2
                if (instance == null) { // 3. 第二次检查
                    instance = new Singleton(); // 4
                }
            }
        }
        return instance;
    }
}
```
这种写法是有问题的， 假设有两个线程 a 和 b 调用 `getInstance()` 方法
1. 假设 a 先运行， 首先到步骤 4 处。`instance = new Singleton()` 这句代码首先会申请一段空间，然后将各个属性初始化为零值(0/null)，执行构造方法中的属性赋值[1]，将这个对象的引用赋值给 instance[2]。在这个过程中，[1] 和 [2] 可能会发生重排序。
2. 此时，线程 b 刚刚进来执行到步骤 1，就有可能会看到 instance 不为 null，然后线程 b 也就不会等待监视器锁，而是直接返回 instance。问题是这个 instance 可能还没执行完构造方法（线程 a 此时还在 4 这一步），所以线程 b 拿到的 instance 是不完整的，它里面的属性值可能是初始化的零值(0/false/null)，而不是线程 a 在构造方法中指定的值。

想解决这个问题， 使用 `volatile` 关键字修饰 instance 即可

另外： 如果对象所有的属性都被 final 关键字修饰， 那么不需要加 volatile 也可以保证不发生重排序。


### volatile

volatile 保证内存可见性和禁止指令重排序

- 内存可见性

上文提到过进入 synchronized 时，使得本地缓存失效，synchronized 块中对共享变量的读取必须从主内存读取；退出 synchronized 时，会将进入 synchronized 块之前和 synchronized块中的写操作刷入到主存中。

volatile 有类似的语义，读一个 volatile 变量之前，需要先使相应的本地缓存失效，这样就必须到主内存读取最新值，写一个 volatile 属性会立即刷入到主内存。所以，volatile 读和 monitorenter 有相同的语义，volatile 写和 monitorexit 有相同的语义。

- 禁止重排序

volatile 的禁止重排序并不局限于两个 volatile 的属性操作不能重排序，而且是 volatile 属性操作和它周围的普通属性的操作也不能重排序。

根据 volatile 的内存可见性和禁止重排序，那么我们不难得出一个推论：线程 a 如果写入一个 volatile 变量，此时线程 b 再读取这个变量，那么此时对于线程 a 可见的所有属性对于线程 b
 都是可见的(这里想想为何ReentrantLock只用了一个volatile的state属性)

#### volatile 语义的实现(内存屏障)

内存屏障四大分类：（Load 代表读取指令，Store代表写入指令）

| 内存屏障类型        | 使用场景                        | 描述                                                       |
|:--------------|:----------------------------|:---------------------------------------------------------|
| LoadLoad 屏障	  | Load1; LoadLoad; Load2      | 在Load2要读取的数据被访问前，保证Load1要读取的数据被读取完毕。                     |
| StoreStore 屏障 | Store1; StoreStore; Store2	 | 在Store2写入执行前，保证Store1的写入操作对其它处理器可见                       |
| LoadStore 屏障	 | Load1; LoadStore; Store2	   | 在Store2被写入前，保证Load1要读取的数据被读取完毕。                          |
| StoreLoad 屏障	 | Store1; StoreLoad; Load2	   | 在Load2读取操作执行前，保证Store1的写入对所有处理器可见。          |


为了实现volatile的内存语义，Java内存模型采取以下的保守策略:

- 在每个 volatile 写操作的前面插入一个 StoreStore 屏障
- 在每个 volatile 写操作的后面插入一个 StoreLoad 屏障
- 在每个 volatile 读操作的后面插入一个 LoadLoad 屏障
- 在每个 volatile 读操作的后面插入一个 LoadStore 屏障


#### volatile使用总结

1. volatile 修饰符适用于以下场景：某个属性被多个线程共享，其中有一个线程修改了此属性，其他线程可以立即得到修改后的值。
2. volatile 属性的读写操作都是无锁的，它不能替代 synchronized，因为它没有提供原子性和互斥性。因为无锁，不需要花费时间在获取锁和释放锁上，所以说它是低成本的。
3. volatile 只能作用于属性，我们用 volatile 修饰属性，这样 compilers 就不会对这个属性做指令重排序。
4. volatile 提供了可见性，任何一个线程对其的修改将立马对其他线程可见。volatile 属性不会被线程缓存，始终从主存中读取。
5. volatile 提供了 happens-before 保证，对 volatile 变量 v 的写入 happens-before 所有其他线程后续对 v 的读操作。
另 volatile 可以使得 long 和 double 的赋值是原子的


### MESI(CPU缓存一致性协议)

MESI 协议是一个基于失效的缓存一致性协议， 它基于总线嗅探实现，用额外的两位给每个缓存行标记状态，并且维护状态的切换，达到缓存一致性的目的。


MESI 是四个单词的缩写，每个单词分别代表缓存行的一个状态：

- M：modified，已修改, 但未同步。缓存行与主存的值不同。如果别的 CPU 内核要读主存这块数据，该缓存行必须回写到主存，状态变为共享状态（S）。
- E：exclusive，独占。缓存行只在当前缓存中，但和主存数据一致。当别的缓存读取它时，状态变为共享；当前写数据时，变为已修改状态（M）。
- S：shared，共享。缓存行也存在于其它缓存中且是干净的。缓存行可以在任意时刻抛弃。
- I：invalid，无效的。缓存行是无效的。

在 S(共享) 和 I(失效)状态下, 核心没有获得 Cache 块的独占权（锁）。在修改数据时不能直接修改，而是要先向所有核心广播 RFO（Request For Ownership）请求 ，将其它核心的 Cache 置为 “已失效”，等到获得回应 ACK 后才算获得 Cache 块的独占权。

在 M(已修改) 和 E(独占) 状态下，核心已经获得了 Cache 块的独占权（锁）, 在修改数据时不需要向总线发送广播，能够减轻总线的通信压力。


> 备注： 在线体验 MESI 协议的网站: https://www.scss.tcd.ie/Jeremy.Jones/VivioJS/caches/MESI.htm

#### Store Buffer

如果 CPU 对某个数据进行写操作，那么 CPU 就会发送一个 `Read Invalidate` 消息去读取对应的数据，并让其他的缓存副本失效。
从发送消息之后，到接收到所有的响应消息，中间等待过程对于 CPU 来说是漫长的， store buffer 就是用来减少 cpu 的等待时间的。


对于 store buffer:
- CPU 在写操作时，可以不等待其他 CPU 响应消息就直接写到 store buffer，后续收到响应消息之后，再把 store buffer 里面的数据写入缓存行。
- CPU 读数据的时候，也会先判断一下 store buffer 里面有没有数据，如果存在，就优先使用 store buffer 里面的数据（这个机制，叫做`store forwarding`）。


#### Invalidate Queue

store buffer 容量非常小，如果在其他 CPU 繁忙的时候响应消息的速度变慢，store buffer 会很容易地被填满，会直接的影响 CPU 的运行效率。
解决这个问题的关键就是提高 cpu 响应速度， invalid queue 主要作用就是问题提高 invalidate 消息的响应速度

对于 invalid queue:
- CPU 在收到 invalidate 消息(RFO)时，可以先不讲对应的缓存行失效，而是将消息放入 `invalidate queue`，立即返回 Invalidate Acknowledge 消息，然后在要对外发送 invalidate 消息时，先检查 invalidate queue 中有无该缓存行的 Invalidate 消息，如果有的话这个时候才处理 Invalidate 消息。




#### 流程演示

![](/images/thread/mesi.png)

从上图来看整个读取写入的流程:
1. cpu0 向总线读取 a， 此刻缓存未命中， 到主存中读取， 此刻 `cpu0 中 flag 为 E`
2. cpu1 向总线读取 a,  发现其他 cpu 有数据， 将 cpu0 中 flag 置为 S， `cpu1 读取 a flag 为 S`
3. cpu1 修改 a=1, 写入 store buffer 后立即返回
4. store buffer 异步在总线广播 invalidate 消息， 并等待 ack
5. cpu0 收到 invaliadte 消息后， 放入 invalidate queue 并返回 ack
6. invalidate queue 异步执行消息， 将 `cpu0 缓存行 a=0 置为 I`
7. cpu0 读取变量 a, 此刻缓存行状态为 I， 代表已失效
8. cpu0 像总线广播一个读请求
9. cpu1 收到读请求后， `cpu1 将缓存行状态置为 S` ， 并将缓存行 a=2 同步到 cpu0(这里使用的是cpu缓存行间同步， 比直接读主存快)

### 参考资料

- [类锁和对象锁](https://juejin.im/post/5adc8f8af265da0b7e0bdafe)
- [对象锁和类锁全面解析](http://www.importnew.com/20444.html)
- [java锁的优化](http://www.importnew.com/21933.html)
- [synchronized的底层优化](http://www.cnblogs.com/paddix/p/5405678.html)
- [jvm锁优化](https://www.jianshu.com/p/9932047a89be)
- [jvm锁的降级](https://www.jianshu.com/p/9932047a89be)
- [java 基础之内存模型](https://javadoop.com/post/java-memory-model)