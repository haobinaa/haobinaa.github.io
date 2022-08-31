---
title: transmittable-thread-local
date: 2022-08-22 10:20:10
tags:
categories: 并发
description: ttl 使用以及场景介绍、框架结构。 以及源码分析
---


### TTL 概述

JDK `ThreadLocal`、`InheritableThreadLocal`的最大局限性就是：无法为预先创建好（未投入使用）的线程实例传递变量（准确来说是首次传递某些场景是可行的，而后面由于线程池中的线程是复用的，无法进行更新或者修改变量的传递值），泛线程池Executor体系、TimerTask和ForkJoinPool等一般会预先创建（核心）线程，也就它们都是无法在线程池中由预创建的子线程执行的Runnable任务实例中使用。

#### 使用场景

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

这里 `holder 静态变量` ， 作为父线程管理所有 `TransmittableThreadLocal` 的桥梁
- 是 `InheritableThreadLocal` 类型(get 方法为线程隔离)
- 存放了一个 `WeakHashMap<TransmittableThreadLocal<Object>, ?>`,  key 是 `TransmittableThreadLocal`, value 是 null， 这里是把 `WeakHashMap` 当 SET 容器使用

整体存储结构如下:
![](/images/thread/ttl-set.png)


这里有一个关键变量， 也是上面提到的 `disableIgnoreNullValueSemantics`。
默认情况下`disableIgnoreNullValueSemantics=false`，TTL如果设置 NULL 值，会直接从holder 移除对应的 TTL 实例，在TTL#get()方法被调用的时候，如果原来持有的属性不为NULL，该TTL实例会重新加到holder。

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
    
    // 私有静态类，快照，保存从holder中捕获的所有TransmittableThreadLocal和外部手动注册保存在threadLocalHolder的ThreadLocal的K-V映射快照
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
    //-- 捕获
    
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


- `capture`：捕获操作，父线程原来就存在的线程本地变量映射和手动注册的线程本地变量映射捕获，得到捕获的快照值captured。
- `reply`：重放操作，子线程原来就存在的线程本地变量映射和手动注册的线程本地变量生成备份backup，刷新captured的所有值到子线程在全局存储器holder中绑定的值。
- `restore`：复原操作，子线程原来就存在的线程本地变量映射和手动注册的线程本地变量恢复成backup。


#### TtlRunnable


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

整体执行流程:
![](/images/thread/ttl-runnable.png)

### 参考资料

- [通过transmittable-thread-local源码理解线程池线程本地变量传递的原理](https://www.cnblogs.com/throwable/p/12817754.html)
- [github-TransmittableThreadLocal](https://github.com/alibaba/transmittable-thread-local)