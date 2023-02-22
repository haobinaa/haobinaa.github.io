---
title: 文件操作之 FileChannel 与 mmap
date: 2022-09-17 15:17:52
tags: IO
categories: IO
---

### Java 中的文件读写

Java 中原生读写方式大概可以被分为三种：普通 IO，FileChannel（文件通道），mmap（内存映射）。

例如 FileWriter,FileReader 存在于 java.io 包中，他们属于普通 IO；FileChannel 存在于 java.nio 包中，也是 Java 最常用的文件操作类；而 mmap，则是由 FileChannel 调用 map 方法衍生出来的一种特殊读写文件的方式，被称之为内存映射。

### FileChannel

FileChannel 被 JavaDocs 称呼为：A channel for reading, writing, mapping, and manipulating a file，即 FileChannel 是用于读、写、映射、维护一个文件的通道。 

FileChannel 优势:
1. 可以在文件的特定位置进行读写操作(操作文件指针)；
2. 可以直接将文件的一部分加载到内存中(mmap)；
3. 可以以更快的速度从一个通道传输文件数据到另一个通道(转入/转出其他通道)；
4. 可以锁定文件的一部分，以限制其他线程访问(文件锁)；
5. 为了避免数据丢失，我们可以强制将对文件的写入更新立即写入存储(force 刷盘)；


#### FileChannel API

|           方法            |       描述       |
|:-----------------------:|:--------------:|
|          open           | 创建 FileChannel |
|       read/write        |       读写       |
|          force          |      强制刷盘      |
|           map           |   mmap 内存映射    |
| transferTo/transferFrom |    转入/转出 通道    |
|      lock/tryLock       |     获取文件锁      |

#### 打开FileChannel

在使用FileChannel之前，必须先打开它。但是，我们无法直接打开一个FileChannel，需要通过使用一个`InputStream、OutputStream`或`RandomAccessFile`来获取一个FileChannel实例。下面是通过RandomAccessFile打开FileChannel的示例：
``` 
RandomAccessFile aFile = new RandomAccessFile("data/nio-data.txt", "rw");
FileChannel inChannel = aFile.getChannel();
```

#### FileChannel 读写数据

```
// 写
byte[] data = new byte[4096];
long position = 1024L;
// 指定 position 写入 4kb 的数据
fileChannel.write(ByteBuffer.wrap(data), position);
// 从当前文件指针的位置写入 4kb 的数据
fileChannel.write(ByteBuffer.wrap(data));

// 读
ByteBuffer buffer = ByteBuffer.allocate(4096);
long position = 1024L;
// 指定 position 读取 4kb 的数据
fileChannel.read(buffer,position)；
// 从当前文件指针的位置读取 4kb 的数据
fileChannel.read(buffer);
```
#### 刷盘

`FileChannel#force` 方法用于这个 Channel 更新的内容直接写入文件 ，而不是 pagecache。

这个方法适用于断电等意外情况， 强制保存数据。


#### FileChannel 间数据传输

FileChannel#transferTo 以及 FileChannel#transferFrom 用于文件通道的内容转出到另一个通道或者将另一个通道的内容转入当前通道。

如：
```
srcChannel.transferTo(0, Integer.MAX_VALUE, dstChannel);
srcChannel.transferFrom(fromChannel, 0, Integer.MAX_VALUE);
```

该两个方法可以实现通道字节数据的快速转移，不仅在简化代码量（少了中间内存的数据拷贝转移）而且还大幅到提高了性能。

#### 内存映射

内存映射文件的作用是使一个磁盘文件与内存中的一个缓冲区建立映射关系，然后当从缓冲区中取数据，就相当于读文件中的相应字节；而将数据存入缓冲区，就相当于写文件中的相应字节。这样就可以不使用read和write直接执行I/O了。(本来流程应该是磁盘->内核缓存区->用户空间)

Java中`FileChannel`提供了map方法，把文件映射成内存映射文件:
```
MappedByteBuffer map(int mode,long position,long size); 
```
- position: 文件开始
- size：映射的文件区域大小
- mode: 访问该内存映射文件的方式，取值可以为：
    - READ_ONLY(只读)
    - READ_WRITE(读写)
    - PRIVATE，这种方式的更改不会传播到文件，而是创建一个修改副本
    
#### 文件锁

文件锁在 OS 中很常见，如果多个程序同时访问、修改同一个文件，很容易因为文件数据不同步而出现问题。给文件加一个锁，同一时间，只能有一个程序修改此文件，或者程序都只能读此文件，这就解决了同步问题，保证了线程安全（这里持有文件锁的是进程级别不是线程）。

一旦某个进程（比如说JVM实例）对某个文件加锁，则在释放这个锁之前，此进程不能再对此文件加锁，就是说JVM实例在同一文件上的文件锁是不重叠的（进程级别不能重复在同一文件上获取锁）。



使用示例:
``` 
FileChannel channel = rf.getChannel();
// 持有文件锁
FileLock lock = channel.lock(0L, 23L, false);
// 释放文件锁
lock.release();
```

其中，false 意味着独占模式，true 则对应共享模式。

FileLock 的几个重要重点事项如下：

- 文件锁 FileLock 是被整个 JVM 持有的，即 FileLock 是进程级别的，所以不可用于作为多线程安全控制的同步工具。
- 虽然上面提到 FileLock 不可用于多线程访问安全控制，但是多线程访问是安全的。如果线程 1 获取了文件锁 FileLock（共享或者独占），线程 2 再来请求获取该文件的文件锁，则会抛出 `OverlappingFileLockException`
- 一个程序获取到 FileLock 后，是否会阻止另一个程序访问相同文件具重叠内容的部分取决于操作系统的实现，具有不确定性。FileLock 的实现依赖于底层操作系统实现的本地文件锁设施。
- 以上所说的文件锁的作用域是文件的区域，可以时整个文件内容或者只是文件内容的一部分。独占和共享也是针对文件区域而言。程序（或者线程）获取文件 0 至 23 范围的锁，另一个程序（或者线程）仍然能获取文件 23 至以后的范围。只要作用的区域无重叠，都相互无影响。


#### 关于 FileChannel 的读写效率

由于 FileChannel 采用了 ByteBuffer 这样的内存缓冲区，让我们可以非常精准的控制写盘的大小， 这样在写入 4KB(linux 默认一页的大小) 的整数倍的时候， 效率会非常高。

这也是我们常说的顺序读写比随机读写快这个结论的支撑:
1. 对于文件的读写操作， 实际上并不是直接作用于磁盘的， 中间是有一层 pagecache。
2. 操作系统有一个预读机制(read ahead), 会提前预读一部分到 pagecache 中(读取的粒度由操作系统控制， 采取快速窗口扩张算法， 首次预读一般是 `readahead_size * 2`)
3. 这样读写都是和内存(pagecache)打交道， 减少了IO次数， 所以提高了读写效率

> 补充: pagecache 监控工具: https://github.com/brendangregg/perf-tools

### ByteBuffer 

FileChannel 是通过控制 ByteBuffer 来完成读写的.  整体 UML 如下:
![](/images/nio/bb_uml.png)


#### 创建方式

1. allocation 直接创建
```
// 普通 ByteBuffer
ByteBuffer buffer = ByteBuffer.allocate(10);

// 堆外内存
ByteBuffer buffer = ByteBuffer.allocateDirect(10);
```

2. Wrapping 从 byte 数组创建
```
// 直接 wrap
byte[] bytes = new byte[10];
ByteBuffer buffer = ByteBuffer.wrap(bytes);
// 等同于上面的方式
ByteBuffer buffer = ByteBuffer.wrap(bytes, 0, bytes.length);
```

#### 基本索引使用

- capacity: buffer 元素的最大容量
- limit: read 或 write 的最大索引位置
- position: 当前 read 或 write 的索引位置
- mark: 用于标记的索引位置

整体的位置关系如下:
``` 
0 <= mark <= position <= limit <= capacity
```

以一个新创建的 ByteBuffer 为例说明各指针的位置:
```
// 创建一个 ByteBuffer。 此刻 mark 为 -1， position 为 0， limit 和 capacity 都是 10
ByteBuffer buffer = ByteBuffer.allocate(10);
// capacity 是无法改变的， 可以通过方法改变 position 和 limit 的位置
buffer. position(2); // 改变 position 的位置到 2
buffer.limit(5); // 改变 limit 的位置到 5
```

#### mark 和 reset

mark 和 reset 搭配使用可以标记一个指定的位置， 然后回到标记的位置。 当 ByteBuffer 初始化后， 调用 `mark()` 记录当前的位置， 后续可以通过调用 `reset()` 来回到之前 mark 标记的位置。 使用如下:
``` 
ByteBuffer buffer = ByteBuffer.allocate(10); // mark = -1, position = 0
buffer.position(2);                          // mark = -1, position = 2
buffer.mark();                               // mark = 2,  position = 2
buffer.position(5);                          // mark = 2,  position = 5
buffer.reset();                              // mark = 2,  position = 2
```

#### clear, Flip, Rewind 和 Compact

clear, Flip, Rewind,  Compact 这几个方法的作用有很多相似的地方和一些细微的差别， 对比如下:

- clear: limit=capacity, position=0, mark=-1。 相当于初始化 buffer， 为下一次读写做准备
- flip: limit=position, position=0, mark=-1。 切换读写模式， 但是要避免连续两次调用 flip, 这样会把 limit 设置到 0， 变得无法读写。
- rewind: position=0, mark=-1. 用于重头开始读数据。
- compact: limit=capacity, position=remaining(还未处理的部分), mark=-1。 用于将未处理的部分(limit-position)拷贝到 buffer 的头部， 然后从未处理数据的尾部开始写(等于只覆盖已处理的字节部分)

示例讲解:
``` 
// 初始化各个指针位置
ByteBuffer buffer = ByteBuffer.allocate(10); // mark = -1, position = 0, limit = 10
buffer.position(2);                          // mark = -1, position = 2, limit = 10
buffer.mark();                               // mark = 2,  position = 2, limit = 10
buffer.position(5);                          // mark = 2,  position = 5, limit = 10
buffer.limit(8);                             // mark = 2,  position = 5, limit = 8
```

clear 将 limit 设置为 capacity 位置， mark 设置为 -1, position 设置为 0。 一般在重新填充 buffer 前调用
```
buffer.clear();                              // mark = -1, position = 0, limit = 10
```
flip 将 limit 设置到 position 位置， position 设置为0， mark 设置为 -1。
```
buffer.flip();                               // mark = -1, position = 0, limit = 5
```
rewind 让 limit 保持不变， 将 position 设置为 0， mark 位置为 -1。 相当于重头读写 buffer
``` 
buffer.rewind();                             // mark = -1, position = 0, limit = 8
```
compact 将 limit 设置到 capacity 位置， position 指向还未处理的位置(limit-position)， mark 置为 -1
``` 
buffer.compact();                            // mark = -1, position = 3, limit = 10
```

### 堆外内存和堆外内存

ByteBuffer 可以通过 `ByteBuffer.allocate` 来分配堆内内存， 使用 `ByteBuffer.allocateDirect` 来分配堆外内存。 这两者的比较:

| -      |     堆内内存      | 堆外内存                                                                                                     |
|:-------|:-------------:|:---------------------------------------------------------------------------------------------------------|
| 底层实现   |   数组，JVM堆内存   | `unsafe.allocateMemory(size)` 分配直接内存                                                                     |
| 分配大小限制 | `-Xms-Xmx`限制  | 可以通过 `-XX:MaxDirectMemorySize`从JVM层面限制，同时也受到物理内存限制                                                       |
| 垃圾回收   |     gc 回收     | DirectByteBuffer 不再被使用的时候， 会发出内部的 cleaner 钩子， 保险通过:`((DirectByteBuffer)buffer)).cleaner().clean()` 来手动回收 |
| 拷贝方式   | 用户态和内核态之间来回拷贝 | 内核态                                                                                                      |

#### HeapByteBuffer 复制的问题

FileChannel 操作的时候使用 ByteBuffer， 默认是使用的堆内内存 `HeapByteBuffer`， 一般代码操作如下:
``` 
public void readInOneThread() throws Exception {
    int bufferSize = 50 * 1024 * 1024;
    File file = new File("/demo.txt");
    FileChannel fileChannel = new RandomAccessFile(file, "rw").getChannel();
    ByteBuffer byteBuffer = ByteBuffer.allocate(bufferSize);
    fileChannel.read(byteBuffer);
}
```
上述代码讲文件中的数据缓存到了内存中，在多线程的场景下， 控制线程数每个线程分 50MB 缓存是没问题的。 但是如果直接使用上面的代码， 很可能有内存溢出的问题。

FileChannel 使用的是 IOUtil 来进行读操作的， 源码如下:
``` 
// IOUtil#read
static int read(FileDescriptor var0, ByteBuffer var1, long var2, NativeDispatcher var4) throws IOException {
    if (var1.isReadOnly()) {
        throw new IllegalArgumentException("Read-only buffer");
    } else if (var1 instanceof DirectBuffer) { 
    // 直接内存走这里
        return readIntoNativeBuffer(var0, var1, var2, var4);
    } else {
      // 堆内内存走这里
        ByteBuffer var5 = Util.getTemporaryDirectBuffer(var1.remaining());

        int var7;
        try {
          // 将数据读取到直接内存里面
            int var6 = readIntoNativeBuffer(var0, var5, var2, var4);
            var5.flip();
            if (var6 > 0) {
                // 从直接内存拷贝到堆内内存
                var1.put(var5);
            }

            var7 = var6;
        } finally {
            Util.offerFirstTemporaryDirectBuffer(var5);
        }

        return var7;
    }
}
```

可以发现如果是堆内内存会走这个逻辑: `Util.getTemporaryDirectBuffer(var1.remaining());`, 封装的源码如下:
``` 
public class Util {
    private static ThreadLocal<Util.BufferCache> bufferCache;
    
    public static ByteBuffer getTemporaryDirectBuffer(int var0) {
        if (isBufferTooLarge(var0)) {
            return ByteBuffer.allocateDirect(var0);
        } else {
            // FOUCS ON THIS LINE
            Util.BufferCache var1 = (Util.BufferCache)bufferCache.get();
            ByteBuffer var2 = var1.get(var0);
            if (var2 != null) {
                return var2;
            } else {
                if (!var1.isEmpty()) {
                    var2 = var1.removeFirst();
                    free(var2);
                }

                return ByteBuffer.allocateDirect(var0);
            }
        }
    }
    // ..... 省略其他逻辑
}
```

isBufferTooLarge 这个方法会根据传入 Buffer 的大小决定如何分配堆外内存，如果过大，直接分配大缓冲区；如果不是太大，会使用 bufferCache 这个 ThreadLocal 变量来进行缓存，从而复用（实际上这个数值非常大，几乎不会走进直接分配堆外内存这个分支）。这么可以得出两个结论：
1. 使用 HeapByteBuffer 读写都会经过 DirectByteBuffer， 读取数据的流转方式是: DisK->PageCache->DirectByteBuffer->HeapByteBuffer， 写入数据的过程正好相反
2. 使用 HeapByteBuffer 读写会申请一块跟线程绑定的 DirectByteBuffer(IOUtil里面的ThreadLocal变量)。这意味着，线程越多，临时 DirectByteBuffer 就越会占用越多的空间。

所以在线程过多的时候， 就容易引起 DirectByteBuffer 上升导致堆外内存溢出.

解决方案可以借鉴 IOUtil 复制的思路， 因为从磁盘到堆内的复制是省略不了堆外内存的复制， 那就把直接内存控制在自己的逻辑上， 从而避免被 FileChannel 复杂的内部逻辑左右: 
``` 
public void directBufferCopy() throws Exception {
    File file = new File("/essd");
    FileChannel fileChannel = new RandomAccessFile(file, "rw").getChannel();
    ByteBuffer byteBuffer = ByteBuffer.allocate(50 * 1024 * 1024);
    ByteBuffer directByteBuffer = ByteBuffer.allocateDirect(4 * 1024);
    for (int i = 0; i < 12800; i++) {
        directByteBuffer.clear();
        // 读取到自己的堆外内存
        fileChannel.read(directByteBuffer, i * 4 * 1024);
        // 拷贝到堆内内存
        directByteBuffer.flip();
        byteBuffer.put(directByteBuffer);
    }
}
```

#### 堆外内存的回收

上面说了使用 HeapByteBuffer 的时候要经过 DirectByteBuffer， 而不是直接从堆内内存写入 PageCache 然后刷盘， 这种设计的考量根据R大的解释:

> 这里其实是在迁就OpenJDK里的HotSpot VM的一点实现细节。
HotSpot VM 里的 GC 除了 CMS 之外都是要移动对象的，是所谓“compacting GC”。
如果要把一个Java里的 byte[] 对象的引用传给native代码，让native代码直接访问数组的内容的话，就必须要保证native代码在访问的时候这个 byte[] 对象不能被移动，也就是要被“pin”（钉）住。
可惜 HotSpot VM 出于一些取舍而决定不实现单个对象层面的 object pinning，要 pin 的话就得暂时禁用 GC——也就等于把整个 Java 堆都给 pin 住。
所以 Oracle/Sun JDK / OpenJDK 的这个地方就用了点绕弯的做法。它假设把 HeapByteBuffer 背后的 byte[] 里的内容拷贝一次是一个时间开销可以接受的操作，同时假设真正的 I/O 可能是一个很慢的操作。
于是它就先把 HeapByteBuffer 背后的 byte[] 的内容拷贝到一个 DirectByteBuffer 背后的 native memory去，这个拷贝会涉及 sun.misc.Unsafe.copyMemory() 的调用，背后是类似 memcpy() 的实现。这个操作本质上是会在整个拷贝过程中暂时不允许发生 GC 的。
然后数据被拷贝到 native memory 之后就好办了，就去做真正的 I/O，把 DirectByteBuffer 背后的 native memory 地址传给真正做 I/O 的函数。这边就不需要再去访问 Java 对象去读写要做 I/O 的数据了。

总结来说:
- 为了方便 GC 的实现， DirectByteBuffer 指向的 native memory 是不受 GC 管辖的
- HeapByteBuffer 背后使用的是 byte 数组，其占用的内存不一定是连续的，不太方便 JNI 方法的调用


##### DirectByteBuffer 直接内存的回收

观察堆外内存的回收可以通过 `Java VisualVM` 安装 `MBeans 和 Buffer Pools` 两个插件即可

1. GC时会回收不再使用的直接内存:
``` 
  public static void systemGC() throws IOException, InterruptedException {
      ByteBuffer buffer = ByteBuffer.allocateDirect(1024 * 1024 * 1024);
      System.in.read();
      buffer = null;
      // 手动触发GC可以回收堆外内存
      System.gc();
      new CountDownLatch(1).await();
  }
```

2. 手动回收
``` 
public static void cleanerGC() throws InterruptedException, IOException {
    ByteBuffer buffer = ByteBuffer.allocateDirect(1024 * 1024 * 1024);
    System.in.read();
    // 通过 cleaner 来回收
    ((DirectBuffer) buffer).cleaner().clean();
    new CountDownLatch(1).await();
} 
```


### mmap 的使用

mmap 是一种内存映射文件的方法，即将一个文件映射到进程的地址空间，实现文件磁盘地址和一段进程虚拟地址的映射。实现这样的映射关系后，进程就可以采用指针的方式读写操作这一段内存，而系统会自动回写脏页到对应的文件磁盘上，即完成了对文件的操作而不必再调用 read,write 等系统调用函数。相反，内核空间对这段区域的修改也直接反映用户空间，从而可以实现不同进程间的文件共享。

在操作系统层面提供的 mmap 调用函数:
``` 
void *mmap(void *start, size_t length, int prot, int flags, int fd, off_t offset);
int munmap( void * addr, size_t len);
int msync( void *addr, size_t len, int flags);
```

#### java 中 mmap

java 中主要通过 FileChannel 来进行 mmap(内存映射)， 通过 `MmapedByteBuffer` 来进行内存相关操作:
``` 
// 开启 mmap
FileChannel fileChannel = new RandomAccessFile(new File("test.log"), "rw").getChannel();
MappedByteBuffer mappedByteBuffer = fileChannel.map(FileChannel.MapMode.READ_WRITE, 0, fileChannel.size());

// 写
byte[] data = new byte[4];
int position = 8;
// 从 mmap 当前指针写入 4b 数据
mappedByteBuffer.put(data);
// 指定 position 位置写入 4b 数据
MappedByteBuffer subMmap = (MappedByteBuffer) mappedByteBuffer.slice();
subMmap.position(position);
subMmap.put(data);

// 读
byte[] readData = new byte[4];
// 从当前指针读 4b
mappedByteBuffer.get(data);
// 从指定位置读 4b
subMmap.position(position);
subMmap.get(data);
```

这里需要注意的是, 通过`fileChannel.map(FileChannel.MapMode.READ_WRITE, 0, 1)` 读取 1GB 文件的方式， 这是一个消耗很小的操作， 此时并不意味着 1G 的文件读入了 pagecache。 只有进行了真正的读取才行， 如:
``` 
FileChannel fileChannel = new RandomAccessFile(new File("test.log"), "rw").getChannel();
// 真正使用 MappedByteBuffer 进行读取了才会确保文件进入 pagecache
MappedByteBuffer mappedByteBuffer = fileChannel.map(FileChannel.MapMode.READ_WRITE, 0, 1);
for(int i = 0; i < _1GB; i += _4KB) {
  temp += map.get(i);
}
```

#### mmap 零拷贝与刷盘效率问题

先看两段写文件:
``` 
// 方法一， 一次写 4KB， 写 1GB
System.out.println(LocalDateTime.now());
FileChannel fileChannel = new RandomAccessFile(new File("test.log"), "rw").getChannel();
ByteBuffer byteBuffer = ByteBuffer.allocate(_4KB);
for (int i = 0; i < _4KB; i++) {
    byteBuffer.put((byte) 0);
}
for (int i = 0; i < _GB; i += _4KB) {
    byteBuffer.position(0);
    byteBuffer.limit(_4KB);
    fileChannel.write(byteBuffer);
}
System.out.println(LocalDateTime.now());


// 方法二， 一次写 1byte， 写 1GB
System.out.println(LocalDateTime.now());
FileChannel fileChannel = new RandomAccessFile(new File("test.log"), "rw").getChannel();
ByteBuffer byteBuffer = ByteBuffer.allocate(1);
byteBuffer.put((byte) 0);
for (int i = 0; i < _GB; i++) {
    byteBuffer.position(0);
    byteBuffer.limit(1);
    fileChannel.write(byteBuffer);
}
System.out.println(LocalDateTime.now());
```
方法一： 写 4KB 缓冲刷盘， 实测写 1GB 大概 2120ms
方法二: 写 1byte 缓冲刷盘，实测写 1GB 文件， 1min 写了大概 9MB 左右， 差距巨大。


使用写入缓冲区是一个非常经典的优化技巧，用户只需要设置 4kb 整数倍的写入缓冲区，聚合小数据的写入，就可以使得数据从 pageCache 刷盘时，尽可能是 4kb 的整数倍，避免写入放大问题。
但pageCache 其实本身也是一层缓冲，实际写入 1byte 并不是同步刷盘的，相当于写入了内存，pageCache 刷盘由操作系统自己决策。那为什么方法二这么慢呢？主要就在于 filechannel 的 read/write 底层相关联的系统调用，是需要切换内核态和用户态的，注意，这里跟内存拷贝没有任何关系，导致态切换的根本原因是 read/write 关联的系统调用本身。方法二比方法一多切换了 4096 倍，态的切换成为了瓶颈，导致耗时严重。
总的来说， 用户态写入缓冲区的两个意义:
1. 方便做 4kb 对齐，ssd 刷盘友好
2. 减少用户态和内核态的切换次数，cpu 友好


使用 mmap 其底层提供了映射能力， 不需要内核态和用户态的切换， 使用如下代码:
``` 
System.out.println(LocalDateTime.now());
FileChannel fileChannel = new RandomAccessFile(new File("test.log"), "rw").getChannel();
MappedByteBuffer mappedByteBuffer = fileChannel.map(FileChannel.MapMode.READ_WRITE, 0, _GB);
for (int i = 0; i < _GB; i++) {
    mappedByteBuffer.put((byte) 0);
}
System.out.println(LocalDateTime.now());
```
实测这种方法大概在 1200ms 左右， 说明了**在一次写入小数据量场景下， 瓶颈不在于IO， 而在于用户态和内核态的切换**

#### mmap 内存的回收

与 DirectByteBuffer 类似(实际上DirectByteBuffer 是 MappedByteBuffer 的子类)， 通过 cleaner 来回收:
``` 
((DirectByteBuffer) mmap).cleaner().clean()
```

#### mmap 使用场景

1. 频繁处理小数据场景

如果 IO 非常频繁，数据却非常小，推荐使用 mmap，以避免 FileChannel 导致的切态问题。例如索引文件的追加写。

2. 小文件的读写

mmap 由于其不切态的特性，特别适合顺序读写，但由于 `sun.nio.ch.FileChannelImpl#map(MapMode mode, long position, long size)`  中 size 的限制，只能传递一个 int 值，所以，单次 map 单个文件的长度不能超过 2G，如果将 2G 作为文件大 or 小的阈值，那么小于 2G 的文件使用 mmap 来读写一般来说是有优势的。在 RocketMQ 中也利用了这一点，为了能够方便的使用 mmap，将 commitLog 的大小按照 1G 来进行切分。RocketMQ 等消息队列一直在使用 mmap。

3. mmap 缓存

当使用 FileChannel 进行文件读写时，往往需要一块写入缓存以达到聚合的目的，最常使用的是堆内/堆外内存，但他们都有一个问题，即当进程挂掉后，堆内/堆外内存会立刻丢失，这一部分没有落盘的数据也就丢了。而使用 mmap 作为缓存，会直接存储在 pageCache 中，不会导致数据丢失，尽管这只能规避进程被 kill 这种情况，无法规避掉电。

### 参考资料

- [对文件IO操作的一些最佳实践](https://www.cnkirito.moe/file-io-best-practise/)
- [并发编程网-FileChannel](http://ifeve.com/file-channel/)
- [重新认识java中的内存映射(mmap)](https://mp.weixin.qq.com/s?__biz=MzI0NzEyODIyOA==&mid=2247487748&idx=1&sn=6d1f80d6f295b1c82ee72b90e16e916f&chksm=e9b598cfdec211d96730f7ea964a472d39d6d462a7c4ce1a65120756fda9a66a9a9ea1dfc535&scene=178&cur_album_id=2015403550708662273#rd)