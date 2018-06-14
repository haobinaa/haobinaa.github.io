---
title: java多线程(状态切换)
date: 2017-11-20 16:08:41
tags: java多线程
categories: java并发
---
#### Object中的等待/唤醒
在Object.java中，定义了wait(), notify()和notifyAll()等接口。wait()的作用是让当前线程进入等待状态，同时，wait()也会让当前线程释放它所持有的锁。而notify()和notifyAll()的作用，则是唤醒当前对象上的等待线程；notify()是唤醒单个线程，而notifyAll()是唤醒所有的线程。
- notify： 唤醒此对象监视器上等待的单线程
- notifyAll： 唤醒此对象监视器上等待的所有线程
- wait： 让当前线程处于“等待(阻塞)状态”，“直到其他线程调用此对象的 notify() 方法或 notifyAll() 方法”，当前线程被唤醒(进入“就绪状态”)
- wait(long timeout): 让当前线程处于“等待(阻塞)状态”，“直到其他线程调用此对象的 notify() 方法或 notifyAll() 方法，或者超过指定的时间量”，当前线程被唤醒(进入就绪状态)
- wait(long timeout, int nanos)

##### wait和notify的使用
``` 
class ThreadA extends Thread {
    public ThreadA(String name) {
        super(name);
    }

    public void run() {
       synchronized (this) {
           System.out.println(Thread.currentThread().getName() + " call notify()");
           // 唤醒当前wait的线程
           notify();
       }
    }
}
public class WaitAndNotify {
    public static void main(String[] args) {

        ThreadA t1= new ThreadA("t1");

        synchronized (t1) {
            try {
                System.out.println(Thread.currentThread().getName() + " start t1");
                t1.start();

                System.out.println(Thread.currentThread().getName() + " wait()");
                t1.wait();

                System.out.println(Thread.currentThread().getName() + " continue");
            } catch (InterruptedException e) {

            }
        }
    }
}
```
1. main线程通过new Thread建立了线程t1，随后通过synchronize获取了t1对象的同步锁，然后调用t1.start启动t1
2. 主线程执行完t1.wait后释放t1的锁，进入等待阻塞状态，等待t1对象的notify或notifyAll将他唤醒
3. t1运行完后通过notify唤醒“当前对象等待的线程”也就是主线程
4. t1运行完毕后释放当前对象的锁，主线程获取t1对象的锁接着运行

上述t1.wait让主线程并非t1线程等待阻塞，jdk中对wait的描述:
>引起“当前线程”等待，直到另外一个线程调用notify()或notifyAll()唤醒该线程。换句话说，这个方法和wait(0)的效果一样！(补充，对于wait(long millis)方法，当millis为0时，表示无限等待，直到被notify()或notifyAll()唤醒)。
 “当前线程”在调用wait()时，必须拥有该对象的同步锁。该线程调用wait()之后，会释放该锁；然后一直等待直到“其它线程”调用对象的同步锁的notify()或notifyAll()方法。然后，该线程继续等待直到它重新获取“该对象的同步锁”，然后就可以接着运行。
 
 ##### wait(long timeout)和notify的使用
``` 
class ThreadB extends Thread{

    public ThreadB(String name) {
        super(name);
    }

    public void run() {
        System.out.println(Thread.currentThread().getName() + " run ");
        // 死循环，不断运行。
        while(true)
            ;
    }
}
public class NotifyWaitLong {
    public static void main(String[] args) {

        ThreadB t1 = new ThreadB("t1");

        synchronized(t1) {
            try {
                // 启动“线程t1”
                System.out.println(Thread.currentThread().getName() + " start t1");
                t1.start();

                // 主线程等待t1通过notify()唤醒 或 notifyAll()唤醒，或超过3000ms延时；然后才被唤醒。
                System.out.println(Thread.currentThread().getName() + " call wait ");
                t1.wait(3000);
                // 三秒后main线程自动唤醒
                System.out.println(Thread.currentThread().getName() + " continue");
            } catch (InterruptedException e) {
                e.printStackTrace();
            }
        }
    }
}
```

#### wait、notify等方法定义在Object中的原因
Object中的wait(), notify()等函数，和synchronized一样，会对“对象的同步锁”进行操作

wait()会使“当前线程”等待，因为线程进入等待状态，所以线程应该释放它锁持有的“同步锁”，否则其它线程获取不到该“同步锁”而无法运行！
OK，线程调用wait()之后，会释放它锁持有的“同步锁”；而且，根据前面的介绍，我们知道：等待线程可以被notify()或notifyAll()唤醒。现在，请思考一个问题：notify()是依据什么唤醒等待线程的？或者说，wait()等待线程和notify()之间是通过什么关联起来的？答案是：依据“对象的同步锁”。

负责唤醒等待线程的那个线程(我们称为“唤醒线程”)，它只有在获取“该对象的同步锁”(这里的同步锁必须和等待线程的同步锁是同一个)，并且调用notify()或notifyAll()方法之后，才能唤醒等待线程。虽然，等待线程被唤醒；但是，它不能立刻执行，因为唤醒线程还持有“该对象的同步锁”。必须等到唤醒线程释放了“对象的同步锁”之后，等待线程才能获取到“对象的同步锁”进而继续运行。

总之，notify(), wait()依赖于“同步锁”，而“同步锁”是对象锁持有，并且每个对象有且仅有一个！这就是为什么notify(), wait()等函数定义在Object类，而不是Thread类中的原因。

#### 线程让步（yield）
yield()的作用是让步。它能让当前线程由“运行状态”进入到“就绪状态”，从而让其它具有相同优先级的等待线程获取执行权；但是，并不能保证在当前线程调用yield()之后，其它具有相同优先级的线程就一定能获得执行权；也有可能是当前线程又进入到“运行状态”继续运行！

##### yield与wait的比较
1. wait()是让线程由“运行状态”进入到“等待(阻塞)状态”，而不yield()是让线程由“运行状态”进入到“就绪状态”
2. wait()是会线程释放它所持有对象的同步锁，而yield()方法不会释放锁。

#### 线程休眠
sleep() 的作用是让当前线程休眠，即当前线程会从“运行状态”进入到“休眠(阻塞)状态”。sleep()会指定休眠时间，线程休眠的时间会大于/等于该休眠时间；在线程重新被唤醒时，它会由“阻塞状态”变成“就绪状态”，从而等待cpu的调度执行。 
##### sleep和wait的比较     
我们知道，wait()的作用是让当前线程由“运行状态”进入“等待(阻塞)状态”的同时，也会释放同步锁。而sleep()的作用是也是让当前线程由“运行状态”进入到“休眠(阻塞)状态”。
但是，wait()会释放对象的同步锁，而sleep()则不会释放锁。
``` 
public class SleepAndWait {
    private static Object obj = new Object();

    static class ThreadA extends Thread {
        public ThreadA(String name) {
            super(name);
        }

        public void run() {
            synchronized (obj) {
                try {
                    for (int i = 0; i < 10; i++) {
                        System.out.printf("%s: %d\n", this.getName(), i);
                        // 能被4整除就休眠2秒
                        if (i % 4 == 0) {
                            Thread.sleep(2000);
                        }
                    }
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            }
        }
    }

    public static void main(String[] args) {
        ThreadA t1 = new ThreadA("t1");
        ThreadA t2 = new ThreadA("t2");
        // sleep是不会释放对象的锁,sleep的线程还会持有obj的锁
        t1.start();
        t2.start();
    }
}
```
