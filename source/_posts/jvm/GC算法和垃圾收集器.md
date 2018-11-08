---
title: GC算法和垃圾收集器
date: 2018-10-25 18:06:07
tags:
categories: jvm
---
### 垃圾收集

#### Minor GC
新生代(由 Eden and Survivor 组成)的垃圾收集叫做Minor GC。

Minor GC触发条件： 一般是新生代中Eden区满时，触发Minor GC

#### Full GC
Full GC清理整个heap区

Full GC触发条件：
- 调用System.gc时，系统建议执行Full GC，但是不必然执行
- 老年代空间不足
- 方法区空间不足
- 过Minor GC后进入老年代的平均大小大于老年代的可用内存
- 由Eden区、From Space区向To Space区复制时，对象大小大于To Space可用内存，则把该对象转存到老年代，且老年代的可用内存小于该对象大小
### 参考资料
- [Minor GC、Major GC和Full GC之间的区别](https://segmentfault.com/a/1190000007723051)