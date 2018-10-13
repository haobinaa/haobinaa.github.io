---
title: CAS解析
date: 2018-09-28 09:29:15
tags:
categories: 并发
---
### CAS(Compare And Swap)概述
 CAS 指的是现代 CPU 广泛支持的一种对内存中的共享数据进行操作的一种特殊指令。这个指令会对内存中的共享数据做原子的读写操作
 
CAS是JUC的基石，许多操作都是基于CAS实现的，如图所示：
![](http://odu0tqqax.bkt.clouddn.com/cas.png)

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
  private static final long valueOffset;

  static {
      try {
       // 获取value属性在内存中的位置
          valueOffset = unsafe.objectFieldOffset(AtomicInteger.class.getDeclaredField("value"));
      } catch (Exception ex) { throw new Error(ex); }
  }

  private volatil,e int value;
  
// 更新操作
// 当内存中的value值等于expect值时，则将内存中的value值更新为update值，并返回true，否则返回false
    public final boolean compareAndSet(int expect, int update) {
        return unsafe.compareAndSwapInt(this, valueOffset, expect, update);
    }
```
- Unsafe是CAS的核心类，它提供了硬件级别的原子操作
- valueOffset为变量值在内存中的偏移地址，unsafe就是通过偏移地址来得到数据的原值的
- value当前值，使用volatile修饰，保证多线程环境下看见的是同一个


### ABA问题


### 参考资料

- [深入分析CAS](http://cmsblogs.com/?p=2235)
- [CAS原理分析](https://juejin.im/post/5a73cbbff265da4e807783f5)