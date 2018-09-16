---
title: Callable和Future
date: 2018-09-15 18:07:16
tags:
categories: 并发
---

### Callable与Future

创建线程的2种方式，一种是直接继承Thread，另外一种就是实现Runnable接口。这2种方式的缺陷就是：在执行完任务之后无法获取执行结果。

#### Callable
Callable也是一个接口，在它里面也只声明了一个方法，只不过这个方法叫做call()：
``` 
public interface Callable<V> {
    V call() throws Exception;
}
```
Callable一般情况下是配合ExecutorService来使用的，在ExecutorService接口中声明了若干个submit方法的重载版本：
``` 
<T> Future<T> submit(Callable<T> task);
<T> Future<T> submit(Runnable task, T result);
Future<?> submit(Runnable task);
```

#### Future

Future就是对于具体的Runnable或者Callable任务的执行结果进行取消、查询是否完成、获取结果。必要时可以通过get方法获取执行结果，该方法会阻塞直到任务返回结果。

Future也是一个接口，定义如下
``` 
public interface Future<V> {
    boolean cancel(boolean mayInterruptIfRunning);
    boolean isCancelled();
    boolean isDone();
    V get() throws InterruptedException, ExecutionException;
    V get(long timeout, TimeUnit unit)
        throws InterruptedException, ExecutionException, TimeoutException;
}
```

方法说明：
- cancel方法用来取消任务，如果取消任务成功则返回true，如果取消任务失败则返回false。参数mayInterruptIfRunning表示是否允许取消正在执行却没有执行完毕的任务，如果设置true，则表示可以取消正在执行过程中的任务。如果任务已经完成，则无论mayInterruptIfRunning为true还是false，此方法肯定返回false，即如果取消已经完成的任务会返回false；如果任务正在执行，若mayInterruptIfRunning设置为true，则返回true，若mayInterruptIfRunning设置为false，则返回false；如果任务还没有执行，则无论mayInterruptIfRunning为true还是false，肯定返回true
- isCancelled方法表示任务是否被取消成功，如果在任务正常完成前被取消成功，则返回 true
- isDone方法表示任务是否已经完成，若任务完成，则返回true
- get()方法用来获取执行结果，这个方法会产生阻塞，会一直等到任务执行完毕才返回
- get(long timeout, TimeUnit unit)用来获取执行结果，如果在指定时间内，还没获取到结果，就直接返回null

#### FutureTask
因为Future只是一个接口，所以是无法直接用来创建对象使用的，因此就有了FutureTask

``` 
public class FutureTask<V> implements RunnableFuture<V>

public interface RunnableFuture<V> extends Runnable, Future<V> {
    void run();
}
```

可以看出RunnableFuture继承了Runnable接口和Future接口，而FutureTask实现了RunnableFuture接口。所以它既可以作为Runnable被线程执行，又可以作为Future得到Callable的返回值

FutureTask提供了2个构造器：
``` 
public FutureTask(Callable<V> callable) {
}
public FutureTask(Runnable runnable, V result) {
}
```

### 配合线程池的使用
线程池的默认实现类`ThreadPoolExecutor`有以下几个方法:
``` 
  public Future<?> submit(Runnable task) {
        if (task == null) throw new NullPointerException();
        RunnableFuture<Void> ftask = newTaskFor(task, null);
        execute(ftask);
        return ftask;
  }
     public <T> Future<T> submit(Runnable task, T result) {
          if (task == null) throw new NullPointerException();
          RunnableFuture<T> ftask = newTaskFor(task, result);
          execute(ftask);
          return ftask;
  }
    public <T> Future<T> submit(Callable<T> task) {
          if (task == null) throw new NullPointerException();
          RunnableFuture<T> ftask = newTaskFor(task);
          execute(ftask);
          return ftask;
  }
```
这几个方法都返回一个Future对象，仔细查看发现，所有的方法最终都将runnable或者callable转变成一个RunnableFuture的对象，这个RunnableFutre的对象是一个同时继承了Runnable和Future
的接口。然后调用executor(runnable)方法，最后返回一个RunnableFuture对象。




### 参考资料
- [详解java中的Future、FutureTask原理及使用](https://blog.csdn.net/wei_lei/article/details/74262818)
- [java并发编程实战]