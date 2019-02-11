---
title: netty-pipeline和channel
date: 2019-02-03 21:39:14
tags: netty
categories: IO
---
### pipline 和 channelHandler

无论是从服务端来看，还是客户端来看，在 Netty 整个框架里面，一条连接对应着一个 Channel，这条 Channel 所有的处理逻辑都在一个叫做 ChannelPipeline 的对象里面，ChannelPipeline 是一个双向链表结构，他和 Channel 之间是一对一的关系。

![](/images/netty/pipeline.png)

`ChannelPipeline` 里面每个节点都是一个 `ChannelHandlerContext` 对象，这个对象能够拿到和 Channel 相关的所有的上下文信息，然后这个对象包着一个重要的对象，那就是逻辑处理器 `ChannelHandler`。

#### channelHandler

![](/images/netty/channel_handler.png)

可以看到 `ChannelHandler` 有两大子接口：

- `ChannelInboundHandler`:处理读数据的逻辑。它的一个最重要的方法就是 `channelRead()`,我们可以在这个方法中解析读到的数据，并且组装响应的数据

- `ChannelOutBoundHandler`:是处理写数据的逻辑，它是定义我们一端在组装完响应之后，把数据写到对端的逻辑。比如，我们封装好一个 response 对象，接下来我们有可能对这个 response 
做一些其他的特殊逻辑，然后，再编码成 ByteBuf，最终写到对端，它里面最核心的一个方法就是 `write()`（或者是`writeAndFlush`）

ChannelHandler链处理数据的流程与TCP处理数据的流程很相似， 读数据时， 数据包从物理层一层层解析到应用层； 写数据时， 数据包从应用层一层层封装发再到物理层发出去。

#### 





















### 参考资料