---
title: javaIO网络编程参考
date: 2018-08-08 17:16:12
tags: 网络IO
categories: IO
---

### 传统BIO模型
传统BIO编程模型实现如下:
``` 
{
 ExecutorService executor = Excutors.newFixedThreadPollExecutor(100);//线程池

 ServerSocket serverSocket = new ServerSocket();
 serverSocket.bind(8088);
 while(!Thread.currentThread.isInturrupted()){//主线程死循环等待新连接到来
 Socket socket = serverSocket.accept();
 executor.submit(new ConnectIOnHandler(socket));//为新的连接创建新的线程
 }

class ConnectIOnHandler extends Thread{
    private Socket socket;
    public ConnectIOnHandler(Socket socket){
       this.socket = socket;
    }
    public void run(){
      while(!Thread.currentThread.isInturrupted()&&!socket.isClosed()){死循环处理读写事件
          String someThing = socket.read()....//读取数据
          if(someThing!=null){
             ......//处理数据
             socket.write()....//写数据
          }

      }
    }
}
```
socket.accept()、socket.read()、socket.write()
三个主要函数都是同步阻塞的，当一个连接在处理I/O的时候，系统是阻塞的，如果是单线程的话必然就挂死在那里；但CPU是被释放出来的，开启多线程，就可以让CPU去处理更多的事情。

这也是所有使用多线程的本质：
1. 利用多核
2. 当I/O阻塞系统，但CPU空闲的时候，可以利用多线程使用CPU资源


### 参考资料
- [java nio浅析](https://tech.meituan.com/nio.html)
- [IO模型到netty](https://juejin.im/post/58bbaee6ac502e006b02f607)
- [IO多路复用原理剖析](https://juejin.im/post/59f9c6d66fb9a0450e75713f)
