---
title: Callable和Future
date: 2018-09-05 18:07:16
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

#### submit原理
FutureTask实现了RunnableFuture的接口，既然我们知道最终返回的是一个FutureTask对象ftask，而且我们可以通过ftask.get()可以的来得到execute(task)的返回值。

Runnable的run()是没有返回值的，所以当es.submit()的参数只有一个Runnable对象的时候，通过ftask.get()得到的也是一个null值，当参数还有一个result的时候，就返回这个result；如果参数是一个Callable的对象的时候，Callable的call()是有返回值的，同时这个call()方法会在转换的Runable对象ftask的run()方法中被调用，然后将它的返回值赋值给一个全局变量，最后在ftask的get()方法中得到这个值。

#### 将Runnable转为FutureTask的过程
``` 
protected <T> RunnableFuture<T> newTaskFor(Runnable runnable, T value) {
        return new FutureTask<T>(runnable, value);
}


public FutureTask(Runnable runnable, V result) {
    this.callable = Executors.callable(runnable, result);
    this.state = NEW;       // ensure visibility of callable
}
// -------------- Executors.callable方法  
public static <T> Callable<T> callable(Runnable task, T result) {
      if (task == null)
          throw new NullPointerException();
      return new RunnableAdapter<T>(task, result);
}

// -------------- Executors内部类RunableAdapter
static final class RunnableAdapter<T> implements Callable<T> {
        final Runnable task;
        final T result;
        RunnableAdapter(Runnable task, T result) {
            this.task = task;
            this.result = result;
        }
        public T call() {
            task.run();
            return result;
        }
}

```

#### 将Callable转为FutureTask的过程
``` 
protected <T> RunnableFuture<T> newTaskFor(Callable<T> callable) {
        return new FutureTask<T>(callable);
}

public FutureTask(Callable<V> callable) {
    if (callable == null)
        throw new NullPointerException();
    this.callable = callable;
    this.state = NEW;       // ensure visibility of callable
}
```

#### execute(runnable)的执行过程
ThreadPoolExecutor中executor(runnable) :
``` 
 public void execute(Runnable command) {
        if (command == null)
            throw new NullPointerException();
        // ctl是一个AtomicInteger的变量，标识线程池的状态
        int c = ctl.get();
        if (workerCountOf(c) < corePoolSize) {
            if (addWorker(command, true))
                return;
            c = ctl.get();
        }
        if (isRunning(c) && workQueue.offer(command)) {
            int recheck = ctl.get();
            if (! isRunning(recheck) && remove(command))
                reject(command);
            else if (workerCountOf(recheck) == 0)
                addWorker(null, false);
        }
        else if (!addWorker(command, false))
            reject(command);
}
```

如上，过程为：
1. 如果当前线程池的的线程小于核心线程的数量的时候，就会调用addWorker检查运行状态和正在运行的线程数量，通过返回false来防止错误地添加线程，然后执行当前任务。
2. 否则当前线程池的的线程大于核心线程的数量的时候，我们仍然需要先判断是否需要添加一个新的线程来执行这个任务，因为可能已经存在的线程此刻任务执行完毕处于空闲状态，这个时候可以直接复用。否则创建一个新的线程来执行此任务。
3. 如果不能再添加新的任务，就拒绝。执行execute(runnable)最终会回调runnable的run()方法，也就是FutureTask的对象ftask的run()方法，如下：
``` 
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

```
通过执行result = c.call()拿到返回值，然后set(result) ，因此get()方法获得的值正是这个result。

可以看到之前execute中，对工作线程`worker`类的处理，类关系如下：

![](http://odu0tqqax.bkt.clouddn.com/thread_worker.png)

worker类的关键成员：
``` 
final Thread thread;  // Worker类的工作线程

 Runnable firstTask; //我们提交的任务，可能被立刻执行，也可能被放到队列里面
```

### 参考资料
- [详解java中的Future、FutureTask原理及使用](https://blog.csdn.net/wei_lei/article/details/74262818)
- [java并发编程实战]