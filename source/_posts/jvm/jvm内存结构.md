---
title: jvm内存结构
date: 2018-10-20 22:37:28
tags:
categories: jvm
---

### JVM内存结构概览
先来看一张图：

![](/images/jvm_structure.png)

jvm主要分，堆、方法区、java栈、本地方法栈、程序计数器五个区域，其中方法区和堆区是线程共享的

#### 堆区域

堆内存是JVM中最大的一块由新生代和老年代组成，而新生代内存又被分成三部分，Eden空间、From Survivor空间、To Survivor空间,默认情况下

新生代(young):老年代(old)=1:2

在新生代中 eden:from:to = 8:1:1

![](/images/heap-generation.png)


##### 新生代

新生代是大部分对象创建和销毁的区域，在通常的 Java 应用中，绝大部分对象生命周期都是很短暂的。其内部又分为 Eden 区， 作为对象初始化分配的区域， 两个survivor区域， 分别为from和to， 用来放置从Minor 
GC中保留下来的对象。JVM会随意选取一个Survivor作为to区域，然后会在GC过程中，将Eden中存活下来的对象和from中的对象拷贝到to这个区域， 防止内存碎片化，进一步清理无用对象

对Eden区域继续划分， Hotspot JVM还有一个概念叫Thread Local Allocation Buffer(TLAB), 
这是JVM对每个线程分配的一个私有缓存区域，避免多线程同时分配的时候操作同一个地址时可能需要加锁等机制而影响分配速度。TLAB仍然分配在堆上，结构比较简单，start、end就是起止地址，top表示已经分配到那里了，top与end
相遇的时候，代表该缓存已经满了，JVM会试图再从Eden中分配一块

![](/images/TLAB.png)

##### 老年代

老年代放置长生命周期的对象，通常是从Survivor区域拷贝过来的对象。当然也有特殊情况，我们知道普通对象会被分配在TLAB上，如果对象较大，JVM会试图直接分配在Eden其他位置上，如果对象太大，无法在新生代找到足够长的连续空间，JVM会直接分配在老年代


##### 永久代
永久代是早期hotspot JVM方法区的实现方式，存储Java的元数据、常量池等， JDK8之后就不存在永久代了

##### 各个区域的控制参数

-	-Xms设置堆的最小空间大小。
-	-Xmx设置堆的最大空间大小。
- -XX:NewSize设置新生代大小
- -XX:NewRatio=value 设置老年代和新生代的比例，默认是2
-	-XX:MaxNewSize设置新生代最大空间大小。
- -XX:PermSize设置永久代最小空间大小。
-	-XX:MaxPermSize设置永久代最大空间大小。
-	-XX:MaxPermSize设置永久代最大空间大小。

没有直接设置老年代的参数，但是可以设置堆空间大小和新生代空间大小两个参数来间接控制：老年代大小=堆空间大小-新生代空间大小

在年代堆视角中，还标记出了virtual区域， 在 JVM 内部，如果 Xms 小于 Xmx，堆的大小并不会直接扩展到其上限， 当内存需求不断增长的时候， JVM会逐渐扩张新生代等区域的大小，所以Virtual区域代表的就是暂时不可用的空间

#### 监控和诊断堆内存的工具

- 图形化工具： JConsole
- 命令行工具： jstat、 jmap
- JMC(java mission control)

#### 方法区

方法区和Java堆一样，是各个线程共享的内存区域。用于存储已被虚拟机加载的：
1. 类信息(class metadata)
2. 常量(包括interned Strings)
3. 静态变量（类变量 class static variables）
4. 即时编译器编译后的代码等

对于使用HotSpot VM的程序员来说，很多人把方法区称之为“永久代（Permanent Generation）”（备注：永久代为HotSpot特有,但现已经被移除）

##### 运行时常量池

运行时常量池其实是方法区的一部分。

class文件中有一项信息是常量池表（constant_pool table），用于存放编译期生成的“字面量”和“符号引用”，这部分内容将在类加载后进入方法区的运行时常量池中（Run-Time Constant Pool）存放

- 字面量相当于Java语言层面常量的概念，如文本字符串、final等常量  
- 符号引用属于编译原理方面的概念，包括了如下三种类型的常量：
  1. 类和接口的全限定名
  2. 字段名称和描述符
  3. 方法名称和描述符

也就是说：每一个class都会根据constant_pool table 来1：1创建一个此class对应的Run-Time Constant Pool

总结：
- 就是运行时所需要的常量数据的容器
- JVM规范对class文件的每一部分（包括constant_pool table）都有严格的规范，但是对于运行时常量池却没有做任何细节要求，不过一般来说，除了class文件中的符号引用外，直接引用也会存储在运行时常量池中
- 运行时常量池具备动态性，Java语言并没有要求常量一定只能编译期产生，运行期也可以将新常量放入池中。这个特性用的较多的便是String类的intern()方法

当运行时常量池无法再申请到内存时，将抛出OutOfMemoryError异常



#### 程序计数器

程序计数器（Program Counter Register）是一块较小的内存空间，它的作用可以看做是当前线程所执行的字节码的行号指示器

#### JVM栈

与程序计数器一样，也是线程私有的，其生命周期和线程一样，每个Java线程有一个虚拟机栈。平常我们讲的“栈内存”就是虚拟机栈，或者说是虚拟机栈中局部变量表部分。

虚拟机栈描述的是Java方法执行的内存模型, 每一个方法被调用直至执行完成的过程，就对应着一个栈帧在虚拟机栈中从入栈到出栈的过程。栈帧中存储：
- 1）局部变量表

存放了编译期就可知的：各种基本数据类型（8个基本数据类型）、对象引用(reference类型)、returnAddress类型（指向一条字节码指令地址）。其中64位长度的long和double类型的数据会占用2个局部变量空间
(Slot)，其余的数据类型只占用1个。局部变量表所需的内存大小在编译期就完成了分配，也就是说当进入一个方法时，此方法需要在栈帧中分配多大的局部变量表空间时完全确定的，运行期不会改变

- 2)操作数栈（指令的压栈和出栈来操作）
- 3)动态链接

每个栈帧都包含一个指向运行时常量池中该栈帧所属性方法的引用，持有这个引用是为了支持方法调用过程中的动态连接。在Class文件的常量池中存有大量的符号引用，字节码中的方法调用指令就以常量池中指向方法的符号引用为参数。这些符号引用一部分会在类加载阶段或第一次使用的时候转化为直接引用，这种转化称为静态解析。另外一部分将在每一次的运行期期间转化为直接引用，这部分称为动态连接。

- 4)方法出口等

方法从调用到执行完成的过程，就对应了，一个栈帧在虚拟机栈中的入栈和出栈的过程

有两种异常：
1. 如果线程请求的栈深度大于JVM所允许的深度，将抛出StackOverflowError异常
2. 如果栈扩展时无法申请到足够的内存，将抛出OutOfMemoryError(OOM)异常



#### 本地方法栈
本地方法栈（Native Method Stacks）与虚拟机栈所发挥的作用是非常相似的，其区别不过是虚拟机栈为虚拟机执行Java方法（也就是字节码）服务，而本地方法栈则是为虚拟机使用到的Native方法服务


### 直接内存

直接内存并不是虚拟机运行时数据区的一部分， 也不是虚拟规范中定义的内存区域， 但这部分内存也被频繁使用。

NIO引入一种基于通道(Channel)和缓冲(buffer)的I/O方式， 他使用`Native函数库`直接分配堆外内存， 然后通过存在java堆中的`DirectByteBuffer对象`作为对这块内存的引用进行操作， 
这样在一些场景中显著提升内存， 避免了在java堆和native堆中来回复制数据

直接内存的分配不受java堆大小的限制， 但是配置虚拟机参数的时候要考虑到直接内存的存在， 不能让各个内存区域的总和大于物理机的内存， 从而导致动态扩展的时候出现OOM


### 常见OOM的原因

#### 1.对象不能被分配在堆内存中，
``` 
Exception in thread “main”: java.lang.OutOfMemoryError: Java heap space
```
内存泄露或者堆内存空间分配过小


#### 2. 类或方法不能加载到持久代
``` 
Exception in thread “main”: java.lang.OutOfMemoryError: PermGen space
```
它可能出现在一个程序加载很多类的时候，比如引用了很多第三方的库；

#### 3. 创建的数组大于堆内存的空间
``` 
Exception in thread “main”: java.lang.OutOfMemoryError: Requested array size exceeds VM limit
```

#### 4. 分配本地分配失败
``` 
Exception in thread “main”: java.lang.OutOfMemoryError: request <size> bytes for <reason>. Out of swap space?
```
或者

``` 
Exception in thread “main”: java.lang.OutOfMemoryError: <reason> <stack trace>（Native method）
```

应该从本地方法、JNI或java虚拟机本身找原因


### 参考资料
- [周志明-深入理解java虚拟机]
- [纯洁的微笑博客](http://www.ityouknow.com/jvm/2017/08/25/jvm-memory-structure.html)
- [杨晓峰-如何监控java堆内和堆外的内存]
- [JVM自动内存管理机制](http://liucw.cn/2017/09/28/jvm/JVM%E8%87%AA%E5%8A%A8%E5%86%85%E5%AD%98%E7%AE%A1%E7%90%86%E6%9C%BA%E5%88%B6/)