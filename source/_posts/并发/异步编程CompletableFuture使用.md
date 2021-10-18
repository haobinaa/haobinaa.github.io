---
title: 异步编程CompletableFuture使用
date: 2020-12-14 21:52:15
tags:
categories: 并发
description: java 异步编程 CompletableFuture 使用
---
### CompletableFuture 介绍

`CompletableFuture` 是对 `Future` 的扩展， 提供了函数式编程的能力，简化了异步编程的复杂性。 

#### 函数式编程的几个接口

`CompletableFuture` 主要使用了函数式编程， 这里介绍几个函数式编程的接口

|  name   | type  | description | 
|  -------  | ----------  | -----------------  |
| Consumer  | Consumer<T> | 接收 T 对象, 无返回值 |
| Functional | Functional<T,R> | 接收 T 对象， 返回 R 对象 |
| Supplier | Supplier<T> | 无接收参数，返回 T 对象 |
| Predicate | Predicate<T> | 接收 T 对象，返回布尔值 |


#### Future 的局限性

Future 是 JDK5 新增的接口，用于描述一个异步的计算任务，但是使用中有很多局限:

1. Future 对结果的获取仍是阻塞的， 这样与异步编程的初衷相违背
2. 无法将多个异步的计算结果合并为一个
3. 无法等待 Future 集合的所有任务完成
4. 任务完成后触发动作


### CompletableFuture 的使用

这里只介绍 CompletableFuture 的使用，不涉及源码分析

#### 创建一个 CompletableFuture 任务

- runAsync: 不支持返回值
- supplyAsync: 支持返回值

```
// Runnable 构建任务
CompletableFuture<Void> rFuture = CompletableFuture.runAsync(() -> {
    System.out.println("runnable completableFuture");
}, pool);
// Supplier 构建任务
CompletableFuture<String> sFuture = CompletableFuture.supplyAsync(() -> {
    System.out.println("supply completableFuture");
    return "supply";
}, pool);
// 阻塞等待
System.out.println(rFuture.join());
// 阻塞等待
String name = sFuture.join();
System.out.println(name);
// 关闭线程池
pool.shutdown();
```

#### 串行执行任务

- thenRunAsync 任务完成运行 action，不关心上一个任务的结果，无返回值
- thenAcceptAsync 任务完成运行 action, 依赖上一个任务结果, 无返回值
- thenApplyAsync 任务完成运行 action, 依赖上一个任务结果, 有返回值   
- thenComposeAsync 任务完成运行 action, 依赖上一个任务结果，有返回值(与 thenApplyAsync 区别是该方法返回 CompletionStage 而非 U 对象)

``` 
CompletableFuture<Void> thenRunAsyncFuture = CompletableFuture
        .supplyAsync(() -> "RunAsync run supply", pool)
        // 不关心上一个任务的结果
        .thenRunAsync(() -> System.out.println("ok"), pool);
CompletableFuture<Void> thenAcceptAsyncFuture = CompletableFuture
        .supplyAsync(() -> "RunAccept run supply")
        // 依赖上一个任务返回结果
        .thenAcceptAsync(consumer -> System.out.println(consumer), pool);
CompletableFuture<String> thenApplyAsyncFuture = CompletableFuture
        .supplyAsync(() -> "ApplyAsync run supply")
        // 依赖上个任务的返回结果， 有返回值
        .thenApplyAsync((fn) -> {
            System.out.println(fn);
            return "success";
        }, pool);
CompletableFuture<String> thenComposeFuture = CompletableFuture
        .supplyAsync(() -> "Compose run supply")
        // 依赖上个任务的返回结果， 返回第一个异步任务
        .thenComposeAsync((result) -> CompletableFuture.supplyAsync(() -> {
            System.out.println(result);
            return result;
        }), pool);
pool.shutdown();
```

#### 并行执行任务
 
- runAfterBothAsync：两个 CompletableFuture 并行执行完， 然后执行 action，不依赖两个任务的结果，无返回值
- thenAcceptBothAsync： 两个 CompletableFuture 并行执行完，然后执行 action，依赖两个任务的结果，无返回值
- thenCombine：两个 CompletableFuture 并行执行完，然后执行 action， 依赖两个任务的结果， 有返回值

``` 
CompletableFuture<Void> runAfterBothAsyncFuture = CompletableFuture
        .supplyAsync(() -> {
            System.out.println("first task execution");
            return "ok";
        }, pool)
        .runAfterBothAsync(
                CompletableFuture.supplyAsync(() -> {
                    System.out.println("second task execution");
                    return "ok";
                }),
                // 不依赖前两个任务的执行结果， 无返回值
                () -> System.out.println("both ok"));

CompletableFuture<Void> thenAcceptBothAsyncFuture = CompletableFuture
        .supplyAsync(() -> {
            System.out.println("first accept task execution");
            return "first accept ok";
        }, pool)
        .thenAcceptBothAsync(CompletableFuture.supplyAsync(() -> {
                    System.out.println("second accept task execution");
                    return "second accept ok";
                }, pool),
                // 依赖前两个任务的执行结果， 无返回值
                (f, s) -> System.out.println(f + "，" + s), pool);

CompletableFuture<String> thenCombineFuture = CompletableFuture
        .supplyAsync(() -> {
            System.out.println("first combine task");
            return "first combine ok";
        }, pool)
        .thenCombine(CompletableFuture.supplyAsync(() -> {
                    System.out.println("second combine task execution");
                    return "second combine ok";
                }),
                // 依赖前两个任务的执行结果， 有返回值
                (f, s) -> {
                    System.out.println(f + "," + s);
                    return "";
                }
        );
pool.shutdown();
```

#### 两任务并行执行，先完成的触发 action

- runAfterEitherAsync: 前面两个任务先执行完的触发 action, 不依赖上个任务的返回结果， 无返回值   
- acceptEitherAsync: 前面两个任务谁先执行完触发 action， 依赖上个任务的返回结果，无返回值   
- applyToEitherAsync: 前面两个任务谁先执行完触发 action， 依赖上个任务的返回结果，有返回值

``` 
CompletableFuture<Void> runAfterEitherFuture = CompletableFuture
        .supplyAsync(() -> {
            try {
                Thread.sleep(100);
            } catch (Exception e) {
                System.out.println("exception");
            }
            System.out.println("first either task execution" + Thread.currentThread().getName());
            return "first either";
        }, pool)
        .runAfterEitherAsync(CompletableFuture.supplyAsync(() -> {
                    System.out.println("second either task execution" + Thread.currentThread().getName());
                    return "second either";
                }, pool),
                // 前面的任务谁先执行完谁触发， 不依赖上个任务的返回结果， 无返回值
                () -> System.out.println("ok" + Thread.currentThread().getName()), pool);

CompletableFuture<Void> acceptEitherFuture = CompletableFuture
        .supplyAsync(() -> {
            System.out.println("first accept task execution");
            return "first accept";
        }, pool)
        .acceptEitherAsync(CompletableFuture.supplyAsync(() -> {
                    System.out.println("second either task execution");
                    return "second accept";
                }, pool),
                // 前面两个任务谁先执行完谁触发， 依赖上个任务的返回结果， 无返回值
                result -> System.out.println(result));


CompletableFuture<String> applyToEitherFuture = CompletableFuture
        .supplyAsync(() -> {
            System.out.println("first apply task execution");
            return "first apply";
        }, pool)
        .applyToEitherAsync(CompletableFuture.supplyAsync(() -> {
                    System.out.println("second apply execution");
                    return "second apply";
                }, pool),
                result -> {
                    System.out.println(result);
                    return "ok";
                }, pool);
pool.shutdown();
```

#### 多任务的组合

- allOf: 调用 join 会阻塞直到所有任务运行完成， 没有返回值
- anyOf: 调用 join 返回最先完成任务的值
``` 
CompletableFuture cfA = CompletableFuture.supplyAsync(() -> "taskA");
CompletableFuture cfB = CompletableFuture.supplyAsync(() -> "taskB");
CompletableFuture cfC = CompletableFuture.supplyAsync(() -> "taskC");
CompletableFuture<Void> allFuture = CompletableFuture.allOf(cfA, cfB, cfC);
// join 阻塞到这里， 直到所有任务运行完成. allOf 是聚合多个 CompletableFuture 实例， 所以没有返回值
allFuture.join();

CompletableFuture<Object> anyFuture = CompletableFuture.anyOf(cfA, cfB, cfC);
// join 会返回最先完成的任务， 也是返回最先完成任务的结果
Object result = anyFuture.join();
```

#### 异常处理

- handle: 任务完成或触发异常就会执行，入参分别为 data(正常执行结果)和exception(异常执行结果)，一般情况下两个参数必有一个为 null
- exceptionally： 在任务后衔接可能发生的异常，等同于 try catch 写法
``` 
CompletableFuture<Integer> exceptionallyFuture = CompletableFuture
        .supplyAsync(() -> {
            if (true) {
                throw new RuntimeException("exceptionally");
            }
            return "first task";
        })
        .exceptionally(e -> {
            e.printStackTrace();
            return "first task handle";
        })
        .thenApply(data -> {
            System.out.println("second task:" + data);
            return 1;
        });
CompletableFuture<Integer> handleFuture = CompletableFuture
        .supplyAsync(() -> {
            System.out.println("first task");
            if (true) {
                throw new RuntimeException("handle");
            }
            return "handle";
        }, pool)
        .thenApply(data -> {
            if (true) {
                throw new RuntimeException("second handle");
            }
            return 200;
        })
        // data 和 e 分别代表正常执行结果和异常执行结果， 两个必有一个为 null
        .handle((data, e) -> {
            System.out.println(data);
            e.printStackTrace();
            return data;
        });
pool.shutdown();
```