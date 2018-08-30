---
title: NIO简述
date: 2018-01-27 18:45:31
tags: JavaIO
categories: IO
---
### 概述
java nio的核心有以下几部分组成：
- channels
- buffers
- selectors

### Channel
>A channel represents an open connection to an entity such as a hardware device, a file, a network socket, or a 
program component that is capable of performing one or more distinct I/O operations, for example reading or writing.  
一个Channel（通道）代表和某一实体的连接，这个实体可以是文件、网络套接字等。也就是说，通道是Java NIO提供的一座桥梁，用于我们的程序和操作系统底层I/O服务进行交互


基本上，所有的 IO 在NIO 中都从一个Channel 开始。Channel 有点象流。 数据可以从Channel读到Buffer中，也可以从Buffer 写到Channel中

NIO中主要的channel：
- FileChannel
- DatagramChannel
- SocketChannel
- SeverSocketChannel 

Java NIO的通道类似流，但又有些不同：

既可以从通道中读取数据，又可以写数据到通道。但流的读写通常是单向的。
- 通道可以异步地读写。
- 通道中的数据总是要先读到一个Buffer，或者总是要从一个Buffer中写入。
- 正如上面所说，从通道读取数据到缓冲区，从缓冲区写入数据到通道。

如下图所示：
![](http://ifeve.com/wp-content/uploads/2013/06/overview-channels-buffers.png)

之前提到的channel的实现：

- FileChannel 从文件中读写数据
- DatagramChannel 能通过UDP读写网络中的数据
- SocketChannel 能通过TCP读写网络中的数据
- ServerSocketChannel可以监听新进来的TCP连接，像Web服务器那样。对每一个新进来的连接都会创建一个SocketChannel

#### 基本的channel示例
``` 
RandomAccessFile aFile = new RandomAccessFile("data/nio-data.txt", "rw");
FileChannel inChannel = aFile.getChannel();
ByteBuffer buf = ByteBuffer.allocate(48);
int bytesRead = inChannel.read(buf);

while (bytesRead != -1) {

    System.out.println("Read " + bytesRead);

    buf.flip();

    while (buf.hasRemaining()) {

        System.out.print((char) buf.get());

    }

    buf.clear();

    bytesRead = inChannel.read(buf);

}

aFile.close();
```
注意 buf.flip() 的调用，首先读取数据到Buffer，然后反转Buffer,接着再从Buffer中读取数据

### Buffer

关键的Buffer实现：
- ByteBuffer
- CharBuffer
- DoubleBuffer
- FloatBuffer
- IntBuffer
- LongBuffer
- ShortBuffer

#### capacity, position, limit

缓冲区本质上是一块可以写入数据，然后可以从中读取数据的内存。这块内存被包装成NIO Buffer对象，并提供了一组方法，用来方便的访问该块内存

Buffer中有3个很重要的变量，它们是理解Buffer工作机制的关键，分别是:

- capacity （总容量,缓存区容纳元素的最大数量， 在创建缓冲区的时候被设定，并且永远不能被改变）
- position （指针当前位置）
- limit （读/写边界位置, 在写模式下表示最多能写入多少数据； 在读模式下表示最多能读到多少数据，应该和缓存区中实际数据大小相同）

capacity、positon、limit在读写模式的说明：
![](http://ifeve.com/wp-content/uploads/2013/06/buffers-modes.png)


在对Buffer进行读/写的过程中，position会往后移动，而 limit 就是 position 移动的边界。由此不难想象，在对Buffer进行写入操作时，limit应当设置为capacity的大小，而对Buffer进行读取操作时，limit应当设置为数据的实际结束位置。（注意：将Buffer数据 写入 通道是Buffer 读取 操作，从通道 读取 数据到Buffer是Buffer 写入 操作）

#### flip

buffer中的flip方法涉及到bufer中的Capacity,Position和Limit三个概念。其中Capacity在读写模式下都是固定的，就是我们分配的缓冲大小,Position类似于读写指针，表示当前读(写)到什么位置,Limit在写模式下表示最多能写入多少数据，此时和Capacity相同，在读模式下表示最多能读多少数据，此时和缓存中的实际数据大小相同。在写模式下调用flip方法，那么limit就设置为了position当前的值(即当前写了多少数据),postion会被置为0，以表示读操作从缓存的头开始读。也就是说调用flip之后，读写指针指到缓存头部，并且设置了最多只能读出之前写入的数据长度(而不是整个缓存的容量大小)

#### rewind

rewind()将position设回0，所以你可以重读Buffer中的所有数据。limit保持不变，仍然表示能从Buffer中读取多少个元素（byte、char等）。


#### clear和compact
一旦读完Buffer中的数据，需要让Buffer准备好再次被写入。可以通过clear()或compact()方法来完成。

如果调用的是clear()方法，position将被设回0，limit被设置成 capacity的值。换句话说，Buffer 被清空了。Buffer中的数据并未清除，只是这些标记告诉我们可以从哪里开始往Buffer里写数据。


如果Buffer中仍有未读的数据，且后续还需要这些数据，但是此时想要先先写些数据，那么使用compact()方法。compact()将未读取完的数据（position 与 limit 之间的数据）移动到缓冲区开头，并将 position 设置为这段数据末尾的下一个位置。其实就等价于重新向缓冲区中写入了这么一段数据



#### mark方法与reset方法
通过调用Buffer.mark()方法，可以标记Buffer中的一个特定position。之后可以通过调用Buffer.reset()方法恢复到这个position。例如：
``` 
// 在当前位置做个标记，通过buffer.get()已经将position移动了多次
buffer.mark();
// 将position移动到标记的位置
buffer.reset();  //set position back to mark.
```

#### 示例
``` 
   FileChannel channel = new RandomAccessFile("test.txt", "rw").getChannel();
    channel.position(channel.size());  // 移动文件指针到末尾（追加写入）

    ByteBuffer byteBuffer = ByteBuffer.allocate(20);

    // 数据写入Buffer
    byteBuffer.put("你好，世界！\n".getBytes(StandardCharsets.UTF_8));

    // Buffer -> Channel
    byteBuffer.flip();
    while (byteBuffer.hasRemaining()) {
        channel.write(byteBuffer);
    }

    channel.position(0); // 移动文件指针到开头（从头读取）
    CharBuffer charBuffer = CharBuffer.allocate(10);
    CharsetDecoder decoder = StandardCharsets.UTF_8.newDecoder();

    // 读出所有数据
    byteBuffer.clear();
    while (channel.read(byteBuffer) != -1 || byteBuffer.position() > 0) {
        byteBuffer.flip();

        // 使用UTF-8解码器解码
        charBuffer.clear();
        decoder.decode(byteBuffer, charBuffer, false);
        System.out.print(charBuffer.flip().toString());

        byteBuffer.compact(); // 数据可能有剩余
    }

  channel.close();
```

### Selector

Selector（选择器）是一个特殊的组件，用于采集各个通道的状态（或者说事件）。我们先将通道注册到选择器，并设置好关心的事件，然后就可以通过调用select()方法，静静地等待事件发生,通道有四个事件供我们监听：
- Accept：有可以接受的连接
- Connect：连接成功
- Read：有数据可读
- Write：可写入数据了

#### selector的优势

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