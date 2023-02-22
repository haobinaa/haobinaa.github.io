---
title: Java线程池异常处理
date: 2021-04-30 11:29:19
tags:
categories: 并发
description: 线程池异常情况
---

### 线程池运行中线程异常后的情况

先来看两段代码:

```
executorService.execute(() -> {
    int i = 1 / 0;
    System.out.println("execute 执行");
});

====== 输出如下:
Exception in thread "pool-1-thread-1" java.lang.ArithmeticException: / by zero
```
``` 
executorService.submit(() -> {
    int i = 1 / 0;
    System.out.println("submit 执行");
});
======== 输出空

```

1. 当执行方式是 `execute` 时， 可以看到堆栈异常输出
2. 当执行方式是 `submit` 时， 不会有堆栈异常


#### 原理探究

`ThreadPoolExecutor` 的 `execute` 方法不用过多分析， 就是线程池的执行流程， 这里看看 `submit`:
```
public <T> Future<T> submit(Callable<T> task) {
    if (task == null) throw new NullPointerException();
    RunnableFuture<T> ftask = newTaskFor(task);
    execute(ftask);
    return ftask;
}
// 包装成 FutureTask
protected <T> RunnableFuture<T> newTaskFor(Callable<T> callable) {
    return new FutureTask<T>(callable);
}
```
可以看到这里把提交的任务包装成了一个 `FutureTask`。

回到线程池运行流程中的 `runWorker`中任务运行的一段代码:

``` 
try {
        beforeExecute(wt, task);
        Throwable thrown = null;
        try {
        // 实际逻辑还是 task 本身 run 方法
            task.run();
        } catch (RuntimeException x) {
            thrown = x; throw x;
        } catch (Error x) {
            thrown = x; throw x;
        } catch (Throwable x) {
            thrown = x; throw new Error(x);
        } finally {
            afterExecute(task, thrown);
        }
    } finally {
        task = null;
        w.completedTasks++;
        w.unlock();
    }
```

这里可以看到， 其实还是调用 task 本身的 run 方法， 如果 task 本身没有捕捉异常， 最终还是会抛出去的， 前面可以看到使用 `submit` 的方式是包装为了 futureTask, `run`方法逻辑:
```
// FutureTask#run 
public void run() {
    if (state != NEW ||
        !UNSAFE.compareAndSwapObject(this, runnerOffset,
                                     null, Thread.currentThread()))
        return;
    try {
        Callable<V> c = callable;
        if (c != null && state == NEW) {
            V result;
            boolean ran;
            try {
                result = c.call();
                ran = true;
            } catch (Throwable ex) {
            // 发生异常把异常信息存放起来
                result = null;
                ran = false;
                setException(ex);
            }
            if (ran)
                set(result);
        }
    } finally {
        // runner must be non-null until state is settled to
        // prevent concurrent calls to run()
        runner = null;
        // state must be re-read after nulling runner to prevent
        // leaked interrupts
        int s = state;
        if (s >= INTERRUPTING)
            handlePossibleCancellationInterrupt(s);
    }
}
// 存放异常信息
protected void setException(Throwable t) {
    if (UNSAFE.compareAndSwapInt(this, stateOffset, NEW, COMPLETING)) {
    // outcome 变量保存异常信息
        outcome = t;
        UNSAFE.putOrderedInt(this, stateOffset, EXCEPTIONAL); // final state
        finishCompletion();
    }
}
```
可以看到， `FutureTask` 把异常捕获了， 并未抛出， 只是通过 `setException` 将异常信息存在了 `FutureTask` 的 `outcome` 变量里面， 这里也就明白了为什么  `submit` 不会有异常

那么在看看 `future.get`:
``` 
public V get() throws InterruptedException, ExecutionException {
    int s = state;
    if (s <= COMPLETING)
        s = awaitDone(false, 0L);
    return report(s);
}

private V report(int s) throws ExecutionException {
    Object x = outcome;
    if (s == NORMAL)
        return (V)x;
    if (s >= CANCELLED)
        throw new CancellationException();
     // 走到这里也就是状态为 EXCEPTIONAL
    throw new ExecutionException((Throwable)x);
}
```
可以看到如果 future 的状态是非正常的， 就会将异常包装成 `ExecutionException` 抛出， 这里也是 `submit` 可以通过 `future.get` 获取异常的原理(实际上拿到的是包装完后的 `ExecutionException`)



从上面的内容我们知道了， submit 把线程池运行过程中产生的异常包装到了 FutureTask 的 outcome 变量里面， 这样我们就可以在线程池外包去捕获异常了， 代码如下:
``` 
try {
    Future<String> f = executorService.submit(() -> {
        int i = 1 / 0;
        System.out.println("submit 执行");
        return "success";
    });
    f.get();
} catch (Exception e) {
    System.out.println("submit future get exeception:" + e.getMessage());
}
===== 输出如下:
submit future get exeception:java.lang.ArithmeticException: / by zero
```

这样就能再线程池外感知到线程池内部发生的异常了(正常情况下， 子线程的异常父线程是无法感知到的)



### invokeAll 的陷阱

这里再来看一段代码:
``` 
List<Callable<String>> callableLists = new ArrayList<>();
callableLists.add(() -> {
    int i = 1/0;
    System.out.println("callable 执行");
   return "success";
});
try {
    executorService.invokeAll(callableLists);
} catch (InterruptedException e) {
    System.out.println("interrupted");
} catch (Exception e) {
    System.out.println("catch exception:" + e.getMessage());
}

=========== 输出空(无打印任何信息)
```

这里看到  `callableLists` 这个任务集合中有抛出异常， 那么也无法感知到。
结合我们上面说的 futureTask 把所有异常都包装成了 `ExecutionException`, 来看看 invokeAll 执行任务的实现:

``` 
public <T> List<Future<T>> invokeAll(Collection<? extends Callable<T>> tasks)
    throws InterruptedException {
    if (tasks == null)
        throw new NullPointerException();
    ArrayList<Future<T>> futures = new ArrayList<Future<T>>(tasks.size());
    boolean done = false;
    try {
    // 全部包装成 future， 然后通过 execute 执行， 这里和 submit 有点像
        for (Callable<T> t : tasks) {
            RunnableFuture<T> f = newTaskFor(t);
            futures.add(f);
            execute(f);
        }
        // 拿到每个 future 的执行结果(也可以是等待每个 future 执行结束)
        for (int i = 0, size = futures.size(); i < size; i++) {
            Future<T> f = futures.get(i);
            if (!f.isDone()) {
                try {
                    f.get();
                } catch (CancellationException ignore) {
                // 这里 catch 到了 ExecutionException， 什么也没处理
                } catch (ExecutionException ignore) {
                }
            }
        }
        done = true;
        return futures;
    } finally {
        if (!done)
            for (int i = 0, size = futures.size(); i < size; i++)
                futures.get(i).cancel(true);
    }
}
```
可以看到`ExecutionException`被 catch 到后什么也没处理(ignore 了)


### 感知子线程内部异常方式

#### 原子变量传递

``` 
AtomicBoolean exception = new AtomicBoolean(false);

Callable<Void> qwbkt = () -> {
    try {
        qwbktSections.add(qwbktManager.query(context, null));
    } catch (Throwable t) {
        context.getLogger().error("qwbkt exception:", t);
        exception.set(true);
    }
    return null;
};

// 查看原子变量是否状态被设置
if (exception.get()) {
    throw new RuntimeException("queryError");
}
```

#### 通过 code 传递

``` 
Callable<String> task = new Callable<String>() {
    @Override
    public String call() throws Exception {
        Result<String> result = new Result<>();
        try {
            // 将结果包裹起来， 设置到 code 中
        } catch (Exception e) {
            result.setCode("500");
        }
        return result;
    }
};
```

#### future.get

最常见的还是通过 `future.get`

``` 
try {
    String s = future.get();
} catch (InterruptedException e) {
    //..
} catch (ExecutionException e) {
    //todo: 这里处理线程内部异常
}
```