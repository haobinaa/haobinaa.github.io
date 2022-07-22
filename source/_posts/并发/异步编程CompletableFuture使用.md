---
title: 异步编程CompletableFuture使用
date: 2021-12-14 21:52:15
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

1. Future 对结果的获取仍是阻塞的(只能通过阻塞或轮询的方式获取结果)
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

### CompletableFuture 原理

CompletableFuture中包含两个字段：`result`和`stack`。
- result用于存储当前CF的结果
- stack（Completion）表示当前CF完成后需要触发的依赖动作（Dependency Actions），去触发依赖它的CF的计算，依赖动作可以有多个（表示有多个依赖它的CF），以栈（Treiber stack）的形式存储，stack表示栈顶元素。
> 备注: Treiber stack 是一种无锁并发栈， Treiber stack 首先是个单向链表，链表头部即栈顶元素，在入栈和出现过程中，需要对栈顶元素进行CAS控制，防止多线程情况下数据错乱。 FutureTask 也是这种实现
```
volatile Object result;       // Either the result or boxed AltResult
volatile Completion stack;    // Top of Treiber stack of dependent actions
```

依赖动作`Completion`基于类似观察者模式实现，他的子类如下:
![](/images/thread/completion.png)
- `UniCompletion`继承了 `Completion`，是一元依赖的基类，例如`thenApply`的实现类`UniApply`就继承自`UniCompletion`
- `BiCompletion`继承了`UniCompletion`，是二元依赖的基类，同时也是多元依赖的基类。例如`thenCombine`的实现类`BiRelay`就继承自`BiCompletion`。

#### CompletableFuture 中观察者模式(一元依赖)

一个一元依赖(依赖一个CF)的 CompletableFuture 例子
``` 
// 定义一个异步执行 cf1
CompletableFuture<String> cf1 = CompletableFuture.supplyAsync(() -> {
    System.out.println("cf1 execute");
    return "result1";
}, pool);
// 依赖 cf1 的执行结果
CompletableFuture<String> cf2 = cf1.thenApply(result1 -> {
    System.out.println("cf2 execute");
    return "result2";
});
```

1. `CompletableFuture` 中 `stack` 变量为 `Completion` 类型， 成员变量 `next` 串成责任链:
```
volatile Completion next;      // Treiber stack link
```

2. CompletableFuture 支持很多回调方法，例如`thenAccept、thenApply、exceptionally`等，这些方法接收一个函数类型的参数f，生成一个`Completion`类型的对象（即观察者），并将入参函数f赋值给Completion的成员变量fn，然后检查当前CF是否已处于完成状态（即result != null），如果已完成直接触发fn，否则将观察者Completion加入到CF的观察者链stack中，再次尝试触发，如果被观察者未执行完则其执行完毕之后通知触发。
   1. 观察者中的dep属性：指向其对应的 CompletableFuture(如下图)
   2. 观察者中的src属性：指向其依赖的 CompletableFuture
   3. 观察者Completion中的fn属性：用来存储具体的等待被回调的函数。这里需要注意的是不同的回调方法（thenAccept、thenApply、exceptionally等）接收的函数类型也不同

![](/images/thread/CompletableFutureThenApply.png)