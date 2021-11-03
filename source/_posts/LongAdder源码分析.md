---
title: LongAdder源码分析
date: 2021-10-13 17:23:21
tags:
categories: 并发
description: 并发计数工具类 LongAdder 中的设计， Striped64 类, 缓存伪共享
---

### 并发计数器

并发环境重计数 `AtomicLong` 的 `Add` 操作是依赖自旋不断的 CAS 去累加一个 Long 值。如果在竞争激烈的情况下，CAS 操作不断的失败，就会有大量的线程不断的自旋尝试 CAS 会造成 CPU 的极大的消耗。


`LongAdder` 功能类似于 `AtomicLong`， 在低并发情况下两者表现差不多, 高并发下 `LongAdder` 的表现就好很多。`LongAdder` 实现于 `Striped64` 


### Striped64

`Striped64` 对外的语义是一个数字，在内部将数字的“值”拆成了好几部分：一个`base`变量和一个`cells`数组。
当线程尝试修改数字（增减）时，会先尝试对 base 进行修改，如果成功则退出，如果失败则说明当前存在竞争，会根据线程的哈希值，对 cells 中的某个元素进行修改。外部需要获取数值时，需要累加 base 和 cells 中的所有元素。


#### 成员变量

``` 
abstract class Striped64 extends Number {
    // 系统 CPU 核数
    static final int NCPU = Runtime.getRuntime().availableProcessors();

    // 线程映射数组， 大小是2的次方
    transient volatile Cell[] cells;

    // 基本数值， 在无竞争的情况下用， 初始化 cells 的时候也能用上
    transient volatile long base;

    // 自旋锁， 创建或扩充 cells 的时候用
    transient volatile int cellsBusy;
}
```

`Cell` 类是通过 CAS 更新的， 有点类似 `AtomicLong`(volatile 变量、Unsafe 加上字段的偏移量，再用 CAS 提供修改能力), 定义如下:
``` 
@sun.misc.Contended static final class Cell {
    volatile long value;
    Cell(long x) { value = x; }
    final boolean cas(long cmp, long val) {
        return UNSAFE.compareAndSwapLong(this, valueOffset, cmp, val);
    }

    // Unsafe mechanics
    private static final sun.misc.Unsafe UNSAFE;
    private static final long valueOffset;
    static {
        try {
            UNSAFE = sun.misc.Unsafe.getUnsafe();
            Class<?> ak = Cell.class;
            valueOffset = UNSAFE.objectFieldOffset
                (ak.getDeclaredField("value"));
        } catch (Exception e) {
            throw new Error(e);
        }
    }
}
```

`Cell` 类中只有一个用来保存计数的变量 Value ， 并提供了CAS操作, Striped64 在 Cell 的基础上提供了 `longAccumulate` 和 `doubleAccumulate` 两个计数方法

#### longAccumulate

``` 
final void longAccumulate(long x, LongBinaryOperator fn,
                          boolean wasUncontended) {
    // 获取线程的哈希值, 这里复制的 ThreadLocalRandom 类的代码
    // getProbe 获取哈希值, advanceProbe 更新哈希值
    int h;
    if ((h = getProbe()) == 0) {
        ThreadLocalRandom.current(); // force initialization
        h = getProbe();
        wasUncontended = true;
    }
    // 最后 slot 不为空则为 true， flase 重试
    boolean collide = false;        
    for (;;) {
        Cell[] as; Cell a; int n; long v;
        if ((as = cells) != null && (n = as.length) > 0) { 
        // cells 已经初始化了
            if ((a = as[(n - 1) & h]) == null) { 
            // 对应的 cell 不存在，需要新建
                if (cellsBusy == 0) {       
                // cells 没上锁时, 乐观创建并初始化 cell
                    Cell r = new Cell(x);
                    if (cellsBusy == 0 && casCellsBusy()) {
                     // 锁仍然空闲， 成功获取到锁
                        boolean created = false;
                        try {               
                        // 上锁后判断 cells 对应的映射 slot 是否被占用
                            Cell[] rs; int m, j;
                            if ((rs = cells) != null &&
                                (m = rs.length) > 0 &&
                                rs[j = (m - 1) & h] == null) {
                                // 映射的 slot 仍然为空， 则关联 cell 到 slot
                                rs[j] = r;
                                created = true;
                            }
                        } finally {
                            // 释放锁
                            cellsBusy = 0;
                        }
                         // cell 创建完毕，可以退出
                        if (created)       
                            break;
                       // 加锁后发现 cell 对应的 slot 已经不再为空，轮询重试
                        continue;           
                    }
                }
                // cellsBusy 锁被占用， 重试
                collide = false;
            }
            // 下面的这些 else 在尝试检测当前竞争度大不大，如果大则尝试扩容，如果扩容已经没用了，则尝试 rehash 来分散并发到不同的 cell 中
            
            
            
            // 已知 CAS 失败，说明并发度大
            else if (!wasUncontended)  
                // rehash 后重试     
                wasUncontended = true;     
                
            // 尝试 CAS 将值更新到 cell 中， 更新成功 break
            else if (a.cas(v = a.value, ((fn == null) ? v + x :   
                                         fn.applyAsLong(v, x))))
                break;
                
            // 如果 cell 的长度已经大于等于 cpu 的数量，扩容意义不大，就不用标记冲突，重试
            else if (n >= NCPU || cells != as) 
                collide = false;     
            
            // 到此说明其它竞争已经很大，rehash         
            else if (!collide)                
                collide = true;
            // 获取锁，上锁扩容，将冲突标记为否，继续执行    
            else if (cellsBusy == 0 && casCellsBusy()) {
                try {
                    if (cells == as) {      // 加锁过程中可能有其它线程在扩容，需要排除该情形
                        Cell[] rs = new Cell[n << 1];
                        for (int i = 0; i < n; ++i)
                            rs[i] = as[i];
                        cells = rs;
                    }
                } finally {
                    cellsBusy = 0;
                }
                collide = false;
                continue;                   // Retry with expanded table
            }
            h = advanceProbe(h);            // rehash
        }
        
        // 获取锁， 初始化 cell 数组
        else if (cellsBusy == 0 && cells == as && casCellsBusy()) { // cells 未初始化
            boolean init = false;
            try {                           // Initialize table
                if (cells == as) {
                    Cell[] rs = new Cell[2];
                    rs[h & 1] = new Cell(x);
                    cells = rs;
                    init = true;
                }
            } finally {
                cellsBusy = 0;
            }
            if (init)
                break;
        }
        
       // 其它线程在初始化 cells 或在扩容，尝试更新 base
        else if (casBase(v = base, ((fn == null) ? v + x :
                                    fn.applyAsLong(v, x))))
            break;
    }
}
```

在 longAccumulate 中有几个标记位：
- `cellsBusy` cells 的操作标记位，如果正在修改、新建、操作 cells 数组中的元素会,会将其 cas 为 1，否则为0。
- `wasUncontended` 表示 cas 是否失败，如果失败则考虑操作升级。
- `collide` 是否冲突，如果冲突，则考虑扩容 cells 的长度。

整个 for(;;) 死循环，都是以 cas 操作成功而告终。否则则会修改上述描述的几个标记位，重新进入循环。包含几种情况:
1. cells 不为空
    - 如果 cell[i] 某个下标为空，则 new 一个 cell，并初始化值，然后退出
    - 如果 cas 失败，继续循环
    - 如果 cell 不为空，且 cell cas 成功，退出
    - 如果 cell 的数量，大于等于 cpu 数量或者已经扩容了，继续重试。（扩容没意义）
    - 设置 collide 为 true。
    - 获取 cellsBusy 成功就对 cell 进行扩容，获取 cellBusy 失败则重新 hash 再重试。 

2. cells 为空且获取到 cellsBusy ，init cells 数组，然后赋值退出。

3. cellsBusy 获取失败，则进行 baseCas ，操作成功退出，不成功则重试。

#### doubleAccumulate

doubleAccumulate 的整体逻辑与 longAccumulate 几乎一样，区别在于将 double 存储成 long 时需要转换。例如在创建 cell 时：
```
Cell r = new Cell(Double.doubleToRawLongBits(x));
```

`doubleToRawLongBits` 是一个 native 方法，将 double 转成 long。在累加时需要再转来回：
``` 
else if (a.cas(v = a.value,
               ((fn == null) ?
                Double.doubleToRawLongBits
                (Double.longBitsToDouble(v) + x) : // 转回 double 做累加
                Double.doubleToRawLongBits
                (fn.applyAsDouble
                 (Double.longBitsToDouble(v), x)))))
```

#### 伪共享

上面可以看到 `Cell` 类被 `@sun.misc.Contended` 注解了, 是用来避免缓存的伪共享， 减少CPU缓存级别竞争, 这里在并发队列 `Disruptor` 也有用上。



##### CPU Cache Line 

在计算机的架构中 L1、L2、L3分别表示一级缓存、二级缓存、三级缓存，越靠近CPU的缓存，速度越快，容量也越小。
所以L1缓存很小但很快，并且紧靠着在使用它的CPU内核；L2大一些，也慢一些，并且仍然只能被一个单独的CPU核使用；L3更大、更慢，并且被单个插槽上的所有CPU核共享；最后是主存，由全部插槽上的所有CPU核共享。如下图:
![](/images/hardware/cpu-cache.png)


Cache 是由很多个cache line(缓存行)组成的。每个cache line通常是 64 字节，并且它有效地引用主内存中的一块地址。一个Java的long类型变量是 8 字节，因此在一个缓存行中可以存 8 个long类型的变量。


利用 cache line 特性与不使用比较， 性能相差一倍以上:
``` 
    // cpu cache line 64 字节， 刚好是 8 个 long
    static  long[][] arr;

    public static void main(String[] args) {
        arr = new long[1024 * 1024][];
        for (int i = 0; i < 1024 * 1024; i++) {
            arr[i] = new long[8];
            for (int j = 0; j < 8; j++) {
                arr[i][j] = 0L;
            }
        }
        long sum = 0L;
        long marked = System.currentTimeMillis();
        for (int i = 0; i < 1024 * 1024; i+=1) {
            // 一行一行读
            for(int j =0; j< 8;j++){
                sum += arr[i][j];
            }
        }
        System.out.println("Loop times:" + (System.currentTimeMillis() - marked) + "ms");

        marked = System.currentTimeMillis();
        for (int i = 0; i < 8; i+=1) {
            // 一列一列读(无法使用缓存行)
            for(int j =0; j< 1024 * 1024;j++){
                sum = arr[j][i];
            }
        }
        System.out.println("Loop times:" + (System.currentTimeMillis() - marked) + "ms");
    }
    
################
// mac 下输出
Loop times:20ms
Loop times:42ms
```

##### 伪共享

多个线程并发的修改一个缓存行中的不同变量的时候， 比如CPU1更新X， CPU2更新Y, 但是X和Y在同一个缓存行上，每个线程都要去竞争缓存行的所有权来更新变量。
如果核心1获得了所有权，缓存子系统将会使核心2中对应的缓存行失效。当核心2获得了所有权然后执行更新操作，核心1就要使自己对应的缓存行失效。这会来来回回的经过L3缓存，大大影响了性能。如下图:

![](/images/hardware/cpu-fake-share.png)


##### 避免伪共享

避免伪共享的情况出现， 就需要让可能出现线程竞争的变量分开到不同的 Cache Line 中， 使用空间换时间的思维。
在 java7和以前的版本， 可以专门用一些空对象来做一个填充,如:
``` 
public final static class ValuePadding {
  // 前置填充对象
  protected long p1, p2, p3, p4, p5, p6, p7;
  // value 值
  protected volatile long value = 0L;
  // 后置填充对象
  protected long p9, p10, p11, p12, p13, p14, p15;
}
```


JDK8 有专门的注解 `@Contended` 来避免伪共享， `Striped64` 也是被 `@Contended` 所修饰 


### LongAdder

LongAdder 继承于 Striped64， 也就继承了成员变量 `cells 数组`, `base` 变量和 `Accumulate` 逻辑。 `add` 源码如下:
``` 
public void add(long x) {
    Cell[] as; long b, v; int m; Cell a;
    // 如果 cells 数组不为空， 或者 cas 操作 base 失败, 则进入下一步
    if ((as = cells) != null || !casBase(b = base, b + x)) {
        boolean uncontended = true;
        // 1. cells 数组为空， 直接进入 longAccumulate
        // 2. cells 数组长度小于 1， 进入 longAccumulate
        // 3. 如果都没有满足以上条件，则对当前线程进行某种 hash 生成一个数组下标，对下标保存的值进行 cas 操作。如果操作失败，则说明竞争依然激烈，则进入 longAccumulate().
        if (as == null || (m = as.length - 1) < 0 ||
            (a = as[getProbe() & m]) == null ||
            !(uncontended = a.cas(v = a.value, v + x)))
            longAccumulate(x, null, uncontended);
    }
}
```