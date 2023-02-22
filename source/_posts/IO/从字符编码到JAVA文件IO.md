---
title: 从字符编码到JAVA文件IO
date: 2017-11-15 23:03:03
tags: JavaIO
categories: IO
---

### IO 流

流是一组有顺序的，有起点和终点的字节集合，是对数据传输的总称或抽象。即数据在两设备间的传输称为流，流的本质是数据传输，根据数据传输特性将流抽象为各种类，方便更直观的进行数据操作。

根据处理数据类型的不同分为字符流和字节流

根据数据流入不同分为输入流和输出流


### 字符流与字节流

#### 字符编码

在谈字节与字符之前， 先聊聊字符串编码的问题。

##### ASCII 码

计算机内部，所有信息最终都是一个二进制值。每一个二进制位（bit）有0和1两种状态，因此八个二进制位就可以组合出256种状态，这被称为一个字节（byte，这样一个字节可以表示 256 种状态。

ASCII 码一共规定了128个字符的编码，比如空格SPACE是32（二进制00100000），大写的字母A是65（二进制01000001）。这128个符号（包括32个不能打印出来的控制符号），只占用了一个字节的后面7位，最前面的一位统一规定为0。

##### UNICODE-字符集

英语用 ascii 码就够了， 但是其他语言(如中文)只用 128 个符号是远远不够的,  所以需要多个字节来表达一个符号。

UNICODE 是一个很大的字符集， 想囊括人类所有的符号。它规定一个 16 位即 2Byte 的空间为一个平面（plane），一个平面的容量就是 2^16 = 65536。目前 Unicode 已经定义了 17 个平面，即 17 * 65536 大约 100 万这么多容量。如果不够还可以继续扩充至 18 平面、19平面 ……

但是 UNICODE 只是一个 **符号集(字符集)**， 只规定了符号的二进制代码， 并没有定义这个二进制该如何存储。

比如，汉字严的 Unicode 是十六进制数4E25，转换成二进制数足足有15位（100111000100101），也就是说，这个符号的表示至少需要2个字节。表示其他更大的符号，可能需要3个字节或者4个字节，甚至更多。
这里就有两个严重的问题，第一个问题是，如何才能区别 Unicode 和 ASCII ？计算机怎么知道三个字节表示一个符号，而不是分别表示三个符号呢？第二个问题是，我们已经知道，英文字母只用一个字节表示就够了，如果 Unicode 统一规定，每个符号用三个或四个字节表示，那么每个英文字母前都必然有二到三个字节是0，这对于存储来说是极大的浪费，文本文件的大小会因此大出二三倍，这是无法接受的。

这两个问题就造成了 UNICODE 出现了很多种存储方式(许多不同的二进制格式)以及很长一段时间无法推广， 直到互联网的出现。

##### UNICODE码元和码点 

- 一个字符集一般可以用一张或多张由多个行和多个列所构成的二维表来表示。 二维表中行与列相交的点，称之为**码点(Code Point)**, 可以理解为每个字符在字符集中都有一个唯一的 code point 来表示。 表示为一个与计算机无关的十六机制数 
- 在计算机存储和网络传输时，码点值(即字符编号)被映射到一个或多个**码元(Code Unit)**。码元可理解为字符编码方式CEF(Character Encoding Form)对码点值进行编码处理时作为一个整体来看待的基本单位。 简单的理解， code unit 就是将 code point 映射到某种编码的实际字节数。 对于utf8来说 code unit 就是1字节， utf16 code unit 就是2字节


##### UTF8-编码

互联网的普及， 就强烈需要一种统一的编码方式， UTF-8 就是在互联网上使用最广的一种 Unicode 的实现方式。其他实现方式还包括 UTF-16（字符用两个字节或四个字节表示）和 UTF-32（字符用四个字节表示）。这里的关系是： **UTF-8 是 Unicode 的实现方式之一**。

UTF-8 最大的一个特点，就是它是一种变长的编码方式。它可以使用1~4个字节表示一个符号，根据不同的符号而变化字节长度。
UTF-8 的编码规则很简单，只有二条：
1. 对于单字节的符号，字节的第一位设为0，后面7位为这个符号的 Unicode 码。因此对于英语字母，UTF-8 编码和 ASCII 码是相同的。
2. 对于n字节的符号（n > 1），第一个字节的前n位都设为1，第n + 1位设为0，后面字节的前两位一律设为10。剩下的没有提及的二进制位，全部为这个符号的 Unicode 码。
编码规则如下:
``` 
Unicode符号范围     |        UTF-8编码方式
(十六进制)        |              （二进制）
----------------------+---------------------------------------------
0000 0000-0000 007F | 0xxxxxxx
0000 0080-0000 07FF | 110xxxxx 10xxxxxx
0000 0800-0000 FFFF | 1110xxxx 10xxxxxx 10xxxxxx
0001 0000-0010 FFFF | 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx 
```

跟据上表，解读 UTF-8 编码非常简单。如果一个字节的第一位是0，则这个字节单独就是一个字符；如果第一位是1，则连续有多少个1，就表示当前字符占用多少个字节。


##### UTF16-编码

UTF16 是JAVA默认的编码， 每次固定读取两个字节。


#### 字节流

Java 中的字节流处理的最基本单位为单个字节，它通常用来处理二进制数据。Java 中最基本的两个字节流类是 `InputStream` 和 `OutputStream`，它们分别代表了组基本的输入字节流和输出字节流。`InputStream` 类与 `OutputStream` 类均为抽象类，我们在实际使用中通常使用 Java 类库中提供的它们的一系列子类。


以`InputStream`为例，有一个从字节流中读取字节的方法 `read()` 这一方法的功能是从字节流中读取一个字节，若到了末尾则返回-1，否则返回读入的字节

一次读一个字节效率很低(每读一次就会进行一次IO)，inputStream重载了read方法，可以一次读一个字节数组，源码如下:   
``` 
public int read(byte b[]) throws IOException {
    return read(b, 0, b.length);
}
public int read(byte b[], int off, int len) throws IOException {
    if (b == null) {
        throw new NullPointerException();
    } else if (off < 0 || len < 0 || len > b.length - off) {
        throw new IndexOutOfBoundsException();
    } else if (len == 0) {
        return 0;
    }

    int c = read();
    if (c == -1) {
        return -1;
    }
    b[off] = (byte)c;

    int i = 1;
    try {
    // 本质上还是调用 read
        for (; i < len ; i++) {
            c = read();
            if (c == -1) {
                break;
            }
            b[off + i] = (byte)c;
        }
    } catch (IOException ee) {
    }
    return i;
}
```
可以看到`read(byte[])`也是通过循环调用read来实现一次读入一个字节数组，因此本质上来说这个方法也没有使用内存缓存区。
要提高读取的效率，应该使用`BufferedInputStream`等带缓存的实现类

#### 字符流


在以上范围内的每个数字都与一个字符相对应，Java中的String类型默认就把字符以Unicode规则编码而后存储在内存中。然而与存储在内存中不同，存储在磁盘上的数据通常有着各种各样的编码方式。使用不同的编码方式，相同的字符会有不同的二进制表示。字符流的工作方式是：

- 输入字符流：把要读取的字节序列按指定编码方式解码为相应字符序列从而可以存在内存中
- 输出字符流：把要写入文件的字符序列转为指定编码方式下的字节序列，然后再写入到文件中


##### 字符到字节转换

可以从字符流中获取char[]数组，转换为String，然后调用String的API函数getBytes() 获取到byte[]，然后就可以通过ByteArrayInputStream、ByteArrayOutputStream来实现到字节流的转换。

函数:`new String(byte[] data, String encoding);`,通常与`String.getBytes(String encoding)`一起使用

用法：`String str = new String(formMsg.getBytes("ISO-8859-1"),"utf-8");`

##### 字节流到字符流

如下，是一个字节流上传文件到 hadoop hdfs 的工具方法。此处为了避免中文乱码的，将字节流指定编码转换为字符流，然后再用 getBytes("UTF-8") 方法获取相应编码的字节，实现字节流输出。
``` 
/**
 * 文件流上传文件
 *
 * @param iStream 输入流
 * @param pathStr HDFS(Hadoop分布式文件系统) 路径  'test/out/' 最后要有 /
 * @param fileName 文件名
 * @return
 */
public static boolean upLoadFileToHdfs(InputStream iStream, String pathStr, String fileName) {
    //FileSystem fs = FileSystem.get(conf);
    Path path = new Path(pathStr + fileName);
    //FSDataOutputStream outputStream = fs.create(path);
    FileSystem fs = null;
    FSDataOutputStream outputStream = null;
    //InputStreamReader是字节流和字符流之间的桥梁，转化时需要指定字符集，否则按照系统字符集转换
    InputStreamReader reader = null;
    BufferedReader br = null;
    try {
        reader = new InputStreamReader(iStream,"UTF-8");
        //创建缓冲字符输入流
        br = new BufferedReader(reader);
        fs = FileSystem.get(conf);
        outputStream = fs.create(path);
        String line;
        while ((line = br.readLine()) != null) {
            outputStream.write(line.getBytes("UTF-8"));
            outputStream.write("\r\n".getBytes("UTF-8"));
        }
        //IOUtils.copyBytes(, outputStream, 4096);
        return true;
    } catch (IOException e) {
        e.printStackTrace();
    } finally {
        try {
            outputStream.hsync();
            outputStream.close();
            br.close();
            reader.close();
            iStream.close();
            fs.close();
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
    return false;
}
```


### 缓存流

缓冲流是处理流的一种, 它依赖于原始的输入输出流, 它令输入输出流具有1个缓冲区, 显著减少与外部设备的IO次数, 而且提供一些额外的方法。

可见, 缓冲流最大的特点就是具有1个缓冲区，而我们使用缓冲流无非两个目的:
1. 减少IO次数(提升performance)
2. 使用一些缓冲流的额外的方法。

> 备注： 这里需要注意的是， 缓存流实现类实际上底层还是调用的对应的被装饰的类的 read 方法(如 FileInputStream 的 read 方法)， 只不过一次性读取了 8K(默认， 可设置大小)数据到成员变量的 buffer 里面， 然后每次通过 buffer类(BufferedInputStream) 的 read 读取的实际上是成员变量 buffer。 如果不使用 buffer 的实现类自己调用 read 一次读取一定量数据(最好是操作系统页大小整数倍) 实际上的性能也差不多


`BufferedInputStream`和`BufferedOutputStream`这两个类分别是`FilterInputStream`和`FilterOutputStream`的子类，作为装饰器子类，使用它们可以防止每次读取/发送数据时进行实际的写操作，代表着使用缓冲区,因为他们实现了缓存功能，所有使用`BufferedOutputStream`写完数据后，需要用`flush()`或者`close()`强行将缓存区内容数据写出，否则可能无法写出数据。与之相似还`BufferedReader`和`BufferedWriter`两个类


利用缓存区复制文件：
``` 
 public static void copyFile( File oldFile , File newFile){
        InputStream inputStream = null ;
        BufferedInputStream bufferedInputStream = null ;

        OutputStream outputStream = null ;
        BufferedOutputStream bufferedOutputStream = null ;

        try {
            inputStream = new FileInputStream( oldFile ) ;
            bufferedInputStream = new BufferedInputStream( inputStream ) ;

            outputStream = new FileOutputStream( newFile ) ;
            bufferedOutputStream = new BufferedOutputStream( outputStream ) ;

            byte[] b=new byte[1024];   //代表一次最多读取1KB的内容

            int length = 0 ; //代表实际读取的字节数
            while( (length = bufferedInputStream.read( b ) )!= -1 ){
                //length 代表实际读取的字节数
                bufferedOutputStream.write(b, 0, length );
            }
            //缓冲区的内容写入到文件
            bufferedOutputStream.flush();
        } catch (FileNotFoundException e) {
            e.printStackTrace();
        }catch (IOException e) {
            e.printStackTrace();
        }finally {
            // close 回收流
        }
    }
}
```

### 对象序列化流

#### 什么java对象序列化
Java平台允许我们在内存中创建可复用的Java对象，但一般情况下，只有当JVM处于运行时，这些对象才可能存在，即，这些对象的生命周期不会比JVM的生命周期更长。但在现实应用中，就可能要求在JVM停止运行之后能够保存(持久化)指定的对象，并在将来重新读取被保存的对象。Java对象序列化就能够帮助我们实现该功能。

 使用Java对象序列化，在保存对象时，会把其状态保存为一组字节，在未来，再将这些字节组装成对象。必须注意地是，对象序列化保存的是对象的"状态"，即它的成员变量。由此可知，对象序列化不会关注类中的静态变量。
 
  除了在持久化对象时会用到对象序列化之外，当使用RMI(远程方法调用)，或在网络中传递对象时，都会用到对象序列化。Java序列化API为处理对象序列化提供了一个标准机制，该API简单易用，在本文的后续章节中将会陆续讲到。


#### 序列化示例

- 若某个类实现了 Serializable 接口，该类的对象就是可序列化的：
    - 创建一个 ObjectOutputStream
    - 调用 ObjectOutputStream 对象的 writeObject(对象) 方法输出可序列化对象。注意写出一次，操作flush()
- 反序列化
    - 创建一个 ObjectInputStream
    - 调用 readObject() 方法读取流中的对象
    
    
```
// 定义user对象 
public class User implements Serializable{
    private String name;
    private int age;
    private Date birthday;
    private transient String gender;
    private static final long serialVersionUID = -6849794470754667710L;

    ......getter and setter
}

// 序列化和反序列化
public class SerializableDemo {

    public static void main(String[] args) {
        //Initializes The Object
        User user = new User();
        user.setName("hollis");
        user.setGender("male");
        user.setAge(23);
        user.setBirthday(new Date());

        //Write Obj to File
        ObjectOutputStream oos = null;
        try {
            oos = new ObjectOutputStream(new FileOutputStream("tempFile"));
            oos.writeObject(user);
        } catch (IOException e) {
            e.printStackTrace();
        } finally {
            IOUtils.closeQuietly(oos);
        }

        //Read Obj from File
        File file = new File("tempFile");
        ObjectInputStream ois = null;
        try {
            ois = new ObjectInputStream(new FileInputStream(file));
            User newUser = (User) ois.readObject();
            System.out.println(newUser);
        } catch (IOException e) {
            e.printStackTrace();
        } catch (ClassNotFoundException e) {
            e.printStackTrace();
        } finally {
            IOUtils.closeQuietly(ois);
            try {
                FileUtils.forceDelete(file);
            } catch (IOException e) {
                e.printStackTrace();
            }
        }

    }
}
``` 

#### 序列化和反序列化知识
1. 在Java中，只要一个类实现了java.io.Serializable接口，那么它就可以被序列化。

2. 通过ObjectOutputStream和ObjectInputStream对对象进行序列化及反序列化

3. 虚拟机是否允许反序列化，不仅取决于类路径和功能代码是否一致，一个非常重要的一点是两个类的序列化 ID 是否一致（就是 private static final long serialVersionUID）

4. 序列化并不保存静态变量。

5. 要想将父类对象也序列化，就需要让父类也实现Serializable 接口。

6. Transient 关键字的作用是控制变量的序列化，在变量声明前加上该关键字，可以阻止该变量被序列化到文件中，在被反序列化后，transient 变量的值被设为初始值，如 int 型的是 0，对象型的是 null。

7. 服务器端给客户端发送序列化对象数据，对象中有一些数据是敏感的，比如密码字符串等，希望对该密码字段在序列化时，进行加密，而客户端如果拥有解密的密钥，只有在客户端进行反序列化时，才可以对密码进行读取，这样可以一定程度保证序列化对象的数据安全。

#### ArrayList的序列化
ArrayList源码：
``` 
public class ArrayList<E> extends AbstractList<E>
implements List<E>, RandomAccess, Cloneable, java.io.Serializable
{
    private static final long serialVersionUID = 8683452581122892189L;
    transient Object[] elementData;
    private int size;
}
```
ArrayList实现了java.io.Serializable接口，那么我们就可以对它进行序列化及反序列化。因为elementData是transient的，所以我们认为这个成员变量不会被序列化而保留下来。我们写一个Demo，验证一下我们的想法：
``` 
public static void main(String[] args) throws IOException, ClassNotFoundException {
        List<String> stringList = new ArrayList<String>();
        stringList.add("hello");
        stringList.add("world");
        System.out.println("init StringList" + stringList);
        ObjectOutputStream objectOutputStream = new ObjectOutputStream(new FileOutputStream("stringlist"));
        objectOutputStream.writeObject(stringList);

        IOUtils.close(objectOutputStream);
        File file = new File("stringlist");
        ObjectInputStream objectInputStream = new ObjectInputStream(new FileInputStream(file));
        List<String> newStringList = (List<String>)objectInputStream.readObject();
        IOUtils.close(objectInputStream);
        if(file.exists()){
            file.delete();
        }
        System.out.println("new StringList" + newStringList);
    }
```
了解ArrayList的人都知道，ArrayList底层是通过数组实现的。那么数组elementData其实就是用来保存列表中的元素的。通过该属性的声明方式我们知道，他是无法通过序列化持久化下来的。那么为什么以上的结果却通过序列化和反序列化把List中的元素保留下来了呢

在ArrayList中定义了来个方法： `writeObject()`和`readObject()`
结论是：
>在序列化过程中，如果被序列化的类中定义了writeObject 和 readObject 方法，虚拟机会试图调用对象类里的 writeObject 和 readObject 方法，进行用户自定义的序列化和反序列化。    
 如果没有这样的方法，则默认调用是 ObjectOutputStream 的 defaultWriteObject 方法以及 ObjectInputStream 的 defaultReadObject 方法。    
 用户自定义的 writeObject 和 readObject 方法可以允许用户控制序列化的过程，比如可以在序列化的过程中动态改变序列化的数值。
 
 这两个方法的具体实现：
 ``` 
 // readObject
 private void readObject(java.io.ObjectInputStream s)
         throws java.io.IOException, ClassNotFoundException {
         elementData = EMPTY_ELEMENTDATA;
 
         // Read in size, and any hidden stuff
         s.defaultReadObject();
 
         // Read in capacity
         s.readInt(); // ignored
 
         if (size > 0) {
             // be like clone(), allocate array based upon size not capacity
             ensureCapacityInternal(size);
 
             Object[] a = elementData;
             // Read in all elements in the proper order.
             for (int i=0; i<size; i++) {
                 a[i] = s.readObject();
             }
         }
}

// writeObject
private void writeObject(java.io.ObjectOutputStream s)
        throws java.io.IOException{
        // Write out element count, and any hidden stuff
        int expectedModCount = modCount;
        s.defaultWriteObject();

        // Write out size as capacity for behavioural compatibility with clone()
        s.writeInt(size);

        // Write out all elements in the proper order.
        for (int i=0; i<size; i++) {
            s.writeObject(elementData[i]);
        }

        if (modCount != expectedModCount) {
            throw new ConcurrentModificationException();
        }
}
 ```
 
 ArrayList使用transient的原因:
 
 ArrayList实际上是动态数组，每次在放满以后自动增长设定的长度值，如果数组自动增长长度设为100，而实际只放了一个元素，那就会序列化99个null元素。为了保证在序列化的时候不会将这么多null同时进行序列化，ArrayList把元素数组设置为transient
 
 结论：
 
 我们可以通过在被序列化的类中增加writeObject 和 readObject方法来自定义序列化

参考资料：  
- [阮一峰-字符编码笔记](http://www.ruanyifeng.com/blog/2007/10/ascii_unicode_and_utf-8.html)
- [java I/O流](http://blog.csdn.net/zhaoyanjun6/article/details/54292148)
- [java I/O操作](https://www.cnblogs.com/baixl/p/4170599.html)
- [java流总结](http://skye.fun/2017/11/11/JAVA%20IO%20%E6%B5%81%E8%AF%BB%E5%86%99%E6%80%BB%E7%BB%93/#more)
- [Unicode字符集编码方式](https://www.cnblogs.com/benbenalin/p/6921553.html)
- [理解java对象序列化](http://www.blogjava.net/jiangshachina/archive/2012/02/13/369898.html)
- [深入分析java序列化](http://www.hollischuang.com/archives/1140)