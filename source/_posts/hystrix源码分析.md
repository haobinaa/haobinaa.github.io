---
title: hystrix源码分析
date: 2020-06-21 17:51:29
tags: hystrix
categories: 架构
---
### 源码分析

#### 执行命令分析

执行 Hystrix 命令需要集成 `HystrixCommand`， 有四种调用方式：

- `toObservable`: 返回 Observable 对象
- `observe`: 在调用 `toObservable` 的基础上， 向 `Observable` 上注册 `rx.subjects.ReplaySubject` （这些都是 rxJava 的概念）
- `queue`: 在调用 `toObservable` 的基础上:
    1. 调用 `Observable.toBlocking`, 将 Observable 转换成阻塞的 `rx.observables.BlockingObservable`
    2. 调用 `BlockingObservable.toFuture`， 返回 run 方法的执行结果的 Future 对象
- `execute`: 调用 `queue` 的基础上，调用 `Future.get`，同步返回 run 的执行结果

#### toObservable 入口

