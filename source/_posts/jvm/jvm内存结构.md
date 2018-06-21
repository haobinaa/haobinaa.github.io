---
title: jvm内存结构
date: 2018-05-20 22:37:28
tags:
categories: jvm
---

### JVM内存结构概览
先来看一张图：

![](/images/jvm_structure.png)

jvm主要分，堆、方法区、java栈、本地方法栈、程序计数器五个区域，其中方法区和堆区是线程共享的

#### 堆区域

堆内存是JVM中最大的一块由年轻代和老年代组成，而年轻代内存又被分成三部分，Eden空间、From Survivor空间、To Survivor空间,默认情况下年轻代按照8:1:1的比例来分配

![](/images/heap.png)

##### 各个区域的控制参数

-	-Xms设置堆的最小空间大小。
-	-Xmx设置堆的最大空间大小。
- -XX:NewSize设置新生代最小空间大小
-	-XX:MaxNewSize设置新生代最大空间大小。
- -XX:PermSize设置永久代最小空间大小。
-	-XX:MaxPermSize设置永久代最大空间大小。
-	-XX:MaxPermSize设置永久代最大空间大小。

没有直接设置老年代的参数，但是可以设置堆空间大小和新生代空间大小两个参数来间接控制：老年代大小=堆空间大小-新生代空间大小

#### 方法区

方法区有时被称为持久代（PermGen）

方法区（Method Area）与Java堆一样，是各个线程共享的内存区域，它用于存储已被虚拟机加载的类信息、常量、静态变量、即时编译器编译后的代码等数据

方法区还存储常量池(constant pool)， 用于存放编译期生成的各种字面量和符号引用

##### 字面量
字面量相当于Java语言层面常量的概念，如文本字符串
  
##### 符号引用
符号引用属于编译原理方面的概念，包括了如下三种类型的常量：

- 类和接口的全限定名
- 字段名称和描述符
- 方法名称和描述符
#### 程序计数器

程序计数器（Program Counter Register）是一块较小的内存空间，它的作用可以看做是当前线程所执行的字节码的行号指示器

#### JVM栈

与程序计数器一样，Java虚拟机栈（Java Virtual Machine Stacks）也是线程私有的，它的生命周期与线程相同。虚拟机栈描述的是Java方法执行的内存模型：每个方法被执行的时候都会同时创建一个栈帧（Stack Frame）用于存储局部变量表、操作栈、动态链接、方法出口等信息。每一个方法被调用直至执行完成的过程，就对应着一个栈帧在虚拟机栈中从入栈到出栈的过程

局部变量表存放了编译期可知的各种基本数据类型（boolean、byte、char、short、int、float、long、double）、对象引用（reference类型，它不等同于对象本身，根据不同的虚拟机实现，它可能是一个指向对象起始地址的引用指针，也可能指向一个代表对象的句柄或者其他与此对象相关的位置）和returnAddress类型（指向了一条字节码指令的地址）

其中64位长度的long和double类型的数据会占用2个局部变量空间（Slot），其余的数据类型只占用1个。局部变量表所需的内存空间在编译期间完成分配，当进入一个方法时，这个方法需要在帧中分配多大的局部变量空间是完全确定的，在方法运行期间不会改变局部变量表的大小

#### 本地方法栈
本地方法栈（Native Method Stacks）与虚拟机栈所发挥的作用是非常相似的，其区别不过是虚拟机栈为虚拟机执行Java方法（也就是字节码）服务，而本地方法栈则是为虚拟机使用到的Native方法服务

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
- [深入理解java虚拟机]
- [纯洁的微笑博客](http://www.ityouknow.com/jvm/2017/08/25/jvm-memory-structure.html)