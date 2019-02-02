---
title: Netty ByteBuf 零拷贝
date: 2019-01-17 17:09:51
tags: netty
categories: IO
---

## 零拷贝(Zero-copy)

### 传统意义的零拷贝

>Zero-Copy describes computer operations in which the CPU does not perform the task of copying data from one memory area to another

传统的零拷贝指的是数据传输过程中，不需要CPU进行数据的拷贝。主要是数据在用户空间与内核中间之间的拷贝

在发送数据的时候，传统的实现方式是:
```
File.read(bytes)
Socket.send(bytes)
```
这种方式需要四次数据拷贝和四次上下文切换： 
1. 数据从磁盘读取到内核的read buffer 
2. 数据从内核缓冲区拷贝到用户缓冲区 
3. 数据从用户缓冲区拷贝到内核的socket buffer
4. 数据从内核的socket buffer拷贝到网卡接口的缓冲区

明显上面的第二步和第三步是没有必要的，通过java的FileChannel.transferTo方法，可以避免上面两次多余的拷贝（当然这需要底层操作系统支持）：
1. 调用transferTo,数据从文件由DMA引擎拷贝到内核read buffer 
2. 接着DMA从内核read buffer将数据拷贝到网卡接口buffer

上面的两次操作都不需要CPU参与，所以就达到了零拷贝

备注：DMA(直接存储器存取)，外部设备不通过CPU而直接与系统内存交换数据的接口技术

### Netty中的零拷贝

传统IO数据传输，在之前 [java网络编程模型概述](https://blog.haobin95.club/2018/08/08/IO/javaIO%E7%BD%91%E7%BB%9C%E7%BC%96%E7%A8%8B%E6%A6%82%E8%BF%B0/)中有描述

OS层面的零拷贝主要避免在`用户态(User-space)`和`内核态(Kernel-space)
`之间来回拷贝数据。比如Linux可以将一段用户空间映射到内核空间，映射成功后，用户对这段内存区域的修改可以直接反映到内核空间，这种映射的方式就不需要在两个空间来回拷贝数据，提高了数据传输的效率。

Netty中的 `zero-copy` 不同于操作系统，它完全是在用户态(java 层面)，更多的偏向于优化数据操作这样的概念,体现在：

-  Netty 提供了 `CompositeByteBuf` 类, 它可以将多个 ByteBuf 合并为一个逻辑上的 ByteBuf, 避免了各个 ByteBuf 之间的拷贝
- 通过 wrap 操作, 我们可以将 byte[] 数组、ByteBuf、ByteBuffer等包装成一个 Netty ByteBuf 对象, 进而避免了拷贝操作
- ByteBuf 支持 slice 操作, 因此可以将 ByteBuf 分解为多个共享同一个存储区域的 ByteBuf, 避免了内存的拷贝
- 通过 `FileRegion` 包装的`FileChannel.tranferTo` 实现文件传输, 可以直接将文件缓冲区的数据发送到目标 Channel, 避免了传统通过循环 write 方式导致的内存拷贝问题

#### ByteBuf

ByteBuf是Netty进行数据读写交互的单位，结构如下:

![](/images/bytebuf.jpg)

1. ByteBuf 是一个字节容器，容器里面的的数据分为三个部分，第一个部分是已经丢弃的字节，这部分数据是无效的；第二部分是可读字节，这部分数据是 ByteBuf 的主体数据， 从 ByteBuf 里面读取的数据都来自这一部分;最后一部分的数据是可写字节，所有写到 ByteBuf 的数据都会写到这一段。最后一部分虚线表示的是该 ByteBuf 最多还能扩容多少容量

2. 以上三段内容是被两个指针给划分出来的，从左到右，依次是读指针（readerIndex）、写指针（writerIndex），然后还有一个变量 capacity，表示 ByteBuf 底层内存的总容量

3. 从 ByteBuf 中每读取一个字节，readerIndex 自增1，ByteBuf 里面总共有 writerIndex-readerIndex 个字节可读, 由此可以推论出当 readerIndex 与 writerIndex 相等的时候，ByteBuf 不可读

4. 写数据是从 writerIndex 指向的部分开始写，每写一个字节，writerIndex 自增1，直到增到 capacity，这个时候，表示 ByteBuf 已经不可写了

5. ByteBuf 里面其实还有一个参数 maxCapacity，当向 ByteBuf 写数据的时候，如果容量不足，那么这个时候可以进行扩容，直到 capacity 扩容到 maxCapacity，超过 maxCapacity 就会报错

#### 通过 CompositeByteBuf 实现零拷贝

假设我们有一份协议数据, 它由头部和消息体组成, 而头部和消息体是分别存放在两个 ByteBuf 中的, 即:
``` 
ByteBuf header = ...
ByteBuf body = ...
```
我们在代码处理中, 通常希望将 header 和 body 合并为一个 ByteBuf, 方便处理, 那么通常的做法是:
``` 
ByteBuf allBuf = Unpooled.buffer(header.readableBytes() + body.readableBytes());
allBuf.writeBytes(header);
allBuf.writeBytes(body);
```
将 header 和 body 都拷贝到了新的 allBuf 中了, 这无形中增加了两次额外的数据拷贝操作了


`CompositeByteBuf`可以高效优雅的实现同样的目的:
``` 
ByteBuf header = ...
ByteBuf body = ...

CompositeByteBuf compositeByteBuf = Unpooled.compositeBuffer();
compositeByteBuf.addComponents(true, header, body);
```
`CompositeByteBuf` 的 `addComponents` 将 header 和 body 两个 ByteBuf 
整合成了一个逻辑的整体，在CompositeByteBuf内部，这两个ByteBuf都是单独存在的，CompositeByteBuf只是一个逻辑上的整体:

![](/images/CompositeByteBuf.png)

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

`Unpooled.wrappedBuffer` 方法来将 bytes 包装成为一个 UnpooledHeapByteBuf 对象, 而在包装的过程中, 是不会有拷贝操作的. 即最后我们生成的生成的 ByteBuf 对象是和 bytes 数组共用了同一个存储空间, 对 bytes 的修改也会反映到 ByteBuf 对象中

#### 通过 slice 操作实现零拷贝

slice 操作和 wrap 操作刚好相反, Unpooled.wrappedBuffer 可以将多个 ByteBuf 合并为一个, 而 slice 操作可以将一个 ByteBuf 切片 为多个共享一个存储区域的 ByteBuf 对象,ByteBuf 提供了两个 slice 操作方法:
``` 
public ByteBuf slice();
public ByteBuf slice(int index, int length);
```
不带参数的 slice 方法等同于 buf.slice(buf.readerIndex(), buf.readableBytes()) 调用, 即返回 buf 中可读部分的切片. 而 slice(int index, int length) 方法相对就比较灵活了, 我们可以设置不同的参数来获取到 buf 的不同区域的切片.

用 slice 方法产生 byteBuf 的过程是没有拷贝操作的, header 和 body 对象在内部其实是共享了 byteBuf 存储空间的不同部分而已.

#### 通过 FileRegion 实现零拷贝

Netty 中使用 FileRegion 实现文件传输的零拷贝, 不过在底层 FileRegion 是依赖于 `Java NIO FileChannel.transfer` 的零拷贝功能.

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