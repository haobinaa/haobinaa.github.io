---
title: javaIO网络编程参考
date: 2018-08-08 17:16:12
tags: 网络IO
categories: IO
---

### IO数据传输过程

![](/images/io_process.png)


#### 概念

- 当某个程序或已存在的进程需要某段数据时，它只能在用户空间中属于它自己的内存中访问、修改，这段内存暂且称之为`app 
  buffer`
- 正常情况下，数据只能从磁盘(或其他外部设备)加载到内核的缓冲区，且称之为`kernel buffer` 
- TCP/IP协议栈维护着两个缓冲区：`send buffer` 和 `recv buffer` ，它们合称为 `socket buffer`

#### 程序读取数据

1. 进程发起系统调用，通知内核将磁盘的文件加载到 kernel buffer(DMA直接内存拷贝)
2. 将kernel buffer 的数据拷贝到 app buffer

这个过程中进行了两次上下文切换(用户态和内核态之间)， 两次IO拷贝(DMA加载到内核，内核copy到用户空间)

#### 程序发送和读取网络数据

当数据要通过TCP发送出去的时候：
1. app buffer 的数据复制到 send buffer(socket buffer)
2. socket buffer 的数据通过DMA拷贝到网卡通过网络传输出去


数据接收TCP数据时:
1. 数据从网卡(NIC)拷贝到 recv buffer(socket buffer)
2. socket buffer 的数据再拷贝到 app buffer

这个过程也发生了两次上下文切换和IO拷贝:
1. 将用户区的缓存拷贝到内核区的socket buffer， 同时从用户态切换到内核态
2. 将socket buffer的数据通过DMA拷贝到TCP协议网卡中(IO拷贝), 然后返回系统调用结果给用户空间(上下文切换)

#### 零拷贝

我们可以看到，要将磁盘上的数据发送到网络上要经过四次转换:

1. 数据从磁盘读取到内核的 kernel buffer
2. 数据从内核缓冲区拷贝到用户缓冲区
3. 数据从用户缓冲区拷贝到内核的socket buffer
4. 数据从内核的socket buffer拷贝到网卡接口的缓冲区

但是如果我们进程不需要修改数据，则第二步和第三步是没有必要的。 操作系统直接将磁盘上的数据拷贝到 kernel buffer 后， 直接拷贝到网卡缓存区， 这就是零拷贝技术(两次拷贝都不需要CPU参与)

备注： 这里的零拷贝跟netty的零拷贝不是一个概念， netty的零拷贝可以看我另一篇博客


### 五种经典IO模型

所有的系统I/O都分为两个阶段：等待就绪和操作。举例来说，读函数，分为等待系统可读和真正的读；同理，写函数分为等待网卡可以写和真正的写。

需要说明的是等待就绪的阻塞是不使用CPU的，是在“空等”；而真正的读写操作的阻塞是使用CPU的，真正在"干活"，而且这个过程非常快，属于memory copy，带宽通常在1GB/s级别以上，可以理解为基本不耗时。

下图是几种常见I/O模型的对比：

![](/images/nio2.jpg)
#### Blocking IO(阻塞IO)
也叫 **同步阻塞IO** ， 请求数据的进程需要一直阻塞等待读取完成才能返回，同时整个读取的动作也是要同步等待I/O操作的完成才返回。

![](/images/block_io.png)


#### Nonblocking IO(非阻塞IO)
备注，此NIO并非java的NIO(new io)

当数据没有准备好的时候，用户进程调用仍然是同步返回结果，只是如果I/O不可用，它会即时返回一个错误结果，然后用户进程不断轮训，那么对于整个用户进程而言，它是非阻塞的。

![](/images/non-block-io.png)

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
``` 
int select(int nfds, fd_set *readfds, fd_set *writefds, fd_set *exceptfds, struct timeval *timeout);
```

当用户process调用select的时候，select会将需要监控的readfds集合拷贝到内核空间（假设监控的仅仅是socket可读），然后遍历自己监控的socket sk，挨个调用sk的poll逻辑以便检查该sk是否有可读事件，遍历完所有的sk后，如果没有任何一个sk可读，那么select会调用schedule_timeout进入schedule循环，使得process进入睡眠。如果在timeout时间内某个sk上有数据可读了，或者等待timeout了，则调用select的process会被唤醒，接下来select就是遍历监控的sk集合，挨个收集可读事件并返回给用户了

select存在两个问题：
1. 被监控的fds需要从用户空间拷贝到内核空间, 内核空间对fds集合大小做了限制，为1024
2. 被监控的fds集合中，只要有一个有数据可读，整个socket集合就会被遍历一次调用sk的poll函数收集可读事件
 ，需要挨个遍历每个socket来收集可读事件
 
 ##### poll
#### Signal-driven I/O （信号驱动IO）
号驱动IO模型。当开启了信号驱动功能时，首先发起一个信号处理的系统调用，如sigaction()，这个系统调用会立即返回。但数据在准备好时，会发送SIGIO信号，进程收到这个信号就知道数据准备好了，于是发起操作数据的系统调用，如read()。

在发起信号处理的系统调用后，进程不会被阻塞，但是在read()将数据从kernel buffer复制到app buffer时，进程是被阻塞的。如：

![](/images/poll-io.png)

####  Asynchronous I/O (异步IO)

当设置为异步IO模型时，httpd首先发起异步系统调用(如aio_read()，aio_write()等)，并立即返回。这个异步系统调用告诉内核，不仅要准备好数据，还要把数据复制到app buffer中。

httpd从返回开始，直到数据复制到app buffer结束都不会被阻塞。当数据复制到app buffer结束，将发送一个信号通知httpd进程。

如图：
![](/images/a-io.png)
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

在BIO模型中，之所以需要多线程，是因为在进行I/O操作的时候，一是没有办法知道到底能不能写、能不能读，只能"傻等"，即使通过各种估算，算出来操作系统没有能力进行读写，也没法在socket.read()和socket.write()
函数中返回，这两个函数无法进行有效的中断。所以除了多开线程另起炉灶，没有好的办法利用CPU。NIO的读写函数可以立即返回，这就给了我们不开线程利用CPU的最好机会：如果一个连接不能读写（socket.read()返回0或者socket.write()返回0），我们可以把这件事记下来，记录的方式通常是在Selector上注册标记位，然后切换到其它就绪的连接（channel）继续进行读写。


#### 事件模型
我们可以通过注册感兴趣的事件，来通过**事件模型单线程处理所有I/O请求**

Reactor模式：注册所有感兴趣的事件处理器，单线程轮询选择就绪事件，执行事件处理器， 示例如下：
``` 
   interface ChannelHandler{
      void channelReadable(Channel channel);
      void channelWritable(Channel channel);
   }
   class Channel{
     Socket socket;
     Event event;//读，写或者连接
   }

   //IO线程主循环:
   class IoThread extends Thread{
   public void run(){
   Channel channel;
   while(channel=Selector.select()){//选择就绪的事件和对应的连接
      if(channel.event==accept){
         registerNewChannelHandler(channel);//如果是新连接，则注册一个新的读写处理器
      }
      if(channel.event==write){
         getChannelHandler(channel).channelWritable(channel);//如果可以写，则执行写事件
      }
      if(channel.event==read){
          getChannelHandler(channel).channelReadable(channel);//如果可以读，则执行读事件
      }
    }
   }
   Map<Channel，ChannelHandler> handlerMap;//所有channel的对应事件处理器
  }
```

#### 优化线程模型

单线程处理I/O的效率确实非常高，没有线程切换，只是拼命的读、写、选择事件。但现在的服务器，一般都是多核处理器，如果能够利用多核心进行I/O，无疑对效率会有更大的提高。

我们需要的线程类型：
1. 事件分发器，单线程选择就绪的事件。
2. I/O处理器，包括connect、read、write等，这种纯CPU操作，一般开启CPU核心个线程就可以。
3. 业务线程，在处理完I/O后，业务一般还会有自己的业务逻辑，有的还会有其他的阻塞I/O，如DB操作，RPC等。只要有阻塞，就需要单独的线程。

Java的Selector对于Linux系统来说，有一个致命限制：同一个channel的select不能被并发的调用。因此，如果有多个I/O线程，必须保证：一个socket只能属于一个IoThread，而一个IoThread可以管理多个socket。另外连接的处理和读写的处理通常可以选择分开，这样对于海量连接的注册和读写就可以分发。虽然read()和write()是比较高效无阻塞的函数，但毕竟会占用CPU，如果面对更高的并发则无能为力。

![](/images/reactor.png)


#### Proactor和Reactor

 Reactor模式是基于同步I/O的，而Proactor模式是和异步I/O相关的。在Reactor模式中，事件分发器等待某个事件或者可应用或个操作的状态发生（比如文件描述符可读写，或者是socket可读写），事件分发器就把这个事件传给事先注册的事件处理函数或者回调函数，由后者来做实际的读写操作。
 
 Proactor模式中，事件处理者（或者代由事件分发器发起）直接发起一个异步读写操作（相当于请求），而实际的工作是由操作系统来完成的。发起时，需要提供的参数包括用于存放读到数据的缓存区、读的数据大小或用于存放外发数据的缓存区，以及这个请求完后的回调函数等信息。事件分发器得知了这个请求，它默默等待这个请求的完成，然后转发完成事件给相应的事件处理者或者回调。举例来说，在Windows上事件处理者投递了一个异步IO操作（称为overlapped技术），事件分发器等IO Complete事件完成。这种异步模式的典型实现是基于操作系统底层异步API的，所以我们可称之为“系统级别”的或者“真正意义上”的异步，因为具体的读写是由操作系统代劳的。
 
 
 ##### Reactor中读
 - 注册读就绪事件和相应的事件处理器。
 - 事件分发器等待事件
 - 事件到来，激活分发器，分发器调用事件对应的处理器
 - 事件处理器完成实际的读操作，处理读到的数据，注册新的事件，然后返还控制权
 
 
 ##### Proactor中实现读
 - 处理器发起异步读操作（注意：操作系统必须支持异步IO）。在这种情况下，处理器无视IO就绪事件，它关注的是完成事件。
 - 事件分发器等待操作完成事件
 - 在分发器等待过程中，操作系统利用并行的内核线程执行实际的读操作，并将结果数据存入用户自定义缓冲区，最后通知事件分发器读操作完成
 - 事件分发器呼唤处理器
 - 事件处理器处理用户自定义缓冲区中的数据，然后启动一个新的异步操作，并将控制权返回事件分发器
   

### 参考资料
- [java nio浅析](https://tech.meituan.com/nio.html)
- [IO模型到netty](https://juejin.im/post/58bbaee6ac502e006b02f607)
- [IO多路复用原理剖析](https://juejin.im/post/59f9c6d66fb9a0450e75713f)
- [进程、线程及其在Linux中的实现](https://blog.csdn.net/u013933870/article/details/51693484)
- [Linux五种IO模型分析](https://www.cnblogs.com/f-ck-need-u/p/7624733.html)
- [Linux IO模式及 select、poll、epoll详解](https://segmentfault.com/a/1190000003063859)
- [大话Linux Select、poll、epoll](https://cloud.tencent.com/developer/article/1005481)
- [IO模型到netty](https://juejin.im/post/58ea47cbda2f60005f070a70)