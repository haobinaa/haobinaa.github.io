---
title: java动态代理的实现
date: 2017-11-14 16:01:13
tags: javaSE
categories: javaSE
---

### JDK 动态代理

java的动态代理机制的是需要Proxy类来实现的，使用如下:
``` 
public class DynamicProxyDemo {

    public static void main(String[] args) {
        DynamicSubject subject = new RealsSubject();
        // 调用类
        ProxyHandler invocationHandler = new ProxyHandler(subject);
        // 创建代理对象
        DynamicSubject ProxySubject = (DynamicSubject) Proxy.newProxyInstance(RealsSubject.class.getClassLoader(), RealsSubject.class.getInterfaces(), invocationHandler);
        ProxySubject.request();
    }

}

interface DynamicSubject {
    void request();
}

class RealsSubject implements DynamicSubject {
    @Override
    public void request() {
        System.out.println("====RealSubject======");
    }
}


class ProxyHandler implements InvocationHandler {

    private DynamicSubject subject;

    public ProxyHandler(DynamicSubject subject) {
        this.subject =subject;
    }


    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        System.out.println("======befor======");
        Object result = method.invoke(subject,args);
        System.out.println("======after======");
        return result;
    }
}
```

#### java.lang.reflect.Proxy
``` 
// 方法 1: 该方法用于获取指定代理对象所关联的调用处理器
public static InvocationHandler getInvocationHandler(Object proxy) 

// 方法 2：该方法用于获取关联于指定类装载器和一组接口的动态代理类的类对象
public static Class<?> getProxyClass(ClassLoader loader, 
Class<?>... interfaces)

// 方法 3：该方法用于判断指定类对象是否是一个动态代理类
public static boolean isProxyClass(Class<?> cl) 

// 方法 4：该方法用于为指定类装载器、一组接口及调用处理器生成动态代理类实例
public static Object newProxyInstance(ClassLoader loader,
 Class<?>[] interfaces,InvocationHandler h)
```

#### java.lang.reflect.InvocationHandler
``` 
/**
 该方法负责集中处理动态代理类上的所有方法调用。
 第一个参数既是代理类实例，
 第二个参数是被调用的方法对象
 第三个方法是调用参数。
 调用处理器根据这三个参数进行预处理或分派到委托类实例上发射执行
*/
public Object invoke(Object proxy, Method method, Object[] args)
    throws Throwable;
```

#### java.lang.ClassLoader
类装载器类，将类的字节码装载到 Java 虚拟机（JVM）中并为其定义类对象，然后该类才能被使用。Proxy类与普通类的唯一区别就是其字节码是由 JVM 在运行时动态生成的而非预存在于任何一个 .class 文件中。   
每次生成动态代理类对象时都需要指定一个类装载器对象：newProxyInstance()方法第一个参数


#### 动态代理对象创建过程
1. 实现InvocationHandler接口创建自己的调用处理器
``` 
// InvocationHandlerImpl 实现了 InvocationHandler 接口，并能实现方法调用从代理类到委托类的分派转发
// 其内部通常包含指向委托类实例的引用，用于真正执行分派转发过来的方法调用
InvocationHandler handler = new InvocationHandlerImpl(..); 
```
2. 通过Proxy类指定ClassLoader对象和一组Interface来创建动态代理类
``` 
// 通过 Proxy 为包括 Interface 接口在内的一组接口动态创建代理类的类对象
Class clazz = Proxy.getProxyClass(classLoader, new Class[] { Interface.class, ... })
```
3. 通过反射机制获取动态代理类的构造函数，其唯一参数类型是调用处理器接口类型
``` 
Constructor constructor = clazz.getConstructor(new Class[] { InvocationHandler.class })
```
4.通过构造函数创建动态代理类实例，构造时调用处理器对象作为参数被传入
``` 
Interface Proxy = (Interface)constructor.newInstance(new Object[] { handler });
```
为了简化对象的创建过程，Proxy类的newProxyInstance方法封装了2-4步，所以代理对象的创建只需要两步：
``` 
// InvocationHandlerImpl 实现了 InvocationHandler 接口，并能实现方法调用从代理类到委托类的分派转发
InvocationHandler handler = new InvocationHandlerImpl(..); 

// 通过 Proxy 直接创建动态代理类实例
Interface proxy = (Interface)Proxy.newProxyInstance( classLoader, 
     new Class[] { Interface.class }, 
     handler );
```

#### 动态代理机制的特点
1. 包：如果所代理的接口都是 public 的，那么它将被定义在顶层包（即包路径为空），如果所代理的接口中有非 public 的接口（因为接口不能被定义为 protect 或 private，所以除 public 之外就是默认的 package 访问级别），那么它将被定义在该接口所在包（假设代理了 com.ibm.developerworks 包中的某非 public 接口 A，那么新生成的代理类所在的包就是 com.ibm.developerworks），这样设计的目的是为了最大程度的保证动态代理类不会因为包管理的问题而无法被成功定义并访问

2. 类修饰符：该代理类具有 final 和 public 修饰符，意味着它可以被所有的类访问，但是不能被再度继承

3. 类名：格式是“$ProxyN”，其中 N 是一个逐一递增的阿拉伯数字，代表 Proxy 类第 N 次生成的动态代理类，值得注意的一点是，并不是每次调用 Proxy 的静态方法创建动态代理类都会使得 N 值增加，原因是如果对同一组接口（包括接口排列的顺序相同）试图重复创建动态代理类，它会很聪明地返回先前已经创建好的代理类的类对象，而不会再尝试去创建一个全新的代理类，这样可以节省不必要的代码重复生成，提高了代理类的创建效率

4. 类继承关系

![](https://www.ibm.com/developerworks/cn/java/j-lo-proxy1/image002.png)

Proxy 类是它的父类，这个规则适用于所有由 Proxy 创建的动态代理类。而且该类还实现了其所代理的一组接口，这就是为什么它能够被安全地类型转换到其所代理的某接口的根本原因

### 参考文档:
- [java动态代理机制分析](https://www.ibm.com/developerworks/cn/java/j-lo-proxy1/)
- [AOP中的动态代理](https://github.com/brianway/java-learning/blob/master/blogs/javase/java%E5%9F%BA%E7%A1%80%E5%B7%A9%E5%9B%BA%E7%AC%94%E8%AE%B0(4)-%E4%BB%A3%E7%90%86.md)