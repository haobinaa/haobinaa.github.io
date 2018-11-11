---
title: GC算法和垃圾收集器
date: 2018-10-25 18:06:07
tags:
categories: jvm
---
### 判断对象是否存活

垃圾收集器在对堆回收之前，第一件事情就是要确定这些对象哪些还“存活”着，哪些对象已经“死去”(即不可能再被任何途径使用的对象)、

#### 引用计数算法(Reference Counting)

给对象中添加一个引用计数器，每当有一个地方引用它时，计数器值加1；当引用失效时，计数器减1；任何时刻计数器都为0的对象就是不可能再被使用的。

引用计数算法的实现简单，判断效率也很高，在大部分情况下它都是一个不错的算法。但是Java语言中没有选用引用计数算法来管理内存，其中最主要的一个原因是它很难解决对象之间相互循环引用的问题。

例如：在testGC()方法中，对象objA和objB都有字段instance，赋值令objA.instance=objB及objB.instance=objA，除此之外这两个对象再无任何引用，实际上这两个对象都已经不能再被访问，但是它们因为相互引用着对象方，异常它们的引用计数都不为0，于是引用计数算法无法通知GC收集器回收它们。
``` 
public class ReferenceCountingGC {
    public Object instance = null;
    private static final int _1MB = 1024 * 1024;
    /**
     * 这个成员属性的唯一意义就是占点内存，以便能在GC日志中看清楚是否被回收过
     */
    private byte[] bigSize = new byte[2 * _1MB];
    public static void main(String[] args) {
        ReferenceCountingGC objA = new ReferenceCountingGC();
        ReferenceCountingGC objB = new ReferenceCountingGC();
        objA.instance = objB;
        objB.instance = objA;
        objA = null;
        objB = null;
        //假设在这行发生了GC，objA和ojbB是否被回收
        System.gc();
    }
}
```

#### 可达性分析算法(GC Roots Analysis)

主流的判断算法，这个算法的基本思路就是通过一系列名为”GC Roots”的对象作为起始点，从这些节点开始向下搜索，搜索所走过的路径称为引用链(Reference Chain)，当一个对象到GC Roots没有任何引用链相连时，则证明此对象是不可用的，下图对象object5, object6, object7虽然有互相判断，但它们到GC Roots是不可达的，所以它们将会判定为是可回收对象。

![](/images/GCRootReachAnalysis.png)

在Java语言里，可作为GC Roots对象的包括如下几种：
1. 虚拟机栈(栈桢中的本地变量表)中的引用的对象
2. 方法区中的类静态属性引用的对象
3. 方法区中的常量引用的对象
4. 本地方法栈中JNI的引用的对象


### GC回收动作

#### Minor GC
Minor GC 是发生在新生代中的垃圾收集动作，所采用的是复制算法。


当对象在 Eden ( 包括一个 Survivor 区域，这里假设是 from 区域 ) 出生后，在经过一次 Minor GC 后，如果对象还存活，并且能够被另外一块 Survivor 区域所容纳( 上面已经假设为 from 区域，这里应为 to 区域，即 to 区域有足够的内存空间来存储 Eden 和 from 区域中存活的对象 )，则使用复制算法将这些仍然还存活的对象复制到另外一块 Survivor 区域 ( 即 to 区域 ) 中，然后清理所使用过的 Eden 以及 Survivor 区域 ( 即 from 区域 )，并且将这些对象的年龄设置为1，以后对象在 Survivor 区每熬过一次 Minor GC，就将对象的年龄 + 1，当对象的年龄达到某个值时 ( 默认是 15 岁，可以通过参数 -XX:MaxTenuringThreshold 来设定 )，这些对象就会成为老年代。


Minor GC触发条件： 一般是新生代中Eden区满时，触发Minor GC

#### Full GC
Full GC 是发生在老年代的垃圾收集动作，所采用的是标记-清除算法。

Full GC触发条件：
- 调用System.gc时，系统建议执行Full GC，但是不必然执行
- 老年代空间不足
- 方法区空间不足
- 过Minor GC后进入老年代的平均大小大于老年代的可用内存
- 由Eden区、From Space区向To Space区复制时，对象大小大于To Space可用内存，则把该对象转存到老年代，且老年代的可用内存小于该对象大小


### 参考资料
- [周志明-深入理解JVM虚拟机]
- [Minor GC、Major GC和Full GC之间的区别](https://segmentfault.com/a/1190000007723051)
- [jvm垃圾收集器和内存分配策略](http://liucw.cn/2017/12/24/jvm/JVM%E5%9E%83%E5%9C%BE%E6%94%B6%E9%9B%86%E5%99%A8%E4%B8%8E%E5%86%85%E5%AD%98%E5%88%86%E9%85%8D%E7%AD%96%E7%95%A5/)