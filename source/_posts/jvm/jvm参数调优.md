---
title: jvm参数调优
date: 2021-12-01 16:27:13
tags:
categories: jvm
description: jvm 参数调优设置， 应用启动jvm目标(参考唯品会)
---

### jvm 命令行工具

| 名称   |      描述      |  
|----------|:-------------:|
| jps	 |  JVM 进程状态工具。显示系统内的所有 JVM 进程。|
| jstat |    JVM 统计监控工具。监控虚拟机运行时状态信息，它可以显示出 JVM 进程中的类装载、内存、GC、JIT 编译等运行数据。|
| jmap | JVM 堆内存分析工具。用于打印 JVM 进程对象直方图、类加载统计。并且可以生成堆转储快照（一般称为 heapdump 或 dump 文件） |
| jstack | JVM 栈查看工具。用于打印 JVM 进程的线程和锁的情况。并且可以生成线程快照（一般称为 threaddump 或 javacore 文件）|
| jinfo | JVM 信息查看工具。用于实时查看和调整 JVM 进程参数。 |
| jcmd | JVM 命令行调试 工具。用于向 JVM 进程发送调试命令 |

#### jstat

jstat 用于监视虚拟机运行时状态信息，它可以显示出虚拟机进程中的类装载、内存、垃圾收集、JIT 编译等运行数据。

用法: `jstat [option] VMID [interval] [count]`

option 参数:
-class: 监视类装载、卸载数量、总空间以及类装载所耗费的时间
-gc：监视 Java 堆状况，包括 Eden 区、两个 survivor 区、老年代、永久代等区的容量、已用空间、GC 时间合计等信息
-gcutil：显示垃圾回收统计信息
-gccause：显示垃圾回收的相关信息（通 -gcutil），同时显示最后一次或当前正在发生的垃圾回收的诱因
-gccapacity：显示各个代的容量以及使用情况
-gcmetacapacity：显示 Metaspace 的大小
-gcnew：显示新生代信息
-gcnewcapacity：显示新生代大小和使用情况
-gcold：显示老年代和永久代的信息
-gcoldcapacity：显示老年代的大小


#### jmap

-dump:  生成堆转储快照。-dump:live 只保存堆中的存活对象。
-finalizerinfo:  显示在 F-Queue 队列等待执行 finalizer 方法的对象
-heap: 显示 Java 堆详细信息。
-histo: 显示堆中对象的统计信息，包括类、实例数量、合计容量。-histo:live 只统计堆中的存活对象。
-F - 当-dump 没有响应时，强制生成 dump 快照

``` 
// dump 堆到文件，format 指定输出格式，live 指明是活着的对象，file 指定文件名, 生成文件用mat可以分析/
jmap -dump:live,format=b,file=dump.hprof 28920
// 查看实例数最多的类
jmap -histo 29527 | head -n 6
// 查看堆信息
jmap -heap 29527
```

#### jstack

jstack 用来打印目标 Java 进程中各个线程的栈轨迹，以及这些线程所持有的锁，并可以生成 java 虚拟机当前时刻的线程快照（threaddump）

jstack 通常会结合 `top -Hp pid` 或 `pidstat -p pid -t` 一起查看具体线程的状态，也经常用来排查一些死锁的异常。

用法 `jstack [option] pid`
- `-F`当正常输出请求不被响应时，强制输出线程堆栈
- `-l` 除堆栈外，显示关于锁的附加信息
- `-m` 打印 java 和 jni 框架的所有栈信息


jstack 显示系统线程状态:
- `deadlock`: 互相竞争， 导致死锁
- `runnable`: 正常在执行操作
- `blocked`: 阻塞状态，一般是长时间没有获取到锁
- `waiting on condition`: 线程正处于等待资源或等待某个条件的发生，具体的原因需要结合下面堆栈信息进行分析。
  （1） 如果堆栈信息明确是应用代码，则证明该线程正在等待资源，一般是大量读取某种资源且该资源采用了资源锁的情况下，线程进入等待状态，等待资源的读取，或者正在等待其他线程的执行等。
  （2） 如果发现有大量的线程都正处于这种状态，并且堆栈信息中得知正等待网络读写，这是因为网络阻塞导致线程无法执行，很有可能是一个网络瓶颈的征兆。要结合系统的一些性能观察工具进行综合分析，比如 netstat 统计单位时间的发送包的数量，看是否很明显超过了所在网络带宽的限制；观察 CPU 的利用率，看系统态的 CPU 时间是否明显大于用户态的 CPU 时间。这些都指向由于网络带宽所限导致的网络瓶颈。
  （3）还有一种常见的情况是该线程在 sleep，等待 sleep 的时间到了，将被唤醒。

### heap Size

- `-Xmx`: 最大Heap Size，即上图的Total size（包括Eden+form+to+old），限制了年轻代和年老代的可分配最大值
- `-Xms`: 初始化分配的Heap Size

生产环境中xms一般设置成跟xmx相等，因为若xms不等于xmx那么在某些场景下JVM可能需要对Heap Size进行频繁的扩展和收缩，增加处理时间

#### Young Generation Size

- `-Xmn`: 最大年轻代大小，即 Eden+S0+S1

- `-XX:NewSize`： 初始化年轻代大小，即上图中的Eden+S0+S1，在只设置了-Xmn不设置-XX:NewSize的情况下，NewSize等于Xmn

- `-XX:SurvivorRatio`: Eden和S0/S1的比例,默认为8，若NewSize为114m，则S0=NewSize/(SurvivorRatio+2)=11.4m

#### Old Generation Size

- `-XX:NewRatio`: old/new 比例。默认为2

注意：`-Xmn`的优先级比`-XX:NewRatio`高，若-Xmn已指定，则`OldSize=HeapSize-NewSize`，无需再按比例计算。生产环境中一般只需指定-Xmn就足够了。


#### Thread Stack Size

- `-Xss`: —线程堆栈大小，一般用于存放方法入口参数和返回值，以及原子类型的本地变量，一般可设置为128k.

如果线程数较多，函数的递归较少，线程栈内存可以调小节约内存，默认1M

#### MetaSpace/PermGen

jdk1.8以下设置永久代大小:
- `-XX:PermSize`: 永久代初始大小
- `-XX:MaxPermSize`: 永久代最大大小

jdk1.8以及以上版本:
- `-XX:MetaspaceSize`: 元空间大小
- `-XX:MaxMetaspaceSize`: 元空间最大大小

#### 堆外内存设置

- `-XX:MaxDirectMemorySize`: 堆外内存的最大值默认约等于堆大小，可以显式将其设小， 获得一个比较清晰的内存总量估计

这块内存java相关的主要存放`DirectByteBuffer`对象

在CMS GC的情况下， 堆外内存的默认值是: 新生代的最大值-一个survivor的大小+老生代的最大值，也就是我们设置的-Xmx的值里除去一个survivor的大小

### 辅助调试信息

- `-XX:+PrintGC`： 打印GC信息， 输出类似:
```
[GC 118250K->113543K(130112K), 0.0094143 secs] [Full GC 121376K->10414K(130112K), 0.0650971 secs] 
```

- `-XX:+PrintGCDetails`: 打印GC详细信息， 输出类似:
```
[GC [DefNew: 8614K->781K(9088K), 0.0123035 secs] 118250K->113543K(130112K), 0.0124633 secs] 
```

### GC收集器相关参数

#### CMS Options

- `-XX:+UseConcMarkSweepGC`: 启用 CMS 收集器
- `-XX:CMSInitiatingOccupancyFraction`: 
- `-XX:+UseCMSInitiatingOccupancyOnly`：
- `-XX:+ExplicitGCInvokesConcurrent`：  System.gc 使用 CMS 算法
- `-XX:+ParallelRefProcEnabled -XX:+CMSParallelInitialMarkEnabled`： CMS 中这两个阶段并发执行
- ` -XX:MaxTenuringThreshold=3`: 降低晋升年龄(默认是15)， 加快ygc速度
- `-XX:+CMSScavengeBeforeRemark`： remark之前做一次ygc。如果CMS GC时间很长，并且明显受新生代存活对象数量影响时打开，但会导致每次CMS GC与一次YGC连在一起执行，加大了事实上JVM停顿的时间

### 其他优化参数

- `-XX:+AlwaysPreTouch`: 对象首先会先分配在年轻代，因为之前分配的只是虚拟内存，所以每次新建对象都需要操作系统来先分配物理内存，分配对象速度自然就降低了，只有等第一次新生代GC后，该被分配的内存空间都已经分配了，之后分配对象的速度才会加快。那么老年代也是同理，老年代的空间何时真正使用，自然是对象需要晋升到老年代时，所以新生代GC的时候，对象要从新生代晋升到老年代，操作系统也需要为老年代先分配物理内存，这样就间接影响了新生代GC的效率。`-XX:+AlwaysPreTouch`参数能够达到的效果就是，在服务启动的时候真实的分配物理内存给JVM，而不再是虚拟内存，效果是可以加快代码运行效率，缺点也是有的，毕竟把分配物理内存的事提前放到JVM进程启动时做了，自然就会影响JVM进程的启动时间，导致启动时间降低几个数量级。

- `-XX:-UseBiasedLocking`： 禁止偏向锁优化。 当锁对象第一次被线程获取的时候，虚拟机将会把对象头中的标志位设置为“01”、把偏向模式设置为“1”，标识进入偏向模式。同时使用CAS操作把获取这个锁的线程ID记录在了对象头的Mark Word中，如果CAS操作成功，持有偏向锁的线程以后每次进入这个锁都不需要有任何同步操作。但是如果另外的线程去尝试获取这个锁，偏向模式则马上宣告结束。偏向锁是一种权衡的优化，如果程序中的大多数锁都总是被多个不同的线程访问，那偏向模式反而是多余的。

- `-XX:AutoBoxCacheMax`： 配置 IntegerCache 自动装箱大小(默认是 -128 ~ 127)

- `-XX:+UnlockDiagnosticVMOptions -XX:+DebugNonSafepoints`： 对 async-profier 火焰图效果更好的参数(离线环境压测可以打开这两个参数)

### 参考资料
- [JVM对外内存完全解读](http://lovestblog.cn/blog/2015/05/12/direct-buffer/)