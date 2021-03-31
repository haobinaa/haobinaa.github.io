---
title: 池化设计之CommonPool
date: 2021-01-07 15:45:28
tags:
categories: 架构
---
### 池化技术 CommonPool 

对象池化管理是一个很重要的功能，无论是数据库连接池还是redis连接池，都应该特别关注连接池的使用，重点关注几个关键的指标是否正常，连接池使用不当很有可能导致连接池泄露的问题。

这里是基于 Apache CommonPool 2 来分析具体实现

### 关键成员

#### PooledObjectFactory

`PooledObjectFactory` 是用来管理对象的对象工厂, 定义如下:
``` 
public interface PooledObjectFactory<T> {
    //创建一个实例
    PooledObject<T> makeObject();
    void activateObject(PooledObject<T> obj);
    //去初始化，将对象返回到空闲池内
    void passivateObject(PooledObject<T> obj);
    boolean validateObject(PooledObject<T> obj);
    //销毁对象，不再被池需要
    void destroyObject(PooledObject<T> obj);
}
```

使用中可以继承最简单的一个实现`BasePooledObjectFactory`， 只需要实现 `wrap` 和 `create` 方法即可， 例如:
``` 
public class StringBufferFactory extends BasePooledObjectFactory<StringBuffer> {

    @Override
    public StringBuffer create() throws Exception {
        return new StringBuffer();
    }

    /**
     * wrap 可用 DefaultPooledObject
     */
    @Override
    public PooledObject<StringBuffer> wrap(StringBuffer stringBuffer) {
        return new DefaultPooledObject<StringBuffer>(stringBuffer);
    }
}
```

普通的 `PooledObjectFactory` 只能生产出大批设置完全一致的对象。有时需要通过key来获取不同的对象, 这种时候就可以使用 `BaseKeyedPooledObjectFactory` 来替代
`BasePooledObjectFactory` 这个类，实现的是 `KeyedPooledObjectFactory` 接口 ,定义如下：
``` 
// 每个接口都多了一个 key 的定义
public interface KeyedPoolableObjectFactory<K,V> {
    PooledObject<V> makeObject(K key);
    void activateObject(K key, PooledObject<V> obj);
    void passivateObject(K key, PooledObject<V> obj);
    boolean validateObject(K key, PooledObject<V> obj);
    void destroyObject(K key, PooledObject<V> obj);
}
```

#### PooledObject

原始的对象类型不能够反应许多额外的信息，所以将原始类型封装起来，增加了其他的信息，用来对原始对象的行为和状态进行观察。封装类型的模板定义为如下：
``` 
public interface PooledObject<T>{
    //获取原始对象
     T getObject();
    //获取创建时间
    long getCreateTime();
    //该对象最近一次被使用的时长，如果仍然在使用则这个值会变大
    long getActiveTimeMillis();
    //最近一次空闲的时间
    long getIdleTimeMillis();
    //上次被签出的时间
    long getLastBorrowTime();
    // 上次被归还的时间
    long getLastReturnTime();
    // 上次使用的时间  
    long getLastUsedTime();
    //定义了对象的顺序，空闲时间从小到大排列，在GKOP的空闲清理器中会使用到
    int compareTo(PooledObject<T> other);
    将对象设置为EVICTION状态
    boolean startEvictionTest();
    //告诉对象清理已经结束了
    boolean endEvictionTest(Deque<PooledObject<T>> idleQueue);
    //分配对象
    boolean allocate();
    //回收对象
    boolean deallocate();
    //失效对象
    void invalidate();
    //设置logAbandoned
    void setLogAbandoned(boolean logAbandoned);
    //设置使用时间
    void use();
    //如果borrow对象打印调用栈
    void printStackTrace(PrintWriter writer);
    //获取对象的状态
    PooledObjectState getState();
    //标记对象为废弃的
    void markAbandoned();
    //标记对象为返回中
    void markReturning();
}
```

封装对象的状态比较多,有十一个状态, 每个状态含义如下:
``` 
public enum PooledObjectState {
    //在空闲队列中
    IDLE,
    //使用中
    ALLOCATED,
    //在队列中，可能会被清理
    EVICTION,
    //不在队列中，已经被标记为清除，但同时被借出，这个时候借出不成功，当清理器停止工作以后，该对象要被还回到对象的头部
    EVICTION_RETURN_TO_HEAD,
    //在队列中，校验过
    VALIDATION,
    //不在队列中，处于校验待分配状态，该对象已经被借出但是配置了testOnBorrow，正在进行校验，校验通过以后会变成分配。
    VALIDATION_PREALLOCATED,
    //不在队列中，别清理器移除队列，这个时候借出对象，并且正在校验，这个时候校验成功以后需要还回到队列头部
    VALIDATION_RETURN_TO_HEAD,
    //校验不通过
    INVALID,
    //废弃
    ABANDONED,
    //正在归还到线程池中
    RETURNING
}
```

#### ObjectPool

ObjectPool 定义了对象池的操作:
``` 
public interface ObjectPool<T> extends Closeable {
    //借出对象要么是通过工厂创建的对象，要么是从空闲队列里面获取，通过工厂方法激活并且校验通过的
    //根据约定，归还对象必须调用returnObject方法和invalidateObject方法
    T borrowObject();
    //返回被borrow出的对象
    void returnObject(T obj);
    //对借出来的对象进行校验处理，像数据库连接就会去查询一次数据，对于redis去查询发出ping命令
    void invalidateObject(T obj);
    //给空闲队列增加一个对象，工厂生成一个对象，去激活对象，然后加入到队列
    void addObject();
    //空闲对象的个数，认为不增加对象，有多少可用
    int getNumIdle();
    //认为是当前正在使用的对象
    int getNumActive();
    //销毁所有空闲对象，释放资源，必须要调用PooledObjectFactory#destroyObject方法
    void clear();
    //关闭池，并且释放资源
    void close();
}
```

一个对象池的基本使用方式如下:
``` 
Object obj = null;//被池管理的对象

   try {
       obj = pool.borrowObject();//从池里获取对象
       try {
           //使用该对象
       } catch(Exception e) {
           //失效该对象
           pool.invalidateObject(obj);
           //失效成功以后将obj变为null
           obj = null;
       } finally {
           //确保对象已经归还到池里面，并且避免两次归还
           if(null != obj) {
               pool.returnObject(obj);
          }
       }
   } catch(Exception e) {
         //获取对象失败
   }
```

### GenericObjectPool

`GenericObjectPool` 实现了对象的池化管理

#### 构造方法

``` 
public GenericObjectPool(final PooledObjectFactory<T> factory,
        final GenericObjectPoolConfig config) {

    super(config, ONAME_BASE, config.getJmxNamePrefix());

    if (factory == null) {
        jmxUnregister(); // tidy up
        throw new IllegalArgumentException("factory may not be null");
    }
    this.factory = factory;
    // 双向阻塞队列
    idleObjects = new LinkedBlockingDeque<>(config.getFairness());

    setConfig(config);
    //清除器定时任务，设置任务定时间隔,时间不设置，清理器是不会启动的
    startEvictor(getTimeBetweenEvictionRunsMillis());
}
```

#### borrowObject

`borrowObject` 从对象池获取对象:
``` 
//borrow一个对象的方法，borrow这个词很准确，因为还需要归还
public T borrowObject(final long borrowMaxWaitMillis) throws Exception {
    assertOpen();

    final AbandonedConfig ac = this.abandonedConfig;
    //空闲小于两个了 并且这个时候最大活跃的接近最大的了
    //说明这个时候对象是不够用的了，这个时候需要清理出来一批了
    if (ac != null && ac.getRemoveAbandonedOnBorrow() &&
            (getNumIdle() < 2) &&
            (getNumActive() > getMaxTotal() - 3) ) {
        removeAbandoned(ac);
    }

    PooledObject<T> p = null;

    // Get local copy of current config so it is consistent for entire
    // method execution
    final boolean blockWhenExhausted = getBlockWhenExhausted();

    boolean create;
    final long waitTime = System.currentTimeMillis();

    while (p == null) {
        create = false;
        //从双向阻塞队列里面获取
        p = idleObjects.pollFirst();
        if (p == null) {
            //获取不到空闲的则生成一个对象
            p = create();
            if (p != null) {
                create = true;
            }
        }
        //连接池耗尽则阻塞
        if (blockWhenExhausted) {
            if (p == null) {
                if (borrowMaxWaitMillis < 0) {
                    //这就是阻塞队列，不带超时时间
                    p = idleObjects.takeFirst();
                } else {
                    //这是带有超时时间的
                    p = idleObjects.pollFirst(borrowMaxWaitMillis,
                            TimeUnit.MILLISECONDS);
                }
            }
            if (p == null) {
                throw new NoSuchElementException(
                        "Timeout waiting for idle object");
            }
        } else {
            if (p == null) {
                throw new NoSuchElementException("Pool exhausted");
            }
        }
        if (!p.allocate()) {
            p = null;
        }

        if (p != null) {
            try {
                factory.activateObject(p);
            } catch (final Exception e) {
                try {
                    destroy(p);
                } catch (final Exception e1) {
                    // Ignore - activation failure is more important
                }
                p = null;
                if (create) {
                    final NoSuchElementException nsee = new NoSuchElementException(
                            "Unable to activate object");
                    nsee.initCause(e);
                    throw nsee;
                }
            }
            //会影响性能
            if (p != null && (getTestOnBorrow() || create && getTestOnCreate())) {
                boolean validate = false;
                Throwable validationThrowable = null;
                try {
                    validate = factory.validateObject(p);
                } catch (final Throwable t) {
                    PoolUtils.checkRethrow(t);
                    validationThrowable = t;
                }
                if (!validate) {
                    try {
                        destroy(p);
                        destroyedByBorrowValidationCount.incrementAndGet();
                    } catch (final Exception e) {
                        // Ignore - validation failure is more important
                    }
                    p = null;
                    if (create) {
                        final NoSuchElementException nsee = new NoSuchElementException(
                                "Unable to validate object");
                        nsee.initCause(validationThrowable);
                        throw nsee;
                    }
                }
            }
        }
    }

    updateStatsBorrow(p, System.currentTimeMillis() - waitTime);

    return p.getObject();
}
```


#### returnObject 流程

``` 
public void returnObject(final T obj) {
    final PooledObject<T> p = allObjects.get(new IdentityWrapper<>(obj));

    if (p == null) {
        if (!isAbandonedConfig()) {
            throw new IllegalStateException(
                    "Returned object not currently part of this pool");
        }
        return; // Object was abandoned and removed
    }

    synchronized(p) {
        final PooledObjectState state = p.getState();
        if (state != PooledObjectState.ALLOCATED) {
            throw new IllegalStateException(
                    "Object has already been returned to this pool or is invalid");
        }
        p.markReturning(); // Keep from being marked abandoned
    }

    final long activeTime = p.getActiveTimeMillis();

    if (getTestOnReturn()) {
        if (!factory.validateObject(p)) {
            try {
                destroy(p);
            } catch (final Exception e) {
                swallowException(e);
            }
            try {
                ensureIdle(1, false);
            } catch (final Exception e) {
                swallowException(e);
            }
            updateStatsReturn(activeTime);
            return;
        }
    }

    try {
        factory.passivateObject(p);
    } catch (final Exception e1) {
        swallowException(e1);
        try {
            destroy(p);
        } catch (final Exception e) {
            swallowException(e);
        }
        try {
            ensureIdle(1, false);
        } catch (final Exception e) {
            swallowException(e);
        }
        updateStatsReturn(activeTime);
        return;
    }

    if (!p.deallocate()) {
        throw new IllegalStateException(
                "Object has already been returned to this pool or is invalid");
    }

    final int maxIdleSave = getMaxIdle();
    if (isClosed() || maxIdleSave > -1 && maxIdleSave <= idleObjects.size()) {
        try {
            destroy(p);
        } catch (final Exception e) {
            swallowException(e);
        }
    } else {
        if (getLifo()) {
            //后进先出，增加到队列首部
            idleObjects.addFirst(p);
        } else {
            //先进先出 增加到队列尾部
            idleObjects.addLast(p);
        }
        if (isClosed()) {
            // Pool closed while object was being added to idle objects.
            // Make sure the returned object is destroyed rather than left
            // in the idle object pool (which would effectively be a leak)
            //池关掉以后，空闲队列里面的对象也要销毁
            clear();
        }
    }
    updateStatsReturn(activeTime);
}
```

#### evict

设置定时清除器去清理超过 minIdle 的对象:
``` 
public void evict() throws Exception {
    assertOpen();

    if (idleObjects.size() > 0) {

        PooledObject<T> underTest = null;
        final EvictionPolicy<T> evictionPolicy = getEvictionPolicy();

        synchronized (evictionLock) {
            final EvictionConfig evictionConfig = new EvictionConfig(
                    getMinEvictableIdleTimeMillis(),
                    getSoftMinEvictableIdleTimeMillis(),
                    getMinIdle());

            final boolean testWhileIdle = getTestWhileIdle();

            for (int i = 0, m = getNumTests(); i < m; i++) {
                if (evictionIterator == null || !evictionIterator.hasNext()) {
                    evictionIterator = new EvictionIterator(idleObjects);
                }
                if (!evictionIterator.hasNext()) {
                    // Pool exhausted, nothing to do here
                    return;
                }

                try {
                    underTest = evictionIterator.next();
                } catch (final NoSuchElementException nsee) {
                    // Object was borrowed in another thread
                    // Don't count this as an eviction test so reduce i;
                    i--;
                    evictionIterator = null;
                    continue;
                }

                if (!underTest.startEvictionTest()) {
                    // Object was borrowed in another thread
                    // Don't count this as an eviction test so reduce i;
                    i--;
                    continue;
                }

                // User provided eviction policy could throw all sorts of
                // crazy exceptions. Protect against such an exception
                // killing the eviction thread.
                boolean evict;
                try {
                    evict = evictionPolicy.evict(evictionConfig, underTest,
                            idleObjects.size());
                } catch (final Throwable t) {
                    // Slightly convoluted as SwallowedExceptionListener
                    // uses Exception rather than Throwable
                    PoolUtils.checkRethrow(t);
                    swallowException(new Exception(t));
                    // Don't evict on error conditions
                    evict = false;
                }

                if (evict) {
                    destroy(underTest);
                    destroyedByEvictorCount.incrementAndGet();
                } else {
                    //定时任务校验对象
                    if (testWhileIdle) {
                        boolean active = false;
                        try {
                            factory.activateObject(underTest);
                            active = true;
                        } catch (final Exception e) {
                            destroy(underTest);
                            destroyedByEvictorCount.incrementAndGet();
                        }
                        if (active) {
                            if (!factory.validateObject(underTest)) {
                                destroy(underTest);
                                destroyedByEvictorCount.incrementAndGet();
                            } else {
                                try {
                                    factory.passivateObject(underTest);
                                } catch (final Exception e) {
                                    destroy(underTest);
                                    destroyedByEvictorCount.incrementAndGet();
                                }
                            }
                        }
                    }
                    if (!underTest.endEvictionTest(idleObjects)) {
                        // TODO - May need to add code here once additional
                        // states are used
                    }
                }
            }
        }
    }
    final AbandonedConfig ac = this.abandonedConfig;
    if (ac != null && ac.getRemoveAbandonedOnMaintenance()) {
        //同时会清除废弃对象
        removeAbandoned(ac);
    }
}
```