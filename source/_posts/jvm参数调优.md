---
title: jvm参数调优
date: 2021-12-01 16:27:13
tags:
categories: jvm
description: jvm 参数调优设置， 应用启动jvm目标(参考唯品会)
---

### Heap Size

- `-Xmx`: 最大Heap Size，即上图的Total size（包括Eden+form+to+old），限制了年轻代和年老代的可分配最大值

- `-Xms`: 初始化分配的Heap Size

生产环境中xms一般设置成跟xmx相等，因为若xms不等于xmx那么在某些场景下JVM可能需要对Heap Size进行频繁的扩展和收缩，增加处理时间

#### Young Generation Size

- `-Xmn`: 最大年轻代大小，即 Eden+S0+S1

- `-XX:NewSize`： 初始化年轻代大小，即上图中的Eden+S0+S1，在只设置了-Xmn不设置-XX:NewSize的情况下，NewSize等于Xmn

`-XX:SurvivorRatio`: Eden和S0/S1的比例,默认为8，若NewSize为114m，则S0=NewSize/(SurvivorRatio+2)=11.4m

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

### 其他参数

- `-XX:+AlwaysPreTouch`: 对象首先会先分配在年轻代，因为之前分配的只是虚拟内存，所以每次新建对象都需要操作系统来先分配物理内存，分配对象速度自然就降低了，只有等第一次新生代GC后，该被分配的内存空间都已经分配了，之后分配对象的速度才会加快。那么老年代也是同理，老年代的空间何时真正使用，自然是对象需要晋升到老年代时，所以新生代GC的时候，对象要从新生代晋升到老年代，操作系统也需要为老年代先分配物理内存，这样就间接影响了新生代GC的效率。`-XX:+AlwaysPreTouch`参数能够达到的效果就是，在服务启动的时候真实的分配物理内存给JVM，而不再是虚拟内存，效果是可以加快代码运行效率，缺点也是有的，毕竟把分配物理内存的事提前放到JVM进程启动时做了，自然就会影响JVM进程的启动时间，导致启动时间降低几个数量级。



### 参考资料
- [JVM对外内存完全解读](http://lovestblog.cn/blog/2015/05/12/direct-buffer/)