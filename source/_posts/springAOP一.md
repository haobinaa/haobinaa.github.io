---
title: springAOP(动态代理)
date: 2017-11-29 09:56:09
tags: spring
categories: spring
---
### JDK的动态代理
基于JDK的动态代理在之前的文章已经写了[传送门](https://haobinaa.github.io/2017/11/14/java%E5%8A%A8%E6%80%81%E4%BB%A3%E7%90%86%E7%9A%84%E5%AE%9E%E7%8E%B0/)。

还有另外一种代动态代理CGLib(Code Generation Library):  
CGLIB是一个强大的高性能，高质量的代码生成类库，可以在运行期扩展Java类与实现Java接口，CGLib封装了asm，可以再运行期动态生成新的class。和JDK动态代理相比较：JDK创建代理有一个限制，就是只能为接口创建代理实例，而对于没有通过接口定义业务方法的类，则可以通过CGLib创建动态代理

### CGlib动态代理
cglib的使用就比较简单，首先创建一个类`SayHello`
``` 
public class SayHello {
    public void say () {
        System.out.println("hello world!");
    }
}

```
创建代理类`CglibProxy`
``` 
public class CglibProxy implements MethodInterceptor{

    private Enhancer enhancer = new Enhancer();

    public Object getProxy (Class clazz) {
    // 设置需要创建子类的类
        enhancer.setSuperclass(clazz);
        enhancer.setCallback(this);
        // 通过字节码技术创建子类实例
        return enhancer.create();
    }
    public Object intercept(Object o, Method method, Object[] objects, MethodProxy methodProxy) throws Throwable {
        System.out.println("前置代理");
        Object obj = methodProxy.invokeSuper(o, objects);
        System.out.println("后置代理");
        return obj;
    }
}
```
测试代码
``` 
public class main {
    public static void main(String[] args) {
        CglibProxy cglibProxy = new CglibProxy();
        SayHello proxy = (SayHello) cglibProxy.getProxy(SayHello.class);
        proxy.say();
    }
}
```

### 总结
CGLib所创建的动态代理对象的性能比JDK所创建的代理对象性能高不少，大概10倍，但CGLib在创建代理对象时所花费的时间却比JDK动态代理多大概8倍，所以对于singleton的代理对象或者具有实例池的代理，因为无需频繁的创建新的实例，所以比较适合CGLib动态代理技术，反之则适用于JDK动态代理技术。另外，由于CGLib采用动态创建子类的方式生成代理对象，所以不能对目标类中的final，private等方法进行处理。所以，大家需要根据实际的情况选择使用什么样的代理了。同样的，Spring的AOP编程中相关的ProxyFactory代理工厂内部就是使用JDK动态代理或CGLib动态代理的，通过动态代理，将增强（advice)应用到目标类中。

