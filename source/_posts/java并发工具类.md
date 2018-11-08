---
title: java并发工具类
date: 2018-10-13 19:57:21
tags:
categories: 并发
---
### CountDownLatch
CountDownLatch也叫闭锁, 它允许一个或多个线程一直等待，直到其他线程的操作执行完后再执行。

#### 使用示例

CountDownLatch的构造函数接收一个int类型的参数作为计数器，如果你想等待***N个点***完成，这里就传入N。当调用CountDownLatch的countDown方法时，N就会减1，CountDownLatch的await方法会阻塞当前线程，直到N变成零。

> 备注：由于CountDownLatch方法可以用在任何地方，这里说的N个点，可以是N个线程，也可以是1个线程里的N个执行步骤。用在多个线程时，只需要把CountDownLatch的引用传递到线程里即可。

示例(所有工人工作完成后在打印完成)：
``` 
public class CountDownLanchTest {
    
    public static void main(String[] args) throws InterruptedException {
        CountDownLatch latch = new CountDownLatch(2);//两个工人的协作
        Worker worker1 = new Worker("zhang san", 5000, latch);
        Worker worker2 = new Worker("li si", 8000, latch);
        worker1.start();
        worker2.start();
        // 等待所有工人完成工作
        latch.await();
        System.out.println("all work done at " + LocalDateTime.now());
    }


    static class Worker extends Thread {

        String workerName;
        int workTime;
        CountDownLatch latch;

        public Worker(String workerName, int workTime, CountDownLatch latch) {
            this.workerName = workerName;
            this.workTime = workTime;
            this.latch = latch;
        }

        public void run() {
            System.out.println("Worker " + workerName + " do work begin at " + LocalDateTime.now());
            doWork();
            System.out.println("Worker " + workerName + " do work complete at " + LocalDateTime.now());
            latch.countDown();
        }

        private void doWork() {
            try {
                Thread.sleep(workTime);
            } catch (InterruptedException e) {
                e.printStackTrace();
            }
        }
    }

}
```

#### 实现原理
CountDownLatch内部会维护一个初始值为线程数量的计数器，主线程执行await方法，如果计数器大于0，则阻塞等待。当一个线程完成任务后，计数器值减1。当计数器为0时，表示所有的线程已经完成任务，等待的主线程被唤醒继续执行。

CountDownLatch实现主要基于java同步器AQS，其内部维护一个AQS子类，并重写了相关方法。
``` 
    private static final class Sync extends AbstractQueuedSynchronizer {
        private static final long serialVersionUID = 4982264981922014374L;

        Sync(int count) {
            setState(count);
        }
        // 获取同步状态
        int getCount() {
            return getState();
        }
        // 获取同步状态
        protected int tryAcquireShared(int acquires) {
            return (getState() == 0) ? 1 : -1;
        }
        // 释放同步状态
        protected boolean tryReleaseShared(int releases) {
            // Decrement count; signal when transition to zero
            for (;;) {
                int c = getState();
                if (c == 0)
                    return false;
                int nextc = c-1;
                if (compareAndSetState(c, nextc))
                    return nextc == 0;
            }
        }
    }
```
await流程如下：
![](/images/CountDownLatch_await.jpg)

await源码如下:
``` 
    public void await() throws InterruptedException {
        sync.acquireSharedInterruptibly(1);
    }
```
countDown流程和await类似，源码如下:
``` 
    public void countDown() {
        sync.releaseShared(1);
    }
```

>总结:CountDownLatch内部通过共享锁实现。在创建CountDownLatch实例时，需要传递一个int型的参数：count，该参数为计数器的初始值，也可以理解为该共享锁可以获取的总次数。当某个线程调用await()方法，程序首先判断count的值是否为0，如果不会0的话则会一直等待直到为0为止。当其他线程调用countDown()方法时，则执行释放共享锁状态，使count值 - 1。当在创建CountDownLatch时初始化的count参数，必须要有count线程调用countDown方法才会使计数器count等于0，锁才会释放，前面等待的线程才会继续运行。注意CountDownLatch不能回滚重置。

### CyclicBarrier

CyclicBarrier的字面意思是循环屏障。让一组线程到达一个屏障（或者是同步点）的时候被阻塞，直到最后一个线程到达屏障，屏障才会打开，所有的线程继续往下执行。

#### 使用示例
``` 
public class CyclicBarrierTest {
    static CyclicBarrier c = new CyclicBarrier(2);
    
    public static void main(String[] args) throws Exception {
        new Thread(new Runnable(){
            @Override
            public void run() {
                try {
                    Thread.sleep(3000);
                    System.out.println(2);
                    c.await();
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }
        }).start();
        System.out.println(1);
        c.await();
        System.out.println(3);
    }
}
```
#### 实现原理


### Semaphore
#### 使用示例
#### 实现原理


### Exchanger
#### 使用示例
#### 实现原理




### 参考资料
- [java并发工具类-CountDownLatch](https://juejin.im/post/5af3c17f51882567113b37d0)
- [死磕java并发-CountDownLatch](http://cmsblogs.com/?p=2253)
- [java中的并发工具类](https://www.jianshu.com/p/3cdeda81c517)