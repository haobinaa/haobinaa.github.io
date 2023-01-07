---
title: Linux零拷贝和Netty零拷贝
date: 2021-01-17 17:09:51
tags: netty
categories: IO
---

### 零拷贝

#### 概念

- 当某个程序或已存在的进程需要某段数据时，它只能在用户空间中属于它自己的内存中访问、修改，这段内存暂且称之为`user
  buffer`
- 正常情况下，数据只能从磁盘(或其他外部设备)加载到内核的缓冲区，且称之为`kernel buffer`
- TCP/IP协议栈维护着两个缓冲区：`send buffer` 和 `recv buffer` ，它们合称为 `socket buffer`
- Page Cache： 为了避免每次读写文件时，都需要对硬盘进行读写操作，Linux 内核使用 页缓存（Page Cache） 机制来对文件中的数据进行缓存， 也就是读缓冲区


#### DMA操作

DMA 的全称叫直接存储器访问（Direct Memory Access），是一种允许外围设备（硬件子系统）直接访问系统主内存的机制。

DMA 是为了避免 CPU 在磁盘操作时承担过多的中断负载而设计的；在磁盘操作中，CPU 可将总线控制权交给 DMA 控制器，由 DMA 输出读写命令，直接控制 RAM 与 I/O 接口进行 DMA 传输，无需 CPU 直接控制传输，也没有中断处理方式那样保留现场和恢复现场过程，使得 CPU 的效率大大提高。


在没有 DMA 的时候, 整个 IO 过程是这样的:
1. 用户进程向 CPU 发起 read 调用读取数据， 由用户态切位内核态， 然后阻塞等数据返回
2. CPU 发出对应的指令给磁盘控制器，然后返回
3. 磁盘控制器收到指令后，于是就开始准备数据，会把数据放入到磁盘控制器的内部缓冲区(page cache)中，然后产生一个中断
4. CPU 收到中断信号后，停下手头的工作，接着把磁盘控制器的缓冲区的数据一次一个字节地读进自己的寄存器，然后再把寄存器里的数据写入到内存，而在数据传输的期间 CPU 是被阻塞的状态，无法执行其他任务。

流程如下图所示:
![](/images/io/no_dma.png)

DMA 下读取磁盘数据流程如下:

1. 用户进程向 CPU 发起 read 系统调用读取数据，由用户态切换为内核态，然后一直阻塞等待数据的返回。
2. CPU 在接收到指令以后对 DMA 磁盘控制器发起调度指令， 释放 CPU 本身
3. DMA 磁盘控制器对磁盘发起 I/O 请求，将磁盘数据先放入磁盘控制器缓冲区，CPU 全程不参与此过程。
4. 当磁盘缓冲区满或数据读取完成后，DMA 会接受到磁盘的中断通知，将数据从磁盘控制器缓冲区拷贝到内核缓冲区。
5. 当 DMA 读取了足够多的数据，就会发送中断信号给 CPU。
6. CPU 收到 中断信号，将数据从内核拷贝到用户空间，系统调用返回， 由内核态切换为用户态

整体流程如图所示:
![](/images/io/dma.png)

#### 传统读取数据和发送数据


在有了 DMA 后， 程序传统IO实际上是调用系统的`read()`和`write()`实现，通过`read()`把数据从硬盘读取到内核缓冲区，再复制到用户缓冲区；然后再通过`write()`写入到socket缓冲区，最后写入网卡设备

![](/images/io/io_process.png)

具体流程：
1. 用户进程通过`read()`方法向操作系统发起调用，此时上下文从用户态转向内核态
2. DMA控制器把数据从硬盘中拷贝到读缓冲区
3. CPU把读缓冲区数据拷贝到应用缓冲区，上下文从内核态转为用户态，`read()`返回
4. 用户进程通过`write()`方法发起调用，上下文从用户态转为内核态
5. CPU将应用缓冲区中数据拷贝到socket缓冲区
6. DMA控制器把数据从socket缓冲区拷贝到网卡，上下文从内核态切换回用户态，`write()`返回

##### 传统读取数据的优化

我们可以看到在传统文件读取过程发生了四次用户态和内核态的切换还有四次IO拷贝(两次DMA拷贝， 两次CPU拷贝)， 要提高传输的性能， 就需要减少用户态与内核态的切换和内存拷贝的次数。

- 减少用户态与内核态的切换:
读取磁盘数据的时候，之所以要发生上下文切换，这是因为用户空间没有权限操作磁盘或网卡，内核的权限最高，这些操作设备的过程都需要交由操作系统内核来完成，所以一般要通过内核去完成某些任务的时候，就需要使用操作系统提供的系统调用函数。
而**一次系统调用必然会发生 2 次上下文切换**：首先从用户态切换到内核态，当内核执行完任务后，再切换回用户态交由进程代码执行。

- 减少拷贝次数:
传统的文件传输方式会历经 4 次数据拷贝；但很明显的可以看到：从内核的读缓冲区拷贝到用户的缓冲区和从用户的缓冲区里拷贝到 socket 的缓冲区这两步是没有必要的。
因为在下载文件，或者说广义的文件传输场景中，我们并不需要在用户空间对数据进行再加工，所以数据并不需要回到用户空间中。

  
#### 零拷贝实现方式

在Linux中零拷贝的实现方式主要有: `mmap + write`、`sendfile`、`splice`


##### mmap+write(内存映射)

mmap 是 Linux 提供的一种内存映射文件方法，即将一个进程的地址空间中的一段虚拟地址映射到磁盘文件地址。

mmap 主要实现方式是将内核读缓冲区的地址和用户缓冲区的地址进行映射，内核缓冲区和应用缓冲区共享，从而减少了从读缓冲区到用户缓冲区的一次CPU拷贝(等于传统的一次 `read（）调用`)，然而内核读缓冲区（read buffer）仍需将数据拷贝到内核写缓冲区（socket buffer）

![](/images/io/mmap-write.png)

基于 mmap + write 系统调用的零拷贝方式，整个过程发生了4次用户态和内核态的上下文切换和3次拷贝(减少了一次内核态到用户态的切换)，具体流程如下：
1. 用户进程通过 mmap() 向操作系统发起调用，上下文从用户态转向内核态
2. DMA控制器把数据从硬盘中拷贝到读缓冲区
3. 上下文从内核态转为用户态，mmap调用返回
4. 用户进程通过write()方法发起调用，上下文从用户态转为内核态
5. CPU将读缓冲区中数据拷贝到socket缓冲区
6. DMA控制器把数据从socket缓冲区拷贝到网卡，上下文从内核态切换回用户态，write()返回

mmap 主要的用处是提高 I/O 性能，特别是针对大文件。对于小文件，内存映射文件反而会导致碎片空间的浪费，因为内存映射总是要对齐页边界，最小单位是 4 KB，一个 5 KB 的文件将会映射占用 8 KB 内存，也就会浪费 3 KB 内存。

##### sendfile

通过使用 `sendfile` 数据可以直接在内核空间进行传输，因此避免了用户空间和内核空间的拷贝，同时由于使用sendfile替代了`read+write` 从而节省了一次系统调用，也就是2次上下文切换。

![](/images/io/sendfile.png)

整个过程发生了2次用户态和内核态的上下文切换和3次拷贝，具体流程如下：

1. 用户进程通过sendfile()方法向操作系统发起调用，上下文从用户态转向内核态
2. DMA控制器把数据从硬盘中拷贝到读缓冲区
3. CPU将读缓冲区中数据拷贝到socket缓冲区
4. DMA控制器把数据从socket缓冲区拷贝到网卡，上下文从内核态切换回用户态，sendfile调用返回


sendfile方法IO数据对用户空间完全不可见，所以只能适用于完全不需要用户空间处理的情况，比如静态文件服务器。

sendfile 只适用于把数据从磁盘中读出来往 socket buffer 发送的场景


##### sendfile+DMA scatter/gather

Linux 2.4 内核进行了优化，提供了带有 scatter/gather 的 sendfile 操作，这个操作可以把最后一次 CPU COPY 去除。其原理就是在内核空间 Read BUffer 和 Socket Buffer 不做数据复制，而是将 Read Buffer 的内存地址、偏移量记录到相应的 Socket Buffer 中，这样就不需要复制。其本质和虚拟内存的解决方法思路一致，就是内存地址的记录。

通过以下命令查看网卡是否支持  scatter-gather:

``` 
ethtool -k eth0 | grep scatter-gather
scatter-gather: on
```

它将读缓冲区中的数据描述信息--内存地址和偏移量记录到socket缓冲区，由 DMA 根据这些将数据从读缓冲区拷贝到网卡，相比之前版本减少了一次CPU拷贝的过程

![](/images/io/sendfile-scatter.png)

整个过程发生了2次用户态和内核态的上下文切换和2次拷贝，其中更重要的是完全没有CPU拷贝，具体流程如下：

1. 用户进程通过 sendfile() 方法向操作系统发起调用，上下文从用户态转向内核态
2. DMA 控制器利用 scatter 把数据从硬盘中拷贝到内核读缓冲区
3. CPU把读缓冲区中的文件描述符和数据长度发送到socket缓冲区
4. DMA控制器根据文件描述符和数据长度，使用scatter/gather把数据从内核缓冲区拷贝到网卡
5. sendfile()调用返回，上下文从内核态切换回用户态



相较于普通 sendfile 方式， 这种方式只进行了两次数据拷贝， 省略了一次CPU拷贝
DMA gather 和 sendfile 一样数据对用户空间不可见，而且需要硬件支持，同时输入文件描述符只能是文件，但是过程中完全没有CPU拷贝过程，极大提升了性能。


##### splice 方式

splice 调用和 sendfile 非常相似，用户应用程序必须拥有两个已经打开的文件描述符，一个表示输入设备，一个表示输出设备。与sendfile不同的是，splice允许任意两个文件互相连接，而并不只是文件与socket进行数据传输。对于从一个文件描述符发送数据到socket这种特例来说，一直都是使用sendfile系统调用，而splice一直以来就只是一种机制，它并不仅限于sendfile的功能。也就是说 sendfile 是 splice 的一个子集。

splice() 是基于 Linux 的管道缓冲区 (pipe buffer) 机制实现的，所以splice()的两个入参文件描述符要求必须有一个是管道设备。

使用 splice() 完成一次磁盘文件到网卡的读写过程如下：

1. 用户进程调用 pipe()，从用户态转入内核态；创建匿名单向管道，pipe() 返回，上下文从内核态切换回用户态；
2. 用户进程调用 splice()，从用户态陷入内核态；
3. DMA 控制器将数据从硬盘拷贝到内核缓冲区，从管道的写入端"拷贝"进管道，splice()返回，上下文从内核态回到用户态；
4. 用户进程再次调用 splice()，从用户态陷入内核态；
5. 内核把数据从管道的读取端拷贝到socket缓冲区，DMA 控制器将数据从socket缓冲区拷贝到网卡；
6. splice() 返回，上下文从内核态切换回用户态。

![](/images/io/splice.png)

#### Linux 零拷贝的实际应用

##### Kafka

kafka 文件传输中用到了 Java NIO 库中的 `transferTo`：
``` 
long transferFrom(FileChannel fileChannel, long position, long count) throws IOException {
    return fileChannel.transferTo(position, count, socketChannel);
}
```

在 Linux 系统中 `transferTo()` 实际上最后就会使用到 `sendfile()` 系统调用函数。

##### Nginx 

Nginx 也支持零拷贝技术，一般默认是开启零拷贝技术，这样有利于提高文件传输的效率，是否开启零拷贝技术的配置如下：
``` 
http {
...
    sendfile on
...
}
```
#### 大文件传输场景分析

在大文件传输的场景下，零拷贝技术并不是最优选择；因为在零拷贝的任何一种实现中，都会有「DMA 将数据从磁盘拷贝到内核缓存区——Page Cache」这一步，但是，在传输大文件（GB 级别的文件）的时候，PageCache 会不起作用，那就白白浪费 DMA 多做的一次数据拷贝，造成性能的降低，即使使用了 PageCache 的零拷贝也会损失性能。

这是因为在大文件传输场景下，每当用户访问这些大文件的时候，内核就会把它们载入 PageCache 中，PageCache 空间很快被这些大文件占满；且由于文件太大，可能某些部分的文件数据被再次访问的概率比较低，这样就会带来 2 个问题：
- PageCache 由于长时间被大文件占据，其他「热点」的小文件可能就无法充分使用到 PageCache，于是这样磁盘读写的性能就会下降了；
- PageCache 中的大文件数据，由于没有享受到缓存带来的好处，但却耗费 DMA 多拷贝到 PageCache 一次。

##### 同步IO VS 异步IO
- 同步IO
之前所有的IO场景都是基于同步IO, 也就是说进程调用 read 方法读取文件的时候， 进程会阻塞在 read 调用上， 因为要等待磁盘返回:
![](/images/io/sync_io.png)

- 异步IO
调用大文件时候阻塞时间非常长， 我们肯定是不希望再读取大文件的时候阻塞， 可以用异步IO来解决:
![](/images/io/async_io.png)

1. 异步IO在发起 read 调用后， 内核向磁盘发起读请求， 可以不等待数据就返回， 此刻进程可以处理其他任务
2. 当内核将磁盘的数据拷贝到进程缓冲区后， 进程收到内核通知， 再去处理数据

另外异步 I/O 并没有涉及到 PageCache；使用异步 I/O 就意味着要绕开 PageCache，因为填充 PageCache 的过程在内核中必须阻塞。

所以异步 I/O 中使用的是`direct I/O`（对比使用 PageCache 的buffer I/O），这样才能不阻塞进程，立即返回。

### Netty中的零拷贝


OS层面的零拷贝主要避免在`用户态(User-space)`和`内核态(Kernel-space)`之间来回拷贝数据。

Netty中的 `zero-copy` 不同于操作系统，它完全是在用户态(java 层面)，更多的偏向于优化数据操作这样的概念,体现在：
-  Netty 提供了 `CompositeByteBuf` 类, 它可以将多个 ByteBuf 合并为一个逻辑上的 ByteBuf, 避免了各个 ByteBuf 之间的拷贝
- 通过 wrap 操作, 我们可以将 byte[] 数组、ByteBuf、ByteBuffer等包装成一个 Netty ByteBuf 对象, 进而避免了拷贝操作
- ByteBuf 支持 slice 操作, 因此可以将 ByteBuf 分解为多个共享同一个存储区域的 ByteBuf, 避免了内存的拷贝
- 通过 `FileRegion` 包装的`FileChannel.transferTo` 实现文件传输, 可以直接将文件缓冲区的数据发送到目标 Channel, 避免了传统通过循环 write 方式导致的内存拷贝问题

上述的 Netty 包装了 `FileChannel.transferTo` 实际上也是对操作系统 `sendfile` 的一个封装， 我们可以理解为 Netty 即支持了系统层面的零拷贝， 还有一个重要作用就是：防止 JVM 中不必要的复制

#### ByteBuf

ByteBuf是Netty进行数据读写交互的单位，结构如下:

![](/images/bytebuf.jpg)

1. ByteBuf 是一个字节容器，容器里面的的数据分为三个部分，第一个部分是已经丢弃的字节，这部分数据是无效的；第二部分是可读字节，这部分数据是 ByteBuf 的主体数据， 从 ByteBuf 里面读取的数据都来自这一部分;最后一部分的数据是可写字节，所有写到 ByteBuf 的数据都会写到这一段。最后一部分虚线表示的是该 ByteBuf 最多还能扩容多少容量

2. 以上三段内容是被两个指针给划分出来的，从左到右，依次是读指针（readerIndex）、写指针（writerIndex），然后还有一个变量 capacity，表示 ByteBuf 底层内存的总容量

3. 从 ByteBuf 中每读取一个字节，readerIndex 自增1，ByteBuf 里面总共有 `writerIndex-readerIndex` 个字节可读,当 readerIndex 与 writerIndex 相等的时候，ByteBuf 不可读

4. 写数据是从 writerIndex 指向的部分开始写，每写一个字节，writerIndex 自增1，直到增到 capacity，这个时候，表示 ByteBuf 已经不可写了

5. ByteBuf 里面其实还有一个参数 maxCapacity，当向 ByteBuf 写数据的时候，如果容量不足，那么这个时候可以进行扩容，直到 capacity 扩容到 maxCapacity，超过 maxCapacity 就会报错

#### CompositeByteBuf 零拷贝

`Composite buffer`实现了透明的零拷贝，将物理上的多个 Buffer 组合成了一个逻辑上完整的 CompositeByteBuf.

比如在网络编程中, 一个完整的 http 请求常常会被分散到多个 Buffer 中。用 CompositeByteBuf 很容易将多个分散的Buffer组装到一起，而无需额外的复制：
``` 
ByteBuf header = Unpooled.buffer();// 模拟http请求头
ByteBuf body = Unpooled.buffer();// 模拟http请求主体
CompositeByteBuf httpBuf = Unpooled.compositeBuffer();
// 这一步，不需要进行header和body的额外复制，httpBuf只是持有了header和body的引用
// 接下来就可以正常操作完整httpBuf了
httpBuf.addComponents(header, body);
```

![](/images/netty/composite-bytebuf.png)

而 JDK ByteBuffer 完成这一需求:
``` 
ByteBuffer header = ByteBuffer.allocate(1024);// 模拟http请求头
ByteBuffer body = ByteBuffer.allocate(1024);// 模拟http请求主体

// 需要创建一个新的ByteBuffer来存放合并后的buffer信息，这涉及到复制操作
ByteBuffer httpBuffer = ByteBuffer.allocate(header.remaining() + body.remaining());
// 将header和body放入新创建的Buffer中
httpBuffer.put(header);
httpBuffer.put(body);
httpBuffer.flip();
```

相比于JDK，Netty的实现更合理，省去了不必要的内存复制，可以称得上是JVM层面的零拷贝。

#### 通过 wrap 操作实现零拷贝

例如我们有一个 byte 数组, 我们希望将它转换为一个 ByteBuf 对象, 以便于后续的操作, 那么传统的做法是将此 byte 数组拷贝到 ByteBuf 中, 即:
``` 
byte[] bytes = ...
ByteBuf byteBuf = Unpooled.buffer();
byteBuf.writeBytes(bytes);
```
这样的操作是有一次额外的拷贝，如果使用`Unpooled`相关的方法，包装这个byte数组生成一个新的的ByteBuf，而不需要进行拷贝，如:
``` 
byte[] bytes = ...
ByteBuf byteBuf = Unpooled.wrappedBuffer(bytes);
```

`Unpooled.wrappedBuffer` 方法来将 bytes 包装成为一个 `UnpooledHeapByteBuf` 对象, 而在包装的过程中, 是不会有拷贝操作的. 即最后我们生成的生成的 ByteBuf 对象是和 bytes 数组共用了同一个存储空间, 对 bytes 的修改也会反映到 ByteBuf 对象中

Unpooled 提供的方法可以将一个或多个 buffer 包装为一个 ByteBuf 对象, 从而避免了拷贝操作.



#### 通过 slice 操作实现零拷贝

slice 操作和 wrap 操作刚好相反, `Unpooled.wrappedBuffer` 可以将多个 ByteBuf 合并为一个
而 slice 操作将一个 ByteBuf 切片为多个共享一个存储区域的 ByteBuf 对象,如:
``` 
ByteBuf byteBuf = ...
ByteBuf header = byteBuf.slice(0, 5);
ByteBuf body = byteBuf.slice(5, 10);
```

用 slice 方法产生 byteBuf 的过程是没有拷贝操作的, header 和 body 对象在内部其实是共享了 byteBuf 存储空间的不同部分而已

![](/images/netty/slice.png)


#### 通过 FileRegion 实现零拷贝

Netty 中使用 FileRegion 实现文件传输的零拷贝, 不过在底层 FileRegion 是依赖于 `Java NIO FileChannel.transfer` 的零拷贝功能.

`Java NIO FileChannel.transfer` 实际上是对 sendfile 的一种实现， 直接在内核态之间拷贝内存

一个文件拷贝的功能, 那么使用传统的方式实现如下:
``` 
public static void copyFile(String srcFile, String destFile) throws Exception {
    byte[] temp = new byte[1024];
    FileInputStream in = new FileInputStream(srcFile);
    FileOutputStream out = new FileOutputStream(destFile);
    int length;
    while ((length = in.read(temp)) != -1) {
        out.write(temp, 0, length);
    }

    in.close();
    out.close();
}
```
道, 上面的代码中不断中源文件中读取定长数据到 temp 数组中, 然后再将 temp 中的内容写入目的文件, 这样的拷贝操作对于小文件倒是没有太大的影响, 但是如果我们需要拷贝大文件时, 频繁的内存拷贝操作就消耗大量的系统资源了

下面我们来看一下使用 Java NIO 的 `FileChannel` 是如何实现零拷贝的:
``` 
public static void copyFileWithFileChannel(String srcFileName, String destFileName) throws Exception {
    RandomAccessFile srcFile = new RandomAccessFile(srcFileName, "r");
    FileChannel srcFileChannel = srcFile.getChannel();

    RandomAccessFile destFile = new RandomAccessFile(destFileName, "rw");
    FileChannel destFileChannel = destFile.getChannel();

    long position = 0;
    long count = srcFileChannel.size();

    srcFileChannel.transferTo(position, count, destFileChannel);
}
```
FileChannel直接将源文件的内容直接拷贝(transferTo) 到目的文件中, 而不需要额外借助一个临时 buffer, 避免了不必要的内存操作


在 Netty 中是怎么使用 FileRegion 来实现零拷贝传输一个文件:
``` 
public void channelRead0(ChannelHandlerContext ctx, String msg) throws Exception {
    RandomAccessFile raf = null;
    long length = -1;
    try {
        // 1. 通过 RandomAccessFile 打开一个文件.
        raf = new RandomAccessFile(msg, "r");
        length = raf.length();
    } catch (Exception e) {
        ctx.writeAndFlush("ERR: " + e.getClass().getSimpleName() + ": " + e.getMessage() + '\n');
        return;
    } finally {
        if (length < 0 && raf != null) {
            raf.close();
        }
    }
    ctx.write("OK: " + raf.length() + '\n');
    if (ctx.pipeline().get(SslHandler.class) == null) {
        // SSL not enabled - can use zero-copy file transfer.
        // 2. 调用 raf.getChannel() 获取一个 FileChannel.
        // 3. 将 FileChannel 封装成一个 DefaultFileRegion
        ctx.write(new DefaultFileRegion(raf.getChannel(), 0, length));
    } else {
        // SSL enabled - cannot use zero-copy file transfer.
        ctx.write(new ChunkedFile(raf));
    }
    ctx.writeAndFlush("\n");
}
```

### 参考资料
- [Netty中的零拷贝](http://blog.onlycatch.com/post/Netty%E4%B8%AD%E7%9A%84%E9%9B%B6%E6%8B%B7%E8%B4%9D)
- [对于Netty ByteBuf零拷贝的理解](https://segmentfault.com/a/1190000007560884)
- [深入Linux IO原理和几种零拷贝](https://zhuanlan.zhihu.com/p/83398714)