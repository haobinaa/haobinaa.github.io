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

#### Inbound 和 Outbound

在 Netty 中，IO 事件被分为 Inbound 事件和 Outbound 事件。

Outbound 的 out 指的是 出去，比如 connect、write、flush 这些 IO 操作是往外部方向进行的，它们就属于 Outbound 事件

 Inbound 是接收。如 accept、read 这种就属于 Inbound 事件
 
 比如服务端的childHandler中有如下代码:
 ``` e
 1. pipeline.addLast(new StringDecoder());
 2. pipeline.addLast(new StringEncoder());
 3. pipeline.addLast(new BizHandler());
 ```
最开始接触这个肯定会很不理解，应该是先 decode 客户端过来的数据，然后用 BizHandler 处理业务逻辑，最后再 encode 数据然后返回给客户端，所以添加的顺序应该是 1 -> 3 -> 2 才对。

其实这里的三个 handler 是分组的，分为 Inbound（1 和 3） 和 Outbound（2）：
- 客户端连接进来的时候，读取（read）客户端请求数据的操作是 Inbound 的，所以会先使用 1，然后是 3 对处理进行处理；
- 处理完数据后，返回给客户端数据的 write 操作是 Outbound 的，此时使用的是 2。

所以虽然添加顺序有点怪，但是执行顺序其实是按照 1 -> 3 -> 2 进行的

如果在上面的基础上，新增一个`OutboundHandler`：
``` 
4. pipeline.addLast(new OutboundHandlerA());
```

此时可能将执行顺序理解成  1 -> 3 -> 2 -> 4 。 其实并非如此

>对于 Inbound 操作，按照添加顺序执行每个 Inbound 类型的 handler；而对于 Outbound 操作，是反着来的，从后往前，顺次执行 Outbound 类型的 handler。

所以上面的顺序应该是 1 -> 3 -> 4 -> 2

这就是`channelHandler`的事件传播顺序

#### ChannelInboundHandlerAdapter 与 ChannelOutboundHandlerAdapter

`ChannelInboundHandlerAdapter` ，这个适配器主要用于实现其接口 `ChannelInboundHandler` 的所有方法，这样我们在编写自己的 handler 的时候就不需要实现 handler 里面的每一种方法，而只需要实现我们所关心的方法，默认情况下，对于 `ChannelInboundHandlerAdapter`，我们比较关心的是他的如下方法:
``` 
public void channelRead(ChannelHandlerContext ctx, Object msg) throws Exception {
    ctx.fireChannelRead(msg);
}
```
他的作用就是接收上一个 handler 的输出，这里的 msg 就是上一个 handler 的输出。默认情况下 adapter 会通过 `fireChannelRead()` 方法直接把上一个 handler 的输出结果传递到下一个 handler。


`ChannelOutboundHandlerAdapter`，它的核心方法如下:
``` 
public void write(ChannelHandlerContext ctx, Object msg, ChannelPromise promise) throws Exception {
    ctx.write(msg, promise);
}
```
默认情况下，这个 adapter 也会把对象传递到下一个 outBound 节点，它的传播顺序与 inboundHandler 相反

#### netty中的解码(ByteToMessageDecoder)

通常情况下，无论我们是在客户端还是服务端，当我们收到数据之后，首先要做的事情就是把二进制数据转换到我们的一个 Java 对象，所以 Netty 提供了一个父类，来专门做这个事情。使用如下:
``` 
public class PacketDecoder extends ByteToMessageDecoder {

    @Override
    protected void decode(ChannelHandlerContext ctx, ByteBuf in, List out) {
        out.add(PacketCodeC.INSTANCE.decode(in));
    }
}
```
当我们继承了 `ByteToMessageDecoder` 这个类之后，我们只需要实现一下 `decode()` 方法，这里的 in 大家可以看到，传递进来的时候就已经是 `ByteBuf` 类型，所以我们不再需要强转，第三个参数是 List 类型，我们通过往这个 List 里面添加解码后的结果对象，就可以自动实现结果往下一个 handler 进行传递，这样，我们就实现了解码的逻辑 handler。

另外，值得注意的一点，对于 Netty 里面的 ByteBuf，默认情况下用的是堆外内存，堆外内存我们需要自行释放，随着程序运行越来越久，内存泄露的问题就慢慢暴露出来了， 而这里我们使用 `ByteToMessageDecoder`，Netty 会自动进行内存的释放，我们不用操心太多的内存管理方面的逻辑

#### netty中的编码(MessageToByteEncoder)

在处理完了指令逻辑之后，我们总是需要进行编码(转出二进制的`ByteBuf`)，然后调用`writeAndFlush`将数据写到客户端，这有是个重复的逻辑。Netty 提供了一个特殊的 channelHandler 来专门处理编码逻辑，我们不需要每一次将响应写到对端的时候调用一次编码逻辑进行编码，也不需要自行创建 ByteBuf，这个类叫做 `MessageToByteEncoder`，从字面意思也可以看出，它的功能就是将对象转换到二进制数据。

使用如下:
``` 
public class PacketEncoder extends MessageToByteEncoder<Packet> {

    @Override
    protected void encode(ChannelHandlerContext ctx, Packet packet, ByteBuf out) {
        PacketCodeC.INSTANCE.encode(out, packet);
    }
}
```
`PacketEncoder` 继承自 `MessageToByteEncoder`，泛型参数 `Packet` 表示这个类的作用是实现 `Packet` 类型对象到二进制的转换。这里我们只需要实现 encode() 方法：
``` 
// PacketCodeC.java
public void encode(ByteBuf byteBuf, Packet packet) {
    // 1. 序列化 java 对象

    // 2. 实际编码过程
}
```


#### 优化代码中过多的判断

通常情况下， 我们需要对不同的指令对象， 来进行不同的逻辑处理(登录、发送消息等)， 当指令越来越多的时候，代码会很臃肿，类似如下:
``` 
if (packet instanceof LoginRequestPacket) {
    // ...
} else if (packet instanceof MessageRequestPacket) {
    // ...
} else if ...
```

Netty 基于这种考虑抽象出了一个 `SimpleChannelInboundHandler` 对象，类型判断和对象传递的活都自动帮我们实现了，而我们可以专注于处理我们所关心的指令即可, 假如处理登录逻辑:
``` 
public class LoginRequestHandler extends SimpleChannelInboundHandler<LoginRequestPacket> {
    @Override
    protected void channelRead0(ChannelHandlerContext ctx, LoginRequestPacket loginRequestPacket) {
        // 登录逻辑
    }
}
```

`SimpleChannelInboundHandler` 从字面意思也可以看到，使用它非常简单，我们在继承这个类的时候，给他传递一个泛型参数，然后在 `channelRead0()` 方法里面，我们不用再通过 if 逻辑来判断当前对象是否是本 handler 可以处理的对象，也不用强转，不用往下传递本 handler 处理不了的对象，这一切都已经交给父类 `SimpleChannelInboundHandler`来实现了，我们只需要专注于我们要处理的业务逻辑即可。


### Netty中的拆包/粘包

粘包半包现象:

尽管我们在应用层面使用了 Netty，但是对于操作系统来说，只认 TCP 协议，尽管我们的应用层是按照 ByteBuf 为 
单位来发送数据，但是到了底层操作系统仍然是按照字节流发送数据，因此，数据到了服务端，也是按照字节流的方式读入，然后到了 Netty 应用层面，重新拼装成 ByteBuf，而这里的 ByteBuf 与客户端按顺序发送的 ByteBuf 
可能是不对等的。因此，我们需要在客户端根据自定义协议来组装我们应用层的数据包，然后在服务端根据我们的应用层的协议来解码数据包，这个过程通常在服务端称为拆包，而在客户端称为粘包。

拆包和粘包是相对的，一端粘了包，另外一端就需要将粘过的包拆开，举个栗子，发送端将三个数据包粘成两个 TCP 数据包发送到接收端，接收端就需要根据应用协议将两个数据包重新组装成三个数据包。

#### Netty中自带拆包工具

在没有 Netty 的情况下，用户如果自己需要拆包，基本原理就是不断从 TCP 缓冲区中读取数据，每次读取完都需要判断是否是一个完整的数据包， 处理情况如下:
1. 如果当前读取的数据不足以拼接成一个完整的业务数据包，那就保留该数据，继续从 TCP 缓冲区中读取，直到得到一个完整的数据包
2. 如果当前读到的数据加上已经读取的数据足够拼接成一个数据包，那就将已经读取的数据拼接上本次读取的数据，构成一个完整的业务数据包传递到业务逻辑，多余的数据仍然保留，以便和下次读到的数据尝试拼接。

如果我们自己实现拆包，对于我们定义的每一种协议都要自己实现，这样很麻烦，netty提供了一些拆包器

##### 固定长度的拆包器 FixedLengthFrameDecoder

如果你的应用层协议非常简单，每个数据包的长度都是固定的，比如 100，那么只需要把这个拆包器加到 pipeline 中，Netty 会把一个个长度为 100 的数据包 (ByteBuf) 传递到下一个 channelHandler。

##### 行拆包器 LineBasedFrameDecoder

从字面意思来看，发送端发送数据包的时候，每个数据包之间以换行符作为分隔，接收端通过 LineBasedFrameDecoder 将粘过的 ByteBuf 拆分成一个个完整的应用层数据包。

##### 分隔符拆包器 DelimiterBasedFrameDecoder

DelimiterBasedFrameDecoder 是行拆包器的通用版本，只不过我们可以自定义分隔符。

##### 基于长度域拆包器 LengthFieldBasedFrameDecoder

最后一种拆包器是最通用的一种拆包器，只要你的自定义协议中包含长度域字段，均可以使用这个拆包器来实现应用层拆包。

### channelHandler的生命周期

建立连接channelHandler的各个回调方法的执行顺序是:

>handlerAdded() -> channelRegistered() -> channelActive() -> channelRead() -> channelReadComplete()

- `handlerAdded()`: 当前channel中已经成功添加该handler处理器
- `channelRegistered()`: 表示当前的 channel 的所有的逻辑处理已经和某个 NIO 线程建立了绑定关系,类似BIO中accept到了新的连接，然后创建了一个线程去处理这个连接的读写。
- `channelActive()`: 当 channel 的所有的业务逻辑链准备完毕（也就是说 channel 的 pipeline 中已经添加完所有的 handler）以及绑定好一个 NIO 线程之后，这条连接算是真正激活了，接下来就会回调到此方法
- `channelRead()`:客户端向服务端发来数据，每次都会回调此方法，表示有数据可读
- `channelReadComplete()`: 服务端每次读完一次完整的数据之后，回调该方法，表示数据读取完毕。

关闭连接回调方法的顺序是:

>channelInactive() -> channelUnregistered() -> handlerRemoved()

- `channelInactive()`:  表面这条连接已经被关闭了，这条连接在 TCP 层面已经不再是 ESTABLISH 状态了
- `channelUnregistered()`:  既然连接已经被关闭，那么与这条连接绑定的线程就不需要对这条连接负责了，这个回调就表明与这条连接对应的 NIO 线程移除掉对这条连接的处理
- `handlerRemoved()`: 这条连接上添加的所有的业务逻辑处理器都给移除掉

channelHandler的生命周期用图表示:

![](/images/netty/channelHandler_lifecycle.png)