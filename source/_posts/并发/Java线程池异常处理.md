---
title: Java线程池异常处理
date: 2021-04-30 11:29:19
tags:
categories: 并发
---

### 线程池运行中线程异常后的情况

1. 当执行方式是 `execute` 时， 可以看到堆栈异常输出
2. 当执行方式是 `submit` 时， 不会有堆栈异常， 但是执行 `Future.get` 可以捕获到异常


### 原理探究

`ThreadPoolExecutor` 的 `execute` 方法不用过多分析， 就是线程池的执行流程， 这里看看 `submit`:
```
public <T> Future<T> submit(Callable<T> task) {
    if (task == null) throw new NullPointerException();
    RunnableFuture<T> ftask = newTaskFor(task);
    execute(ftask);
    return ftask;
}
protected <T> RunnableFuture<T> newTaskFor(Callable<T> callable) {
    return new FutureTask<T>(callable);
}
```
可以看到这里把提交的任务包装成了了一个 `FutureTask`, 回到线程池运行流程中的 `runWorker`中任务运行的一段代码:
``` 
try {
        beforeExecute(wt, task);
        Throwable thrown = null;
        try {
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
这里可以看到， 其实还是调用 task 本身的 run 方法， 如果 task 本身没有捕捉异常， 最终还是会抛出去的， 前面可以看到使用 `submit` 的方式是包装为了 futureTask, 看看他是怎么做的:
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

protected void setException(Throwable t) {
    if (UNSAFE.compareAndSwapInt(this, stateOffset, NEW, COMPLETING)) {
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
    throw new ExecutionException((Throwable)x);
}
```
可以看到如果 future 的状态是非正常的， 就会将异常包装成 `ExecutionException` 抛出， 这里也是 `submit` 可以通过 `future.get` 获取异常的原理

### invokeAll 的陷阱

这里再来看一段代码:
``` 
try {
    executorService.invokeAll(callableHashSet);
} catch (Exception e) {
    throw new RuntimeException(e);
}
```

这里如果 `callableHashSet` 这个任务集合中有抛出异常， 那么也无法感知到， 结合我们上面说的 futureTask 把所有异常都包装成了 `ExecutionException`, 来看看 invokeAll 执行任务的实现:
``` 
for (int i = 0, size = futures.size(); i < size; i++) {
    Future<T> f = futures.get(i);
    if (!f.isDone()) {
        try {
            f.get();
        } catch (CancellationException ignore) {
        } catch (ExecutionException ignore) {
        }
    }
}
```
可以看到`ExecutionException`被 ignore 了
