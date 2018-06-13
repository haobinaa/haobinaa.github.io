---
title: java多线程(内存模型三)
date: 2017-11-26 10:24:06
tags: java多线程
categories: java并发
---
### DCL分析
DCL(Double check lock)双重检查锁定，单例模式中为了保证并发时产生的是单例，用到该机制       
普通单例如下
``` 
public class Singleton {
    private static Singleton singleton;

    private Singleton(){}
    
    public static Singleton getInstance(){
        if(singleton == null){
            singleton = new Singleton();
        }
        
        return singleton;
    }
}
```
上面那段代码其实是错误的，无法保证线程安全，在并发下，可能多个线程同时执行`singleton == null`，然后创建多个对象，就无法保证单例，然后有如下优化:
``` 
public class Singleton {
    private static Singleton singleton;

    private Singleton(){}
    
    public static synchronized Singleton getInstance(){
        if(singleton == null){
            singleton = new Singleton();
        }
        
        return singleton;
    }
}
```
这个优化又很粗糙，synchronize每次都会加锁，导致了很多冲突，性能下降严重，于是有了如下的双重检查DCL：
``` 
public class Singleton {
    private static Singleton singleton;

    private Singleton(){}

    public static Singleton getInstance(){
        if(singleton == null){                              // 1
            synchronized (Singleton.class){                 // 2
                if(singleton == null){                      // 3
                    singleton = new Singleton();            // 4
                }
            }
        }
        return singleton;
    }
}
```
这次比上次好多了，理由如下：
- 如果第一个singleton不为null，则不用执行下面的加锁操作，极大的提升了性能
- 如果第一个singleton为null，即使有多个线程同一时间判断，由于有synchronize的存在，只会有一个线程能进入代码块，判断对象是否存在从而创建对象

虽然这个逻辑没有问题，但是实现是错误的，创建对象的流程如下：
1. 分配内存空间
2. 初始化对象
3. 将内存空间地址的引用赋值给对应的引用

但是重排序的缘故，可能会发生如下重排序：
1. 分配内存空间
2. 将内存地址的引用赋值给对应的引用
3. 初始化对象

如果2，3发生了重排序,在执行`sigleton == null`的时候，就会判断出错，其实singleton只是一个地址，还没有被初始化，所有return的是一个没有被初始化的对象，那么dcl的错误根源在`new Singleton()这一步`，解决方法是：
不允许初始化阶段发生重排序

那么可以用volatile来解决，将单例变量申明为volatile：
``` 
public class Singleton {
    private volatile static Singleton singleton;

    private Singleton(){}

    public static Singleton getInstance(){
        if(singleton == null){
            synchronized (Singleton.class){
                if(singleton == null){
                    singleton = new Singleton();
                }
            }
        }
        return singleton;
    }
}
```
根据volatile的功能，禁止重排序，就不会有问题了

### JUC锁

#### 知识点
- Lock接口

JUC包中的 Lock 接口支持那些语义不同(重入、公平等)的锁规则。所谓语义不同，是指锁可是有"公平机制的锁"、"非公平机制的锁"、"可重入的锁"等等。"公平机制"是指"不同线程获取锁的机制是公平的"，而"非公平机制"则是指"不同线程获取锁的机制是非公平的"，"可重入的锁"是指同一个锁能够被一个线程多次获取
- ReadWriteLock 

ReadWriteLock 接口以和Lock类似的方式定义了一些读取者可以共享而写入者独占的锁。JUC包只有一个类实现了该接口，即 ReentrantReadWriteLock，因为它适用于大部分的标准用法上下文。但程序员可以创建自己的、适用于非标准要求的实现
- AbstractOwnableSynchronizer/AbstractQueuedSynchronizer(AQS)/AbstractQueuedLongSynchronizer

AbstractQueuedSynchronizer就是被称之为AQS的类，它是一个非常有用的超类，可用来定义锁以及依赖于排队阻塞线程的其他同步器；ReentrantLock，ReentrantReadWriteLock，CountDownLatch，CyclicBarrier和Semaphore等这些类都是基于AQS类实现的。AbstractQueuedLongSynchronizer 类提供相同的功能但扩展了对同步状态的 64 位的支持。两者都扩展了类 AbstractOwnableSynchronizer（一个帮助记录当前保持独占同步的线程的简单类）
- LockSupport

LockSupport提供“创建锁”和“其他同步类的基本线程阻塞原语”。   
LockSupport的功能和"Thread中的Thread.suspend()和Thread.resume()有点类似"，LockSupport中的park() 和 unpark() 的作用分别是阻塞线程和解除阻塞线程。但是park()和unpark()不会遇到“Thread.suspend 和 Thread.resume所可能引发的死锁”问题
-  Condition

Condition需要和Lock联合使用，它的作用是代替Object监视器方法，可以通过await(),signal()来休眠/唤醒线程。
Condition 接口描述了可能会与锁有关联的条件变量。这些变量在用法上与使用 Object.wait 访问的隐式监视器类似，但提供了更强大的功能。需要特别指出的是，单个 Lock 可能与多个 Condition 对象关联。为了避免兼容性问题，Condition 方法的名称与对应的 Object 版本中的不同



### 参考资料
[死磕java之并发编程](http://cmsblogs.com/?p=2161)
[JUC锁](http://www.cnblogs.com/skywang12345/p/3496098.html)

