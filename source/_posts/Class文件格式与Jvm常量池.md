---
title: Class文件格式与Jvm常量池
date: 2019-11-11 16:08:16
tags:
categories: jvm
---

### Class 文件

虚拟机会将我们平时编写的 Java 文件编译成字节码格式的 `.class` 文件。

class文件中的信息是一项一项排列的， 每项数据都有它的固定长度， 有的占一个字节， 有的占两个字节， 还有的占四个字节或8个字节， 数据项的不同长度分别用u1, u2, u4, u8表示， 分别表示一种数据项在class文件中占据一个字节， 两个字节， 4个字节和8个字节。 可以把u1, u2, u3, u4看做class文件数据项的类型 。

#### Class 文件的结构

一个典型的class文件分为：MagicNumber，Version，Constant_pool，Access_flag，This_class，Super_class，Interfaces，Fields，Methods 和Attributes这十个部分，用一个数据结构可以表示如下：

``` 
ClassFile {
  u4              magic;
  u2              minor_version;
  u2              major_version;
  u2              constant_pool_count;
  cp_info         constant_pool[constant_pool_count-1];
  u2              access_flags;
  u2              this_class;
  u2              super_class;
  u2              interfaces_count;
  u2              interfaces[interfaces_count];
  u2              fields_count;
  field_info      fields[fields_count];
  u2              methods_count;
  method_info     methods[methods_count];
  u2              attributes_count;
  attribute_info  attributes[attributes_count];
}
```

##### 1.magic

在class文件开头的四个字节， 存放着class文件的魔数， 这个魔数是class文件的标志，他是一个固定的值： 0XCAFEBABE 。 也就是说他是判断一个文件是不是class格式的文件的标准， 如果开头四个字节不是0XCAFEBABE， 那么就说明它不是class文件， 不能被JVM识别

##### 2. minor_version/major_version

接下来四个字节是class文件的此版本号和主版本号(分别占两个字节)。

同版本的javac编译器编译的class文件， 版本号可能不同， 而不同版本的JVM能识别的class文件的版本号也可能不同， 一般情况下， 高版本的JVM能识别低版本的javac编译器编译的class文件， 而低版本的JVM不能识别高版本的javac编译器编译的class文件。

##### 3. constant_pool

版本号之后就是常量池相关的数据项，常量池中几乎包含类中的所有信息的描述。class文件中的很多其他部分都是对常量池中的数据项的引用，常量池中各个项也会相互引用。

常量池中存放了文字字符串，常量值，当前类的类名，字段名，方法名， 各个字段和方法的描述符， 对当前类的字段和方法的引用信息， 当前类中对其他类的引用信息等等。

常量池中各个数据项通过索引来访问， 有点类似与数组， 只不过常量池中的第一项的索引为1, 而不为0。常量池中的每一种数据项也有自己的类型。 常量池中的数据项的类型如下表:


| 常量池中数据项 | 类型标志 | 类型描述                 |
|--------------|---------|-------------------------|
| CONSTANT_Utf8| 1      |   utf8 编码的字符串        |
| CONSTANT_Integer | 3  | int类型字面量             |
| CONSTANT_Float |   4  | float类型字面量 
| CONSTANT_Long |   5  | long类型字面量          | 
| CONSTANT_Double |   6  | double类型字面量          | 
| CONSTANT_Class |   7  | 对一个类或接口的符号引用          | 
| CONSTANT_String |   8  | string类型字面量          | 
| CONSTANT_Fieldref |   9  | 对一个字段的符号引用      | 
| CONSTANT_Methodref |   10  | 对一个类中声明方法的符号引用  | 
| CONSTANT_InterfacMethodref |11|对一个接口中声明方法的符号引| 
| CONSTANT_NameAndType | 12|对一个字段或方法的部分符号引用  | 

其中每个数据项叫做一个XXX_info项，比如，一个常量池中一个CONSTANT_Utf8类型的项，就是一个CONSTANT_Utf8_info。除此之外， 每个info项中都有一个标志值（tag），这个标志值表明了这个常量池中的info项的类型是什么， 从上面的表格中可以看出，一个CONSTANT_Utf8_info中的tag值为1，而一个CONSTANT_Fieldref_info中的tag值为9 。

##### 4. access_flag

保存了当前类的访问权限

##### 5. this_cass

保存了当前类的全局限定名在常量池里的索引

##### 6. super class

保存了当前类的父类的全局限定名在常量池里的索引

##### 7.interfaces 

存了当前类实现的接口列表，包含两部分内容：

- interfaces_count: 指的是当前类实现的接口数目
- interfaces[]: 包含 interfaces_count 个接口的全局限定名的索引的数组

##### 8. fields

保存了当前类的成员列表，包含两部分的内容：
- fields_count: 类变量和实例变量的字段的数量总和
- fields[]: 包含 fields_count 个字段详细信息的列表


##### 9. methods

包含两部分的内容：
- methods_count:该类或者接口显示定义的方法的数量。
- methods[]: 包含方法信息的一个详细列表。

##### 10. attributes

包含了当前类的attributes列表，包含两部分内容
- attributes_count: attributes 列表中包含的attribute_info的数量。
- attributes[]: attributes 属性列表

### jvm中的常量池

java中常量池分为三种类型:
1. 类文件常量池(Class Constant Pool)
2. 运行时常量池(The Run-Time Constant Pool)
3. String 常量池

#### Class 文件常量池

上面已经写过 Class Constant Pool 的结构。这里再总结一下，class常量池主要存储两大常量： 字面量和符号引用。

##### 字面量

字面量有点接近于 java 语言层面的概念，主要包括：

- 文本字符串: 比如我们经常声明的：`public String s = "abc";`中的`"abc"`
```
 #9 = Utf8               s
 #3 = String             #31            // abc
 #31 = Utf8              abc
```

- final 修饰的成员变量，包括静态变量、实例变量和局部变量

##### 符号引用

符号引用主要指的是:
1. 类和接口的全限定名称，比如`java/lang/String`
2. 字段的名称和描述符
3. 方法的名称和描述符

这里引申另一个概念：直接引用。符号引用是字面量描述符，用文本形式来表示引用关系。那么直接引用就类似于直接指针，JVM能直接定位到具体位置。

#### 运行时常量池

运行时常量池是方法区的一部分，所以也是全局共享的。

class 文件常量池在编译阶段就已经确定；JVM 规范对 class 文件结构有着严格的规范，必须符合此规范的 class 文件才会被 JVM 认可和装载.运行时常量池 中保存着一些 class 文件中描述的符号引用，同时还会将这些符号引用所翻译出来的直接引用存储在运行时常量池中。

 运行时常量池相对于 class 常量池一大特征就是其具有动态性，Java 规范并不要求常量只能在运行时才产生，也就是说运行时常量池中的内容并不全部来自 class 常量池，class 常量池并非运行时常量池的唯一数据输入口；在运行时可以通过代码生成常量并将其放入运行时常量池中，这种特性被用的较多的是`String.intern()`

运行时常量池再JDK8之前位于永久代，JDK8移入元空间(Metaspace)


#### 全局字符串常量池

##### java中创建字符串对象的两种方式

java中创建字符串对象一般有两种方式(StringBuiler和StringBuffer除外):
``` 
String s0 = "hello'；
String s1 = new String ("hello");
```

1. 第一种声明的字面量 hello 是在编译期就已经确定的，它会直接进入class文件常量池中；当运行期间在全局字符串常量池中会保存它的一个引用，实际上最终还是要在堆上创建一个`hello`对象
2. 第二种方式方式使用了`new String()`，也就是调用了String类的构造函数，我们知道new指令是创建一个类的实例对象并完成加载初始化的，因此这个字符串对象是在运行期才能确定的，创建的字符串对象是在堆内存上

这里看一段典型的代码:
```java
String s1 = "Hello";
String s2 = "Hello";
String s3 = "Hel" + "lo";
String s4 = "Hel" + new String("lo");
String s5 = new String("Hello");
String s7 = "H";
String s8 = "ello";
String s9 = s7 + s8;

System.out.println(s1 == s2);  // true
System.out.println(s1 == s3);  // true
System.out.println(s1 == s4);  // false
System.out.println(s1 == s9);  // false
```

1. s1==s2

这个对比第一部分常量池的讲解应该很好理解，因为字面量"Hello"在运行时会进入运行时常量池，同时同一份字面量只会保留一份，所有引用都指向这一份字符串，自然引用的地址也就相同了

2. s1==s3

这个主要牵扯String"+"号编译器优化的问题，s3虽然是动态拼接出来的字符串，但是所有参与拼接的部分都是已知的字面量，在编译期间，这种拼接会被优化，编译器直接帮你拼好，因此String s3 = "Hel" + "lo";在class文件中被优化成String s3 = "Hello";，所以s1 == s3成立

3. s1 != s4

new String("lo")在堆中new了一个String对象出来，而“Hel”字面量是通过另一种操作在堆中创建的对象，这两个在堆中不同地方创建的对象是通过StringBuilder
.append方法拼接出来的，并且最终会调用StringBuilder.toString方法输出(最终输出的也是“Hello”),这些通过上面字节码的分析都可以看得出来，我们来看看StringBuilder.toString方法:
``` 
public String toString() {
    // Create a copy, don't share the array
    return new String(value, 0, count);
}
```
最终是拼接出来一个对象， s4 指向了拼接出来这个对象。而s1指向的是另一个对象

4. s1 != s9

s9 这种两个字面量拼接的方式，同样是以StringBuilder.append生成的(字节码分析)一个全新的对象

##### 字符串常量池

String s1="hello" 字符串对象在哪里？

这里要引申出我们要说的概念：字符串常量池。运行时常量池不是一个概念。但我们在代码中申明String s1 = "Hello";这句代码后，在类加载的过程中，类的class文件的信息会被解析到内存的方法区里。class文件里常量池里大部分数据会被加载到“运行时常量池”，包括String的字面量；但同时“Hello”字符串的一个引用会被存到同样在“非堆”区域的“字符串常量池”中，而"Hello"本体还是和所有对象一样，创建在Java堆中。

字符串常量池是JVM所维护的一个字符串实例的引用表，在HotSpot VM中，它是一个叫做StringTable的全局表。在字符串常量池中维护的是字符串实例的引用，底层实现就是一个Hashtable。这些被维护的引用所指的字符串实例，被称作”被驻留的字符串”或”interned string”或通常所说的”进入了字符串常量池的字符串”

JDK7 以后字符串常量池被移到了 java heap 中






 




