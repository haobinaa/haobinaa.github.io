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


#### Channel和Buffer

基本上，所有的 IO 在NIO 中都从一个Channel 开始。Channel 有点象流。 数据可以从Channel读到Buffer中，也可以从Buffer 写到Channel中

NIO中主要的channel：
- FileChannel
- DatagramChannel
- SocketChannel
- SeverSocketChannel


关键的Buffer实现：
- ByteBuffer
- CharBuffer
- DoubleBuffer
- FloatBuffer
- IntBuffer
- LongBuffer
- ShortBuffer


#### Selector
Selector允许单线程处理多个 Channel。如果你的应用打开了多个连接（通道），但每个连接的流量都很低，使用Selector就会很方便。例如，在一个聊天服务器中。

这是在一个单线程中使用一个Selector处理3个Channel的图示：
![](http://ifeve.com/wp-content/uploads/2013/06/overview-selectors.png)

要使用Selector，得向Selector注册Channel，然后调用它的select()方法。这个方法会一直阻塞到某个注册的通道有事件就绪。一旦这个方法返回，线程就可以处理这些事件，事件的例子有如新连接进来，数据接收等

### Channel

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

#### Buffer的基本用法
Buffer遵循四个步骤：
1. 写数据到buffer
2. 调用filp()方法
3. 从Buffer中读数据
4. 调用clear方法或compact方法

当向buffer写入数据时，buffer会记录下写了多少数据。一旦要读取数据，需要通过flip()方法将Buffer从写模式切换到读模式。在读模式下，可以读取之前写入到buffer的所有数据

一旦读完了所有的数据，就需要清空缓冲区，让它可以再次被写入。有两种方式能清空缓冲区：调用clear()或compact()方法。clear()方法会清空整个缓冲区。compact()方法只会清除已经读过的数据。任何未读的数据都被移到缓冲区的起始处，新写入的数据将放到缓冲区未读数据的后面。

例子：
``` 
RandomAccessFile aFile = new RandomAccessFile("data/nio-data.txt", "rw");
FileChannel inChannel = aFile.getChannel();
//create buffer with capacity of 48 bytes
ByteBuffer buf = ByteBuffer.allocate(48);
int bytesRead = inChannel.read(buf); //read into buffer.
while (bytesRead != -1) {
    while (buf.hasRemaining()) {
        System.out.print((char) buf.get()); // read 1 byte at a time
    }
    buf.clear(); //make buffer ready for writing
    bytesRead = inChannel.read(buf);
}
aFile.close();
```

#### capacity, position, limit

缓冲区本质上是一块可以写入数据，然后可以从中读取数据的内存。这块内存被包装成NIO Buffer对象，并提供了一组方法，用来方便的访问该块内存


capacity、positon、limit在读写模式的说明：
![](http://ifeve.com/wp-content/uploads/2013/06/buffers-modes.png)

##### capacity
缓存区容纳元素的最大数量， 在创建缓冲区的时候被设定，并且永远不能被改变。



##### limit
在写模式下，Buffer的limit表示你最多能往Buffer里写多少数据。 写模式下，limit等于Buffer的capacity。

当切换Buffer到读模式时， limit表示你最多能读到多少数据。因此，当切换Buffer到读模式时，limit会被设置成写模式下的position值。换句话说，你能读到之前写入的所有数据（limit被设置成已写数据的数量，这个值在写模式下就是position）

##### position
缓冲区下一个要被读或写的元素，位置会自动的由get或put更新

当你写数据到Buffer中时，position表示当前的位置。初始的position值为0.当一个byte、long等数据写到Buffer后， position会向前移动到下一个可插入数据的Buffer单元。position最大可为capacity – 1.

当读取数据时，也是从某个特定位置读。当将Buffer从写模式切换到读模式，position会被重置为0. 当从Buffer的position处读取数据时，position向前移动到下一个可读的位置。


#### buffer的类型

NIO的buffer有以下Buffer类型：

>ByteBuffer、MappedByteBuffer、CharBuffer、DoubleBuffer、FloatBuffer
、IntBuffer、LongBuffer、ShortBuffer


#### buffer的分配
要想获得一个Buffer对象首先要进行分配。 每一个Buffer类都有一个allocate方法。下面是一个分配48字节capacity的ByteBuffer的例子。
``` 
ByteBuffer buf = ByteBuffer.allocate(48);
```

#### 往buffer中写
写数据到Buffer有两种方式：

- 从channel到buffer
``` 
int bytesRead = inChannel.read(buf); 
```
- 通过Buffer的put()方法写到buffer
``` 
buf.put(127)
```

#### flip方法
flip方法将Buffer从写模式切换到读模式。调用flip()方法会将position设回0，并将limit设置成之前position的值。

换句话说，position现在用于标记读的位置，limit表示之前写进了多少个byte、char等 —— 现在能读取多少个byte、char等。

#### 从buffer中读
从Buffer中读取数据有两种方式：

- 从Buffer读取数据到Channel
``` 
int bytesWritten = inChannel.write(buf);
```
使用get()方法从Buffer中读取数据
``` 
byte aByte = buf.get();
```

#### rewind方法

Buffer.rewind()将position设回0，所以你可以重读Buffer中的所有数据。limit保持不变，仍然表示能从Buffer中读取多少个元素（byte、char等）。


#### clear和compact
一旦读完Buffer中的数据，需要让Buffer准备好再次被写入。可以通过clear()或compact()方法来完成。

如果调用的是clear()方法，position将被设回0，limit被设置成 capacity的值。换句话说，Buffer 被清空了。Buffer中的数据并未清除，只是这些标记告诉我们可以从哪里开始往Buffer里写数据。

如果Buffer中有一些未读的数据，调用clear()方法，数据将“被遗忘”，意味着不再有任何标记会告诉你哪些数据被读过，哪些还没有。

如果Buffer中仍有未读的数据，且后续还需要这些数据，但是此时想要先先写些数据，那么使用compact()方法。

compact()方法将所有未读的数据拷贝到Buffer起始处。然后将position设到最后一个未读元素正后面。limit属性依然像clear()方法一样，设置成capacity。现在Buffer准备好写数据了，但是不会覆盖未读的数据。

#### mark方法与reset方法
通过调用Buffer.mark()方法，可以标记Buffer中的一个特定position。之后可以通过调用Buffer.reset()方法恢复到这个position。例如：
``` 
// 在当前位置做个标记，通过buffer.get()已经将position移动了多次
buffer.mark();
// 将position移动到标记的位置
buffer.reset();  //set position back to mark.
```

#### equals()与compareTo()方法
可以使用equals()和compareTo()方法两个Buffer。

##### equals()
当满足下列条件时，表示两个Buffer相等：

1. 有相同的类型（byte、char、int等）。
2. Buffer中剩余的byte、char等的个数相等。
3. Buffer中所有剩余的byte、char等都相同。

equals只是比较Buffer的一部分，不是每一个在它里面的元素都比较。实际上，它只比较Buffer中的剩余元素。

##### compareTo()

compareTo()方法比较两个Buffer的剩余元素(byte、char等)， 如果满足下列条件，则认为一个Buffer“小于”另一个Buffer：

1. 第一个不相等的元素小于另一个Buffer中对应的元素 。
2. 所有元素都相等，但第一个Buffer比另一个先耗尽(第一个Buffer的元素个数比另一个少)。

### 参考资料
- [NIO教程-Jakob Jenkov](http://tutorials.jenkov.com/java-nio/index.html)