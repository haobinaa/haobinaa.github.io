---
title: java多线程(线程终止和守护线程)
date: 2017-11-21 11:50:27
tags: java多线程
categories: java并发
---
#### join
join() 的作用：让“主线程”等待“子线程”结束之后才能继续运行  
join源码分析:
``` 
public final void join() throws InterruptedException {
    join(0);
}

public final synchronized void join(long millis)
throws InterruptedException {
    long base = System.currentTimeMillis();
    long now = 0;

    if (millis < 0) {
        throw new IllegalArgumentException("timeout value is negative");
    }
    
    // 如果millis是0，执行join
    if (millis == 0) {
        // 如果子线程是alive状态，主线程执行wait阻塞
        while (isAlive()) {
            wait(0);
        }
    } else {
    // 如果millis不是0，则主线程wait()，时间为delay
        while (isAlive()) {
            long delay = millis - now;
            if (delay <= 0) {
                break;
            }
            wait(delay);
            now = System.currentTimeMillis() - base;
        }
    }
}
```

#### interrupt
interrupt的JDK描述：
>interrupt()的作用是中断本线程。
 本线程中断自己是被允许的；其它线程调用本线程的interrupt()方法时，会通过checkAccess()检查权限。这有可能抛出SecurityException异常。
 如果本线程是处于阻塞状态：调用线程的wait(), wait(long)或wait(long, int)会让它进入等待(阻塞)状态，或者调用线程的join(), join(long), join(long, int), sleep(long), sleep(long, int)也会让它进入阻塞状态。若线程在阻塞状态时，调用了它的interrupt()方法，那么它的“中断状态”会被清除并且会收到一个InterruptedException异常。例如，线程通过wait()进入阻塞状态，此时通过interrupt()中断该线程；调用interrupt()会立即将线程的中断标记设为“true”，但是由于线程处于阻塞状态，所以该“中断标记”会立即被清除为“false”，同时，会产生一个InterruptedException的异常。
 如果线程被阻塞在一个Selector选择器中，那么通过interrupt()中断它时；线程的中断标记会被设置为true，并且它会立即从选择操作中返回。
 如果不属于前面所说的情况，那么通过interrupt()中断线程时，它的中断标记会被设置为“true”。
 中断一个“已终止的线程”不会产生任何操作。
 
 #### 终止线程的方式
 ##### 终止处于阻塞状态的线程
 通常我们是通过中断方式终止处于阻塞状态的线程  
 当线程由于被调用了sleep(), wait(), join()等方法而进入阻塞状态；若此时调用线程的interrupt()将线程的中断标记设为true。由于处于阻塞状态，中断标记会被清除，同时产生一个InterruptedException异常。将InterruptedException放在适当的为止就能终止线程，形式如下：
 ``` 
 public void run() {
     try {
         while (true) {
             // 执行任务...
         }
     } catch (InterruptedException ie) {  
         // 由于产生InterruptedException异常，退出while(true)循环，线程终止！
     }
 }
 ```
 在while(true)中不断的执行任务，当线程处于阻塞状态时，调用线程的interrupt()产生InterruptedException中断。中断的捕获在while(true)之外，这样就退出了while(true)循环！  
 注意：对InterruptedException的捕获务一般放在while(true)循环体的外面，这样，在产生异常时就退出了while(true)循环。否则，InterruptedException在while(true)循环体之内，就需要额外的添加退出处理。形式如下：
 ``` 
 public void run() {
     while (true) {
         try {
             // 执行任务...
         } catch (InterruptedException ie) {  
             // InterruptedException在while(true)循环体内。
             // 当线程产生了InterruptedException异常时，while(true)仍能继续运行！需要手动退出
             break;
         }
     }
 }
 ```
 上面的InterruptedException异常的捕获在whle(true)之内。当产生InterruptedException异常时，被catch处理之外，仍然在while(true)循环体内；要退出while(true)循环体，需要额外的执行退出while(true)的操作。
 
 ##### 终止运行状态的线程
 1.通过终端标记终止
 ``` 
 public void run() {
     while (!isInterrupted()) {
         // 执行任务...
     }
 }
 ```
 isInterrupted()是判断线程的中断标记是不是为true。当线程处于运行状态，并且我们需要终止它时；可以调用线程的interrupt()方法，使用线程的中断标记为true，即isInterrupted()会返回true。此时，就会退出while循环。     
 注意：interrupt()并不会终止处于“运行状态”的线程！它会将线程的中断标记设为true。
 
 2.通过额外添加标记
 ``` 
 private volatile boolean flag= true;
 protected void stopTask() {
     flag = false;
 }
 
 @Override
 public void run() {
     while (flag) {
         // 执行任务...
     }
 }
 ```
 线程中有一个flag标记，它的默认值是true；并且我们提供stopTask()来设置flag标记。当我们需要终止该线程时，调用该线程的stopTask()方法就可以让线程退出while循环。  
 注意：将flag定义为volatile类型，是为了保证flag的可见性。即其它线程通过stopTask()修改了flag之后，本线程能看到修改后的flag的值。
 
 #### 线程优先级
 
 ##### 优先级和守护线程介绍
 java 中的线程优先级的范围是1～10，默认的优先级是5。“高优先级线程”会优先于“低优先级线程”执行
 
 java 中有两种线程：用户线程和守护线程。可以通过isDaemon()方法来区别它们：如果返回false，则说明该线程是“用户线程”；否则就是“守护线程”。  
 用户线程一般用户执行用户级任务，而守护线程也就是“后台线程”，一般用来执行后台任务。需要注意的是：Java虚拟机在“用户线程”都结束后会后退出。
 
 JDK中描述：
 >每个线程都有一个优先级。“高优先级线程”会优先于“低优先级线程”执行。每个线程都可以被标记为一个守护进程或非守护进程。在一些运行的主线程中创建新的子线程时，子线程的优先级被设置为等于“创建它的主线程的优先级”，当且仅当“创建它的主线程是守护线程”时“子线程才会是守护线程”(理解为守护线程创建的线程也是守护线程)。  
  当Java虚拟机启动时，通常有一个单一的非守护线程（该线程通过是通过main()方法启动）。JVM会一直运行直到下面的任意一个条件发生，JVM就会终止运行：  
  (01) 调用了exit()方法，并且exit()有权限被正常执行。  
  (02) 所有的“非守护线程”都死了(即JVM中仅仅只有“守护线程”)。
  每一个线程都被标记为“守护线程”或“用户线程”。当只有守护线程运行时，JVM会自动退出。
  
  ##### 守护线程
  ``` 
  class MyThread extends Thread{  
      public MyThread(String name) {
          super(name);
      }
  
      public void run(){
          try {
              for (int i=0; i<5; i++) {
                  Thread.sleep(3);
                  System.out.println(this.getName() +"(isDaemon="+this.isDaemon()+ ")" +", loop "+i);
              }
          } catch (InterruptedException e) {
          }
      } 
  }; 
  
  class MyDaemon extends Thread{  
      public MyDaemon(String name) {
          super(name);
      }
  
      public void run(){
          try {
              for (int i=0; i<10000; i++) {
                  Thread.sleep(1);
                  System.out.println(this.getName() +"(isDaemon="+this.isDaemon()+ ")" +", loop "+i);
              }
          } catch (InterruptedException e) {
          }
      } 
  }
  public class Demo {  
      public static void main(String[] args) {  
  
          System.out.println(Thread.currentThread().getName()
                  +"(isDaemon="+Thread.currentThread().isDaemon()+ ")");
  
          Thread t1=new MyThread("t1");    // 新建t1
          Thread t2=new MyDaemon("t2");    // 新建t2
          t2.setDaemon(true);                // 设置t2为守护线程
          t1.start();                        // 启动t1
          t2.start();                        // 启动t2
      }  
  }
  ```
  t1和main是用户线程，t2是守护线程，当t1和main执行结束，只剩下守护线程，jvm退出。
  ##### 线程优先级
  ``` 
  class MyThread extends Thread{  
      public MyThread(String name) {
          super(name);
      }
  
      public void run(){
          for (int i=0; i<5; i++) {
              System.out.println(Thread.currentThread().getName()
                      +"("+Thread.currentThread().getPriority()+ ")"
                      +", loop "+i);
          }
      } 
  }; 
  
  public class Demo {  
      public static void main(String[] args) {  
          // 主线程优先级5
          System.out.println(Thread.currentThread().getName()
                  +"("+Thread.currentThread().getPriority()+ ")");
  
          Thread t1=new MyThread("t1");    // 新建t1
          Thread t2=new MyThread("t2");    // 新建t2
          t1.setPriority(1);                // 设置t1的优先级为1
          t2.setPriority(10);                // 设置t2的优先级为10
          // t1和t2并发执行(时间片调度)
          t1.start();                        // 启动t1
          t2.start();                        // 启动t2
      }  
  }
  ```
  