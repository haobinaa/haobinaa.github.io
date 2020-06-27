---
title: hystrix源码分析
date: 2020-06-21 17:51:29
tags: hystrix
categories: 中间件
---
### 整体源码分析

在回顾一下`hystrix`的执行流程:

![](/images/spring-cloud/hystrix-work-flow.png)

#### 执行命令入口

执行 Hystrix 命令需要集成 `HystrixCommand`， 有四种调用方式：

- `toObservable`: 返回 Observable 对象
- `observe`: 在调用 `toObservable` 的基础上， 向 `Observable` 上注册 `rx.subjects.ReplaySubject` （这些都是 rxJava 的概念）
- `queue`: 在调用 `toObservable` 的基础上:
    1. 调用 `Observable.toBlocking`, 将 Observable 转换成阻塞的 `rx.observables.BlockingObservable`
    2. 调用 `BlockingObservable.toFuture`， 返回 run 方法的执行结果的 Future 对象
- `execute`: 调用 `queue` 的基础上，调用 `Future.get`，同步返回 run 的执行结果

#### 大体流程解释

Hystrix 底层使用了大量的 RxJava, 这里就不把源代码贴出来了, 包括上面的执行方式也可以看出来 Hystrix 是依赖于 RxJava 的 Observable 实现的。

结合执行流程图再次全局的分析一下
1. 执行操作指令时，Hystrix 首先会检查缓存内是否有对应指令的结果，如果有的话，将缓存的结果直接以 Observable 对象的形式返回
2. 如果没有对应的缓存，Hystrix会检查Circuit Breaker的状态
    1. 如果Circuit Breaker的状态为开启状态，Hystrix将不会执行对应指令，而是直接进入失败处理状态(fallback)
    2. 如果Circuit Breaker的状态为关闭状态，Hystrix会继续进行线程池、任务队列、信号量的检查，确认是否有足够的资源执行操作指令。如果资源满，Hystrix同样将不会执行对应指令并且直接进入失败处理状态
3. 如果资源充足，Hystrix将会执行操作指令。操作指令的调用最终都会到两个方法:`HystrixCommand.run(),HystrixObservableCommand.construct()`
4. 如果执行指令的时间超时，执行线程会抛出TimeoutException异常。Hystrix会抛弃结果并直接进入失败处理状态。如果执行指令成功，Hystrix会进行一系列的数据记录，然后返回执行的结果
5. 同时，Hystrix会根据记录的数据来计算失败比率，一旦失败比率达到某一阈值将自动开启Circuit Breaker


Hystrix 处理失败的逻辑：

如果我们在 Command 中实现了 `HystrixCommand.getFallback()`（或 `HystrixObservableCommand.resumeWithFallback()`，Hystrix会返回对应方法的结果。如果没有实现这些方法的话，从底层看Hystrix将会返回一个空的Observable对象，并且可以通过onError来终止并处理错误。 如果从应用层来看:
1). `execute()` 方法将会抛出异常
2). `queue()` 将会返回一个失败状态的 `Future` 对象
3). `observe()` 和 `toObservable()` 都会返回上述的空 `Observable` 对象

### 断路器 HystrixCircuitBreaker 分析

执行命令入口和获取缓存的逻辑都需要结合 RxJava 来看源码， 这里就只挑断路器的部分来分析一下（基于 1.4.x 版本来分析， 1.5.x 都转换成了基于订阅的流式操作)

Hystrix 中的 Circuit Breaker 的实现比较清晰,整个 `HystrixCircuitBreaker` 接口一共有三个方法和三个静态类：

![](/images/spring-cloud/hystrix-circuitbreaker.png)


#### Factory

Factory 是用来获取 `HystrixCircuitBreaker` 的静态工厂， 实现如下:
``` 
public static class Factory {
    // key 是 HystrixCommandKey 的 hashcode
    private static ConcurrentHashMap<String, HystrixCircuitBreaker> circuitBreakersByCommand = new ConcurrentHashMap<String, HystrixCircuitBreaker>();
    public static HystrixCircuitBreaker getInstance(HystrixCommandKey key, HystrixCommandGroupKey group, HystrixCommandProperties properties, HystrixCommandMetrics metrics) {
        // 先从缓存中获取
        HystrixCircuitBreaker previouslyCached = circuitBreakersByCommand.get(key.name());
        if (previouslyCached != null) {
            return previouslyCached;
        }
        // 如果缓存中为空， 就初始化并放入缓存
        HystrixCircuitBreaker cbForCommand = circuitBreakersByCommand.putIfAbsent(key.name(), new HystrixCircuitBreakerImpl(key, group, properties, metrics));
        if (cbForCommand == null) {
            // this means the putIfAbsent step just created a new one so let's retrieve and return it
            return circuitBreakersByCommand.get(key.name());
        } else {
            // this means a race occurred and while attempting to 'put' another one got there before
            // and we instead retrieved it and will now return it
            return cbForCommand;
        }
    }
    public static HystrixCircuitBreaker getInstance(HystrixCommandKey key) {
        return circuitBreakersByCommand.get(key.name());
    }
    /* package */static void reset() {
        circuitBreakersByCommand.clear();
    }
}
```

这里的代码很简单。Factory 中维护了一个 `ConcurrentHashMap` 用于存储与每一个 `HystrixCommandKey` 相对应的 `HystrixCircuitBreaker`。每当我们通过 `getInstance` 从中获取 `HystrixCircuitBreaker` 的时候，首先会检查ConcurrentHashMap中有没有对应的缓存的断路器，如果有的话直接返回。如果没有的话就会新创建一个 `HystrixCircuitBreaker` 实例，将其添加到缓存中并且返回。

#### HystrixCircuitBreakerImpl

`HystrixCircuitBreakerImpl` 静态类是 `HystrixCircuitBreaker` 接口的实现。

1. `HystrixCircuitBreakerImpl` 中有四个成员变量:

- `properties` 是对应 HystrixCommand 的属性类
- `metrics` 是对应 HystrixCommand 的度量数据类
- `circuitOpen` 代表断路器的状态（默认是false代表关闭，这里没有特意实现Half-Open这个状态），考虑并发使用了 `AtomicBoolean` 修饰
- `circuitOpenedOrLastTestedTime`记录着断路恢复计时器的初始时间，用于Open状态向Close状态的转换。使用了一个 `AtomicLong` 类型的变量


2. 主要方法:
- `allowRequest()` 表示是否允许指令执行
- `isOpen()` 表示断路器是否为开启状态
- `markSuccess()` 用于将断路器关闭


##### allRequest 是否允许指令执行

``` 
public boolean allowRequest() {
    if (properties.circuitBreakerForceOpen().get()) {
        // 如果断路器强制开启，直接返回 false
        return false;
    }
    if (properties.circuitBreakerForceClosed().get()) {
        // 就算是强制关闭了， 也要调用 isOpen 来记录一些统计数据
        isOpen();
        // 因为是强制关闭， 不用在意 isOpen 的执行结果
        return true;
    }
    // 判断断路器是否关闭或断路器恢复计时器是否到达时间
    return !isOpen() || allowSingleTest();
}
```


##### isOpen 是否应该打开断路器

``` 
@Override
public boolean isOpen() {
    if (circuitOpen.get()) {
        // 如果是 open 状态， 直接返回 true
        return true;
    }
    // 如果是 cloes 状态， 就需要获取 healthCounts 来判断错误率是否达到需要打开断路器
    HealthCounts health = metrics.getHealthCounts();
    // check if we are past the statisticalWindowVolumeThreshold
    if (health.getTotalRequests() < properties.circuitBreakerRequestVolumeThreshold().get()) {
        // 请求数如果小于判断阈值则返回 false
        return false;
    }
    if (health.getErrorPercentage() < properties.circuitBreakerErrorThresholdPercentage().get()) {
        // 判断错误比例是否小于设定的值， 默认是 50%
        return false;
    } else {
        // 错误比例太高， cas 开启断路器
        if (circuitOpen.compareAndSet(false, true)) {
            // 将当前系统时间设置为短路定时器初始时间
            circuitOpenedOrLastTestedTime.set(System.currentTimeMillis());
            return true;
        } else {
           // 走到这里代表 cas 失败， 就是有其他的线程开启了断路器， 也返回 true
            return true;
        }
    }
}
```

1. 首先通过 `circuitOpen.get()` 获取断路器的状态，如果是开启状态(true)则返回true。
2. 否则，从 `Metrics` 数据中获取 `HealthCounts` 对象，然后检查对应的请求总数(totalCount)是否小于属性中的请求容量阈值(`circuitBreakerRequestVolumeThreshold`)，如果是的话表示断路器可以保持关闭状态，返回false。
3. 如果达到请求阈值， 就再检查错误比率(errorPercentage)是否小于属性中的错误百分比阈值(circuitBreakerErrorThresholdPercentage，默认 50)，如果是的话表示断路器可以保持关闭状态，返回 false
4. 如果超过阈值，Hystrix会判定服务的某些地方出现了问题，因此通过CAS操作将断路器设为开启状态，并记录此时的系统时间作为定时器初始时间，最后返回 true。

##### allowSingleTest 判断恢复计时器

``` 
public boolean allowSingleTest() {
    // 获取断路器定时器的初始时间
    long timeCircuitOpenedOrWasLastTested = circuitOpenedOrLastTestedTime.get();
    // 1) 断路器状态是 open
    // 2) 当前时间与定时器初始时间的差大于 circuitBreakerSleepWindowInMilliseconds(睡眠窗口时间，默认 5s)
    if (circuitOpen.get() && System.currentTimeMillis() > timeCircuitOpenedOrWasLastTested + properties.circuitBreakerSleepWindowInMilliseconds().get()) {
        // cas 将断路定时器初始时间设置为当前时间
        if (circuitOpenedOrLastTestedTime.compareAndSet(timeCircuitOpenedOrWasLastTested, System.currentTimeMillis())) {
            // 如果设置成功则返回 true
            return true;
        }
    }
    // 返回 false 代表有其他线程放行了请求
    return false;
}
```

这里的逻辑也很清晰， 当过了一个窗口时间后就试着放行一个请求

### 1.5.x 版本的滑动窗口



### 参考资料

- [Hystrix 1.5 滑动窗口实现总结](https://www.sczyh30.com/posts/%E9%AB%98%E5%8F%AF%E7%94%A8%E6%9E%B6%E6%9E%84/netflix-hystrix-1-5-sliding-window/)
- [Hystrix 源码解析 HystrixCircuitBreaker](http://www.iocoder.cn/Hystrix/circuit-breaker/)