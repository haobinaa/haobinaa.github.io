---
title: tcp状态分析
date: 2019-09-24 15:50:53
tags:
categories: 网络协议
description: tcp协议
---
### tcp 状态

tcp握手挥手的状态图如下:

![](/images/net/tcp-status.png)


#### 服务端状态

- CLOSED: 初始状态, 表示 TCP "关闭"

- LISTENING: server 侦听远方的tcp端口的连接请求(Server端bind某个端口，此时套接字可以接收client请求)

#### 三次握手状态

- SYN_SEND: client调用connect进行连接，发送一个syn请求，之后状态会置为SYN_SENT

- SYN_RCVD: server 接收到 syn j将标志位 syn 和 ack 置为1，发送给客户端

- ESTABLISHED：client 收到 ack 为1，将这个ack数据包再次发给服务端，服务端确认为1后建立连接

#### 四次挥手状态



- FIN_WAIT1: 主动关闭端调用`close()`发送 FIN 请求主动关闭连接，之后进入 `FIN_WAIT1` 状态,等待远程TCP连接中断请求的确认。
如果服务器出现shutdown再重启，使用`netstat -nat`查看，就会看到很多FIN-WAIT-1的状态。就是因为服务器当前有很多客户端连接，直接关闭服务器后，无法接收到客户端的ACK

- CLOSE-WAIT: 被动关闭端TCP接到FIN后，就发出ACK以回应FIN请求,并进入`CLOSE_WAIT`.接下来呢，会需要检查自己是否还有数据要发送给对方，如果没有的话，那就可以`close()`这个SOCKET并发送`FIN`报文给对方，即关闭自己到对方这个方向的连接。有数据的话则看程序的策略，继续发送或丢弃。简单地说，当处于`CLOSE_WAIT` 状态下，需要完成的事情是等待你去关闭连接,并发送 `FIN` 告知对方关闭连接

- FIN_WAIT2: 主动关闭端接到 ack ，就会进入`FIN_WAIT2`，这是一种半连接状态。这种状态下，如果对方不完成关闭过程(四次挥手), 会一直保持到系统重启, 过多的`FIN_WAIT2`会导致系统内核 crash

- LAST-ACK: 当被动关闭的一方在发送`FIN`报文后，等待对方的`ACK`报文的时候，就处于`LAST_ACK` 状态。当收到对方的ACK报文后，也就可以进入到CLOSED 可用状态了

- TIME_WAIT: 表示收到了对方的FIN报文，并发送出了ACK报文。 `TIME_WAIT`状态下的TCP连接会等待 `2*MSL`（Max Segment Lifetime，最大分段生存期，指一个TCP报文在Internet上的最长生存时间。每个具体的TCP协议实现都必须选择一个确定的MSL值，RFC 1122建议是2分钟，但BSD传统实现采用了30秒，Linux可以cat /proc/sys/net/ipv4/tcp_fin_timeout看到本机的这个值），然后即可回到CLOSED 可用状态了。如果FIN_WAIT_1状态下，收到了对方同时带FIN标志和ACK标志的报文时，可以直接进入到TIME_WAIT状态，而无须经过FIN_WAIT_2状态。（这种情况应该就是四次挥手变成三次挥手的那种情况）


#### 为什么是三次握手

回顾一下三次握手的过程:
1. 客户端发送 `syn`
2. 服务端收到 syn, 发送 `syn+ack`
3. 客户端回复收到的 `ack`

为何是三次而不是两次：
两次握手的时候，客户端收到了服务端的ack，这个时候客户端确认了服务端已经连接成功，但是服务端确不知道客户端是否连接成功，如果客户端没有回复ack
，那么服务端的连接会一直挂载，应该把这个风险放在客户端，让最后一次回复给客户端承担，即使没有连接成功，客户端浪费几个连接也无所谓

#### 为什么是四次挥手

回顾四次挥手的过程：
1. 客户端调用 `close`, 发送 `FIN`给服务端，告知要断开
2. 服务端收到`FIN`, 发送`ack`给客户端
3. 服务端处理完所有的报文，发送`FIN`给客户端，通知关闭客户端
4. 客户端收到服务端的`FIN`，回复`ack`， 连接关闭


为什么是四次挥手:

当服务端第一次收到`FIN`时，仅仅代表客户端没有报文传输了，但是服务端的报文不一定全部传输给了客户端，所以当服务端的报文传输完成后，再次发送`FIN`,告知客户端同意关闭。 主要的目的是确保报文能够完整传输


### 常见TCP排查命令

1. `netstat -nat`: 查看 tcp 各个连接状态的数量
2. `tcpdump -iany tcp port 9000`: 对tcp端口为9000的进行抓包
3. `lsof -i:9000`, 对9000端口的套接字状态进行查看




### 参考资料

- [TCP状态分析](https://www.cnblogs.com/xinfang520/p/8961129.html)
