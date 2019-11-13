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


##### 新生代（young)

新生代是大部分对象创建和销毁的区域，在通常的 Java 应用中，绝大部分对象生命周期都是很短暂的。其内部又分为 Eden 区， 作为对象初始化分配的区域， 两个survivor区域， 分别为from和to， 用来放置从Minor 
GC中保留下来的对象。JVM会随意选取一个Survivor作为to区域，然后会在GC过程中，将Eden中存活下来的对象和from中的对象拷贝到to这个区域， 防止内存碎片化，进一步清理无用对象

对Eden区域继续划分， Hotspot JVM还有一个概念叫Thread Local Allocation Buffer(TLAB), 
这是JVM对每个线程分配的一个私有缓存区域，避免多线程同时分配的时候操作同一个地址时可能需要加锁等机制而影响分配速度。TLAB仍然分配在堆上，结构比较简单，start、end就是起止地址，top表示已经分配到那里了，top与end
相遇的时候，代表该缓存已经满了，JVM会试图再从Eden中分配一块

![](/images/TLAB.png)

##### 老年代 (old)

老年代放置长生命周期的对象，通常是从Survivor区域拷贝过来的对象。当然也有特殊情况，我们知道普通对象会被分配在TLAB上，如果对象较大，JVM会试图直接分配在Eden其他位置上，如果对象太大，无法在新生代找到足够长的连续空间，JVM会直接分配在老年代


##### 堆大小参数设置

相关参数：
>　　-Xmx Java Heap最大值，默认值为物理内存的1/4，最佳设值视物理内存大小及计算机内其他内存开销而定  
 　　-Xms Java Heap初始值，Server端JVM最好将-Xms和-Xmx设为相同值，开发测试机JVM可以保留默认值；  
 　　-Xmn Java Heap Young区大小，不熟悉最好保留默认值；  
 　　-Xss 每个线程的Stack大小，不熟悉最好保留默认值；  
 其默认空间(即-Xms)是物理内存的1/64，最大空间(-Xmx)是物理内存的1/4。如果内存剩余不到40％，JVM就会增大堆到Xmx设置的值，内存剩余超过70％，JVM就会减小堆到Xms设置的值。所以服务器的Xmx和Xms设置一般应该设置相同避免每次GC后都要调整虚拟机堆的大小。假设物理内存无限大，那么JVM内存的最大值跟操作系统有关，一般32位机是1.5g到3g之间，而64位的就不会有限制了
 
 
没有直接设置老年代的参数，但是可以设置堆空间大小和新生代空间大小两个参数来间接控制：老年代大小=堆空间大小-新生代空间大小

在年代堆视角中，还标记出了virtual区域， 在 JVM 内部，如果 Xms 小于 Xmx，堆的大小并不会直接扩展到其上限， 当内存需求不断增长的时候， JVM会逐渐扩张新生代等区域的大小，所以Virtual区域代表的就是暂时不可用的空间

#### 监控和诊断堆内存的工具和方法

- Jconsole 图形化分析
- 命令行工具： jstat、 jmap 等命令配合参数进行运行时查询
- 使用 Eclipse MAT 来分析 jmap 堆转储的文件
- gc 日志分析

#### 方法区

方法区和Java堆一样，是各个线程共享的内存区域。用于存储已被虚拟机加载的：
1. 类信息(class metadata)
2. 常量(包括interned Strings)
3. 静态变量（类变量 class static variables）
4. 即时编译器编译后的代码等

对于使用HotSpot VM的程序员来说，很多人把方法区称之为“永久代（Permanent Generation）”（备注：永久代为HotSpot特有,但现已经被移除）.永久代的垃圾回收和老年代的垃圾回收是绑定的，一旦其中一个区域被占满，这两个区都要进行垃圾回收。

##### 永久代(PermGen)

方法区是JVM的一种规范，永久代是它的一种实现。


永久代是早期hotspot JVM方法区的实现方式，存储Java的元数据、常量池等， JDK8之后就不存在永久代了

JDK8之后，原先永久代中类的元信息会被放入本地内存（元数据区，metaspace），将类的静态变量和内部字符串放入到java堆中。原理上metaspace属于堆外内存，只受限于系统物理内存大小。设置`metaspace`的参数：
- -XX:MetaspaceSize, Metaspace扩容时触发FullGC的初始化阈值。
- -XX:MaxMetaspaceSize, Metaspace最大值。

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

##### 方法区的回收

方法区中的垃圾回收主要是：废弃常量及无用类。

判断常量是否废弃与判断堆中对象十分相似。例如，若常量池中存在字符串“abc”，而系统中并没有任何String对象的值为“abc”的，也就是没有任何对象引用它，那么它就可以被回收了。

无用类的判定稍微复杂点，需要满足：
1. 该类的所有对象实例已经被回收，也就是Java堆中不存在该类的任何实例
2. 加载该类的ClassLoader已经被回收
3. 该类的类对象Class没有在任何地方被引用，无法使用反射来访问该类的方法

当方法区中的类满足以上条件时，就可以对无用类进行回收了，这里说的仅仅是“可以”，而并不是和对象一样，不使用了就必然会回收。是否对类进行回收，HotSpot虚拟机提供了各种配置，这里不多讲。

在大量使用反射、动态代理、CGLIB等ByteCode框架、动态生成JSP以及OSGI这类频繁自定义ClassLoader的场景都需要虚拟机具备类卸载的功能，以保存永久代不会溢出。




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


### 内存溢出

#### java堆溢出


Java堆用于存储对象实例，只要不断地创建对象，并且保证GC Roots到对象之间有可达路径来避免垃圾回收机制清除这些对象，那么在对象数量到达最大堆的容量限制后就会产生内存溢出异常。

`-XX:+HeapDumpOnOutOfMemoryError` 可以让虚拟机在出现内存溢出异常时Dump出当前的内存堆栈转储快照以便事后进行分析。

例子：
``` 
//VM Args: -Xms20m -Xmx20m -XX:+HeapDumpOnOutOfMemoryError
//Java堆溢出异常测试
public class HeapOOM {
    static class OOMObject {}
    public static void main(String[] args) {
        List<OOMObject> list = new ArrayList<OOMObject>();
        while (true) {
            list.add(new OOMObject());
        }
    }
}
```
将会抛出异常:`Exception in thread “main” java.lang.OutOfMemoryError: Java heap space`

##### 内存溢出和内存泄露
- 内存溢出：out of memory，是指程序在申请内存时，没有足够的内存空间供其使用，出现out of memory；比如申请了一个integer,但给它存了long才能存下的数，那就是内存溢出。

- 内存泄露： memory leak，是指程序在申请内存后，无法释放已申请的内存空间，一次内存泄露危害可以忽略，但内存泄露堆积后果很严重，无论多少内存,迟早会被占光

##### 内存泄露处理方式

如果是内存泄露，可用Eclipse Memory Analyzer工具查看泄露对象到GC Roots的引用链。于是就能找到泄露对象是通过怎样的路径与GC Roots相关联并导致垃圾收集器无法自动回收他们的。掌握了泄露对象的类型信息及GC Roots引用链的信息，就可以比较准确地定位出泄露代码的位置。

具体可以参考[分析内存泄露的一般办法](https://blog.csdn.net/ZYC88888/article/details/80487391)

##### 内存溢出的处理方式
如果内存不泄露，也就是说，就是内存中的对象确实都还必须都活着，则：
1. 检查虚拟机的堆参数（-Xmx与-Xms），与机器物理内存对比看是否还可以调大。
2. 从代码上检查是否存在某些对象生命周期过长、持有状态时间过长的情况，尝试减少程序运行期的内存消耗。


#### 虚拟机和本地方法栈溢出

由于在HotSpot虚拟机中并不区分虚拟机栈和本地方法栈，因此，对于HotSpot来说，虽然-Xoss参数（设置本地方法栈大小）存在，但实际上是无效的，栈容量只由-Xss参数设定。关于虚拟机栈和本地方法栈，在Java虚拟机规划中描述了两种异常：
1. 如果线程请求的栈深度大于虚拟机所允许的最大尝试，将抛出抛出StackOverflowError异常
2. 如果虚拟机在扩展栈时无法申请到足够的内存空间，则抛出OutOfMemoryError异常

虽然分了两种情况，其实存在互相重叠的地方：当栈空间无法继续分配时，到底是内存太小，还是已使用的栈空间太大，其本质只是对同一件事情的两种描述而已。

例子：
``` 
/**
 * VM Args: -Xss128k
 *
 * 1.使用-Xss参数减少栈内存容量。结果：抛出StackOverflowError，
 *   异常出现时输出的堆栈尝试相应缩小。
 * 2.定义了大量的本地变量，增大此方法帧中本地变量表的长度。
 *   结果：抛出StackOverflowError，异常出现时输出的堆栈尝试相应缩小。
 */
public class JavaVMStackSOF {
    private int stackLength = 1;
    public void stackLeak() {
        stackLength++;
        stackLeak();
    }
    public static void main(String[] args) throws Throwable {
        JavaVMStackSOF oom = new JavaVMStackSOF();
        try {
            oom.stackLeak();
        } catch (Throwable e){
            System.out.println("stack length:" + oom.stackLength);
            throw e;
        }
    }
}



#####################运行结果
stack length:11411Exception in thread “main” java.lang.StackOverflowError
at com.changwen.javabase.JVM.OutOfMemoryError.JavaVMStackSOF.stackLeak(JavaVMStackSOF.java:12)
at com.changwen.javabase.JVM.OutOfMemoryError.JavaVMStackSOF.stackLeak(JavaVMStackSOF.java:13)
at com.changwen.javabase.JVM.OutOfMemoryError.JavaVMStackSOF.stackLeak(JavaVMStackSOF.java:13)…….(最后程序还是会停止的）
```

在单线程下，无论是由于栈帧太大还是虚拟机容量太小，当内存无法分配时，虚拟机都是抛出StackOverflowError异常。
　　如果测试时不限于单线程，通过不断地建立线程的方式倒是可以产生内存溢出异常。但是这样产生的内存溢出异常与栈空间是否足够大并不存在任何联系，准确地说，在这种情况下，为每个线程的栈分配的内存越大，反而越容易产生内存溢出异常。所以在多线程开发的应用时需要特别注意，如果出现StackOverflowError异常时有错误堆栈可以阅读，相对来说，比较容易找到错误问题所在。

例子：
``` 
/**
 * VM Args: -Xss2M（这时候不妨设置大些）
 *
 * 如果要尝试运行上面这段代码，记得要先保存当前的工作。
 * 由于在Windows平台的虚拟机中，Java的线程是映射到操作系统的内核线程上的，
 * 因此上述代码执行时有较大的风险，可能会导致操作系统假死。
 */
public class JavaVMStackOOM {
    private void dontStop() {
        while(true){}
    }
    public void stackLeakByThread() {
        while(true) {
            Thread thread = new Thread(new Runnable() {
                public void run() {
                    dontStop();
                }
            });
        }
    }
    public static void main(String[] args) {
        JavaVMStackOOM oom = new JavaVMStackOOM();
        oom.stackLeakByThread();
    }
}
```
则，此时会`Exception in thread “main” java.lang.OutOfMemoryError: unable to create new native method`






### 参考资料
- [周志明-深入理解java虚拟机]
- [纯洁的微笑博客](http://www.ityouknow.com/jvm/2017/08/25/jvm-memory-structure.html)
- [杨晓峰-如何监控java堆内和堆外的内存]
- [JVM自动内存管理机制](http://liucw.cn/2017/09/28/jvm/JVM%E8%87%AA%E5%8A%A8%E5%86%85%E5%AD%98%E7%AE%A1%E7%90%86%E6%9C%BA%E5%88%B6/)
- [Java永久代去哪儿了](https://droidyue.com/blog/2015/08/22/where-has-the-java-permgen-gone/)