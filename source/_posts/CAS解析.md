---
title: CAS解析
date: 2018-03-28 09:29:15
tags:
categories: 并发
---
### CAS(Compare And Swap)概述

在CAS中有三个参数：内存值V、旧的预期值A、要更新的值B，当且仅当内存值V的值等于旧的预期值A时才会将内存值V的值修改为B，否则什么都不干。其伪代码如下：

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
  private static final Unsafe unsafe = Unsafe.getUnsafe();
  private static final long valueOffset;

  static {
      try {
          valueOffset = unsafe.objectFieldOffset
              (AtomicInteger.class.getDeclaredField("value"));
      } catch (Exception ex) { throw new Error(ex); }
  }

  private volatile int value;
```
- Unsafe是CAS的核心类，它提供了硬件级别的原子操作
- valueOffset为变量值在内存中的偏移地址，unsafe就是通过偏移地址来得到数据的原值的
- value当前值，使用volatile修饰，保证多线程环境下看见的是同一个





### 参考资料

- [深入分析CAS](http://cmsblogs.com/?p=2235)