---
title: ThreadLocal详解
date: 2018-08-15 11:38:04
tags: 
categories: 并发
---
### 概要
ThreadLocal 用于提供线程局部变量，在多线程环境可以保证各个线程里的变量独立于其它线程里的变量。也就是说 ThreadLocal 可以为每个线程创建一个【单独的变量副本】，相当于线程的 private static 类型变量

ThreadLocal 的作用和同步机制有些相反：同步机制是为了保证多线程环境下数据的一致性；而 ThreadLocal 是保证了多线程环境下数据的独立性

### ThreadLocal源码分析


#### set(T value)和get()方法

set(T value) 方法中，首先获取当前线程，然后在获取到当前线程的 ThreadLocalMap，如果 ThreadLocalMap 不为 null，则将 value 保存到 ThreadLocalMap 中，并用当前 ThreadLocal 作为 key；否则创建一个 ThreadLocalMap 并给到当前线程，然后保存 value。

ThreadLocalMap 相当于一个 HashMap，是真正保存值的地方。
``` 
public void set(T value) {
    Thread t = Thread.currentThread();
    // 获取当前线程的ThreadLocalMap
    ThreadLocalMap map = getMap(t);
    if (map != null)
        map.set(this, value);
    else
        createMap(t, value);
}
```
在 get() 方法中也会获取到当前线程的 ThreadLocalMap，如果 ThreadLocalMap 不为 null，则把获取 key 为当前 ThreadLocal 的值；否则调用 setInitialValue() 方法返回初始值，并保存到新创建的 ThreadLocalMap 中。

``` 
public T get() {
    Thread t = Thread.currentThread();
    ThreadLocalMap map = getMap(t);
    if (map != null) {
        ThreadLocalMap.Entry e = map.getEntry(this);
        if (e != null) {
            @SuppressWarnings("unchecked")
            T result = (T)e.value;
            return result;
        }
    }
    return setInitialValue();
}
```
setInitialValue() 是 ThreadLocal 的初始值，默认返回 null，子类可以重写改方法，用于设置 ThreadLocal 的初始值:
``` 
private T setInitialValue() {
    T value = initialValue();
    Thread t = Thread.currentThread();
    ThreadLocalMap map = getMap(t);
    if (map != null)
        map.set(this, value);
    else
        createMap(t, value);
    return value;
}
```

#### remove()
 remove()用来移除当前 ThreadLocal 对应的值。同样也是同过当前线程的 ThreadLocalMap 来移除相应的值。
``` 
public void remove() {
    ThreadLocalMap m = getMap(Thread.currentThread());
    if (m != null)
        m.remove(this);
}
```

#### 当前线程的 ThreadLocalMap(getMap(t))
在 set，get，initialValue 和 remove 方法中都会获取到当前线程，然后通过当前线程获取到 ThreadLocalMap，如果 ThreadLocalMap 为 null，则会创建一个 ThreadLocalMap，并给到当前线程。
``` 
ThreadLocalMap getMap(Thread t) {
    return t.threadLocals;
}

void createMap(Thread t, T firstValue) {
    t.threadLocals = new ThreadLocalMap(this, firstValue);
}

```
每一个线程都会持有有一个 ThreadLocalMap，用来维护线程本地的值，在`Thread`类中：`
``` 
public class Thread implements Runnable {
    ...
    ThreadLocal.ThreadLocalMap threadLocals = null;
    ...
}
```
在使用 ThreadLocal 类型变量进行相关操作时，都会通过当前线程获取到 ThreadLocalMap 来完成操作。每个线程的 ThreadLocalMap 是属于线程自己的，ThreadLocalMap 
中维护的值也是属于线程自己的。这就保证了 ThreadLocal(类型为ThreadLocalMap)变量在每个线程中是独立的，在多线程环境下不会相互影响。

#### ThreadLocalMap
##### 构造方法
ThreadLocal 中当前线程的 ThreadLocalMap 为 null 时会使用 ThreadLocalMap 的构造方法新建一个 ThreadLocalMap：
``` 
ThreadLocalMap(ThreadLocal<?> firstKey, Object firstValue) {
// INITIAL_CAPACITY默认为16
    table = new Entry[INITIAL_CAPACITY];
    int i = firstKey.threadLocalHashCode & (INITIAL_CAPACITY - 1);
    table[i] = new Entry(firstKey, firstValue);
    size = 1;
    setThreshold(INITIAL_CAPACITY);
}
```
构造方法中会新建一个数组，并将将第一次需要保存的键值存储到一个数组中，完成一些初始化工作。

##### 存储结构
ThreadLocalMap 内部维护了一个哈希表（数组）来存储数据，并且定义了加载因子：
``` 
// 初始容量，必须是 2 的幂
private static final int INITIAL_CAPACITY = 16;

// 存储数据的哈希表
private Entry[] table;

// table 中已存储的条目数
private int size = 0;

// 表示一个阈值，当 table 中存储的对象达到该值时就会扩容
private int threshold;

// 设置 threshold 的值
private void setThreshold(int len) {
    threshold = len * 2 / 3;
}
```
table 是一个 Entry 类型的数组，Entry 是 ThreadLocalMap 的一个内部类：
``` 
static class Entry extends WeakReference<ThreadLocal<?>> {
    Object value;

    Entry(ThreadLocal<?> k, Object v) {
        super(k);
        value = v;
    }
}
```

##### 保存键值对
调用`ThreadLocalMap`的`set(ThreadLocal key, Object value)`方法将数据保存到哈希表中：
``` 
private void set(ThreadLocal key, Object value) {

    Entry[] tab = table;
    int len = tab.length;
    // 计算要存储的索引位置
    int i = key.threadLocalHashCode & (len-1);

    // 循环判断要存放的索引位置是否已经存在 Entry，若存在，进入循环体
    for (Entry e = tab[i];
         e != null;
         e = tab[i = nextIndex(i, len)]) {
        ThreadLocal k = e.get();

        // 若索引位置的 Entry 的 key 和要保存的 key 相等，则更新该 Entry 的值
        if (k == key) {
            e.value = value;
            return;
        }

        // 若索引位置的 Entry 的 key 为 null（key 已经被回收了），表示该位置的 Entry 已经无效，用要保存的键值替换该位置上的 Entry
        if (k == null) {
            replaceStaleEntry(key, value, i);
            return;
        }
    }

    // 要存放的索引位置没有 Entry，将当前键值作为一个 Entry 保存在该位置
    tab[i] = new Entry(key, value);
    // 增加 table 存储的条目数
    int sz = ++size;
    // 清除一些无效的条目并判断 table 中的条目数是否已经超出阈值
    if (!cleanSomeSlots(i, sz) && sz >= threshold)
        rehash(); // 调整 table 的容量，并重新摆放 table 中的 Entry
}
```
首先使用 key（当前 ThreadLocal）的 threadLocalHashCode 来计算要存储的索引位置 i。threadLocalHashCode 的值由 ThreadLocal 类管理，每创建一个 ThreadLocal 对象都会自动生成一个相应的 threadLocalHashCode 值，其实现如下：
``` 
// ThreadLocal 对象的 HashCode
private final int threadLocalHashCode = nextHashCode();

// 使用 AtomicInteger 保证多线程环境下的同步
private static AtomicInteger nextHashCode =
    new AtomicInteger();

// 每次创建 ThreadLocal 对象是 HashCode 的增量
private static final int HASH_INCREMENT = 0x61c88647;

// 计算 ThreadLocal 对象的 HashCode
private static int nextHashCode() {
    return nextHashCode.getAndAdd(HASH_INCREMENT);
}
```
在保存数据时，如果索引位置有 Entry，且该 Entry 的 key 为 null，那么就会执行清除无效 Entry 的操作，因为 Entry 的 key 使用的是弱引用的方式，key 如果被回收（即 key 为 null），这时就无法再访问到 key 对应的 value，需要把这样的无效 Entry 清除掉来腾出空间。

在调整 table 容量时，也会先清除无效对象，然后再根据需要扩容。
``` 
private void rehash() {
    // 先清除无效 Entry
    expungeStaleEntries();
    // 判断当前 table 中的条目数是否超出了阈值的 3/4
    if (size >= threshold - threshold / 4)
        resize();
}
```

##### 获取Entry
取值是直接获取到 Entry 对象，使用 `getEntry(ThreadLocal key)` 方法：
``` 
private Entry getEntry(ThreadLocal key) {
    // 使用指定的 key 的 HashCode 计算索引位置
    int i = key.threadLocalHashCode & (table.length - 1);
    // 获取当前位置的 Entry
    Entry e = table[i];
    // 如果 Entry 不为 null 且 Entry 的 key 和 指定的 key 相等，则返回该 Entry
    // 否则调用 getEntryAfterMiss(ThreadLocal key, int i, Entry e) 方法
    if (e != null && e.get() == key)
        return e;
    else
        return getEntryAfterMiss(key, i, e);
}
```
因为可能存在哈希冲突，key 对应的 Entry 的存储位置可能不在通过 key 计算出的索引位置上，也就是说索引位置上的 Entry 不一定是 key 对应的 Entry。所以需要调用 getEntryAfterMiss(ThreadLocal key, int i, Entry e) 方法获取。

``` 
private Entry getEntryAfterMiss(ThreadLocal key, int i, Entry e) {
    Entry[] tab = table;
    int len = tab.length;

    // 索引位置上的 Entry 不为 null 进入循环，为 null 则返回 null
    while (e != null) {
        ThreadLocal k = e.get();
        // 如果 Entry 的 key 和指定的 key 相等，则返回该 Entry
        if (k == key)
            return e;
        // 如果 Entry 的 key 为 null （key 已经被回收了），清除无效的 Entry
        // 否则获取下一个位置的 Entry，循环判断
        if (k == null)
            expungeStaleEntry(i);
        else
            i = nextIndex(i, len);
        e = tab[i];
    }
    return null;
}

```

##### 移除Entry
```
private void remove(ThreadLocal key) {
    Entry[] tab = table;
    int len = tab.length;
    // 使用指定的 key 的 HashCode 计算索引位置
    int i = key.threadLocalHashCode & (len-1);
    // 循环判断索引位置的 Entry 是否为 null
    for (Entry e = tab[i];
         e != null;
         e = tab[i = nextIndex(i, len)]) {
        // 若 Entry 的 key 和指定的 key 相等，执行删除操作
        if (e.get() == key) {
            // 清除 Entry 的 key 的引用
            e.clear();
            // 清除无效的 Entry
            expungeStaleEntry(i);
            return;
        }
    }
}
```

#### 内存泄露原因分析
![](/images/threadlocal.png)

ThreadLocal的实现是这样的：每个Thread 维护一个 ThreadLocalMap 映射表，这个映射表的 key 是 ThreadLocal实例本身，value 是真正需要存储的 Object。

也就是说 ThreadLocal 本身并不存储值，它只是作为一个 key 来让线程从 ThreadLocalMap 获取 value。值得注意的是图中的虚线，表示 ThreadLocalMap 是使用 ThreadLocal 的弱引用作为 Key 的，弱引用的对象在 GC 时会被回收。

##### 为何会内存泄露
每个thread中都存在一个map, map的类型是ThreadLocal.ThreadLocalMap. Map中的key为一个threadlocal实例. 这个Map的确使用了弱引用,不过弱引用只是针对key. 每个key都弱引用指向threadlocal. 当把threadlocal实例置为null以后,没有任何强引用指向threadlocal实例,所以threadlocal将会被gc回收. 但是,我们的value却不能回收,因为存在一条从current thread连接过来的强引用. 只有当前thread结束以后, current thread就不会存在栈中,强引用断开, Current Thread, Map, value将全部被GC回收。所以得出一个结论就是只要这个线程对象被gc回收，就不会出现内存泄露，但在threadLocal设为null和线程结束这段时间不会被回收的，就发生了我们认为的内存泄露。其实这是一个对概念理解的不一致，也没什么好争论的。最要命的是线程对象不被回收的情况，这就发生了真正意义上的内存泄露。比如使用线程池的时候，线程结束是不会销毁的，会再次使用的就可能出现内存泄露 。（在web应用中，每次http请求都是一个线程，tomcat容器配置使用线程池时会出现内存泄漏问题）

ThreadLocalMap使用ThreadLocal的弱引用作为key，如果一个ThreadLocal没有外部强引用来引用它，那么系统 GC 的时候，这个ThreadLocal势必会被回收，这样一来，ThreadLocalMap中就会出现key为null的Entry，就没有办法访问这些key为null的Entry的value，如果当前线程再迟迟不结束的话，这些key为null的Entry的value就会一直存在一条强引用链：Thread Ref -> Thread -> ThreaLocalMap -> Entry -> value永远无法回收，造成内存泄漏。


##### ThreadLocalMap的设计
ThreadLocalMap的设计中已经考虑到这种情况，也加上了一些防护措施：在ThreadLocal的get(),set(),remove()的时候都会清除线程ThreadLocalMap里所有key为null的value。

但是这些被动的预防措施并不能保证不会内存泄漏：
- 使用static的ThreadLocal，延长了ThreadLocal的生命周期，可能导致的内存泄漏
- 分配使用了ThreadLocal又不再调用get(),set(),remove()方法，那么就会导致内存泄漏。

##### 为什么使用弱引用
先来看看官方文档的说法：
> To help deal with very large and long-lived usages, the hash table entries use WeakReferences for keys.
  为了应对非常大和长时间的用途，哈希表使用弱引用的 key。
  
下面我们分两种情况讨论：
- key 使用强引用：引用的ThreadLocal的对象被回收了，但是ThreadLocalMap还持有ThreadLocal的强引用，如果没有手动删除，ThreadLocal不会被回收，导致Entry内存泄漏。
- key 使用弱引用：引用的ThreadLocal的对象被回收了，由于ThreadLocalMap持有ThreadLocal的弱引用，即使没有手动删除，ThreadLocal也会被回收。value在下一次ThreadLocalMap调用set,get，remove的时候会被清除。

比较两种情况，我们可以发现：由于ThreadLocalMap的生命周期跟Thread一样长，如果都没有手动删除对应key，都会导致内存泄漏，但是使用弱引用可以多一层保障：弱引用ThreadLocal不会内存泄漏，对应的value在下一次ThreadLocalMap调用set,get,remove的时候会被清除。

因此，ThreadLocal内存泄漏的根源是：由于ThreadLocalMap的生命周期跟Thread一样长，如果没有手动删除对应key就会导致内存泄漏，而不是因为弱引用。

##### 使用ThreadLocal

1. 使用ThreadLocal，建议用static修饰 static ThreadLocal<HttpHeader> headerLocal = new ThreadLocal();
2. 使用完ThreadLocal后，执行remove操作，避免出现内存溢出情况。

在使用线程池的情况下，没有及时清理ThreadLocal，不仅是内存泄漏的问题，更严重的是可能导致业务逻辑出现问题。所以，使用ThreadLocal就跟加锁完要解锁一样，用完就清理。

### 参考资料
- [javaThreadLocal详解](https://juejin.im/post/5965ef1ff265da6c40737292)
- [ThreadLocal内存泄露问题](https://juejin.im/post/5ba9a6665188255c791b0520)
- [深入分析ThreadLocal内存泄露](https://www.jianshu.com/p/1342a879f523)