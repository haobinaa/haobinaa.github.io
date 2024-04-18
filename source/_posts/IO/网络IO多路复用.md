---
title: 网络IO多路复用
date: 2024-04-16 14:39:41
tags:
categories: IO
---

### 前置阅读

对阻塞、非阻塞， 同步、异步的描述参考之前的文章: [网络IO编程(阻塞/非阻塞/同步/异步)](https://haobin.work/2021/08/08/IO/%E7%BD%91%E7%BB%9CIO%E7%BC%96%E7%A8%8B(%E9%98%BB%E5%A1%9E%E3%80%81%E9%9D%9E%E9%98%BB%E5%A1%9E%E3%80%81%E5%90%8C%E6%AD%A5%E3%80%81%E5%BC%82%E6%AD%A5)/)


#### Linux wakeup callback 机制

Linux(2.6+)内核的事件wakeup callback机制，这是IO多路复用机制的核心:


Linux 通过 socket 睡眠队列（`sleep list`）来管理所有等待socket的某个事件的 process，同时通过 wakeup 机制来异步唤醒整个睡眠队列上等待事件的 process ，通知 process 相关事件发生。
通常情况，socket的事件发生的时候，其会顺序遍历 socket 睡眠队列上的每个 process 节点，调用每个 process 节点挂载的 callback 函数。在遍历的过程中，如果遇到某个节点是排他的，那么就终止遍历

睡眠等待逻辑:
1. `select、poll、epoll_wait` 陷入内核，判断监控的 socket 是否有关心的事件发生了，如果没，则为当前 process 构建一个 `wait_entry` 节点，然后插入到监控 socket 的 sleep_list
2. 进入等待， 直到事件发生
3. 关心的事件发生后，将当前 process 的 wait_entry 节点从 socket 的 sleep_list 中移除

唤醒逻辑:
1. socket的事件发生了，然后 socket 顺序遍历自己的 sleep list ，依次调用每个 wait_entry 的 callback 函数
2. 直到完成队列的遍历或遇到某个 wait_entry 节点是排他的才停止


#### 术语定义

##### 文件描述符 fd

文件描述符（`file descriptor`）是一个非负整数，从 0 开始。进程使用文件描述符来标识一个打开的文件。Linux 中一切皆文件。

系统为每一个进程维护了一个文件描述符表，表示该进程打开文件的记录表，而文件描述符实际上就是这张表的索引。每个进程默认都有 3 个文件描述符：`0 (stdin)、1 (stdout)、2 (stderr)`

##### socket

socket 可以用于同一台主机的不同进程间的通信，也可以用于不同主机间的通信。操作系统将 socket 映射到进程的一个文件描述符上，进程就可以通过读写这个文件描述符来和远程主机通信。

socket 是进程间通信规则的高层抽象，而 fd 提供的是底层的具体实现。socket 与 fd 是一一对应的。通过 socket 通信，实际上就是通过文件描述符 fd 读写文件。



### Select


##### fd_set(文件描述符集合)

select 函数参数中的 fd_set 类型表示文件描述符的集合。


文件描述符 fd 是一个从 0 开始的无符号整数，所以可以使用 `fd_set` 的二进制每一位来表示一个文件描述符。
如果某一个 bit 为 1，表示对应的文件描述符已就绪。
譬如设 fd_set 长度为 1 字节，则一个 fd_set 变量最大可以表示 8 个文件描述符。当 select 返回 fd_set = 00010011 时，表示文件描述符 1、2、5 已经就绪。


#### select 执行过程

进程使用 select 监听 socket 文件描述符的执行流程:
1. 进程 A 启动， 调用 select 监听 socket 文件描述符(假如监听的是 2,3,4 三个文件描述符)
2. 如果这三个连接均没有数据到达网卡，则进程 A 会让出 CPU，进入阻塞状态，同时会将进程 A 的进程描述符和被唤醒时用到的回调函数组成等待队列项加入到 socket 对象 3、4、5 的 sleep list 中(注意，这时 select 调用时，fdsr 文件描述符集会从用户空间拷贝到内核空间)
3. 当网卡接收到数据，然后网卡通过中断信号通知 CPU 有数据到达，执行中断程序。中断程序会将网络数据写入到对应 socket 的数据接收队列里面， 并且唤醒 socket `sleep list` 中的进程 A， 将进程 A 放入 CPU 运行队列(注意， 此刻 select 运行结束， fd_set 文件描述符集会从内核空间拷贝到用户空间)

第三步这里就是使用了开头介绍的  `wakeup callback 机制` 

#### select 的缺点

从上面可以看出 select 有如下缺点：
1. 调用 select 时会陷入内核，这时需要将参数中的 fd_set 从用户空间拷贝到内核空间，select 执行完后，还需要将 fd_set 从内核空间拷贝回用户空间，高并发场景下这样的拷贝会消耗极大资源
2. 进程被唤醒后，不知道哪些连接已就绪即收到了数据，需要遍历传递进来的所有 fd_set 的每一位，不管它们是否就绪
3. 另外同时能够监听的文件描述符数量太少。受限于 `sizeof(fd_set)` 的大小，在编译内核时就确定了且无法更改。一般是 32 位操作系统是 1024，64 位是 2048

### Poll

poll 与 select 类似， 只是描述 fd 集合的方式不同，poll 使用 pollfd 结构而非 select 的 fd_set 结构。

pollfd 定义如下:
``` 
struct pollfd {
    int fd;           // 要监听的文件描述符
    short events;     // 要监听的事件
    short revents;    // 文件描述符fd上实际发生的事件
};
```

poll 管理多个描述符也是进行轮询，根据描述符的状态进行处理，但 poll 无最大文件描述符数量的限制，因其基于链表(每个节点是一个 pollfd )存储


### epoll 

epoll 是对 select 和 poll 的改进，解决了 **性能开销大** 和 **文件描述符数量少** 这两个缺点，是性能最高的多路复用实现方式，能支持的并发量也是最大。


epoll 的特点是：
1. 使用红黑树存储一份文件描述符集合，每个文件描述符只需在添加时传入一次，无需用户每次都重新传入(解决了select 中 fd_set 重复拷贝到内核的问题)
2. 通过异步 IO 事件找到就绪的文件描述符，而不是通过轮询的方式；
3. 使用队列存储就绪的文件描述符，且会按需返回就绪的文件描述符，无须再次遍历；


#### epoll 的使用

epoll 基本使用:
```
int main(void)
{
  struct epoll_event events[5];
  int epfd = epoll_create(10);         // 创建一个 epoll 对象
  ......
  for(i = 0; i < 5; i++)
  {
      static struct epoll_event ev;
      .....
      ev.data.fd = accept(sock_fd, (struct sockaddr *)&client_addr, &sin_size);  
      ev.events = EPOLLIN;
      epoll_ctl(epfd, EPOLL_CTL_ADD, ev.data.fd, &ev);  // 向 epoll 对象中添加要管理的连接 
  }

  while(1)               
  {
     nfds = epoll_wait(epfd, events, 5, 10000);   // 等待其管理的连接上的 IO 事件
    
     for(i=0; i<nfds; i++)
     {
         ......
         read(events[i].data.fd, buff, MAXBUF)
     }
}
```

上面的流程涉及到三个函数:
1. `int epoll_create(int size)`   创建一个 eventpoll 内核对象
2. `int epoll_ctl(int epfd, int op, int fd, struct epoll_event *event)` 将连接到socket对象添加到 eventpoll 对象上，epoll_event是要监听的事件
3. `int epoll_wait(int epfd, struct epoll_event *events, int maxevents, int timeout)` 等待连接 socket 的数据到达

##### epoll_create

epoll_create 会创建一个 struct `eventpoll` 的内核对象，类似 socket，把它关联到当前进程的已打开文件列表中。


eventpoll 主要包含三个字段：
``` 
struct eventpoll {
	wait_queue_head_t wq;      // 等待队列链表，存放阻塞的进程

	struct list_head rdllist;  // 数据就绪的文件描述符都会放到这里

	struct rb_root rbr;        // 红黑树，管理用户进程下添加进来的所有 socket 连接
        ......
}
```

- wq： 等待队列，如果当前进程没有数据需要处理，会把当前进程描述符和回调函数 `default_wake_functon` 构造一个等待队列项，放入当前 wq 对待队列，软中断数据就绪的时候会通过 wq 来找到阻塞在 epoll 对象上的用户进程。
- rbr： 一棵红黑树，管理用户进程下添加进来的所有 socket 连接。
- rdllist： 就绪的描述符的链表。当有的连接数据就绪的时候，内核会把就绪的连接放到 rdllist 链表里。这样应用进程只需要判断链表就能找出就绪进程，而不用去遍历整棵树。

![](/images/io/epoll_create.png)

#### epoll_ctl
epoll_ctl 函数主要负责把服务端和客户端建立的 socket 连接注册到 eventpoll 对象里，会做三件事：
1. 创建一个 `epitem` 对象，主要包含两个字段，分别存放 `socket fd` 即连接的文件描述符，和所属的 `eventpoll` 对象的指针
2. 将一个数据到达时用到的回调函数添 `ep_poll_callback` 加到 socket 的进程等待队列中，注意，跟`阻塞 IO 模式`不同的是，这里添加的 socket 的进程等待队列结构中，只有 **回调函数**，没有设置进程描述符，因为在 epoll 中，进程是放在 `eventpoll` 的等待队列中，等待被 epoll_wait 函数唤醒，而不是放在 socket 的进程等待队列中
3. 将第 1 步创建的 epitem 对象插入红黑树


![](/images/io/epoll_ctl.png)

#### epoll_wait

epoll_wait 函数会检查 `eventpoll` 对象的就绪的连接 `rdllist` 上是否有数据到达，如果没有就把当前的进程描述符添加到一个等待队列项里，加入到 `eventpoll` 的进程等待队列里，然后阻塞当前进程，等待数据到达时通过回调函数被唤醒。

当 eventpoll 监控的连接上有数据到达时，通过下面几个步骤唤醒对应的进程处理数据:

1. socket 的数据接收队列有数据到达，会通过进程等待队列的回调函数 `ep_poll_callback` 唤醒红黑树中的节点 `epitem`
2. `ep_poll_callback` 函数将有数据到达的 `epitem` 添加到 `eventpoll` 对象的就绪队列 `rdllist` 中；
3. `ep_poll_callback` 函数检查 eventpoll 对象的进程等待队列上是否有等待项，通过回调函数 `default_wake_func` 唤醒这个进程，进行数据的处理；
4. 当进程醒来后，继续从 `epoll_wait` 时暂停的代码继续执行，遍历 `rdlist`， 把 `就绪的事件` 返回给用户进程，让用户进程调用 `recv` 把已经到达内核 `socket` 等待队列的数据拷贝到用户空间使用。


![](/images/io/epoll_wait.png)


从上面的流程可以看出来也是使用了 `wakeup callback 机制`:
1. epoll 中数据到达 socket 的等待队列时，通过回调函数 ep_poll_callback 找到 eventpoll 中红黑树的 epitem 节点，并将其加入就绪列队 rdllist
2. 通过回调函数 default_wake_func 唤醒用户进程 ，并将 rdllist 传递给用户进程，让用户进程准确读取数据

#### epoll_wait 之水平触发(LT)与边缘触发(ET)

- 水平触发(LT)：关注点是数据（读操作缓冲区不为空，写操作缓冲区不为满），epoll_wait总会返回就绪。LT是epoll的默认工作模式
- 边缘触发(ET)：关注点是变化，只有监视的文件上有数据变化发生（读操作关注有数据写进缓冲区，写操作关注数据从缓冲区取走），epoll_wait才会返回

在 `epoll_wait` 的逻辑中， 当 socket 有数据到达的时候， 会调用 socket 等待队列中的回调函数 `ep_poll_callback` 将 `epoll_item` 放到就绪队列 `rdllist` 中,  LT 与 ET 的区别实际上就是什么时候将 `socket fd`(实际上是 `epoll_item` 持有)从 `rdlist` 就绪队列中移除

对于 ET 来说， 上述第 [4] 步实际上:
遍历 epoll 的 rdlist，把就绪事件返回给用户进程, 将 socket fd 从 rdlist 中移除

对于 LT 来说， 第 [4] 步会分为两个步骤:
1. 遍历 epoll 的 rdlist，把就绪事件返回给用户进程, 将 socket fd 从 rdlist 中移除
2. 如果返回了关心的事件(对于可读事件来说，就是POLL_IN事件)，那么该 socket fd 被重新加入到 epoll 的 rdlist 中

对于可读事件而言，在 ET 模式下，如果某个 socket 有新的数据到达，那么该 socket fd 就会被放入 epoll 的 rdlist，从而 epoll_wait 就一定能收到可读事件的通知。
于是，我们通常理解的缓冲区状态变化(从无到有)的理解是不准确的，准确的理解应该是是否有新的数据达到缓冲区。
而在LT模式下，某个sk被探测到有数据可读，那么该 socket fd 会被重新加入到 read_list，那么在该 socket 的数据被全部取走前，下次调用 epoll_wait 就一定能够收到该 socket 的可读事件，从而 epoll_wait 就能返回


可以看出LT比ET多了两个操作：
(1) 对 rdlist 的遍历的时候，对于收集到可读事件的 socket 会重新放入 rdlist；
(2) 下次 epoll_wait 的时候会再次遍历上次重新放入的 socket，如果 socket 本身没有数据可读了，那么这次遍历就变得多余了

在服务端有海量活跃 socket 的时候，LT模式下，epoll_wait 返回的时候，会有海量的 socket 重新放入 rdlist。
如果，用户在第一次 epoll_wait 返回的时候，将有数据的 socket 都处理掉了，那么下次 epoll_wait 的时候，上次 epoll_wait 重新入 rdlist 的 socket 被再次遍历就有点多余，这个时候LT确实会带来一些性能损失。

然而，实际上会存在很多多余的遍历么？先不说第一次 epoll_wait 返回的时候，用户进程能否都将有数据返回的 socket 处理掉。在用户处理的过程中，如果该 socket有新的数据上来，那么协议栈发现 socket 已经在 rdlist，那么就不需要再次放入 rdlist，也就是在 LT 模式下，对该sk的再次遍历不是多余的，是有效的。
同时，我们回归 epoll 高效的场景在于，服务器有海量 socket，但是活跃 socket 较少的情况下才会体现出 epoll 的高效、高性能。因此，在实际的应用场合，绝大多数情况下，ET模式在性能上并不会比LT模式具有压倒性的优势

另外 ET 模式处理的复杂度是要高于 LT的

### 参考资料
- [KM文章-mingguangtu-深入学习IO多路复用select/poll/epoll实现原理]
- [Linux Wakeup callback 机制](https://blog.csdn.net/wind_602/article/details/104824717)