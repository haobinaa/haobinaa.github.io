---
title: ClassLoader类加载器
date: 2017-11-14 22:51:06
tags: java
categories: javaSE
---
#### java类加载
JVM将类加载过程分为三个步骤：装载（Load），链接（Link）和初始化(Initialize)链接又分为三个步骤  
- 装载： 查找并加载类的二进制数据；
- 链接： 
    - 验证： 确保被加载类的正确性；
    - 准备： 为类的静态变量分配内存，并将其初始化为默认值；
    - 解析： 把类中的符号引用转换为直接引用（编译时，jvm不知道引用的类的实际内存地址，只能用符号代替，叫做符号引用；直接引用可以确定类的实际地址）；
- 初始化： 为类的静态变量赋予正确的初始值；

类的初始化（类在什么时候会初始化）：
1. 创建类实例的时候，也就是new一个对象
2. 访问某个类或接口的静态变量，或者对该静态变量赋值
3. 反射
4. 调用类的静态方法
5. 初始化一个类的子类
6. jvm启动时标明名的启动类，即文件名和类名相同的那个类 

类初始化的步骤：
1. 如果这个类还没有被加载和链接，那先进行加载和链接
2. 假如这个类存在直接父类，并且这个类还没有被初始化（注意：在一个类加载器中，类只能初始化一次），那就初始化直接的父类（不适用于接口）
3. 加入类中存在初始化语句（如static变量和static块），那就依次执行这些初始化语句。

#### java类加载机制
java类加载器就是在运行时在JVM中动态的加载所需的类，java类加载器基于三个机制：委托，可见，单一。委托机制指的是将加载类的请求传递给父加载器，如果父加载器找不到或者不能加载这个类，那么再加载他。可见性机制指的是父加载器加载的类都能被子加载器看见，但是子加载器加载的类父加载器是看不见的。单一性机制指的是一个类只能被同一种加载器加载一次。

- 委托机制：首先要明确的是java的类加载器是按照需求来加载类的，比如说，当一个应用需要一个类名为Abc.class.那么首先该`AppClassLoader`首先将加载这个类的请求传递给`ExtClassLoader`，然后`ExtClassLoader`会再次将加载请求传递给`BootStrapClassLoader`，这时`BootstrapClassLoader`会从JRE/lib/rt.jar目录下找Abc.class这个类文件，如果找到就执行byte code来执行程序。如果没有找到，那么将请求传递给`ExtClassLoader`，如果`ExtClassLoader`在JRE/lib/ext目录下没有找到Abc.class那么将请求传递给该类的`AppClassLoader`，`AppClassLoader`如果在classpath没有找到Abc.class那么就会抛出ClassNotFoundException异常。  
>我们可以发现 ***委托是从下到上的，然而具体查找过程是从上到下的***
- 可见机制： 子加载器可以看见父加载器加载的文件，但是父加载器看不到子加载器加载的类文件
- 单一机制： 一个类只能被同一种加载器加载一次。

#### 默认类加载器
java系统默认有三个类加载器：
- `BootStrap`
- `ExtClassLoader`
- `AppClassLoader`

类加载器也是java类，而Bootrap不是，如下代码：
``` 
public class ClassLoader {
    public static void main(String[] args) {
    // 输出null
        System.out.println(System.class.getClassLoader());
    //  输出sun.misc.Launcher$AppClassLoader@18b4aac2
        System.out.println(ClassLoader.class.getClassLoader());
    }
}
```

类加载器树状图：
![](http://7xph6d.com1.z0.glb.clouddn.com/javaSE_%E7%B1%BB%E5%8A%A0%E8%BD%BD%E5%99%A8%E7%BB%93%E6%9E%84%E5%9B%BE.png)
一般类的加载顺序：
1. 首先当前线程的类加载器去加载线程中的第一个类
2. 如果类A应用了类B，java虚拟机将使用加载类A的类加载器来加载类B
3. 还可以直接调用ClassLoader.loadClass()方法来指定某个类加载器去加载某个类