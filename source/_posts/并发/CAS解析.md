---
title: CAS解析
date: 2018-09-28 09:29:15
tags:
categories: 并发
description: cas 操作
---
### CAS(Compare And Swap)概述
 CAS 指的是现代 CPU 广泛支持的一种对内存中的共享数据进行操作的一种特殊指令。这个指令会对内存中的共享数据做原子的读写操作
 
CAS是JUC的基石，许多操作都是基于CAS实现的，如图所示：
![](/images/cas.png)

CAS个指令的操作过程：首先，CPU 会将内存中将要被更改的数据与期望的值做比较。然后，当这两个值相等时，CPU 才会将内存中的数值替换为新的值。否则便不做操作。最后，CPU 会将旧的数值返回。

CAS有3个操作数，内存值V，旧的预期值A，要修改的新值B。当且仅当预期值A和内存值V相同时，将内存值V修改为B，否则返回V。这是一种乐观锁的思路，它相信在它修改之前，没有其它线程去修改它；(synchronized则是一种悲观锁策略)
其伪代码如下：

``` 
if(this.value == A){
	this.value = B
	return true;
}else{
	return false;
}
```

### CAS分析
以`AtomicInteger`为例阐述CAS实现：

``` 
静态代码块：

  private static final Unsafe unsafe = Unsafe.getUnsafe();
  // value在内存中的位置
  private static final long valueOffset;

  static {
      try {
       // 获取value属性在内存中的位置
          valueOffset = unsafe.objectFieldOffset(AtomicInteger.class.getDeclaredField("value"));
      } catch (Exception ex) { throw new Error(ex); }
  }
  // value的值，volatile保证可见性
  private volatile int value;
  
// 更新操作
// 当内存中的value值等于expect值时，则将内存中的value值更新为update值，并返回true，否则返回false
    public final boolean compareAndSet(int expect, int update) {
        return unsafe.compareAndSwapInt(this, valueOffset, expect, update);
    }
```
- Unsafe是CAS的核心类，它提供了硬件级别的原子操作
- valueOffset为变量值在内存中的偏移地址，unsafe就是通过偏移地址来得到数据的原值的
- value当前值，使用volatile修饰，保证多线程环境下看见的是同一个



例如`AtomicInteger`的`getAndIncrement`过程：
``` 
    public final int getAndIncrement() {
        return unsafe.getAndAddInt(this, valueOffset, 1);
        
    }
    
    // 调用unsafe 的 getAndAddInt
    public final int getAndAddInt(Object var1, long var2, int var4) {
        int var5;
        do {
            var5 = this.getIntVolatile(var1, var2);
        } while(!this.compareAndSwapInt(var1, var2, var5, var5 + var4));

        return var5;
    }
```
可以看到本质上是通过unsafe类的cas循环操作，当期望值与预期值相同的时候才操作成功，失败则继续，直至成功

值得一提的是，在jdk1.7中，同样的方法是通过cas自旋实现的:
``` 

public final int incrementAndGet() {
    for (;;) {
        int current = get();
        int next = current + 1;
        if (compareAndSet(current, next))
            return next;
    }
}
public final boolean compareAndSet(int expect, int update) {
    return unsafe.compareAndSwapInt(this, valueOffset, expect, update);

}
```
在getAndIncrement方法中，它的做法是：先获取到当前的 value 属性值，然后将 value 加 1，赋值给一个局部的 next 变量，然而，这两步都是非线程安全的，但是内部有一个死循环，不断去做compareAndSet操作，直到成功为止，也就是修改的根本在compareAndSet方法里面。


在jdk1.8改成了unsafe类来操作

### ABA问题

ABA问题是指在CAS操作时，其他线程将变量值A改为了B，但是又被改回了A，等到本线程使用期望值A与当前变量进行比较时，发现变量A没有变，于是CAS就将A值进行了交换操作，但是实际上该值已经被其他线程改变过。

ABA问题的解决思路是，每次变量更新的时候把变量的版本号加1，那么A-B-A就会变成A1-B2-A3，只要变量被某一线程修改过，改变量对应的版本号就会发生递增变化，从而解决了ABA问题。在JDK的java.util.concurrent.atomic包中提供了AtomicStampedReference来解决ABA问题，该类的compareAndSet是该类的核心方法，实现如下：
``` 
    public boolean compareAndSet(V   expectedReference,
                                 V   newReference,
                                 int expectedStamp,
                                 int newStamp) {
        Pair<V> current = pair;
        return
            expectedReference == current.reference &&
            expectedStamp == current.stamp &&
            ((newReference == current.reference &&
              newStamp == current.stamp) ||
             casPair(current, Pair.of(newReference, newStamp)));
    }
```
该类检查了当前引用与当前标志是否与预期相同，如果全部相等，才会以原子方式将该引用和该标志的值设为新的更新值，这样CAS操作中的比较就不依赖于变量的值了

### 参考资料

- [深入分析CAS](http://cmsblogs.com/?p=2235)
- [CAS原理分析](https://juejin.im/post/5a73cbbff265da4e807783f5)
- [JDK1.8中AtomicInteger](https://blog.csdn.net/qq_27139155/article/details/79564242)