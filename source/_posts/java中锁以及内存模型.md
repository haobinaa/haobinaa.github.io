---
title: java中锁以及内存模型
date: 2019-12-27 16:10:44
tags: jvm
categories: 并发
---
### 并发下的三大问题

#### 重排序

以下几种机制会引起重排序:
1. 编译器的优化： 对于没有数据依赖关系的操作，编译器在编译的过程中会进行一定程度的重排序。
2. 指令重排序： CPU在执行指令的时候也会对不存在数据依赖关系的指令进行一定程度的重排序

#### 内存可见性

Java中使用JMM屏蔽了CPU
的多级缓存: 所有的共享变量存在于主内存中，每个线程有自己的本地内存，线程读写共享数据也是通过本地内存交换的。在操作数据的时候，每个线程都会将自己需要的数据读到线程本地缓存中，数据修改后也是写入到缓存中，然后等待刷入到主存中。所以会导致有些线程读取的值是一个过期的值。

#### 原子性

原子性是指的一个操作不可被中断，要么成功要么失败。

Java 编程语言规范中提到，对于 64 位的值的写入，可以分为两个 32 位的操作进行写入。本来一个整体的赋值操作，被拆分为低 32 位赋值和高 32 位赋值两个操作，中间如果发生了其他线程对于这个值的读操作，必然就会读到一个奇怪的值。

这个时候需要使用 volatile 关键字进行控制了，JMM 规定了对于 volatile long 和 volatile double，JVM 需要保证写入操作的原子性(在 64 位的 JVM 中，不加 volatile
 也是可以的，同样能保证对于 long 和 double 写操作的原子性, 但是要尽量考虑到 long 和 double 的非原子性问题)。
 
 #### 并发规则的约束
 
 JVM 定义了一些约束规则来避免各种各样的并发问题，开发者写代码的时候按照规则才能准确的预测执行结果。
 
 ##### 同步规则(Synchronization)
 
 Java 语言定义的同步规则如下:
 
 - 对于监视器 m 的解锁与所有后续操作对于 m 的加锁同步
 - 对 volatile 变量 v 的写入，与所有其他线程后续对 v 的读同步
 - 启动线程的操作与线程中的第一个操作同步
 - 对于每个属性写入默认值（0， false，null）与每个线程对其进行的操作同步
 - 线程 T1 的最后操作与线程 T2 发现线程 T1 已经结束同步(线程 T2 可以通过 T1.isAlive() 或 T1.join() 方法来判断 T1 是否已经终结)
 - 如果线程 T1 中断了 T2，那么线程 T1 的中断操作与其他所有线程发现 T2 被中断了同步(Thread.interrupted 或 Thread.isInterrupted)
 
 #### Happens-before 原则
 
 两个操作可以用 happens-before 来确定它们的执行顺序，如果一个操作 happens-before 于另一个操作，那么我们说第一个操作对于第二个操作是可见的。
 
 - 如果操作 x 和操作 y 是同一个线程的两个操作，并且在代码上操作 x 先于操作 y 出现，那么有 hb(x, y)。(这里的 happens-before 不是说一定是 x 在 y之前执行，只是 x 的执行结果是对 y 可见的)
 - 如果操作 x 与随后的操作 y 构成同步(上面的同步规则)，那么 hb(x, y)
 - hb(x, y) 和 hb(y, z)，那么可以推断出 hb(x, z)
 
 ### synchronize 原理
 
 ### volatile 原理
 
 ### 参考资料
 
 - [Java基础并发模型](https://javadoop.com/post/java-memory-model)
 - [正确使用volatile变量](https://www.ibm.com/developerworks/cn/java/j-jtp06197.html)
 - [Java并发中锁优化](https://mp.weixin.qq.com/s?__biz=MzU0OTk3ODQ3Ng==&mid=2247486831&idx=1&sn=69ca4c63d806f1d22579b3a3df52d3e7&chksm=fba6e56cccd16c7ada14fc23d052de0f2f02c4cc1560f65bdf2c2d473a8a1a0047b35738d911&mpshare=1&scene=1&srcid=&sharer_sharetime=1577408454552&sharer_shareid=3c10d2bfc6ced97cc6607b57b30ea1b1&key=ff1b1d089c15295c3c600d3f8ce8ddc0ab879df14ddc473fbdb57ad415231a9bcb4bb7f2ea68cd2fda61541fb745234b412d411fe4d487ab5fb9abd86e45657420c8503edd6acff6cd47d3c0cecbc220&ascene=1&uin=MjkyMjA3ODQwNA%3D%3D&devicetype=Windows+10&version=62070158&lang=zh_CN&exportkey=A98bG3TKu5AOwxw3wb3J5VU%3D&pass_ticket=D%2BYz2lIw3c6APzjfwsbD3JI58lKvJxKoZkAABhujFNfpTDob6624UaGy6Df0b6gp)