---
title: java类初始化顺序
date: 2017-11-30 10:07:36
tags: java
categories: javaSE
---
### java代码块
>静态代码块：用staitc声明，jvm加载类时执行，仅执行一次
 构造代码块：类中直接用{}定义，每一次创建对象时执行。
 执行顺序优先级：静态块,main(),构造块,构造方法。
 
#### 构造函数
- 创建对象时调用
- 一般用于给对象初始化
- 一个对象建立，构造函数执行一次

#### 构造代码块
- 用来给对象初始化
- 对象建立时运行构造代码块，优先于构造函数
- 构造代码块是给所有对象进行统一初始化，而构造函数是给对应的对象初始化。因为构造函数是可以多个的，运行哪个构造函数就会建立什么样的对象，但无论建立哪个对象，都会先执行相同的构造代码块。也就是说，构造代码块中定义的是不同对象共性的初始化内容。

#### 静态代码块
- 它是随着类的加载而执行，只执行一次，并优先于主函数。具体说，静态代码块是由类调用的。类调用时，先执行静态代码块，然后才执行主函数的
- 静态代码块其实就是给类初始化的，而构造代码块是给对象初始化的
- 静态代码块中的变量是局部变量，与普通函数中的局部变量性质没有区别
- 一个类中可以有多个静态代码块


### 测试代码

#### 代码块测试
``` 
public class LoadBlock {
    public LoadBlock() {
        System.out.println("构造函数");
    }

    {
        System.out.println("构造代码块");
    }


    static {
        System.out.println("静态代码块");
    }


    public static void main(String[] args) {
        LoadBlock A = new LoadBlock();
        LoadBlock B = new LoadBlock();
    }
}

/********* 运行结果 **********/
静态代码块
构造代码块
构造函数
构造代码块
构造函数
```
静态代码块只运行一次，构造代码块优先于构造函数

#### 静态变量和普通变量
``` 
public class InitialClass {
    // 静态变量
    public static String staticField = "staticField";

    // 普通变量
    public String field = "field";

    static {
        System.out.println(staticField);
        System.out.println("static block init");
    }

    {
        System.out.println(field);
        System.out.println("block init");
    }

    public InitialClass() {
        System.out.println("Constructor init");
    }

    public static void main(String[] args) {
        new InitialClass();
    }
}

/******** 执行结果 *************/
staticField
static block init
field
block init
Constructor init
```
（静态变量、静态初始化块）>（变量、初始化块）>构造器。

#### 有继承的情况
``` 
class HelloA {
    public HelloA() {
        System.out.println("A's constructor");
    }

    {
        System.out.println("A's code block");
    }

    static {
        System.out.println("A's static code block");
    }
}


public class InheritLoad extends HelloA{
    public InheritLoad() {
        System.out.println("son constructor");
    }

    {
        System.out.println("son's code block");
    }

    static {
        System.out.println("son's static code block");
    }

    public static void main(String[] args) {
        InheritLoad obj = new InheritLoad();
    }
}

/********** 运行结果 ************/
A's static code block
son's static code block
A's code block
A's constructor
son's code block
son constructor

```
有继承的情况，执行顺序如下:
1. 执行父类的静态代码块，并初始化父类静态成员变量
2. 执行子类的静态代码块，并初始化子类静态成员变量
3. 执行父类的构造代码块，执行父类的构造函数，并初始化父类普通成员变量
4. 执行子类的构造代码块， 执行子类的构造函数，并初始化子类普通成员变量


### 总结
java类初始化执行顺序如下:
1. 父类静态变量
2. 父类静态初始化块
3. 子类静态变量
4. 子类静态化初始化块
5. 父类变量
6. 父类初始化块
7. 父类构造器
8. 子类变量
9. 子类初始化块
10. 子类构造器


规律是 静态变量、静态代码块->普通变量、初始化块、构造器

因为静态代码块是跟类关联的，所以只执行一次，并且优先级最高

### 参考资料
[java类初始化顺序](https://www.cnblogs.com/Qian123/p/5713440.html)
