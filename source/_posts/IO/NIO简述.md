---
title: NIO简述
date: 2018-03-27 18:45:31
tags: JavaIO
categories: IO
---
### 概述
java nio的核心有以下几部分组成：
- channels
- buffers
- selectors

### Buffer

一个 `Buffer` 本质上是内存中的一块，我们可以将数据写入这块内存，之后从这块内存获取数据

关键的Buffer实现：
- ByteBuffer
- CharBuffer
- DoubleBuffer
- FloatBuffer
- IntBuffer
- LongBuffer
- ShortBuffer
- MappedByteBuffer

核心的还是 `ByteBuffer`， 其他的 Char、Integer 等只是包装了一下它而已， 通常我们是直接使用 `ByteBuffer`。

`MappedByteBuffer` 用于实现内存映射文件，这里暂时不讨论



#### capacity, position, limit

可以将 `Buffer` 理解成一个数组， 数组有容量， 每次访问需要指定下标

`Buffer` 中有3个很重要的变量，它们是理解Buffer工作机制的关键，分别是:

- capacity: 代表这个缓冲区的容量，一旦设定就不可以更改
- position: 初始值是 0， 每写入 Buffer 一个值， position 就自动加 1， 代表下一次写入的位置。读也是类似，每读一个值，position 就加 1
- limit: 写操作模式下，limit 代表的是最大能写入的数据，这个时候 limit 等于 capacity。写结束后，切换到读模式，此时的 limit 等于 Buffer 中实际的数据大小，因为 Buffer 不一定被写满了

#### 初始化 Buffer

Buffer 的实现类提供了一个静态的方法 `allocate(int capacity)`, 来实例化 Buffer, 如:
```
ByteBuffer byteBuf = ByteBuffer.allocate(1024);
IntBuffer intBuf = IntBuffer.allocate(1024);
LongBuffer longBuf = LongBuffer.allocate(1024);
```

实际场景中，也会经常使用 `wrap` 来初始化:
```
public static ByteBuffer  wrap(byte[] array)
```

#### Buffer 的读写操作

##### 往Buffer中写

`Buffer` 提供了一些 put 方法用于填充数据到 `Buffer` 中， 另外常见的操作就是将 `Channel` 中的数据读入 `Buffer`， 代码示例:

```java
//  put 方法需要注意不能超过 Buffer 的 capacity

// 填充一个 byte 值
public abstract ByteBuffer put(byte b);
// 在指定位置填充一个 int 值
public abstract ByteBuffer put(int index, byte b);
// 将一个数组中的值填充进去
public final ByteBuffer put(byte[] src) {...}
public ByteBuffer put(byte[] src, int offset, int length) {...}


// 从外部(文件或网络)中读取 Buffer 大小的数据
int num = channel.read(buf);
```

##### 读取Buffer的值


如果要读 Buffer 中的值，需要切换模式，从写入模式切换到读出模式。调用 Buffer 的 `flip()` 方法，可以从写入模式切换到读取模式。其实这个方法也就是设置了一下 position 和 limit 值:

```
// flip 方法
public final Buffer flip() {
    limit = position; // 将 limit 设置为实际写入的数据数量
    position = 0; // 重置 position 为 0
    mark = -1; // mark 之后再说
    return this;
}
```

对应写的put方法， Buffer 也提供了一系列的 get 方法用来读， 同样也经常将写入 Buffer 的数据传输到 Channel 中:
```java
// 根据 position 来获取数据
public abstract byte get();
// 获取指定位置的数据
public abstract byte get(int index);
// 将 Buffer 中的数据写入到数组中
public ByteBuffer get(byte[] dst)

// 网 channel 中写入 buffer 大小的数据
int num = channel.write(buf);
```

#### mark 和 reset

mark 用于临时保存 position 的值，每次调用 mark() 方法都会将 mark 设值为当前的 position，便于后续需要的时候使用:

``` 
public final Buffer mark() {
    mark = position;
    return this;
}
```

reset 用于将 position 设回 mark 标记的值:
``` 
public final Buffer reset() {
    int m = mark;
    if (m < 0)
        throw new InvalidMarkException();
    position = m;
    return this;
}
```

如果需要重新读数据可以考虑使用 mark&reset

#### rewind 和 clear

rewind()：会重置 position 为 0，通常用于重新从头读写 Buffer：
```
public final Buffer rewind() {
    position = 0;
    mark = -1;
    return this;
}
```


clear(): 重置 Buffer， 一般数据重新写入 Buffer 前调用clear:
``` 
public final Buffer clear() {
    position = 0;
    limit = capacity;
    mark = -1;
    return this;
}
```


### Channel

Channel 是数据来源或写入的目的地，NIO中主要的channel：
- FileChannel： 文件通道，用于文件读写(常用的文件操作， 是阻塞的)
- DatagramChannel: UDP 连接的接收和发送
- SocketChannel: TCP 客户端
- SeverSocketChannel: TCP 服务端

通道(Channel)用于和 Buffer 一起操作，读操作将 Channel 的数据写入 Buffer (`Channel.read(buffer)`), 写操作将 Buffer 的数据写入到 Channel 中(`channel.write(buffer)`)

#### FileChannel

FileChannel 主要用于一些文件的操作，常见的操作如下:

##### 初始化

可以从 `inputstream` 或 RandomAccessFile 获取一个 FileChannel:
```
// inputstream
FileInputStream inputStream = new FileInputStream(new File("/data.txt"));
FileChannel fileChannel = inputStream.getChannel();

// RandomAccessFile
FileChannel fileChannel = new RandomAccessFile(new File("/data.txt"), "rw").getChannel();
```

##### 读取/写入文件内容

前面说过，Channel 的数据操作是和 Buffer 打交道的:
```
ByteBuffer buffer = ByteBuffer.allocate(1024);
// 读取数据到 buffer
int num = fileChannel.read(buffer);

// 写入文件
// Buffer 切换为读模式
buffer.flip();
while(buffer.hasRemaining()) {
    // 将 Buffer 中的内容写入文件
    fileChannel.write(buffer);
}
```

#### SocketChannel

SocketChannel 可以理解成一个 TCP 的客户端.

打开一个TCP连接:
`SocketChannel socketChannel = SocketChannel.open(new InetSocketAddress("127.0.0.1", 80));`

读写数据与 FileChannel 没什么区别， 都是通过操作 Buffer 缓冲区:
``` 
// 读取数据
socketChannel.read(buffer);

// 写入数据到网络连接中
while(buffer.hasRemaining()) {
    socketChannel.write(buffer);   
}
```

#### ServerSocketChannel

ServerSocketChannel 可以理解成TCP的服务端。

打开一个TCP服务操作如下：
``` 
// 实例化
ServerSocketChannel serverSocketChannel = ServerSocketChannel.open();
// 监听 8080 端口
serverSocketChannel.socket().bind(new InetSocketAddress(8080));

while (true) {
    // 一旦有一个 TCP 连接进来，就对应创建一个 SocketChannel 进行处理
    SocketChannel socketChannel = serverSocketChannel.accept();
}
```

ServerSocketChannel 不和 Buffer 打交道了，因为它并不实际处理数据，它一旦接收到请求后，实例化 SocketChannel，之后在这个连接通道上的数据传递它就不管了，因为它需要继续监听端口，等待下一个连接


#### DatagramChannel

UDP 和 TCP 不一样，DatagramChannel 一个类处理了服务端和客户端。

监听端口操作:
``` 
DatagramChannel channel = DatagramChannel.open();
channel.socket().bind(new InetSocketAddress(9090));
// 接收数据
ByteBuffer buf = ByteBuffer.allocate(48);
channel.receive(buf);
```

发送数据操作:
``` 
String data = "hello world";

ByteBuffer buf = ByteBuffer.allocate(11);
buf.put(newData.getBytes());
buf.flip();
int bytesSent = channel.send(buf, new InetSocketAddress("jenkov.com", 80));
```

UDP 是无连接的，不需要握手，也不需要通知对方。所以他无法保证数据的送达

### Selector

Selector（选择器）是一个特殊的组件，用于采集各个通道的状态（或者说事件）。我们先将通道注册到选择器，并设置好关心的事件，然后就可以通过调用select()方法，静静地等待事件发生,通道有四个事件供我们监听：
- Accept：有可以接受的连接
- Connect：连接成功
- Read：有数据可读
- Write：可写入数据了

#### Selector的优势

如果用阻塞I/O，需要多线程（浪费内存），如果用非阻塞I/O，需要不断重试（耗费CPU）。Selector的出现解决了这个问题，非阻塞模式下，通过Selector，我们的线程只为已就绪的通道工作，不用盲目的重试了。比如，当所有通道都没有数据到达时，也就没有Read事件发生，我们的线程会在select()方法处被挂起，从而让出了CPU资源。

Selector允许单线程处理多个 Channel。如果你的应用打开了多个连接（通道），但每个连接的流量都很低，使用Selector就会很方便。

这是在一个单线程中使用一个Selector处理3个Channel的图示：
![](http://ifeve.com/wp-content/uploads/2013/06/overview-selectors.png)

要使用Selector，得向Selector注册Channel，然后调用它的select()方法。这个方法会一直阻塞到某个注册的通道有事件就绪。一旦这个方法返回，线程就可以处理这些事件，事件的例子有如新连接进来，数据接收等

#### 使用方式

创建一个Selector，并注册一个Channel。

>注意：要将 Channel 注册到 Selector，首先需要将 Channel 设置为非阻塞模式，否则会抛异常。  
FileChannel 是不能够使用选择器的, 因为 FileChannel 都是阻塞的
``` 
Selector selector = Selector.open();
channel.configureBlocking(false);
SelectionKey key = channel.register(selector, SelectionKey.OP_READ);
```
register()方法的第二个参数名叫“interest set”，也就是你所关心的事件集合。如果你关心多个事件，用一个“按位或运算符”分隔，比如
``` 
SelectionKey.OP_READ | SelectionKey.OP_WRITE
```

#### Selector的基本使用流程
1. 通过 Selector.open() 打开一个 Selector.
2. 将 Channel 注册到 Selector 中, 并设置需要监听的事件(interest set)
3. 不断重复:
  - 调用 select() 方法
  - 调用 selector.selectedKeys() 获取 selected keys
  - 迭代每个 selected key:
    - 从 selected key 中获取 对应的 Channel 和附加信息(如果有的话)
    - 判断是哪些 IO 事件已经就绪了, 然后处理它们. 如果是 OP_ACCEPT 事件, 则调用 "SocketChannel clientChannel = ((ServerSocketChannel) key.channel()).accept()" 获取 SocketChannel, 并将它设置为 非阻塞的, 然后将这个 Channel 注册到 Selector 中.
    - 根据需要更改 selected key 的监听事件.
    - 将已经处理过的 key 从 selected keys 集合中删除.
    
#### 完整Selector示例

当调用了 Selector.close()方法时, 我们其实是关闭了 Selector 本身并且将所有的 SelectionKey 失效, 但是并不会关闭 Channel.

``` 
public class NioEchoServer {
    private static final int BUF_SIZE = 256;
    private static final int TIMEOUT = 3000;

    public static void main(String args[]) throws Exception {
        // 打开服务端 Socket
        ServerSocketChannel serverSocketChannel = ServerSocketChannel.open();

        // 打开 Selector
        Selector selector = Selector.open();

        // 服务端 Socket 监听8080端口, 并配置为非阻塞模式
        serverSocketChannel.socket().bind(new InetSocketAddress(8080));
        serverSocketChannel.configureBlocking(false);

        // 将 channel 注册到 selector 中.
        // 通常我们都是先注册一个 OP_ACCEPT 事件, 然后在 OP_ACCEPT 到来时, 再将这个 Channel 的 OP_READ
        // 注册到 Selector 中.
        serverSocketChannel.register(selector, SelectionKey.OP_ACCEPT);

        while (true) {
            // 通过调用 select 方法, 阻塞地等待 channel I/O 可操作
            if (selector.select(TIMEOUT) == 0) {
                System.out.print(".");
                continue;
            }

            // 获取 I/O 操作就绪的 SelectionKey, 通过 SelectionKey 可以知道哪些 Channel 的哪类 I/O 操作已经就绪.
            Iterator<SelectionKey> keyIterator = selector.selectedKeys().iterator();

            while (keyIterator.hasNext()) {

                SelectionKey key = keyIterator.next();

                // 当获取一个 SelectionKey 后, 就要将它删除, 表示我们已经对这个 IO 事件进行了处理.
                keyIterator.remove();

                if (key.isAcceptable()) {
                    // 当 OP_ACCEPT 事件到来时, 我们就有从 ServerSocketChannel 中获取一个 SocketChannel,
                    // 代表客户端的连接
                    // 注意, 在 OP_ACCEPT 事件中, 从 key.channel() 返回的 Channel 是 ServerSocketChannel.
                    // 而在 OP_WRITE 和 OP_READ 中, 从 key.channel() 返回的是 SocketChannel.
                    SocketChannel clientChannel = ((ServerSocketChannel) key.channel()).accept();
                    clientChannel.configureBlocking(false);
                    //在 OP_ACCEPT 到来时, 再将这个 Channel 的 OP_READ 注册到 Selector 中.
                    // 注意, 这里我们如果没有设置 OP_READ 的话, 即 interest set 仍然是 OP_CONNECT 的话, 那么 select 方法会一直直接返回.
                    clientChannel.register(key.selector(), OP_READ, ByteBuffer.allocate(BUF_SIZE));
                }

                if (key.isReadable()) {
                    SocketChannel clientChannel = (SocketChannel) key.channel();
                    ByteBuffer buf = (ByteBuffer) key.attachment();
                    long bytesRead = clientChannel.read(buf);
                    if (bytesRead == -1) {
                        clientChannel.close();
                    } else if (bytesRead > 0) {
                        key.interestOps(OP_READ | SelectionKey.OP_WRITE);
                        System.out.println("Get data length: " + bytesRead);
                    }
                }

                if (key.isValid() && key.isWritable()) {
                    ByteBuffer buf = (ByteBuffer) key.attachment();
                    buf.flip();
                    SocketChannel clientChannel = (SocketChannel) key.channel();

                    clientChannel.write(buf);

                    if (!buf.hasRemaining()) {
                        key.interestOps(OP_READ);
                    }
                    buf.compact();
                }
            }
        }
    }
}
```

###  SelectionKey

 - register 注册一个 Channel 时, 会返回一个 SelectionKey 对象, 这个对象包含了如下内容:
 - interest set, 即我们感兴趣的事件集, 即在调用 register 注册 channel 时所设置的 interest set.
 - ready set, 代表了 Channel 所准备好了的操作
 - channel
 - selector
 - attached object, 可选的附加对象
 
 #### interest set
 我们可以通过如下方式获取 interest set:
 
 ``` 
 int interestSet = selectionKey.interestOps();
 
 boolean isInterestedInAccept  = interestSet & SelectionKey.OP_ACCEPT;
 boolean isInterestedInConnect = interestSet & SelectionKey.OP_CONNECT;
 boolean isInterestedInRead    = interestSet & SelectionKey.OP_READ;
 boolean isInterestedInWrite   = interestSet & SelectionKey.OP_WRITE;    
 ```
 
 #### ready set
代表了 Channel 所准备好了的操作.
我们可以像判断 interest set 一样操作 Ready set, 但是我们还可以使用如下方法进行判断:

``` 
int readySet = selectionKey.readyOps();

selectionKey.isAcceptable();
selectionKey.isConnectable();
selectionKey.isReadable();
selectionKey.isWritable();
```

#### Channel 和 Selector

我们可以通过 SelectionKey 获取相对应的 Channel 和 Selector:
``` 
Channel  channel  = selectionKey.channel();
Selector selector = selectionKey.selector();  
```

#### Attaching Object
我们可以在selectionKey中附加一个对象:
``` 
selectionKey.attach(theObject);
Object attachedObj = selectionKey.attachment();
```
或者在注册时直接附加:
``` 
SelectionKey key = channel.register(selector, SelectionKey.OP_READ, theObject);
```


### 参考资料
- [NIO教程-Jakob Jenkov](http://tutorials.jenkov.com/java-nio/index.html)
- [NIO核心组件](https://www.jianshu.com/p/736bf3c78159)
- [NIO 的前世今生](https://segmentfault.com/a/1190000006824196)
- [SelectionKey源码分析](https://blog.csdn.net/u010412719/article/details/52863704)