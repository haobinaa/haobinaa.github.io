---
title: jvm参数调优
date: 2021-12-01 16:27:13
tags:
categories: jvm
description: jvm 参数调优设置， 应用启动jvm目标(参考唯品会)
---

### 常用JVM参数

#### heap size

`-Xmx`: 最大Heap Size，即上图的Total size（包括Eden+form+to+old），限制了年轻代和年老代的可分配最大值

`-Xms`: 初始化分配的Heap Size

生产环境中xms一般设置成跟xmx相等，因为若xms不等于xmx那么在某些场景下JVM可能需要对Heap Size进行频繁的扩展和收缩，增加处理时间

#### Young Generation Size

`-Xmn`: 最大年轻代大小，即 Eden+S0+S1
