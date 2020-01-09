---
title: Class文件格式与Jvm常量池
date: 2019-11-11 16:08:16
tags:
categories: jvm
typora-root-url: ..\..\images
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

在class文件开头的四个字节， 存放着class文件的魔数， 这个魔数是class文件的标志，他是一个固定的值： `0XCAFEBABE` 。 也就是说他是判断一个文件是不是class格式的文件的标准， 如果开头四个字节不是`0XCAFEBABE`， 那么就说明它不是class文件， 不能被JVM识别

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

##### 字面量(Literal)

字面量有点接近于 java 语言层面的概念，主要包括：

- 文本字符串: 比如我们经常声明的：`public String s = "abc";`中的`"abc"`
```
 #9 = Utf8               s
 #3 = String             #31            // abc
 #31 = Utf8              abc
```

- final 修饰的成员变量，包括静态变量、实例变量和局部变量

简单来说就是用双引号引起来的字符串字面量。

##### 符号引用(Symbolic References)

符号引用主要指的是:
1. 类和接口的全限定名称，比如`java/lang/String`
2. 字段的名称和描述符
3. 方法的名称和描述符

这里引申另一个概念：直接引用。符号引用是字面量描述符，用文本形式来表示引用关系。那么直接引用就类似于直接指针，JVM能直接定位到具体位置。

#### 运行时常量池

jvm在执行某个类的时候，必须经过加载、连接、初始化，而连接又包括验证、准备、解析三个阶段。而当类加载到内存中后，jvm就会将class常量池中的内容存放到运行时常量池中，由此可知，运行时常量池也是每个类都有一个。在上面我也说了，class常量池中存的是字面量和符号引用，也就是说他们存的并不是对象的实例，而是对象的符号引用值。`而经过解析（resolve）之后，也就是把符号引用替换为直接引用`，解析的过程会去查询全局字符串池(String Table)，以保证运行时常量池所引用的字符串与全局字符串池中所引用的是一致的。

运行时常量池再JDK8之前位于永久代，JDK8移入元空间(Metaspace)。


#### 全局字符串常量池(String Pool)


HotSpot VM里，记录interned string的一个全局表叫做`StringTable`，它本质上就是个`HashSet<String>`。这是个纯运行时的结构，而且是惰性（lazy）维护的。注意它只存储对java.lang.String实例的引用，而不存储String对象的内容。 注意，它只存了引用，根据这个引用可以得到具体的String对象。

一般我们说一个字符串进入了全局的字符串常量池其实是说在这个StringTable中保存了对它的引用，反之，如果说没有在其中就是中没有对它的引用。

##### 字面量进入字符串常量池的时机

在前面一小节提到，在类的解析(resolve)的过程中，会去查询 String Table 保证运行时常量池所引用的字符串字面量与 String Table 一致。其实这个表述不是很准确，总的来说应该是这样的:

- HotSpot VM的实现来说，加载类的时候，那些字符串字面量会进入到当前类的运行时常量池，不会进入全局的字符串常量池 ;

- 在字面量赋值的时候，会翻译成字节码ldc指令，ldc指令触发`lazy resolution`动作:
    1. 到当前类的运行时常量池（runtime constant pool）去查找该index对应的项(这里其实存的是一个索引，类型是 String_info)
    2. 如果该项尚未resolve则resolve之，并返回resolve后的内容
    3. 遇到String类型常量时，resolve的过程如果发现StringTable已经有了内容匹配的java.lang.String的引用，则直接返回这个引用;
    4. 如果StringTable里尚未有内容匹配的String实例的引用，则会在Java堆里创建一个对应内容的String对象，然后在StringTable记录下这个引用，并返回这个引用出去

##### 字符串拼接(+)的本质

对于拼接的参数只有字面量或常量，则会直接返回 String Poll 中的引用:
```java
String s1 = "hello";
String s2 = "hel" + "lo";
System.out.println(s1 == s2) // true
```
这个在解析的时候， s2是直接返回的拼接后的 "hello" 的在 String Table 中的引用。

如果是堆中两个不同地方创建的对象，实质上是通过 `StringBuilder.append` 拼接出来的:
```java
String s3 = "hello";
String s4 = "hel" + new String("lo");
System.out.println(s3 == s4) // false
```
这个时候 s4 实际上是通过 `StringBuilder.append` 拼接出来，并且最终调用`StringBuilder.toString`返回的，`StringBuilder.toString`方法如下:
```
  public String toString() {
        // Create a copy, don't share the array
        return new String(value, 0, count);
    }
```
可以看到是 new 了一个新的 String 对象， 最终 s4 指向的是另一个对象

##### String.intern 

String#intern()这个方法的作用是：
1. 如果字符串未在 String Pool 中，那么就往 Pool 中增加一条记录，然后返回 Pool 中的引用
2. 如果已经在 Pool 中，直接返回 Pool 中的引用

这样一段代码:
```java
public static void main(String[] args) {
    String s = new String("1");
    s.intern();
    String s2 = "1";
    System.out.println(s == s2);

    String s3 = new String("1") + new String("1");
    s3.intern();
    String s4 = "11";
    System.out.println(s3 == s4);
}
```
打印的结果：

- jdk6: `false false`
- jdk7(及以上): `false true`


原因:

- JDK6 中字符串常量池(String Pool)在永久代中(Perm Space)，`String.intern`会把字符串实例复制到字符串常量池种，所以返回的是永久代中字符串实例的引用，而`new String
`返回的是堆中实例的引用，两者完全不一样
- JDK7 字符串常量池已经从 Perm 区移到正常的 Java Heap 区域了(JDK8 取消了永久代改为了元空间，但字符串常量池还在 Java Heap 中)。s3 实际上是一个 `new String(11)` 的对象， 通过`String#intern` 将引用放入了 String Table 中，所以 s4 直接在 String Table 中找到了对应的引用， `s3 == s4`。而 `String s = new String("1")`时，已经创建了两个对象。常量池中的“1” 和 JAVA Heap 中的字符串对象。s.intern(); 这一句是 s 对象去常量池中寻找后发现 “1” 已经在常量池里了。在`s2 = 1`这行代码中返回的是常量池中的"1"对象的引用。

### 参考资料

- [深入理解String#intern](https://tech.meituan.com/2014/03/06/in-depth-understanding-string-intern.html)
- [new String("字面量")中的字面量是何时进入常量池的](https://www.zhihu.com/question/55994121)
- [java几种常量池的区分](http://tangxman.github.io/2015/07/27/the-difference-of-java-string-pool/)

 




