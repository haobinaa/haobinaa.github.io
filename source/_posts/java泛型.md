---
title: java泛型详解
date: 2017-12-28 17:34:55
tags: java
categories: javaSE
---

### 简介

#### 语法糖
语法糖指在计算机语言中添加的某种语法，这种语法对语言的功能并没有影响，但是更方便程序员使用。Java中最常用的语法糖主要有泛型、变长参数、条件编译、自动拆装箱、内部类等。虚拟机并不支持这些语法，它们在编译阶段就被还原回了简单的基础语法结构，这个过程成为解语法糖。

#### 泛型的好处
1. 提高安全性: 将运行期的错误转换到编译期. 如果我们在对一个对象所赋的值不符合其泛型的规定, 就会编译报错

2. 避免强转: 比如我们在使用List时, 如果我们不使用泛型, 当从List中取出元素时, 其类型会是默认的Object, 我们必须将其向下转型为String才能使用。比如:
``` 
List l = new ArrayList();
l.add("abc");
String s = (String) l.get(0);
```
如果使用泛型，就可以保证存入和取出的都是String，不必进行cast
``` 
List<String> l = new ArrayList<>();
l.add("abc");
String s = l.get(0);

```

### 泛型的使用
#### 定义类/接口
``` 
public class Test<T> {

   private T obj;

   public T getObj() {
     return obj;
   }

    public void setObj(T obj) {
       this.obj = obj;
   }
}
```
注意点：
- 变量类型中的泛型，和实例类型中的泛型，必须保证相同（不支持继承关系）


示例：
``` 
public class Container<K, V> {

    private K key;
    private V value;

    public Container(K k, V v) {
        key = k;
        value = v;
    }
}


// 使用这些接口、父类派生子类时不能再包含类型形参，需要传入具体的类型。
public class A extends Container<Integer, String>{}
```
- 既然有了这个规定, 因此在JDK1.7时就推出了一个新特性叫菱形泛型(The Diamond), 就是说后面的泛型可以省略直接写成<>, 反正前后一致(类型推断)


#### 定义方法
``` 
修饰符<T, S> 返回值类型 方法名（形参列表）
｛
方法体
 ｝
 
 public class Main{
 // 方形方法与泛型类的方法不同
       public static <T> void out(T t){
                 System.out.println(t);
       }
       public static void main(String[] args){
               out("hansheng");
               out(123);
       }
 }
 
```
注意点：
- 泛型的声明，必须在方法的修饰符（public,static,final,abstract等）之后，返回值声明之前
- 方法参数列表，以及方法体中用到的所有泛型变量，都必须声明


#### 边界符
现在我们要实现这样一个功能，查找一个泛型数组中大于某个特定元素的个数，我们可以这样实现：
``` 
public static <T> int countGreaterThan(T[] anArray, T elem) {
    int count = 0;
    for (T e : anArray)
        if (e > elem)  // compiler error
            ++count;
    return count;
}
```
但是这样很明显是错误的，因为除了short, int, double, long, float, byte, char等原始类型，其他的类并不一定能使用操作符>，所以编译器报错，那怎么解决这个问题呢？答案是使用边界符。
``` 
public interface Comparable<T> {
    public int compareTo(T o);
}
```
做一个类似于下面这样的声明，这样就等于告诉编译器类型参数T代表的都是实现了Comparable接口的类，这样等于告诉编译器它们都至少实现了compareTo方法。
``` 
public static <T extends Comparable<T>> int countGreaterThan(T[] anArray, T elem) {
    int count = 0;
    for (T e : anArray)
        if (e.compareTo(elem) > 0)
            ++count;
    return count;
}
```


#### 通配符
- 作用： 规定只允许某一部分类作为泛型
- 分类：
    - 无边界的分配符(<?>):无边界的通配符的主要作用就是让泛型能够接受未知类型的数据
    - 固定上边界通配符(<? extends E>):使用固定上边界的通配符的泛型, 就能够接受指定类及其子类类型的数据。要声明使用该类通配符, 采用<? extends E>的形式, 这里的E就是该泛型的上边界. 注意: 这里虽然用的是extends关键字, 却不仅限于继承了父类E的子类, 也可以代指显现了接口E的类
    - 固定下边界通配符(<? super E>):使用固定下边界的通配符的泛型, 就能够接受指定类及其父类类型的数据。要声明使用该类通配符, 采用<? super E>的形式, 这里的E就是该泛型的下边界
    
##### 无边界通配符
``` 
public static void printList(List<?> list) {
for (Object o : list) {
      System.out.println(o);
   }
}
 public static void main(String[] args) {
   List<String> l1 = new ArrayList<>();
   l1.add("aa");
    l1.add("bb");
   l1.add("cc");
   printList(l1);
   List<Integer> l2 = new ArrayList<>();
   l2.add(11);
    l2.add(22);
   l2.add(33);
   printList(l2);
```
注意：
- 这里的printList方法不能写成public static void printList(List<Object> list)的形式。原因在上文提到过，变量类型中的泛型，和实例类型中的泛型，必须保证相同。两者之间不支持继承关系。
- 我们不能对List<?>使用add，get以及List拥有的其他方法。原因是，我们不确定该List的类型, 也就不知道add，或者get方法的参数类型。但是也有特例：
``` 
public static void addTest(List<?> list) {
    Object o = new Object();
// list.add(o); // 编译报错
// list.add(1); // 编译报错
// list.add("ABC"); // 编译报错 
   list.add(null); // 特例
// String s = list.get(0); // 编译报错
// Integer i = list.get(1); // 编译报错 
   Object o = list.get(2); // 特例
}
```
由于参数的泛型不确定，调用者可能会传List<Number>，也可能传List<String>。
当调用者传过来的参数是List<Interger>，执行到list.add(o)以及list.("ABC")的时候，系统肯定会抛出异常，使得后面的代码无法执行。

所以，编译器其实是把运行时可能出现的异常放在编译阶段来检查，提高了代码的健壮性以及安全性。


##### 固定上边界通配符(满足是某类型的子类)
``` 
public static double sumOfList(List<? extends Number> list) {
    double s = 0.0;
    for (Number n : list) {
      // 注意这里得到的n是其上边界类型的, 也就是Number,需要将其转换为double.  
      s += n.doubleValue();
    }
    return s;
 }
 public static void main(String[] args) {
    List<Integer> list1 = Arrays.asList(1, 2, 3, 4);
    System.out.println(sumOfList(list1));
    List<Double> list2 = Arrays.asList(1.1, 2.2, 3.3, 4.4);
    System.out.println(sumOfList(list2));
}
```
注意： 
- 不能对List<? extends E>使用add方法,原因是不确定该List的类型, 也就不知道add方法的参数类型。但是也有特例：
``` 
public static void addTest2(List<? extends Number> l) {
// l.add(1); // 编译报错
// l.add(1.1); // 编译报错 
   l.add(null);
   Number number = l.get(1); // 正常 
}
```
目的跟第一种通配符类似，就是编译器其实是把运行时可能出现的异常放在编译阶段来检查。

但是，我们可以保证不管参数是什么泛型，里面的元素肯定是Number或者其子类，所以，从List中获取一个Number元素的get()方法是允许的。

##### 固定下边界通配符(满足是某类型的父类)
``` 
public static void addNumbers(List<? super Integer> list) {
     for (int i = 1; i <= 10; i++) {
         list.add(i);
     }
 }
 public static void main(String[] args) {
     List<Object> list1 = new ArrayList<>();
     addNumbers(list1);
     System.out.println(list1);
     List<Number> list2 = new ArrayList<>();
     addNumbers(list2);
     System.out.println(list2);
     List<Double> list3 = new ArrayList<>();
  // addNumbers(list3); // 编译报错 
 }
```

#### 通配符总结
来看一个贯通的例子，首先定义几个类
``` 
class Fruit {}
class Apple extends Fruit {}
class Orange extends Fruit {}
```
下面这个例子中，我们创建了一个泛型类Reader，然后在f1()中当我们尝试Fruit f = fruitReader.readExact(apples);编译器会报错，因为List<Fruit>与List<Apple>之间并没有任何的关系。
``` 
public class GenericReading {
    static List<Apple> apples = Arrays.asList(new Apple());
    static List<Fruit> fruit = Arrays.asList(new Fruit());
    static class Reader<T> {
        T readExact(List<T> list) {
            return list.get(0);
        }
    }
    
    static void f1() {
        Reader<Fruit> fruitReader = new Reader<Fruit>();
        // 报错: List<Fruit> cannot be applied to List<Apple>.
        // Fruit f = fruitReader.readExact(apples);
    }
    public static void main(String[] args) {
        f1();
    }
}
```
但是按照我们通常的思维习惯，Apple和Fruit之间肯定是存在联系，然而编译器却无法识别，那怎么在泛型代码中解决这个问题呢？我们可以通过使用固定上边界通配符来解决这个问题：
``` 
static class CovariantReader<T> {
    T readCovariant(List<? extends T> list) {
        return list.get(0);
    }
}
static void f2() {
    CovariantReader<Fruit> fruitReader = new CovariantReader<Fruit>();
    Fruit f = fruitReader.readCovariant(fruit);
    Fruit a = fruitReader.readCovariant(apples);
}
public static void main(String[] args) {
    f2();
```
这样就相当与告诉编译器， fruitReader的readCovariant方法接受的参数只要是满足Fruit的子类就行(包括Fruit自身)，这样子类和父类之间的关系也就关联上了。


上面我们看到了类似<? extends T>的用法，利用它我们可以从list里面get元素，那么我们可不可以往list里面add元素呢？我们来尝试一下：
``` 
public class GenericsAndCovariance {
    public static void main(String[] args) {
        // Wildcards allow covariance:
        List<? extends Fruit> flist = new ArrayList<Apple>();
        // Compile Error: can't add any type of object:
        // flist.add(new Apple())
        // flist.add(new Orange())
        // flist.add(new Fruit())
        // flist.add(new Object())
        flist.add(null); // 合法但是没什么用
        // We Know that it returns at least Fruit:
        Fruit f = flist.get(0);
    }
}
```
Java编译器不允许我们这样做，为什么呢？对于这个问题我们不妨从编译器的角度去考虑。因为List<? extends Fruit> flist它自身可以有多种含义：
``` 
List<? extends Fruit> flist = new ArrayList<Fruit>();
List<? extends Fruit> flist = new ArrayList<Apple>();
List<? extends Fruit> flist = new ArrayList<Orange>();
```
当我们add一个orange的时候，flist可能指向一个Apple，其他的也一样，我们只是想要一个固定类型的Fruit，编译器无法识别，所以会报错


所以对于实现了<? extends T>的集合类只能将它视为Producer向外提供(get)元素，而不能作为Consumer来对外获取(add)元素。

如果我们要add元素应该怎么做呢？可以使用<? super T>：
``` 
public class GenericWriting {
    static List<Apple> apples = new ArrayList<Apple>();
    static List<Fruit> fruit = new ArrayList<Fruit>();
    static <T> void writeExact(List<T> list, T item) {
        list.add(item);
    }
    static void f1() {
        writeExact(apples, new Apple());
        writeExact(fruit, new Apple());
    }
    // 固定下边界
    static <T> void writeWithWildcard(List<? super T> list, T item) {
        list.add(item)
    }
    static void f2() {
        writeWithWildcard(apples, new Apple());
        writeWithWildcard(fruit, new Apple());
    }
    public static void main(String[] args) {
        f1(); f2();
    }
}
```
这样我们可以往容器里面添加元素了，但是使用super的坏处是以后不能get容器里面的元素了，原因很简单，我们继续从编译器的角度考虑这个问题，对于List<? super Apple> list，它可以有下面几种含义：
``` 
List<? super Apple> list = new ArrayList<Apple>();
List<? super Apple> list = new ArrayList<Fruit>();
List<? super Apple> list = new ArrayList<Object>();
```
当我们尝试通过list来get一个Apple的时候，可能会get得到一个Fruit，这个Fruit可以是Orange等其他类型的Fruit。

根据上面的例子，我们可以总结出一条规律，”Producer Extends, Consumer Super”(PECS原则)：
- “Producer Extends” – 如果你需要一个只读List，用它来produce T，那么使用? extends T。
- Consumer Super” – 如果你需要一个只写List，用它来consume T，那么使用? super T。
- 如果需要同时读取以及写入，那么我们就不能使用通配符了。

如果阅读过一些Java集合类的源码，可以发现通常我们会将两者结合起来一起用，比如像下面这样
``` 
public class Collections {
    public static <T> void copy(List<? super T> dest, List<? extends T> src) {
        for (int i=0; i<src.size(); i++)
            dest.set(i, src.get(i));
    }
}
```

### 类型擦除

类型擦除就是说Java泛型只能用于在编译期间的静态类型检查，然后编译器生成的代码会擦除相应的类型信息，这样到了运行期间实际上JVM根本就知道泛型所代表的具体类型。这样做的目的是因为Java泛型是1.5之后才被引入的，为了保持向下的兼容性，所以只能做类型擦除来兼容以前的非泛型代码。对于这一点，如果阅读Java集合框架的源码，可以发现有些类其实并不支持泛型。

比如：
``` 
public class Node<T> {
    private T data;
    private Node<T> next;
    public Node(T data, Node<T> next) {
        this.data = data;
        this.next = next;
    }
    public T getData() { return data; }
    // ...
}
```
编译器做完相应的类型检查之后，实际上到了运行期间上面这段代码实际上将转换成：
``` 
public class Node {
    private Object data;
    private Node next;
    public Node(Object data, Node next) {
        this.data = data;
        this.next = next;
    }
    public Object getData() { return data; }
    // ...
}
```

这意味着不管我们声明Node<String>还是Node<Integer>，到了运行期间，JVM统统视为Node<Object>。有没有什么办法可以解决这个问题呢？这就需要我们自己重新设置bounds了，将上面的代码修改成下面这样
``` 
public class Node<T extends Comparable<T>> {
    private T data;
    private Node<T> next;
    public Node(T data, Node<T> next) {
        this.data = data;
        this.next = next;
    }
    public T getData() { return data; }
    // ...
}
```
这样编译器就会将T出现的地方替换成Comparable而不再是默认的Object了：
``` 
public class Node {
    private Comparable data;
    private Node next;
    public Node(Comparable data, Node next) {
        this.data = data;
        this.next = next;
    }
    public Comparable getData() { return data; }
    // ...
}
```
上面的概念或许还是比较好理解，但其实泛型擦除带来的问题远远不止这些，接下来我们系统地来看一下类型擦除所带来的一些问题，有些问题在C++的泛型中可能不会遇见，但是在Java中却需要格外小心

#### 不允许创建泛型数组

在Java中不允许创建泛型数组，类似下面这样的做法编译器会报错：
``` 
List<Integer>[] arrayOfLists = new List<Integer>[2];  // compile-time error
```
为什么编译器不支持上面这样的做法呢？继续使用逆向思维，我们站在编译器的角度来考虑这个问题。
``` 
Object[] strings = new String[2];
strings[0] = "hi";   // OK
strings[1] = 100;    // An ArrayStoreException is thrown.
```
对于上面这段代码还是很好理解，字符串数组不能存放整型元素，而且这样的错误往往要等到代码运行的时候才能发现，编译器是无法识别的。接下来我们再来看一下假设Java支持泛型数组的创建会出现什么后果：
``` 
Object[] stringLists = new List<String>[];  // compiler error, but pretend it's allowed
stringLists[0] = new ArrayList<String>();   // OK
// An ArrayStoreException should be thrown, but the runtime can't detect it.
stringLists[1] = new ArrayList<Integer>();
```
假设我们支持泛型数组的创建，由于运行时期类型信息已经被擦除，JVM实际上根本就不知道new ArrayList<String>()和new ArrayList<Integer>()的区别。类似这样的错误假如出现才实际的应用场景中，将非常难以察觉。

通过如下代码可以证实我们的猜测：
``` 
public class ErasedTypeEquivalence {
    public static void main(String[] args) {
        Class c1 = new ArrayList<String>().getClass();
        Class c2 = new ArrayList<Integer>().getClass();
        System.out.println(c1 == c2); // true
    }
}
```


#### brige method
继续复用我们上面的Node的类，对于泛型代码，Java编译器实际上还会偷偷帮我们实现一个Bridge method。
``` 
public class Node<T> {
    public T data;
    public Node(T data) { this.data = data; }
    public void setData(T data) {
        System.out.println("Node.setData");
        this.data = data;
    }
}
public class MyNode extends Node<Integer> {
    public MyNode(Integer data) { super(data); }
    public void setData(Integer data) {
        System.out.println("MyNode.setData");
        super.setData(data);
    }
}
```
看完上面的分析之后，你可能会认为在类型擦除后，编译器会将Node和MyNode变成下面这样：
``` 
public class Node {
    public Object data;
    public Node(Object data) { this.data = data; }
    public void setData(Object data) {
        System.out.println("Node.setData");
        this.data = data;
    }
}
public class MyNode extends Node {
    public MyNode(Integer data) { super(data); }
    public void setData(Integer data) {
        System.out.println("MyNode.setData");
        super.setData(data);
    }
}
```
实际上不是这样的，我们先来看一下下面这段代码，这段代码运行的时候会抛出ClassCastException异常，提示String无法转换成Integer：
``` 
MyNode mn = new MyNode(5);
Node n = mn; // A raw type - compiler throws an unchecked warning
n.setData("Hello"); // Causes a ClassCastException to be thrown.
// Integer x = mn.data;
```
如果按照我们上面生成的代码，运行到第3行的时候不应该报错，因为MyNode中不存在setData(String data)方法，所以只能调用父类Node的setData(Object data)方法，既然这样上面的第3行代码不应该报错，因为String当然可以转换成Object了，那ClassCastException到底是怎么抛出的？

实际上Java编译器对上面代码自动还做了一个处理:
``` 
class MyNode extends Node {
    // Bridge method generated by the compiler
    public void setData(Object data) {
        setData((Integer) data);
    }
    public void setData(Integer data) {
        System.out.println("MyNode.setData");
        super.setData(data);
    }
    // ...
}
```
这也就是为什么上面会报错的原因了，setData((Integer) data);的时候String无法转换成Integer。所以上面第2行编译器提示unchecked warning的时候，我们不能选择忽略，不然要等到运行期间才能发现异常。如果我们一开始加上Node<Integer> n = mn就好了，这样编译器就可以提前帮我们发现错误

#### 利用类型参数创建实例
正如我们上面提到的，Java泛型很大程度上只能提供静态类型检查，然后类型的信息就会被擦除，所以像下面这样利用类型参数创建实例的做法编译器不会通过：
``` 
public static <E> void append(List<E> list) {
    E elem = new E();  // compile-time error
    list.add(elem);
}
```
但是如果某些场景我们想要需要利用类型参数创建实例，我们应该怎么做呢？可以利用反射解决这个问题：
``` 
public static <E> void append(List<E> list, Class<E> cls) throws Exception {
    E elem = cls.newInstance();   // OK
    list.add(elem);
}
```
我们可以像下面这样调用：
``` 
List<String> ls = new ArrayList<>();
append(ls, String.class);
```

#### 无法对泛型代码直接使用instanceof关键字
我们无法对泛型代码直接使用instanceof关键字，因为Java编译器在生成代码的时候会擦除所有相关泛型的类型信息，正如我们上面验证过的JVM在运行时期无法识别出ArrayList<Integer>和ArrayList<String>的之间的区别：
``` 
public static <E> void rtti(List<E> list) {
    if (list instanceof ArrayList<Integer>) {  // compile-time error
        // ...
    }
}
=> { ArrayList<Integer>, ArrayList<String>, LinkedList<Character>, ... }
```
和上面一样，我们可以使用通配符重新设置bounds来解决这个问题：
``` 
public static void rtti(List<?> list) {
    if (list instanceof ArrayList<?>) {  // OK; instanceof requires a reifiable type
        // ...
    }
}
```



### 参考资料
- [java泛型详解](https://zhuanlan.zhihu.com/p/28242753)
- [importNews java泛型](http://www.importnew.com/24029.html)
- [java泛型](https://www.jianshu.com/p/c8ee2cfa5b33)