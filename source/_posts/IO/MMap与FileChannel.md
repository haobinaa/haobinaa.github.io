---
title: MMAP 与 FileChannel
date: 2019-05-17 15:17:52
tags: IO
categories: IO
---
### FileChannel

FileChannel是一个连接到文件的通道,可以通过文件通道读写文件


#### 打开FileChannel

在使用FileChannel之前，必须先打开它。但是，我们无法直接打开一个FileChannel，需要通过使用一个`InputStream、OutputStream`或`RandomAccessFile`来获取一个FileChannel实例。下面是通过RandomAccessFile打开FileChannel的示例：
``` 
RandomAccessFile aFile = new RandomAccessFile("data/nio-data.txt", "rw");
FileChannel inChannel = aFile.getChannel();
```

#### FileChannel 读写数据

```java
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





### 内存映射

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
    

### mmap的使用

#### 文件内容拷贝
```
  public static void main(String args[]){
        RandomAccessFile f = null;
        try {
            f = new RandomAccessFile("=/user/home/hello.txt", "rw");
            RandomAccessFile world = new RandomAccessFile("/user/home/world.txt", "rw");
            FileChannel fc = f.getChannel();
            MappedByteBuffer buf = fc.map(FileChannel.MapMode.READ_WRITE, 0, 20);
            FileChannel worldChannel = world.getChannel();
            MappedByteBuffer worldBuf = worldChannel.map(FileChannel.MapMode.READ_WRITE, 0, 20);
            worldBuf.put(buf);

            fc.close();
            f.close();
            world.close();
            worldChannel.close();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
```

这样就可以把 hello.txt 里面的内容拷贝到 world.txt

#### 内存共享

两个Java进程map文件映射到内存，这样两个进程就可以通过这个共享内存区域实现进程间到通信了。

```java
// 进程1
public class Main {
    public static void main(String args[]){
        RandomAccessFile f = null;
        try {
            f = new RandomAccessFile("/user/hello.txt", "rw");
            FileChannel fc = f.getChannel();
            MappedByteBuffer buf = fc.map(FileChannel.MapMode.READ_WRITE, 0, 20);

            buf.put("how are you?".getBytes());

            Thread.sleep(10000);

            fc.close();
            f.close();

        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}

// 进程2
public class Main {
    public static void main(String args[]){
        RandomAccessFile f = null;
        try {
            f = new RandomAccessFile("/user/hello.txt", "rw");
            FileChannel fc = f.getChannel();
            MappedByteBuffer buf = fc.map(FileChannel.MapMode.READ_WRITE, 0, 20);

            buf.put("how are you?".getBytes());

            Thread.sleep(10000);

            fc.close();
            f.close();

        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
``` 

### 参考资料

- [对文件IO操作的一些最佳实践](https://www.cnkirito.moe/file-io-best-practise/)
- [并发编程网-FileChannel](http://ifeve.com/file-channel/)