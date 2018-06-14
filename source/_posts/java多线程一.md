---
title: java多线程(基础)
date: 2017-11-19 11:31:32
tags: java并发
categories: java并发
---

#### 线程状态
线程共以下五种状态：
- 新建（New） : 线程被对象创建后，就进入了新建状态。`Thread thread = new Thread()`
- 就绪：(Runnable): 可执行状态，线程对象被创建后，其他线程调用了该对象的start方法，就会让该线程对象进入就绪态，随时可能被CPU调度执行。`thread.start()`
- 运行(Running): 线程获取CPU的权限执行，运行状态只能由就绪状态转入
- 阻塞(Blocked): 阻塞状态是线程由某种原因放弃CPU使用权，暂时停止运行。直到线程进入就绪状态，才有机会转到运行状态。阻塞分三种：
    - 等待阻塞： 通过调用线程的wait()方法，让线程等待某工作的完成。
    - 同步阻塞： 线程在获取synchronized同步锁失败(因为锁被其它线程所占用)，它会进入同步阻塞状态。
    - 其他阻塞： 通过调用线程的sleep()或join()或发出了I/O请求时，线程会进入到阻塞状态。当sleep()状态超时、join()等待线程终止或者超时、或者I/O处理完毕时，线程重新转入就绪状态。
- 死亡状态（Dead）：线程执行完了，或因异常退出了Run方法

#### 多线程的实现
在java中Thread和Runnable都是实现多线程的方式。Thread是一个类，本身实现了Runnable接口，Runnable是一个接口，让类有了更好的扩展性。此外Runnable还可以用于“资源的共享”。即，多个线程都是基于某一个Runnable对象建立的，它们会共享Runnable对象上的资源。通常，建议通过“Runnable”实现多线程！

##### 通过Thread来实现多线程
``` 
class MyThread extends Thread{  
    private int ticket=10;  
    public void run(){
        for(int i=0;i<20;i++){ 
            if(this.ticket>0){
                System.out.println(this.getName()+" 卖票：ticket"+this.ticket--);
            }
        }
    } 
};

public class ThreadTest {  
    public static void main(String[] args) {  
        // 启动3个线程t1,t2,t3；每个线程各卖10张票！
        MyThread t1=new MyThread();
        MyThread t2=new MyThread();
        MyThread t3=new MyThread();
        t1.start();
        t2.start();
        t3.start();
    }  
}
```
上面的例子MyThread是继承于Thread，每个MyThread都会卖出十张票，主线程创建了三个Mythread子线程，每个子线程各卖出十张票

##### 通过Runnable来实现多线程
``` 
class MyThread implements Runnable{  
    private int ticket=10;  
    public void run(){
        for(int i=0;i<20;i++){ 
            if(this.ticket>0){
                System.out.println(Thread.currentThread().getName()+" 卖票：ticket"+this.ticket--);
            }
        }
    } 
}; 

public class RunnableTest {  
    public static void main(String[] args) {  
        MyThread mt=new MyThread();

        // 启动3个线程t1,t2,t3(它们共用一个Runnable对象)，这3个线程一共卖10张票！
        Thread t1=new Thread(mt);
        Thread t2=new Thread(mt);
        Thread t3=new Thread(mt);
        t1.start();
        t2.start();
        t3.start();
    }  
}
```
和上面“MyThread继承于Thread”不同；这里的MyThread实现了Thread接口。    
 主线程main创建并启动3个子线程，而且这3个子线程都是基于“mt这个Runnable对象”而创建的。运行结果是这3个子线程一共卖出了10张票。这说明它们是共享了MyThread接口的。
 
 
#### Thread中的start和run
- start()是启动一个新线程，新线程会执行相应的run()方法。start()不能被重复调用。
- run()就和普通的成员方法一样，可以被重复调用。单独调用run()的话，会在当前线程中执行run()，而并不会启动新线程
``` 
public class RunAndStartThread {
    public static void main(String[] args) {
        //主线程id
        System.out.println("当前线程ID => " + Thread.currentThread().getId());

        SRThread t1 = new SRThread("t1");
        //t1线程id
        t1.start();
        SRThread t2 = new SRThread("t2");
        // 可以看到调用run方法的线程id还是主线程id
        t2.run();
    }
}
class SRThread extends Thread {
    private String name;

    public SRThread(String name) {
        this.name = name;
    }

    @Override
    public void run() {
        System.out.println("name:" + name +", 线程ID => " + Thread.currentThread().getId());
    }
}
```
上述例子可以看到执行run 方法的线程还是主线程
#### synchronize 
##### synchronize原理
>在java中，每一个对象有且仅有一个同步锁。这也意味着，同步锁是依赖于对象而存在

当我们调用某对象的synchronized方法时，就获取了该对象的同步锁。例如，synchronized(obj)就获取了“obj这个对象”的同步锁。
不同线程对同步锁的访问是互斥的。也就是说，某时间点，对象的同步锁只能被一个线程获取到！通过同步锁，我们就能在多线程中，实现对“对象/方法”的互斥访问。 例如，现在有两个线程A和线程B，它们都会访问“对象obj的同步锁”。假设，在某一时刻，线程A获取到“obj的同步锁”并在执行一些操作；而此时，线程B也企图获取“obj的同步锁” —— 线程B会获取失败，它必须等待，直到线程A释放了“该对象的同步锁”之后线程B才能获取到“obj的同步锁”从而才可以运行。
##### synchronize基本规则
- 第一条: 当一个线程访问“某对象”的“synchronized方法”或者“synchronized代码块”时，其他线程对“该对象”的该“synchronized方法”或者“synchronized代码块”的访问将被阻塞。
``` 
class MyRunnable implements Runnable {
    @Override
    public void run() {
        synchronized (this) {
            try {
                for (int i = 0; i < 5; i++) {
                   Thread.sleep(100);
                    System.out.println(Thread.currentThread().getName() + " loop " + i);
                }
            } catch (InterruptedException e) {

            }
        }
    }
}
class OtherThread extends Thread {

    public OtherThread(String name) {
        super(name);
    }

    public void run() {
        synchronized (this) {
            try {
                for (int i = 0; i < 5; i++) {
                    Thread.sleep(100);
                    System.out.println(Thread.currentThread().getName() + " loop " + i);
                }
            }catch (InterruptedException e) {

            }

        }
    }
}

public class SynchronizeBlock {
    public static void main(String[] args) {
        Runnable demo = new MyRunnable();
        // 两个线程访问demo对象的synchronize代码块，会阻塞，等待其中一个执行完
        Thread r1 = new Thread(demo , "r1");
        Thread r2 = new Thread(demo , "r2");
        r1.start();
        r2.start();
        // 两个不同的对象，不会互相阻塞synchronize代码块
        Thread t1 = new OtherThread("t1");
        Thread t2 = new OtherThread("t2");
        t1.start();
        t2.start();
    }
}
```
- 第二条: 当一个线程访问“某对象”的“synchronized方法”或者“synchronized代码块”时，其他线程仍然可以访问“该对象”的非同步代码块。
``` 
package org.javacore.thread.synchronizeBlock;

/**
 * @Author: HaoBin
 * @Date 2017/11/20 15:06
 * 当一个线程访问“某对象”的“synchronized方法”或者“synchronized代码块”时，其他线程仍然可以访问“该对象”的非同步代码块。
 */

class Count {
    public void synMethod() {
        synchronized (this) {
            try {
                for(int i = 0; i < 5; i++) {
                    Thread.sleep(100);
                    System.out.println(Thread.currentThread().getName() + " synMethod loop " + i);
                }
            } catch (InterruptedException e) {

            }
        }
    }

    public void noSynMethod() {
        try {
            for(int i = 0; i < 5; i++) {
                Thread.sleep(100);
                System.out.println(Thread.currentThread().getName() + " nonSynMethod loop " + i);
            }
        } catch (InterruptedException e) {

        }
    }
}
public class NonSynchronize {
    public static void main(String[] args) {
        final Count count = new Count();

        Thread t1 = new Thread(new Runnable() {
            @Override
            public void run() {
                count.synMethod();
            }
        }, "t1");

        Thread t2 = new Thread(new Runnable() {
            @Override
            public void run() {
                count.noSynMethod();
            }
        }, "t2");
        
        t1.start();
        // 访问同一个对象的非synchronize代码块不会阻塞
        t2.start();
    }
}

```
- 第三条: 当一个线程访问“某对象”的“synchronized方法”或者“synchronized代码块”时，其他线程对“该对象”的其他的“synchronized方法”或者“synchronized代码块”的访问将被阻塞。
``` 
class CountT {
    public void synMethod() {
        synchronized (this) {
            try {
                for (int i = 0; i < 5; i++) {
                    Thread.sleep(100);
                    System.out.println(Thread.currentThread().getName() + " synMethod loop " + i);
                }
            } catch (InterruptedException e) {

            }
        }
    }

    public void noSynMethod() {
        synchronized (this) {
            try {
                for (int i = 0; i < 5; i++) {
                    Thread.sleep(100);
                    System.out.println(Thread.currentThread().getName() + " nonSynMethod loop " + i);
                }
            } catch (InterruptedException e) {

            }
        }
    }
}

public class SynchronizeThread {
    public static void main(String[] args) {
        final CountT count = new CountT();

        Thread t1 = new Thread(new Runnable() {
            @Override
            public void run() {
                count.synMethod();
            }
        }, "t1");

        Thread t2 = new Thread(new Runnable() {
            @Override
            public void run() {
                count.noSynMethod();
            }
        }, "t2");

        t1.start();
        // cout对象的synchronize代码块被访问，其他synchronize代码块被另外线程访问时，也会阻塞
        t2.start();
    }
}
```
#### synchronize方法和synchronize代码块
“synchronized方法”是用synchronized修饰方法，而 “synchronized代码块”则是用synchronized修饰代码块
- synchronize方法
``` 
public synchronized void foo1() {
    System.out.println("synchronized methoed");
}
```
- synchronize代码块
``` 
public void foo2() {
    synchronized (this) {
        System.out.println("synchronized methoed");
    }
}
```

#### 实例锁和全局锁
- 实例锁：锁在某一个实例对象上。如果该类是单例，那么该锁也具有全局锁的概念。实例锁对应的就是synchronized关键字。
- 全局锁：该锁针对的是类，无论实例多少个对象，那么线程都共享该锁。全局锁对应的就是static synchronized（或者是锁在该类的class或者classloader对象上）

现有如下类
``` 
pulbic class Something {
    public synchronized void isSyncA(){}
    public synchronized void isSyncB(){}
    public static synchronized void cSyncA(){}
    public static synchronized void cSyncB(){}
}
``` 
假设Something有两个实例x和y
1. x.isSyncA和y.isSyncB。不能同时被访问，因为isSyncA和isSyncB都是一个对象(x)的同步锁
2. y.isSyncA和x.isSyncA。可以被同时访问
3. x.cSyncA和y.cSyncB。不能同时被访问，因为cSyncA和cSyncB都是static类型，都是关联到class Something上面的，属于全局锁
4. x.isSyncA和Something.cSyncA。 可以同时访问，对象锁和类锁不冲突