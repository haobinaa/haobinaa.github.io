---
title: javaIO网络编程参考
date: 2018-08-08 17:16:12
tags: 网络IO
categories: IO
---
### IO数据传输过程
![](https://images2017.cnblogs.com/blog/733013/201710/733013-20171003132425740-1897420439.png)

#### 程序读数据
当某个程序或已存在的进程/线程(后文将不加区分的只认为是进程)需要某段数据时，它只能在用户空间中属于它自己的内存中访问、修改，这段内存暂且称之为app 
buffer。假设需要的数据在磁盘上，那么进程首先得发起相关系统调用，通知内核去加载磁盘上的文件。但正常情况下，数据只能加载到内核的缓冲区，暂且称之为kernel buffer。数据加载到kernel 
buffer之后，还需将数据复制到app buffer。到了这里，进程就可以对数据进行访问、修改了。

#### 程序发送数据
当我们的数据要通过TCP连接传送出去时，过程如下：TCP/IP协议栈维护着两个缓冲区：send buffer和recv buffer，它们合称为socket buffer。需要通过TCP连接传输出去的数据，需要先复制到send 
buffer，再复制给网卡(NIC)通过网络传输出去。如果通过TCP连接接收到数据，数据首先通过网卡进入recv buffer，再被复制到用户空间的app buffer。

#### 零拷贝
我们可以看到，网络数据从kernel buffer复制到app buffer再复制到send buffer， 这个过程中如果进程不需要修改数据，就直接发送给TCP连接的另一端，可以不用从kernel buffer复制到app 
buffer，而是直接复制到send buffer。这就是零拷贝(zero copy)技术。

### 五种经典IO模型
所有的系统I/O都分为两个阶段：等待就绪和操作。举例来说，读函数，分为等待系统可读和真正的读；同理，写函数分为等待网卡可以写和真正的写。

需要说明的是等待就绪的阻塞是不使用CPU的，是在“空等”；而真正的读写操作的阻塞是使用CPU的，真正在"干活"，而且这个过程非常快，属于memory copy，带宽通常在1GB/s级别以上，可以理解为基本不耗时。

下图是几种常见I/O模型的对比：

![](https://tech.meituan.com/img/nio/nio2.jpg)
#### Blocking IO(阻塞IO)
也叫 **同步阻塞IO** ， 请求数据的进程需要一直阻塞等待读取完成才能返回，同时整个读取的动作也是要同步等待I/O操作的完成才返回。

![](https://images2017.cnblogs.com/blog/733013/201710/733013-20171003153915708-1740495360.png)


#### Nonblocking IO(非阻塞IO)
备注，此NIO并非java的NIO(new io)

当数据没有准备好的时候，用户进程调用仍然是同步返回结果，只是如果I/O不可用，它会即时返回一个错误结果，然后用户进程不断轮训，那么对于整个用户进程而言，它是非阻塞的。

![](https://images2017.cnblogs.com/blog/733013/201710/733013-20171003154856927-92203933.png)

#### IO Multiplexing （IO复用）

##### Linux的socket 事件wakeup callback机制
linux(2.6+)内核的事件wakeup callback机制是IO多路复用机制存在的本质。

Linux通过socket睡眠队列来管理所有等待socket的某个事件的process，同时通过wakeup机制来异步唤醒整个睡眠队列上等待事件的process，通知process相关事件发生。通常情况，socket的事件发生的时候，其会顺序遍历socket睡眠队列上的每个process节点，调用每个process节点挂载的callback函数。在遍历的过程中，如果遇到某个节点是排他的，那么就终止遍历，总体上会涉及两大逻辑：（1）睡眠等待逻辑；（2）唤醒逻辑。

(1)睡眠等待
1. select、poll、epoll_wait陷入内核，判断监控的socket是否有关心的事件发生了，如果没，则为当前process构建一个wait_entry节点，然后插入到监控socket的sleep_list
2. 进入循环的schedule直到关心的事件发生了
3. 关心的事件发生后，将当前process的wait_entry节点从socket的sleep_list中删除

(2)唤醒逻辑
1. socket的事件发生了，然后socket顺序遍历其睡眠队列，依次调用每个wait_entry节点的callback函数
2. 直到完成队列的遍历或遇到某个wait_entry节点是排他的才停止。
3. 一般情况下callback包含两个逻辑：1.wait_entry自定义的私有逻辑；2.唤醒的公共逻辑，主要用于将该wait_entry的process放入CPU的就绪队列，让CPU随后可以调度其执行。


##### Select



#### Signal-driven I/O （信号驱动IO）
号驱动IO模型。当开启了信号驱动功能时，首先发起一个信号处理的系统调用，如sigaction()，这个系统调用会立即返回。但数据在准备好时，会发送SIGIO信号，进程收到这个信号就知道数据准备好了，于是发起操作数据的系统调用，如read()。

在发起信号处理的系统调用后，进程不会被阻塞，但是在read()将数据从kernel buffer复制到app buffer时，进程是被阻塞的。如：

![](https://images2017.cnblogs.com/blog/733013/201710/733013-20171003170515536-1404504188.png)

####  Asynchronous I/O (异步IO)

当设置为异步IO模型时，httpd首先发起异步系统调用(如aio_read()，aio_write()等)，并立即返回。这个异步系统调用告诉内核，不仅要准备好数据，还要把数据复制到app buffer中。

httpd从返回开始，直到数据复制到app buffer结束都不会被阻塞。当数据复制到app buffer结束，将发送一个信号通知httpd进程。

如图：
![](https://images2017.cnblogs.com/blog/733013/201710/733013-20171003171529536-693464967.png)
### NIO分析

#### 传统BIO模型
传统BIO编程模型实现如下:
``` 
{
 ExecutorService executor = Excutors.newFixedThreadPollExecutor(100);//线程池

 ServerSocket serverSocket = new ServerSocket();
 serverSocket.bind(8088);
 while(!Thread.currentThread.isInturrupted()){//主线程死循环等待新连接到来
 Socket socket = serverSocket.accept();
 executor.submit(new ConnectIOnHandler(socket));//为新的连接创建新的线程
 }

class ConnectIOnHandler extends Thread{
    private Socket socket;
    public ConnectIOnHandler(Socket socket){
       this.socket = socket;
    }
    public void run(){
      while(!Thread.currentThread.isInturrupted()&&!socket.isClosed()){死循环处理读写事件
          String someThing = socket.read()....//读取数据
          if(someThing!=null){
             ......//处理数据
             socket.write()....//写数据
          }

      }
    }
}
```
socket.accept()、socket.read()、socket.write()
三个主要函数都是同步阻塞的，当一个连接在处理I/O的时候，系统是阻塞的，如果是单线程的话必然就挂死在那里；但CPU是被释放出来的，开启多线程，就可以让CPU去处理更多的事情。

这也是所有使用多线程的本质：
1. 利用多核
2. 当I/O阻塞系统，但CPU空闲的时候，可以利用多线程使用CPU资源

BIO模型最本质的问题在于，严重依赖于线程，但线程资源是宝贵的，主要表现于:
- 线程的创建和销毁成本很高，在Linux这样的操作系统中，线程本质上就是一个进程（Linux中线程并没有定义特殊的数据结构）。创建和销毁都是重量级的系统函数
- 线程本身占用较大内存，像Java的线程栈，一般至少分配512K～1M的空间，如果系统中的线程数过千，恐怕整个JVM的内存都会被吃掉一半
- 线程的切换成本是很高的。操作系统发生线程切换的时候，需要保留线程的上下文，然后执行系统调用。如果线程数过高，可能执行线程切换的时间甚至会大于线程执行的时间，这时候带来的表现往往是系统load偏高、CPU sy使用率特别高（超过20%以上)，导致系统几乎陷入不可用的状态
- 容易造成锯齿状的系统负载。因为系统负载是用活动线程数或CPU核心数，一旦线程数量高但外部网络环境不是很稳定，就很容易造成大量请求的结果同时返回，激活大量阻塞线程从而使系统负载压力过大

当连接数过大的时候，BIO模型是无法应对的

### NIO模型

### 参考资料
- [java nio浅析](https://tech.meituan.com/nio.html)
- [IO模型到netty](https://juejin.im/post/58bbaee6ac502e006b02f607)
- [IO多路复用原理剖析](https://juejin.im/post/59f9c6d66fb9a0450e75713f)
- [进程、线程及其在Linux中的实现](https://blog.csdn.net/u013933870/article/details/51693484)
- [Linux五种IO模型分析](https://www.cnblogs.com/f-ck-need-u/p/7624733.html)
- [Linux IO模式及 select、poll、epoll详解](https://segmentfault.com/a/1190000003063859)
- [大话Linux Select、poll、epoll](https://cloud.tencent.com/developer/article/1005481)