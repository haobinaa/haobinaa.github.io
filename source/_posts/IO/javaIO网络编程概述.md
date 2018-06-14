---
title: javaIO网络编程
date: 2018-01-29 17:16:12
tags: 网络IO
categories: IO
---
### 概述

系统优化瓶颈一般不在CPU、内存的性能上，I/O成了重点关注的方向

- BIO(Blocking IO):同步阻塞I/O模式，数据的读取写入必须阻塞在一个线程内等待其完成。这里使用那个经典的烧开水例子，这里假设一个烧开水的场景，有一排水壶在烧开水，BIO的工作模式就是， 叫一个线程停留在一个水壶那，直到这个水壶烧开，才去处理下一个水壶。但是实际上线程在等待水壶烧开的时间段什么都没有做

- NIO(New I/O):同时支持阻塞与非阻塞模式，但这里我们以其同步非阻塞I/O模式来说明，那么什么叫做同步非阻塞？如果还拿烧开水来说，NIO的做法是叫一个线程不断的轮询每个水壶的状态，看看是否有水壶的状态发生了改变，从而进行下一步的操作。

- AIO( Asynchronous I/O): 异步非阻塞I/O模型。异步非阻塞与同步非阻塞的区别在哪里？异步非阻塞无需一个线程去轮询所有IO操作的状态改变，在相应的状态改变后，系统会通知对应的线程来处理。对应到烧开水中就是，为每个水壶上面装了一个开关，水烧开之后，水壶会自动通知我水烧开了。


在进程中，I/O调用步骤一般为：
1. 进程向操作系统请求数据
2. 操作系统把外部数据加载到内核的缓冲区中
3. 操作系统把内核的缓冲区拷贝到进程的缓冲区
4. 进程获得数据完成自己的功能

当操作系统在把外部数据放到进程缓冲区的这段时间（即上述的第二，三步），如果应用进程是挂起等待的，那么就是同步IO，反之，就是异步IO，也就是AIO 。

### BIO
这是最基本与简单的I/O操作方式，其根本特性是做完一件事再去做另一件事，一件事一定要等前一件事做完。

BIO模型下一个线程同时只能做一个工作，如果线程在执行过程中依赖于需要等待的资源，那么该线程会长期处于阻塞状态，我们知道在整个操作系统中，线程是系统执行的基本单位，在BIO模型下的线程 阻塞就会导致系统线程的切换，从而对整个系统性能造成一定的影响。




#### 传统的BIO编程

网络编程的基本模型是C/S模型，即两个进程间的通信。

服务端提供IP和监听端口，客户端通过连接操作想服务端监听的地址发起连接请求，通过三次握手连接，如果连接成功建立，双方就可以通过套接字进行通信

 传统的同步阻塞模型开发中，ServerSocket负责绑定IP地址，启动监听端口；Socket负责发起连接操作。连接成功后，双方通过输入和输出流进行同步阻塞式通信。
 
 BIO的服务端通信模型：采用BIO通信模型的服务端，通常由一个独立的Acceptor线程负责监听客户端的连接，它接收到客户端连接请求之后为每个客户端创建一个新的线程进行链路处理没处理完成后，通过输出流返回应答给客户端，线程销毁。即典型的一请求一应答通信模型：
 ![](http://blog.anxpp.com/usr/uploads/2016/05/549520916.png)
 
 ##### 同步阻塞示例Server端代码：
 
 ``` 
 public final class ServerNormal {  
     //默认的端口号  
     private static int DEFAULT_PORT = 12345;  
     //单例的ServerSocket  
     private static ServerSocket server;  
     //根据传入参数设置监听端口，如果没有参数调用以下方法并使用默认值  
     public static void start() throws IOException{  
         //使用默认值  
         start(DEFAULT_PORT);  
     }  
     //这个方法不会被大量并发访问，不太需要考虑效率，直接进行方法同步就行了  
     public synchronized static void start(int port) throws IOException{  
         if(server != null) return;  
         try{  
             //通过构造函数创建ServerSocket  
             //如果端口合法且空闲，服务端就监听成功  
             server = new ServerSocket(port);  
             System.out.println("服务器已启动，端口号：" + port);  
             //通过无线循环监听客户端连接  
             //如果没有客户端接入，将阻塞在accept操作上。  
             while(true){  
                 Socket socket = server.accept();  
                 //当有新的客户端接入时，会执行下面的代码  
                 //然后创建一个新的线程处理这条Socket链路  
                 new Thread(new ServerHandler(socket)).start();  
             }  
         }finally{  
             //一些必要的清理工作  
             if(server != null){  
                 System.out.println("服务器已关闭。");  
                 server.close();  
                 server = null;  
             }  
         }  
     }  
 }  
 ```
 ServerHandler
 ``` 
 public class ServerHandler implements Runnable{  
     private Socket socket;  
     public ServerHandler(Socket socket) {  
         this.socket = socket;  
     }  
     @Override  
     public void run() {  
         BufferedReader in = null;  
         PrintWriter out = null;  
         try{  
             in = new BufferedReader(new InputStreamReader(socket.getInputStream()));  
             out = new PrintWriter(socket.getOutputStream(),true);  
             String expression;  
             String result;  
             while(true){  
                 //通过BufferedReader读取一行  
                 //如果已经读到输入流尾部，返回null,退出循环  
                 //如果得到非空值，就尝试计算结果并返回  
                 if((expression = in.readLine())==null) break;  
                 System.out.println("服务器收到消息：" + expression);  
                 try{  
                     result = Calculator.cal(expression).toString();  
                 }catch(Exception e){  
                     result = "计算错误：" + e.getMessage();  
                 }  
                 out.println(result);  
             }  
         }catch(Exception e){  
             e.printStackTrace();  
         }finally{  
             //一些必要的清理工作  
             if(in != null){  
                 try {  
                     in.close();  
                 } catch (IOException e) {  
                     e.printStackTrace();  
                 }  
                 in = null;  
             }  
             if(out != null){  
                 out.close();  
                 out = null;  
             }  
             if(socket != null){  
                 try {  
                     socket.close();  
                 } catch (IOException e) {  
                     e.printStackTrace();  
                 }  
                 socket = null;  
             }  
         }  
     }  
 }  
 ```

##### 同步阻塞IO Client源码
``` 
public class Client {  
    //默认的端口号  
    private static int DEFAULT_SERVER_PORT = 12345;  
    private static String DEFAULT_SERVER_IP = "127.0.0.1";  
    public static void send(String expression){  
        send(DEFAULT_SERVER_PORT,expression);  
    }  
    public static void send(int port,String expression){  
        System.out.println("算术表达式为：" + expression);  
        Socket socket = null;  
        BufferedReader in = null;  
        PrintWriter out = null;  
        try{  
            socket = new Socket(DEFAULT_SERVER_IP,port);  
            in = new BufferedReader(new InputStreamReader(socket.getInputStream()));  
            out = new PrintWriter(socket.getOutputStream(),true);  
            out.println(expression);  
            System.out.println("___结果为：" + in.readLine());  
        }catch(Exception e){  
            e.printStackTrace();  
        }finally{  
            //一下必要的清理工作  
            if(in != null){  
                try {  
                    in.close();  
                } catch (IOException e) {  
                    e.printStackTrace();  
                }  
                in = null;  
            }  
            if(out != null){  
                out.close();  
                out = null;  
            }  
            if(socket != null){  
                try {  
                    socket.close();  
                } catch (IOException e) {  
                    e.printStackTrace();  
                }  
                socket = null;  
            }  
        }  
    }  
}  
```

##### 测试
``` 
public class Test {  
    //测试主方法  
    public static void main(String[] args) throws InterruptedException {  
        //运行服务器  
        new Thread(new Runnable() {  
            @Override  
            public void run() {  
                try {  
                    ServerBetter.start();  
                } catch (IOException e) {  
                    e.printStackTrace();  
                }  
            }  
        }).start();  
        //避免客户端先于服务器启动前执行代码  
        Thread.sleep(100);  
        //运行客户端   
        char operators[] = {'+','-','*','/'};  
        Random random = new Random(System.currentTimeMillis());  
        new Thread(new Runnable() {  
            @SuppressWarnings("static-access")  
            @Override  
            public void run() {  
                while(true){  
                    //随机产生算术表达式  
                    String expression = random.nextInt(10)+""+operators[random.nextInt(4)]+(random.nextInt(10)+1);  
                    Client.send(expression);  
                    try {  
                        Thread.currentThread().sleep(random.nextInt(1000));  
                    } catch (InterruptedException e) {  
                        e.printStackTrace();  
                    }  
                }  
            }  
        }).start();  
    }  
}  
```

#### 改进：伪异步I/O编程
BIO主要的问题在于每当有一个新的客户端请求接入时，服务端必须创建一个新的线程来处理这条链路，在需要满足高性能、高并发的场景是没法应用的（大量创建新的线程会严重影响服务器性能，甚至罢工）。

为了改进这种一连接一线程的模型，我们可以使用线程池来管理这些线程，实现1个或多个线程处理N个客户端的模型（但是底层还是使用的同步阻塞I/O），通常被称为“伪异步I/O模型“。如下：
![](http://blog.anxpp.com/usr/uploads/2016/05/614169023.png)


改动之前Server的代码如下：

``` 
public final class ServerBetter {  
    //默认的端口号  
    private static int DEFAULT_PORT = 12345;  
    //单例的ServerSocket  
    private static ServerSocket server;  
    //线程池 懒汉式的单例  
    private static ExecutorService executorService = Executors.newFixedThreadPool(60);  
    //根据传入参数设置监听端口，如果没有参数调用以下方法并使用默认值  
    public static void start() throws IOException{  
        //使用默认值  
        start(DEFAULT_PORT);  
    }  
    //这个方法不会被大量并发访问，不太需要考虑效率，直接进行方法同步就行了  
    public synchronized static void start(int port) throws IOException{  
        if(server != null) return;  
        try{  
            //通过构造函数创建ServerSocket  
            //如果端口合法且空闲，服务端就监听成功  
            server = new ServerSocket(port);  
            System.out.println("服务器已启动，端口号：" + port);  
            //通过无线循环监听客户端连接  
            //如果没有客户端接入，将阻塞在accept操作上。  
            while(true){  
                Socket socket = server.accept();  
                //当有新的客户端接入时，会执行下面的代码  
                //然后创建一个新的线程处理这条Socket链路  
                executorService.execute(new ServerHandler(socket));  
            }  
        }finally{  
            //一些必要的清理工作  
            if(server != null){  
                System.out.println("服务器已关闭。");  
                server.close();  
                server = null;  
            }  
        }  
    }  
}  
```
我们知道，如果使用CachedThreadPool线程池（不限制线程数量，如果不清楚请参考文首提供的文章），其实除了能自动帮我们管理线程（复用），看起来也就像是1:1的客户端：线程数模型，而使用FixedThreadPool我们就有效的控制了线程的最大数量，保证了系统有限的资源的控制，实现了N:M的伪异步I/O模型。


但是，正因为限制了线程数量，如果发生大量并发请求，超过最大数量的线程就只能等待，直到线程池中的有空闲的线程可以被复用。而对Socket的输入流就行读取时，会一直阻塞，直到发生：
- 有数据读
- 可用数据以及读取完毕
- 发生空指针或异常


 所以在读取数据较慢时（比如数据量大、网络传输慢等），大量并发的情况下，其他接入的消息，只能一直等待，这就是最大的弊端。而NIO，就能解决这个难题
### NIO

关于NIO国内有很多技术博客将英文翻译成No-Blocking I/O，非阻塞I/O模型 ，当然这样就与BIO形成了鲜明的特性对比。NIO本身是基于事件驱动的思想来实现的，其目的就是解决BIO的大并发问题，在BIO模型中，如果需要并发处理多个I/O请求，那就需要多线程来支持，NIO使用了多路复用器机制，以socket使用来说，多路复用器通过不断轮询各个连接的状态，只有在socket有流可读或者可写时，应用程序才需要去处理它，在线程的使用上，就不需要一个连接就必须使用一个处理线程了，而是只是有效请求时（确实需要进行I/O处理时），才会使用一个线程去处理，这样就避免了BIO模型下大量线程处于阻塞等待状态的情景。

相对于BIO的流，NIO抽象出了新的通道（Channel）作为输入输出的通道，并且提供了缓存（Buffer）的支持，在进行读操作时，需要使用Buffer分配空间，然后将数据从Channel中读入Buffer中，对于Channel的写操作，也需要现将数据写入Buffer，然后将Buffer写入Channel中。


#### NIO创建Server
``` 
public class Server {  
    private static int DEFAULT_PORT = 12345;  
    private static ServerHandle serverHandle;  
    public static void start(){  
        start(DEFAULT_PORT);  
    }  
    public static synchronized void start(int port){  
        if(serverHandle!=null)  
            serverHandle.stop();  
        serverHandle = new ServerHandle(port);  
        new Thread(serverHandle,"Server").start();  
    }  
    public static void main(String[] args){  
        start();  
    }  

```

ServerHandle：
``` 
public class ServerHandle implements Runnable{  
    private Selector selector;  
    private ServerSocketChannel serverChannel;  
    private volatile boolean started;  
    /** 
     * 构造方法 
     * @param port 指定要监听的端口号 
     */  
    public ServerHandle(int port) {  
        try{  
            //创建选择器  
            selector = Selector.open();  
            //打开监听通道  
            serverChannel = ServerSocketChannel.open();  
            //如果为 true，则此通道将被置于阻塞模式；如果为 false，则此通道将被置于非阻塞模式  
            serverChannel.configureBlocking(false);//开启非阻塞模式  
            //绑定端口 backlog设为1024  
            serverChannel.socket().bind(new InetSocketAddress(port),1024);  
            //监听客户端连接请求  
            serverChannel.register(selector, SelectionKey.OP_ACCEPT);  
            //标记服务器已开启  
            started = true;  
            System.out.println("服务器已启动，端口号：" + port);  
        }catch(IOException e){  
            e.printStackTrace();  
            System.exit(1);  
        }  
    }  
    public void stop(){  
        started = false;  
    }  
    @Override  
    public void run() {  
        //循环遍历selector  
        while(started){  
            try{  
                //无论是否有读写事件发生，selector每隔1s被唤醒一次  
                selector.select(1000);  
                //阻塞,只有当至少一个注册的事件发生的时候才会继续.  
//              selector.select();  
                Set<SelectionKey> keys = selector.selectedKeys();  
                Iterator<SelectionKey> it = keys.iterator();  
                SelectionKey key = null;  
                while(it.hasNext()){  
                    key = it.next();  
                    it.remove();  
                    try{  
                        handleInput(key);  
                    }catch(Exception e){  
                        if(key != null){  
                            key.cancel();  
                            if(key.channel() != null){  
                                key.channel().close();  
                            }  
                        }  
                    }  
                }  
            }catch(Throwable t){  
                t.printStackTrace();  
            }  
        }  
        //selector关闭后会自动释放里面管理的资源  
        if(selector != null)  
            try{  
                selector.close();  
            }catch (Exception e) {  
                e.printStackTrace();  
            }  
    }  
    private void handleInput(SelectionKey key) throws IOException{  
        if(key.isValid()){  
            //处理新接入的请求消息  
            if(key.isAcceptable()){  
                ServerSocketChannel ssc = (ServerSocketChannel) key.channel();  
                //通过ServerSocketChannel的accept创建SocketChannel实例  
                //完成该操作意味着完成TCP三次握手，TCP物理链路正式建立  
                SocketChannel sc = ssc.accept();  
                //设置为非阻塞的  
                sc.configureBlocking(false);  
                //注册为读  
                sc.register(selector, SelectionKey.OP_READ);  
            }  
            //读消息  
            if(key.isReadable()){  
                SocketChannel sc = (SocketChannel) key.channel();  
                //创建ByteBuffer，并开辟一个1M的缓冲区  
                ByteBuffer buffer = ByteBuffer.allocate(1024);  
                //读取请求码流，返回读取到的字节数  
                int readBytes = sc.read(buffer);  
                //读取到字节，对字节进行编解码  
                if(readBytes>0){  
                    //将缓冲区当前的limit设置为position=0，用于后续对缓冲区的读取操作  
                    buffer.flip();  
                    //根据缓冲区可读字节数创建字节数组  
                    byte[] bytes = new byte[buffer.remaining()];  
                    //将缓冲区可读字节数组复制到新建的数组中  
                    buffer.get(bytes);  
                    String expression = new String(bytes,"UTF-8");  
                    System.out.println("服务器收到消息：" + expression);  
                    //处理数据  
                    String result = null;  
                    try{  
                        result = Calculator.cal(expression).toString();  
                    }catch(Exception e){  
                        result = "计算错误：" + e.getMessage();  
                    }  
                    //发送应答消息  
                    doWrite(sc,result);  
                }  
                //没有读取到字节 忽略  
//              else if(readBytes==0);  
                //链路已经关闭，释放资源  
                else if(readBytes<0){  
                    key.cancel();  
                    sc.close();  
                }  
            }  
        }  
    }  
    //异步发送应答消息  
    private void doWrite(SocketChannel channel,String response) throws IOException{  
        //将消息编码为字节数组  
        byte[] bytes = response.getBytes();  
        //根据数组容量创建ByteBuffer  
        ByteBuffer writeBuffer = ByteBuffer.allocate(bytes.length);  
        //将字节数组复制到缓冲区  
        writeBuffer.put(bytes);  
        //flip操作  
        writeBuffer.flip();  
        //发送缓冲区的字节数组  
        channel.write(writeBuffer);  
        //****此处不含处理“写半包”的代码  
    }  
}  
```

主要的步骤分为：
1. 打开ServerSocketChannel，监听客户端连接
2. 绑定监听端口，设置连接为非阻塞模式
3. 创建Reactor线程，创建多路复用器并启动线程
4. 将ServerSocketChannel注册到Reactor线程中的Selector上，监听ACCEPT事件
5. Selector轮询准备就绪的key
6. Selector监听到新的客户端接入，处理新的接入请求，完成TCP三次握手，简历物理链路
7. 设置客户端链路为非阻塞模式
8. 将新接入的客户端连接注册到Reactor线程的Selector上，监听读操作，读取客户端发送的网络消息
9. 异步读取客户端消息到缓冲区
10. 对Buffer编解码，处理半包消息，将解码成功的消息封装成Task
11. 将应答消息编码为Buffer，调用SocketChannel的write将消息异步发送给客户端


#### NIO客户端
``` 
public class Client {  
    private static String DEFAULT_HOST = "127.0.0.1";  
    private static int DEFAULT_PORT = 12345;  
    private static ClientHandle clientHandle;  
    public static void start(){  
        start(DEFAULT_HOST,DEFAULT_PORT);  
    }  
    public static synchronized void start(String ip,int port){  
        if(clientHandle!=null)  
            clientHandle.stop();  
        clientHandle = new ClientHandle(ip,port);  
        new Thread(clientHandle,"Server").start();  
    }  
    //向服务器发送消息  
    public static boolean sendMsg(String msg) throws Exception{  
        if(msg.equals("q")) return false;  
        clientHandle.sendMsg(msg);  
        return true;  
    }  
    public static void main(String[] args){  
        start();  
    }  
}  
```

ClientHandle:
``` 
public class ClientHandle implements Runnable{  
    private String host;  
    private int port;  
    private Selector selector;  
    private SocketChannel socketChannel;  
    private volatile boolean started;  
  
    public ClientHandle(String ip,int port) {  
        this.host = ip;  
        this.port = port;  
        try{  
            //创建选择器  
            selector = Selector.open();  
            //打开监听通道  
            socketChannel = SocketChannel.open();  
            //如果为 true，则此通道将被置于阻塞模式；如果为 false，则此通道将被置于非阻塞模式  
            socketChannel.configureBlocking(false);//开启非阻塞模式  
            started = true;  
        }catch(IOException e){  
            e.printStackTrace();  
            System.exit(1);  
        }  
    }  
    public void stop(){  
        started = false;  
    }  
    @Override  
    public void run() {  
        try{  
            doConnect();  
        }catch(IOException e){  
            e.printStackTrace();  
            System.exit(1);  
        }  
        //循环遍历selector  
        while(started){  
            try{  
                //无论是否有读写事件发生，selector每隔1s被唤醒一次  
                selector.select(1000);  
                //阻塞,只有当至少一个注册的事件发生的时候才会继续.  
//              selector.select();  
                Set<SelectionKey> keys = selector.selectedKeys();  
                Iterator<SelectionKey> it = keys.iterator();  
                SelectionKey key = null;  
                while(it.hasNext()){  
                    key = it.next();  
                    it.remove();  
                    try{  
                        handleInput(key);  
                    }catch(Exception e){  
                        if(key != null){  
                            key.cancel();  
                            if(key.channel() != null){  
                                key.channel().close();  
                            }  
                        }  
                    }  
                }  
            }catch(Exception e){  
                e.printStackTrace();  
                System.exit(1);  
            }  
        }  
        //selector关闭后会自动释放里面管理的资源  
        if(selector != null)  
            try{  
                selector.close();  
            }catch (Exception e) {  
                e.printStackTrace();  
            }  
    }  
    private void handleInput(SelectionKey key) throws IOException{  
        if(key.isValid()){  
            SocketChannel sc = (SocketChannel) key.channel();  
            if(key.isConnectable()){  
                if(sc.finishConnect());  
                else System.exit(1);  
            }  
            //读消息  
            if(key.isReadable()){  
                //创建ByteBuffer，并开辟一个1M的缓冲区  
                ByteBuffer buffer = ByteBuffer.allocate(1024);  
                //读取请求码流，返回读取到的字节数  
                int readBytes = sc.read(buffer);  
                //读取到字节，对字节进行编解码  
                if(readBytes>0){  
                    //将缓冲区当前的limit设置为position=0，用于后续对缓冲区的读取操作  
                    buffer.flip();  
                    //根据缓冲区可读字节数创建字节数组  
                    byte[] bytes = new byte[buffer.remaining()];  
                    //将缓冲区可读字节数组复制到新建的数组中  
                    buffer.get(bytes);  
                    String result = new String(bytes,"UTF-8");  
                    System.out.println("客户端收到消息：" + result);  
                }  
                //没有读取到字节 忽略  
//              else if(readBytes==0);  
                //链路已经关闭，释放资源  
                else if(readBytes<0){  
                    key.cancel();  
                    sc.close();  
                }  
            }  
        }  
    }  
    //异步发送消息  
    private void doWrite(SocketChannel channel,String request) throws IOException{  
        //将消息编码为字节数组  
        byte[] bytes = request.getBytes();  
        //根据数组容量创建ByteBuffer  
        ByteBuffer writeBuffer = ByteBuffer.allocate(bytes.length);  
        //将字节数组复制到缓冲区  
        writeBuffer.put(bytes);  
        //flip操作  
        writeBuffer.flip();  
        //发送缓冲区的字节数组  
        channel.write(writeBuffer);  
        //****此处不含处理“写半包”的代码  
    }  
    private void doConnect() throws IOException{  
        if(socketChannel.connect(new InetSocketAddress(host,port)));  
        else socketChannel.register(selector, SelectionKey.OP_CONNECT);  
    }  
    public void sendMsg(String msg) throws Exception{  
        socketChannel.register(selector, SelectionKey.OP_READ);  
        doWrite(socketChannel, msg);  
    }  
} 
```

#### Test
``` 
public class Test {  
    //测试主方法  
    @SuppressWarnings("resource")  
    public static void main(String[] args) throws Exception{  
        //运行服务器  
        Server.start();  
        //避免客户端先于服务器启动前执行代码  
        Thread.sleep(100);  
        //运行客户端   
        Client.start();  
        while(Client.sendMsg(new Scanner(System.in).nextLine()));  
    }  
}  
```


### AIO
Java AIO就是Java作为对异步IO提供支持的NIO.2 ，Java NIO2 (JSR 203)定义了更多的 New I/O APIs， 提案2003提出，直到2011年才发布， 最终在JDK 7中才实现。JSR 203除了提供更多的文件系统操作API(包括可插拔的自定义的文件系统)， 还提供了对socket和文件的异步 I/O操作。 同时实现了JSR-51提案中的socket channel全部功能,包括对绑定， option配置的支持以及多播multicast的实现。

从编程模式上来看AIO相对于NIO的区别在于，NIO需要使用者线程不停的轮询IO对象，来确定是否有数据准备好可以读了，而AIO则是在数据准备好之后，才会通知数据使用者，这样使用者就不需要不停地轮询了。当然AIO的异步特性并不是Java实现的伪异步，而是使用了系统底层API的支持，在Unix系统下，采用了epoll IO模型，而windows便是使用了IOCP模型。

NIO 2.0引入了新的异步通道的概念，并提供了异步文件通道和异步套接字通道的实现。
    异步的套接字通道时真正的异步非阻塞I/O，对应于UNIX网络编程中的事件驱动I/O（AIO）。他不需要过多的Selector对注册的通道进行轮询即可实现异步读写，从而简化了NIO的编程模型。

#### Server端代码
``` 
public class Server {  
    private static int DEFAULT_PORT = 12345;  
    private static AsyncServerHandler serverHandle;  
    public volatile static long clientCount = 0;  
    public static void start(){  
        start(DEFAULT_PORT);  
    }  
    public static synchronized void start(int port){  
        if(serverHandle!=null)  
            return;  
        serverHandle = new AsyncServerHandler(port);  
        new Thread(serverHandle,"Server").start();  
    }  
    public static void main(String[] args){  
        Server.start();  
    }  
}  
```

AsyncServerHandler:
``` 
public class AsyncServerHandler implements Runnable {  
    public CountDownLatch latch;  
    public AsynchronousServerSocketChannel channel;  
    public AsyncServerHandler(int port) {  
        try {  
            //创建服务端通道  
            channel = AsynchronousServerSocketChannel.open();  
            //绑定端口  
            channel.bind(new InetSocketAddress(port));  
            System.out.println("服务器已启动，端口号：" + port);  
        } catch (IOException e) {  
            e.printStackTrace();  
        }  
    }  
    @Override  
    public void run() {  
        //CountDownLatch初始化  
        //它的作用：在完成一组正在执行的操作之前，允许当前的现场一直阻塞  
        //此处，让现场在此阻塞，防止服务端执行完成后退出  
        //也可以使用while(true)+sleep   
        //生成环境就不需要担心这个问题，以为服务端是不会退出的  
        latch = new CountDownLatch(1);  
        //用于接收客户端的连接  
        channel.accept(this,new AcceptHandler());  
        try {  
            latch.await();  
        } catch (InterruptedException e) {  
            e.printStackTrace();  
        }  
    }  
} 
```


AcceptHandler:
``` 
public class AcceptHandler implements CompletionHandler<AsynchronousSocketChannel, AsyncServerHandler> {  
    @Override  
    public void completed(AsynchronousSocketChannel channel,AsyncServerHandler serverHandler) {  
        //继续接受其他客户端的请求  
        Server.clientCount++;  
        System.out.println("连接的客户端数：" + Server.clientCount);  
        serverHandler.channel.accept(serverHandler, this);  
        //创建新的Buffer  
        ByteBuffer buffer = ByteBuffer.allocate(1024);  
        //异步读  第三个参数为接收消息回调的业务Handler  
        channel.read(buffer, buffer, new ReadHandler(channel));  
    }  
    @Override  
    public void failed(Throwable exc, AsyncServerHandler serverHandler) {  
        exc.printStackTrace();  
        serverHandler.latch.countDown();  
    }  
} 
```


ReadHandler:
``` 
public class ReadHandler implements CompletionHandler<Integer, ByteBuffer> {  
    //用于读取半包消息和发送应答  
    private AsynchronousSocketChannel channel;  
    public ReadHandler(AsynchronousSocketChannel channel) {  
            this.channel = channel;  
    }  
    //读取到消息后的处理  
    @Override  
    public void completed(Integer result, ByteBuffer attachment) {  
        //flip操作  
        attachment.flip();  
        //根据  
        byte[] message = new byte[attachment.remaining()];  
        attachment.get(message);  
        try {  
            String expression = new String(message, "UTF-8");  
            System.out.println("服务器收到消息: " + expression);  
            String calrResult = null;  
            try{  
                calrResult = Calculator.cal(expression).toString();  
            }catch(Exception e){  
                calrResult = "计算错误：" + e.getMessage();  
            }  
            //向客户端发送消息  
            doWrite(calrResult);  
        } catch (UnsupportedEncodingException e) {  
            e.printStackTrace();  
        }  
    }  
    //发送消息  
    private void doWrite(String result) {  
        byte[] bytes = result.getBytes();  
        ByteBuffer writeBuffer = ByteBuffer.allocate(bytes.length);  
        writeBuffer.put(bytes);  
        writeBuffer.flip();  
        //异步写数据 参数与前面的read一样  
        channel.write(writeBuffer, writeBuffer,new CompletionHandler<Integer, ByteBuffer>() {  
            @Override  
            public void completed(Integer result, ByteBuffer buffer) {  
                //如果没有发送完，就继续发送直到完成  
                if (buffer.hasRemaining())  
                    channel.write(buffer, buffer, this);  
                else{  
                    //创建新的Buffer  
                    ByteBuffer readBuffer = ByteBuffer.allocate(1024);  
                    //异步读  第三个参数为接收消息回调的业务Handler  
                    channel.read(readBuffer, readBuffer, new ReadHandler(channel));  
                }  
            }  
            @Override  
            public void failed(Throwable exc, ByteBuffer attachment) {  
                try {  
                    channel.close();  
                } catch (IOException e) {  
                }  
            }  
        });  
    }  
    @Override  
    public void failed(Throwable exc, ByteBuffer attachment) {  
        try {  
            this.channel.close();  
        } catch (IOException e) {  
            e.printStackTrace();  
        }  
    }  
}  
```
我们在ReadHandler中，以一个匿名内部类实现了WriteHandler。

#### Client代码
``` 
public class Client {  
    private static String DEFAULT_HOST = "127.0.0.1";  
    private static int DEFAULT_PORT = 12345;  
    private static AsyncClientHandler clientHandle;  
    public static void start(){  
        start(DEFAULT_HOST,DEFAULT_PORT);  
    }  
    public static synchronized void start(String ip,int port){  
        if(clientHandle!=null)  
            return;  
        clientHandle = new AsyncClientHandler(ip,port);  
        new Thread(clientHandle,"Client").start();  
    }  
    //向服务器发送消息  
    public static boolean sendMsg(String msg) throws Exception{  
        if(msg.equals("q")) return false;  
        clientHandle.sendMsg(msg);  
        return true;  
    }  
    @SuppressWarnings("resource")  
    public static void main(String[] args) throws Exception{  
        Client.start();  
        System.out.println("请输入请求消息：");  
        Scanner scanner = new Scanner(System.in);  
        while(Client.sendMsg(scanner.nextLine()));  
    }  
}  
```

AsyncClientHandler:
``` 
public class AsyncClientHandler implements CompletionHandler<Void, AsyncClientHandler>, Runnable {  
    private AsynchronousSocketChannel clientChannel;  
    private String host;  
    private int port;  
    private CountDownLatch latch;  
    public AsyncClientHandler(String host, int port) {  
        this.host = host;  
        this.port = port;  
        try {  
            //创建异步的客户端通道  
            clientChannel = AsynchronousSocketChannel.open();  
        } catch (IOException e) {  
            e.printStackTrace();  
        }  
    }  
    @Override  
    public void run() {  
        //创建CountDownLatch等待  
        latch = new CountDownLatch(1);  
        //发起异步连接操作，回调参数就是这个类本身，如果连接成功会回调completed方法  
        clientChannel.connect(new InetSocketAddress(host, port), this, this);  
        try {  
            latch.await();  
        } catch (InterruptedException e1) {  
            e1.printStackTrace();  
        }  
        try {  
            clientChannel.close();  
        } catch (IOException e) {  
            e.printStackTrace();  
        }  
    }  
    //连接服务器成功  
    //意味着TCP三次握手完成  
    @Override  
    public void completed(Void result, AsyncClientHandler attachment) {  
        System.out.println("客户端成功连接到服务器...");  
    }  
    //连接服务器失败  
    @Override  
    public void failed(Throwable exc, AsyncClientHandler attachment) {  
        System.err.println("连接服务器失败...");  
        exc.printStackTrace();  
        try {  
            clientChannel.close();  
            latch.countDown();  
        } catch (IOException e) {  
            e.printStackTrace();  
        }  
    }  
    //向服务器发送消息  
    public void sendMsg(String msg){  
        byte[] req = msg.getBytes();  
        ByteBuffer writeBuffer = ByteBuffer.allocate(req.length);  
        writeBuffer.put(req);  
        writeBuffer.flip();  
        //异步写  
        clientChannel.write(writeBuffer, writeBuffer,new WriteHandler(clientChannel, latch));  
    }  
}  

```

WriteHandler:
``` 
public class WriteHandler implements CompletionHandler<Integer, ByteBuffer> {  
    private AsynchronousSocketChannel clientChannel;  
    private CountDownLatch latch;  
    public WriteHandler(AsynchronousSocketChannel clientChannel,CountDownLatch latch) {  
        this.clientChannel = clientChannel;  
        this.latch = latch;  
    }  
    @Override  
    public void completed(Integer result, ByteBuffer buffer) {  
        //完成全部数据的写入  
        if (buffer.hasRemaining()) {  
            clientChannel.write(buffer, buffer, this);  
        }  
        else {  
            //读取数据  
            ByteBuffer readBuffer = ByteBuffer.allocate(1024);  
            clientChannel.read(readBuffer,readBuffer,new ReadHandler(clientChannel, latch));  
        }  
    }  
    @Override  
    public void failed(Throwable exc, ByteBuffer attachment) {  
        System.err.println("数据发送失败...");  
        try {  
            clientChannel.close();  
            latch.countDown();  
        } catch (IOException e) {  
        }  
    }  
}  
```

ReadHandler:
``` 
public class ReadHandler implements CompletionHandler<Integer, ByteBuffer> {  
    private AsynchronousSocketChannel clientChannel;  
    private CountDownLatch latch;  
    public ReadHandler(AsynchronousSocketChannel clientChannel,CountDownLatch latch) {  
        this.clientChannel = clientChannel;  
        this.latch = latch;  
    }  
    @Override  
    public void completed(Integer result,ByteBuffer buffer) {  
        buffer.flip();  
        byte[] bytes = new byte[buffer.remaining()];  
        buffer.get(bytes);  
        String body;  
        try {  
            body = new String(bytes,"UTF-8");  
            System.out.println("客户端收到结果:"+ body);  
        } catch (UnsupportedEncodingException e) {  
            e.printStackTrace();  
        }  
    }  
    @Override  
    public void failed(Throwable exc,ByteBuffer attachment) {  
        System.err.println("数据读取失败...");  
        try {  
            clientChannel.close();  
            latch.countDown();  
        } catch (IOException e) {  
        }  
    }  
}  
```

#### Test
``` 
public class Test {  
    //测试主方法  
    @SuppressWarnings("resource")  
    public static void main(String[] args) throws Exception{  
        //运行服务器  
        Server.start();  
        //避免客户端先于服务器启动前执行代码  
        Thread.sleep(100);  
        //运行客户端   
        Client.start();  
        System.out.println("请输入请求消息：");  
        Scanner scanner = new Scanner(System.in);  
        while(Client.sendMsg(scanner.nextLine()));  
    }  
}
```

注：@SuppressWarnings是告诉编译器忽略指定的警告


#### 计算工具类：
``` 
public final class Calculator {  
   private final static ScriptEngine jse = new ScriptEngineManager().getEngineByName("JavaScript");
    public static Object cal(String expression) throws ScriptException{
        return jse.eval(expression);
    }
}
```



### 参考资料
- [从java视角看BIO、NIO、AIO](https://juejin.im/entry/598da7d16fb9a03c42431ed3)
- [java网络IO编程总结](http://blog.csdn.net/anxpp/article/details/51512200)


