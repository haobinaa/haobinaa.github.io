---
title: transmittable-thread-local
date: 2022-08-22 10:20:10
tags:
categories: 并发
description: ttl 使用以及场景介绍、框架结构。与InheritableThreadLocal对比以及源码分析
---

### InheritableThreadLocal

在 TTL 之前， 先谈谈 JDK 自带的 InheritableThreadLocal

`InheritableThreadLocal` 可以将变量在父子线程中传递。 根据 `ThreadLocal` 分析， 现成变量是存在 `ThreadLocalMap` 中的， `InheritableThreadLocal` 应该要将 `ThreadLocalMap` 复制一份给子线程。


#### InheritableThreadLocal 源码

``` 
public class InheritableThreadLocal<T> extends ThreadLocal<T> {

    /**
    * 重写 childValue
    **/
    protected T childValue(T parentValue) {
        return parentValue;
    }

    /**
    * ThreadLocal.get/set 使用， 返回的是 inheritableThreadLocals 变量
    **/
    ThreadLocalMap getMap(Thread t) {
       return t.inheritableThreadLocals;
    }

    /**
    * 创建 set 创建 ThreadLocalMap 变量的时候， 使用 inheritableThreadLocals 变量
    **/
    void createMap(Thread t, T firstValue) {
        t.inheritableThreadLocals = new ThreadLocalMap(this, firstValue);
    }
}
```
`InheritableThreadLocal` 源码非常少， 继承于 `ThreadLocal`。 那么 get、set 也是使用的 `ThreadLocal` 提供的， 即操作的是线程的 `t.threadlocals` 变量

#### 复制原理

Thread 初始化时会调用 `init`， 其中有部分逻辑是:
``` 
// ..... Thread#init 省略
if (inheritThreadLocals && parent.inheritableThreadLocals != null)
        this.inheritableThreadLocals =
            ThreadLocal.createInheritedMap(parent.inheritableThreadLocals);
// ..... Thread#init 省略
```

从 `Thread` 构造函数来看 `inheritableThreadLocals` 默认是 true， 即父线程 `inheritableThreadLocals` 不为 null, 就将父线程的 `inheritableThreadLocals` 复制给子线程, 源码如下:
``` 
private ThreadLocalMap(ThreadLocalMap parentMap) {
    Entry[] parentTable = parentMap.table;
    int len = parentTable.length;
    setThreshold(len);
    table = new Entry[len];
    // 遍历复制
    for (int j = 0; j < len; j++) {
        Entry e = parentTable[j];
        if (e != null) {
            @SuppressWarnings("unchecked")
            ThreadLocal<Object> key = (ThreadLocal<Object>) e.get();
            if (key != null) {
                // IniheritableThreadLocal 重写了 childValue
                // 读取 Threadlocal 值， 默认是浅拷贝， 可以实现这个方法深拷贝
                Object value = key.childValue(e.value);
                Entry c = new Entry(key, value);
                int h = key.threadLocalHashCode & (len - 1);
                while (table[h] != null)
                    h = nextIndex(h, len);
                table[h] = c;
                size++;
            }
        }
    }
}
```

#### childValue 含义

`InheritableThreadLocal` 中实现了 `childValue` 方法， 从父线程复制 `ThreaLocalMap` 到子线程时，值从childValue 函数过了一遍再赋值给 Entry.

这里特殊处理的含义: 这个是 `ThreadLocal` 留给子类实现的， 有些情况下设置的值是一个自定义的引用类型，那么从父线程复制到多个子线程的值就存在并发问题（值传递，地址值是共享的），所以复制的时候要保证复制给每个子线程的地址值不一样。 需要实现这个 `childValue` 的深拷贝。(如 TTL 中 holder 的实现)


### TTL 概述

JDK `ThreadLocal`、`InheritableThreadLocal`的最大局限性就是：无法为预先创建好（未投入使用）的线程实例传递变量（准确来说是首次传递某些场景是可行的，而后面由于线程池中的线程是复用的，无法进行更新或者修改变量的传递值），泛线程池Executor体系、TimerTask和ForkJoinPool等一般会预先创建（核心）线程，也就它们都是无法在线程池中由预创建的子线程执行的Runnable任务实例中使用。

#### InheritableThreadLocal存在的问题

1. 无法在主线程和子线程中透传

``` 
static InheritableThreadLocal<String> ITL = new InheritableThreadLocal<>();
static ExecutorService executorService =  Executors.newFixedThreadPool(1);
/**
 * ITL 无法再父子线程中透传
 */
public static void main(String[] args) throws Exception {
    ITL.set("parent-set");
    executorService.execute(() -> {
        System.out.println(ITL.get());
    });
    TimeUnit.SECONDS.sleep(1);
    ITL.set("parent-new-value");
    executorService.execute(() -> {
        System.out.println(ITL.get());
    });
}

============== 输出
parent-set
parent-set
```

可以看到主线程第二次设置的值并没有透传到提交的线程池中。 这是因为ITL只有第一次创建线程的时候会从父线程拿到 inheritableThreadLocals 中的数据，之后父线程对 inheritableThreadLocals 的操作都不会传递给子线程

2. 线程池中线程存在复用的问题， 导致不同子线程之间的值互相影响

``` 
static InheritableThreadLocal<String> ITL = new InheritableThreadLocal<>();
static ExecutorService executorService =  Executors.newFixedThreadPool(1);
/**
 * ITL 无法再父子线程中透传
 */
public static void main(String[] args) throws Exception {
    ITL.set("parent-set");
    executorService.execute(() -> {
        System.out.println(ITL.get());
        ITL.set("old-set");
    });
    TimeUnit.SECONDS.sleep(1);
    ITL.set("new-set");
    executorService.execute(() -> {
        System.out.printf(ITL.get());
    });
}

============输出
parent-set
old-set
```

可以看第二次线程池打印出了第一次在线程池中设置的值 "old-set"。

这是因为第二次执行任务的时候复用了第一次执行任务的线程， 导致第一次设置的值传递到了第二次任务

#### TTL 解决方案和使用

根据上面 ITL 存的局限性， 我们推出: 我们需要的并不是创建线程的那一刻父线程的ThreadLocal值，而是提交任务时父线程的ThreadLocal值。或者说需要把任务提交给线程池时的ThreadLocal值传递到任务执行时。

具体的思路是: 父线程把任务提交给线程池时一同附上此刻自己的ThreadLocalMap，包装在task里，待线程池中某个线程执行到该任务时，用task里的ThreadLocalMap赋盖当前线程ThreadLocalMap，这样就完成了父线程向池化的子线程传递线程私有数据的目标。为了避免数据污染，待任务执行完后，线程归还回线程池之前，还需要还原ThreadLocalMap，如下示：

![](/images/thread/ttl-usage.png)

##### 1. 父子线程传递

与 `InheritableThreadLocal` 类似:
``` 
TransmittableThreadLocal<String> context = new TransmittableThreadLocal<>();
// 在父线程中设置
context.set("value-set-in-parent");

// 在子线程中可以读取，值是"value-set-in-parent"
String value = context.get();
```

##### 2. 线程池中传递-修饰 Runnable 和 Callable

可以使用 `TtlRunnable` 和 `TtlCallable` 来修饰传入线程池的Runnable和Callable。
``` 
TransmittableThreadLocal<String> context = new TransmittableThreadLocal<>();

// =====================================================

// 在父线程中设置
context.set("value-set-in-parent");

Runnable task = new RunnableTask();
// 额外的处理，生成修饰了的对象ttlRunnable
Runnable ttlRunnable = TtlRunnable.get(task);
// 第一次提交
executorService.submit(ttlRunnable);

// =====================================================

// Task中可以读取，值是"value-set-in-parent"
String value = context.get();

// =====================
// 业务逻辑代码，并且修改了 TransmittableThreadLocal上下文 ...
context.set("value-modified-in-parent");

// 再次提交，重新执行修饰，以传递修改了的 TransmittableThreadLocal上下文
executorService.submit(TtlRunnable.get(task));
```

这里需要注意的是即使是同一个Runnable任务多次提交到线程池时，每次提交时都需要通过修饰操作(`TtlRunnable.get`)


### 源码解析

#### TTL 整体框架结构

TTL 除了提供给用户使用的API，还提供了基于Agent和字节码增强实现了无感知增强泛线程池对应类的功能。 整体代码框架如下:
``` 
- transmittable-thread-local
  - com.alibaba.ttl
   - spi   SPI接口和一些实现
    TtlAttachments
    TtlAttachmentsDelegate
    TtlEnhanced
    TtlWrapper
   - threadpool   线程池增强，包括ThreadFactory和线程池的Wrapper等
     - agent   线程池的Agent实现相关
   最外层的包有一些Wrapper的实现和TTL
```

TTL 时序图:
![](/images/thread/ttl-sequence.png)

TTL核心流程和原理是通过 `TransmittableThreadLocal.Transmitter` 抓取当前线程的所有TTL值并在其他线程进行回放，然后在回放线程执行完业务操作后，再恢复为回放线程原来的TTL值。

#### TransmittableThreadLocal(核心类)

`TransmittableThreadLocal` 是TTL的核心类

##### 构造函数和关键属性
``` 
// TTL拷贝器
@FunctionalInterface
public interface TtlCopier<T> {
   
    // 拷贝父属性
    T copy(T parentValue);
}

public class TransmittableThreadLocal<T> extends InheritableThreadLocal<T> implements TtlCopier<T> {

    // 日志句柄，使用的不是SLF4J的接口，而是java.util.logging的实现
    private static final Logger logger = Logger.getLogger(TransmittableThreadLocal.class.getName());
    
    // 是否禁用忽略NULL值的语义
    private final boolean disableIgnoreNullValueSemantics;
    
    // 默认是false，也就是不禁用忽略NULL值的语义，也就是忽略NULL值，
    // 也就是默认的话，NULL值传入不会覆盖原来已经存在的值
    public TransmittableThreadLocal() {
        this(false);
    }
    
    // 可以通过手动设置，去覆盖IgnoreNullValue的语义，如果设置为true，则是支持NULL值的设置，设置为true的时候，与ThreadLocal的语义一致
    public TransmittableThreadLocal(boolean disableIgnoreNullValueSemantics) {
        this.disableIgnoreNullValueSemantics = disableIgnoreNullValueSemantics;
    }
    
    // ......
}
```

针对`disableIgnoreNullValueSemantics`属性可以参考:  [TTL Issue 157 - 对于 set(null) 保持和 InheritableThreadLocal 一致语义](https://github.com/alibaba/transmittable-thread-local/issues/157)

##### 主要方法


``` 
public class TransmittableThreadLocal<T> extends InheritableThreadLocal<T> implements TtlCopier<T> {
    
    // 拷贝器的拷贝方法实现
    public T copy(T parentValue) {
        return parentValue;
    }

    // 模板方法，留给子类实现，在TtlRunnable或者TtlCallable执行前回调
    protected void beforeExecute() {
    }

    // 模板方法，留给子类实现，在TtlRunnable或者TtlCallable执行后回调
    protected void afterExecute() {
    }

    // 获取值，直接从InheritableThreadLocal#get()获取
    @Override
    public final T get() {
        T value = super.get();
        // 如果值不为NULL 或者 禁用了忽略空值的语义（也就是和ThreadLocal语义一致），则重新添加TTL实例自身到存储器
        if (disableIgnoreNullValueSemantics || null != value) addThisToHolder();
        return value;
    }
    
    @Override
    public final void set(T value) {
        // 如果不禁用忽略空值的语义，也就是需要忽略空值，并且设置的入参值为空，则做一次彻底的移除，包括从存储器移除TTL自身实例，TTL（ThrealLocalMap）中也移除对应的值
        if (!disableIgnoreNullValueSemantics && null == value) {
            // may set null to remove value
            remove();
        } else {
            // TTL（ThrealLocalMap）中设置对应的值
            super.set(value);
            // 添加TTL实例自身到存储器
            addThisToHolder();
        }
    }
   
    // 从存储器移除TTL自身实例，从TTL（ThrealLocalMap）中移除对应的值
    @Override
    public final void remove() {
        removeThisFromHolder();
        super.remove();
    }
    
    // 从TTL（ThrealLocalMap）中移除对应的值
    private void superRemove() {
        super.remove();
    }
    
    // 拷贝值，主要是拷贝get()的返回值
    private T copyValue() {
        return copy(get());
    }
     
    // 存储器，本身就是一个InheritableThreadLocal（ThreadLocal）
    // 它的存放对象是`WeakHashMap<TransmittableThreadLocal<Object>, ?>`类型
    // 而WeakHashMap的VALUE总是为NULL，这里当做Set容器使用，WeakHashMap支持NULL值
    private static InheritableThreadLocal<WeakHashMap<TransmittableThreadLocal<Object>, ?>> holder =
            new InheritableThreadLocal<WeakHashMap<TransmittableThreadLocal<Object>, ?>>() {
                @Override
                protected WeakHashMap<TransmittableThreadLocal<Object>, ?> initialValue() {
                    return new WeakHashMap<TransmittableThreadLocal<Object>, Object>();
                }

                @Override
                protected WeakHashMap<TransmittableThreadLocal<Object>, ?> childValue(WeakHashMap<TransmittableThreadLocal<Object>, ?> parentValue) {
                    // 注意这里的WeakHashMap总是拷贝父线程的值
                    return new WeakHashMap<TransmittableThreadLocal<Object>, Object>(parentValue);
                }
            };
    
    // 添加TTL自身实例到存储器，不存在则添加策略
    @SuppressWarnings("unchecked")
    private void addThisToHolder() {
        if (!holder.get().containsKey(this)) {
        // key->TransmittableThreadLocal, value -> null(WeakHashMap 支持 null 值)
            holder.get().put((TransmittableThreadLocal<Object>) this, null);
        }
    }
    
    // 从存储器移除TTL自身的实例
    private void removeThisFromHolder() {
        holder.get().remove(this);
    }
    
    // 执行目标方法，isBefore决定回调beforeExecute还是afterExecute，注意此回调方法会吞掉所有的异常只打印日志
    private static void doExecuteCallback(boolean isBefore) {
        for (TransmittableThreadLocal<Object> threadLocal : holder.get().keySet()) {
            try {
                if (isBefore) threadLocal.beforeExecute();
                else threadLocal.afterExecute();
            } catch (Throwable t) {
                if (logger.isLoggable(Level.WARNING)) {
                    logger.log(Level.WARNING, "TTL exception when " + (isBefore ? "beforeExecute" : "afterExecute") + ", cause: " + t.toString(), t);
                }
            }
        }
    }
    
    // DEBUG模式下打印TTL里面的所有值
    static void dump(@Nullable String title) {
        if (title != null && title.length() > 0) {
            System.out.printf("Start TransmittableThreadLocal[%s] Dump...%n", title);
        } else {
            System.out.println("Start TransmittableThreadLocal Dump...");
        }

        for (TransmittableThreadLocal<Object> threadLocal : holder.get().keySet()) {
            System.out.println(threadLocal.get());
        }
        System.out.println("TransmittableThreadLocal Dump end!");
    }
    
    // DEBUG模式下打印TTL里面的所有值
    static void dump() {
        dump(null);
    }

    // 省略静态类Transmitter的实现代码
}

```

holder 从表象上看是一个静态类， 整个 JVM 只有一份变量。 
实际上不是的，因为继承于 `InheritableThreadLocal`，意味着，每一个线程有且只有一份这个 Holder。
这里体现的设计:
- `static` 修饰: 一个线程中，无论`TransmittableThreadLocal`被创建多少次，需要保证维护的是同一个缓存
- `WeakHashMap`: 弱引用(发生GC就回收)， 避免内存泄露

整体存储结构如下:
![](/images/thread/ttl-set.png)


这里有一个关键变量， 也是上面提到的 `disableIgnoreNullValueSemantics`。
默认情况下`disableIgnoreNullValueSemantics=false`，TTL如果设置 NULL 值，会直接从holder 移除对应的 TTL 实例，在`TTL#get()`方法被调用的时候，如果原来持有的属性不为NULL，该TTL实例会重新加到holder。

如果设置为true，则`set(null)`的语义和ThreadLocal一致。详细说明见上文 ISSUE 地址

#### Transmitter（发射器）

发射器 `Transmitter` 是 `TransmittableThreadLocal` 的一个公有静态类
的核心功能是传输所有的`TransmittableThreadLocal实例`和`提供静态方法注册当前线程的变量到其他线程`。


##### 构造方法和关键属性

``` 
# TransmittableThreadLocal#Transmitter
public static class Transmitter {
    
    // 保存手动注册的ThreadLocal->TtlCopier映射，这里是因为部分API提供了TtlCopier给用户实现
    private static volatile WeakHashMap<ThreadLocal<Object>, TtlCopier<Object>> threadLocalHolder = new WeakHashMap<ThreadLocal<Object>, TtlCopier<Object>>();
    
    // threadLocalHolder更变时候的监视器
    private static final Object threadLocalHolderUpdateLock = new Object();
    
    // 标记WeakHashMap中的ThreadLocal的对应值为NULL的属性，便于后面清理
    private static final Object threadLocalClearMark = new Object();
    
    // 默认的拷贝器，影子拷贝，直接返回父值
    private static final TtlCopier<Object> shadowCopier = new TtlCopier<Object>() {
        @Override
        public Object copy(Object parentValue) {
            return parentValue;
        }
    };
    
    // 私有构造，说明只能通过静态方法提供外部调用
    private Transmitter() {
        throw new InstantiationError("Must not instantiate this class");
    }
    
    // 私有静态类，快照
    // 保存从holder中捕获的所有TransmittableThreadLocal
    // 和外部手动注册保存在 threadLocalHolder的ThreadLocal 的 K-V映射快照
    private static class Snapshot {
        final WeakHashMap<TransmittableThreadLocal<Object>, Object> ttl2Value;
        final WeakHashMap<ThreadLocal<Object>, Object> threadLocal2Value;

        private Snapshot(WeakHashMap<TransmittableThreadLocal<Object>, Object> ttl2Value, WeakHashMap<ThreadLocal<Object>, Object> threadLocal2Value) {
            this.ttl2Value = ttl2Value;
            this.threadLocal2Value = threadLocal2Value;
        }
    }
}
```

##### 主要方法

Transmitter在设计上是一个典型的工具类，外部只能调用其公有静态方法。静态方法如下:
``` 
// # TransmittableThreadLocal#Transmitter
public static class Transmitter {
    //----------------- 捕获
    // 捕获当前线程绑定的所有的 TransmittableThreadLocal 和已经注册的ThreadLocal的值 - 使用了用时拷贝快照的策略
    // 备注: 一般在构造任务实例的时候被调用，因此当前线程相对于子线程或者线程池的任务就是父线程，其实本质是捕获父线程的所有线程本地变量的值
    @NonNull
    public static Object capture() {
        return new Snapshot(captureTtlValues(), captureThreadLocalValues());
    }
    
    // 新建一个WeakHashMap，遍历 TransmittableThreadLocal#holder 中的所有 TransmittableThreadLocal的Entry，获取K-V，存放到这个新的WeakHashMap返回
    private static WeakHashMap<TransmittableThreadLocal<Object>, Object> captureTtlValues() {
        WeakHashMap<TransmittableThreadLocal<Object>, Object> ttl2Value = new WeakHashMap<TransmittableThreadLocal<Object>, Object>();
        for (TransmittableThreadLocal<Object> threadLocal : holder.get().keySet()) {
            ttl2Value.put(threadLocal, threadLocal.copyValue());
        }
        return ttl2Value;
    }
    
    // 新建一个WeakHashMap，遍历 threadLocalHolder 中的所有 ThreadLocal 的Entry，获取K-V，存放到这个新的WeakHashMap返回
    private static WeakHashMap<ThreadLocal<Object>, Object> captureThreadLocalValues() {
        final WeakHashMap<ThreadLocal<Object>, Object> threadLocal2Value = new WeakHashMap<ThreadLocal<Object>, Object>();
        for (Map.Entry<ThreadLocal<Object>, TtlCopier<Object>> entry : threadLocalHolder.entrySet()) {
            final ThreadLocal<Object> threadLocal = entry.getKey();
            final TtlCopier<Object> copier = entry.getValue();
            threadLocal2Value.put(threadLocal, copier.copy(threadLocal.get()));
        }
        return threadLocal2Value;
    }

    //-- 重放

    // 重放capture()方法中捕获的TransmittableThreadLocal和手动注册的ThreadLocal中的值，本质是重新拷贝holder中的所有变量，生成新的快照
    // 笔者注：重放操作一般会在子线程或者线程池中的线程的任务执行的时候调用，因此此时的holder#get()拿到的是子线程的原来就存在的本地线程变量，重放操作就是把这些子线程原有的本地线程变量备份
    @NonNull
    public static Object replay(@NonNull Object captured) {
        final Snapshot capturedSnapshot = (Snapshot) captured;
        return new Snapshot(replayTtlValues(capturedSnapshot.ttl2Value), replayThreadLocalValues(capturedSnapshot.threadLocal2Value));
    }
    
    // 重放所有的TTL的值
    @NonNull
    private static WeakHashMap<TransmittableThreadLocal<Object>, Object> replayTtlValues(@NonNull WeakHashMap<TransmittableThreadLocal<Object>, Object> captured) {
        // 新建一个新的备份WeakHashMap，其实也是一个快照
        WeakHashMap<TransmittableThreadLocal<Object>, Object> backup = new WeakHashMap<TransmittableThreadLocal<Object>, Object>();
        // 这里的循环针对的是子线程，用于获取的是子线程的所有线程本地变量
        for (final Iterator<TransmittableThreadLocal<Object>> iterator = holder.get().keySet().iterator(); iterator.hasNext(); ) {
            TransmittableThreadLocal<Object> threadLocal = iterator.next();

            // 拷贝holder当前线程（子线程）绑定的所有TransmittableThreadLocal的K-V结构到备份中
            backup.put(threadLocal, threadLocal.get());

            // 清理所有的非捕获快照中的TTL变量，以防有中间过程引入的额外的TTL变量（除了父线程的本地变量）影响了任务执行后的重放操作
            // 简单来说就是：移除所有子线程的不包含在父线程捕获的线程本地变量集合的中所有子线程本地变量和对应的值
            /**
             * 这个问题可以举个简单的例子：
             * static TransmittableThreadLocal<Integer> TTL = new TransmittableThreadLocal<>();
             * 
             * 线程池中的子线程C中原来初始化的时候，在线程C中绑定了TTL的值为10087，C线程是核心线程不会主动销毁。
             * 
             * 父线程P在没有设置TTL值的前提下，调用了线程C去执行任务，那么在C线程的Runnable包装类中通过TTL#get()就会获取到10087，显然是不符合预期的
             *
             * 所以，在C线程的Runnable包装类之前之前，要从C线程的线程本地变量，移除掉不包含在父线程P中的所有线程本地变量，确保Runnable包装类执行期间只能拿到父线程中捕获到的线程本地变量
             *
             * 下面这个判断和移除做的就是这个工作
             */
            if (!captured.containsKey(threadLocal)) {
                iterator.remove();
                threadLocal.superRemove();
            }
        }

        // 重新设置TTL的值到捕获的快照中
        // 其实真实的意图是：把从父线程中捕获的所有线程本地变量重写设置到TTL中，本质上，子线程holder里面的TTL绑定的值会被刷新
        setTtlValuesTo(captured);

        // 回调模板方法beforeExecute
        doExecuteCallback(true);

        return backup;
    }
    
    // 提取WeakHashMap中的KeySet，遍历所有的TransmittableThreadLocal，重新设置VALUE
    private static void setTtlValuesTo(@NonNull WeakHashMap<TransmittableThreadLocal<Object>, Object> ttlValues) {
        for (Map.Entry<TransmittableThreadLocal<Object>, Object> entry : ttlValues.entrySet()) {
            TransmittableThreadLocal<Object> threadLocal = entry.getKey();
            // 重新设置TTL值，本质上，当前线程（子线程）holder里面的TTL绑定的值会被刷新
            threadLocal.set(entry.getValue());
        }
    }
    
    // 重放所有的手动注册的ThreadLocal的值
    private static WeakHashMap<ThreadLocal<Object>, Object> replayThreadLocalValues(@NonNull WeakHashMap<ThreadLocal<Object>, Object> captured) {
        // 新建备份
        final WeakHashMap<ThreadLocal<Object>, Object> backup = new WeakHashMap<ThreadLocal<Object>, Object>();
        // 注意这里是遍历捕获的快照中的ThreadLocal
        for (Map.Entry<ThreadLocal<Object>, Object> entry : captured.entrySet()) {
            final ThreadLocal<Object> threadLocal = entry.getKey();
            // 添加到备份中
            backup.put(threadLocal, threadLocal.get());
            final Object value = entry.getValue();
            // 如果值为清除标记则绑定在当前线程的变量进行remove，否则设置值覆盖
            if (value == threadLocalClearMark) threadLocal.remove();
            else threadLocal.set(value);
        }
        return backup;
    }


    // -- 复原
    
    // 从relay()或者clear()方法中恢复TransmittableThreadLocal和手工注册的ThreadLocal的值对应的备份
    // 笔者注：恢复操作一般会在子线程或者线程池中的线程的任务执行的时候调用
    public static void restore(@NonNull Object backup) {
        final Snapshot backupSnapshot = (Snapshot) backup;
        restoreTtlValues(backupSnapshot.ttl2Value);
        restoreThreadLocalValues(backupSnapshot.threadLocal2Value);
    }

    private static void restoreTtlValues(@NonNull WeakHashMap<TransmittableThreadLocal<Object>, Object> backup) {
        // 回调模板方法afterExecute
        doExecuteCallback(false);
        // 这里的循环针对的是子线程，用于获取的是子线程的所有线程本地变量
        for (final Iterator<TransmittableThreadLocal<Object>> iterator = holder.get().keySet().iterator(); iterator.hasNext(); ) {
            TransmittableThreadLocal<Object> threadLocal = iterator.next();
            // 如果子线程原来就绑定的线程本地变量的值，如果不包含某个父线程传来的对象，那么就删除
            // 这一步可以结合前面reply操作里面的方法段一起思考，如果不删除的话，就相当于子线程的原来存在的线程本地变量绑定值被父线程对应的值污染了
            if (!backup.containsKey(threadLocal)) {
                iterator.remove();
                threadLocal.superRemove();
            }
        }

        // 重新设置TTL的值到捕获的快照中
        // 其实真实的意图是：把子线程的线程本地变量恢复到reply()的备份（前面的循环已经做了父线程捕获变量的判断），本质上，等于把holder中绑定于子线程本地变量的部分恢复到reply操作之前的状态
        setTtlValuesTo(backup);
    }
    
    // 恢复所有的手动注册的ThreadLocal的值
    private static void restoreThreadLocalValues(@NonNull WeakHashMap<ThreadLocal<Object>, Object> backup) {
        for (Map.Entry<ThreadLocal<Object>, Object> entry : backup.entrySet()) {
            final ThreadLocal<Object> threadLocal = entry.getKey();
            threadLocal.set(entry.getValue());
        }
    }
}   

```


- `capture`：捕获，捕获父线程的TTL和TL值， 快照保存。
- `reply`：重放， 备份子线程的 TTL和TL值， 将父线程的快照覆盖给子线程
- `restore`：复原，任务执行完后将子线程的 ThreadLocalMap 复原


#### TtlRunnable

##### 使用示例
在线程池场景， 采取 `TtlRunable` 修饰 `Runnable`, 如:
``` 
Runnable ttlRunnable = TtlRunnable.get(() -> {
    System.out.println(TTL.get());
});
EXECUTOR.submit(ttlRunnable);
```

##### 源码流程

`TtlRunnable` 使用了 `Transmitter` 的 capture、reply 和 restore 等， 主要关注 `run` 方法:
``` 
public final class TtlRunnable implements Runnable, TtlWrapper<Runnable>, TtlEnhanced, TtlAttachments {

    // 存放从父线程捕获得到的线程本地变量映射的备份
    private final AtomicReference<Object> capturedRef;
    
    // 原始的Runable实例
    private final Runnable runnable;
    
    // 执行之后是否释放TTL值引用
    private final boolean releaseTtlValueReferenceAfterRun;

    private TtlRunnable(@NonNull Runnable runnable, boolean releaseTtlValueReferenceAfterRun) {
        // 这里关键点：TtlRunnable实例化的时候就已经进行了线程本地变量的捕获，所以一定是针对父线程的，因为此时任务还没提交到线程池
        this.capturedRef = new AtomicReference<Object>(capture());
        this.runnable = runnable;
        this.releaseTtlValueReferenceAfterRun = releaseTtlValueReferenceAfterRun;
    }

    @Override
    public void run() {
        // 获取父线程捕获到的线程本地变量映射的备份，做一些前置判断
        Object captured = capturedRef.get();
        if (captured == null || releaseTtlValueReferenceAfterRun && !capturedRef.compareAndSet(captured, null)) {
            throw new IllegalStateException("TTL value reference is released after run!");
        }
        // 重放操作
        Object backup = replay(captured);
        try {
            // 真正的Runnable调用
            runnable.run();
        } finally {
            // 复原操作
            restore(backup);
        }
    }

    @Nullable
    public static TtlRunnable get(@Nullable Runnable runnable) {
        return get(runnable, false, false);
    }

    @Nullable
    public static TtlRunnable get(@Nullable Runnable runnable, boolean releaseTtlValueReferenceAfterRun, boolean idempotent) {
        if (null == runnable) return null;
        if (runnable instanceof TtlEnhanced) {
            // avoid redundant decoration, and ensure idempotency
            if (idempotent) return (TtlRunnable) runnable;
            else throw new IllegalStateException("Already TtlRunnable!");
        }
        return new TtlRunnable(runnable, releaseTtlValueReferenceAfterRun);
    }
    
    //......... 
```

### 参考资料

- [通过transmittable-thread-local源码理解线程池线程本地变量传递的原理](https://www.cnblogs.com/throwable/p/12817754.html)
- [github-TransmittableThreadLocal](https://github.com/alibaba/transmittable-thread-local)