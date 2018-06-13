---
title: java增强循环
date: 2017-12-15 11:37:04
tags: java
categories: javaSE
---

### 前言

阿里巴巴java开发手册上面写道：不要在 foreach 循环里进行元素的 add / remove 操作，remove 元素使用 Iterator 方式。经测试确实在foreach里面remove元素会抛出`ConcurrentModificationException `异常

查了一些资料，自己动手实验了一遍，探究其中原因

#### foreach循环
编译一个foreach循环的字节码可以看到，一个ArrayList的foreach循环其实是通过Iterator实现的，比如

``` 
List<String> list = new ArrayList<> ();
list.add("1");
list.add("2");

for (String item : list) {
    System.out.println(item);
}
```

其实是等于:
``` 
List<String> list = new ArrayList<> ();
list.add("1");
list.add("2");

for (Iterator<String> i = list.iterator(); i.hasNext(); ) {
    String item = i.next();
    System.out.println(item);
}
```

#### ArrayList迭代内部机制

在ArrayList中有一个内部类`Itr`实现了`Iterator`接口，其成员变量：
``` 
 int cursor;       // 下一个元素的位置
 int lastRet = -1; // 前一个元素的位置，-1表示没有这个元素
 int expectedModCount = modCount;
```

`modCount`是ArrayList继承与AbstractList的一个变量，记录了list结构变化次数，在ArrayList的代码可以看到，add和remove的时候modCount都会++

`expectedModCount`是迭代类Itr记录集合的变化次数，在Itr内部有一个方法:
``` 
final void checkForComodification() {
            if (modCount != expectedModCount)
                throw new ConcurrentModificationException();
        }
```
如果集合变化次数和迭代器记录变化次数不等的时候，`ConcurrentModificationException`异常，在Iterator的next和remove方法中都会调用这个`checkForComodification`方法

那么在foreach里面使用remove会抛异常就知道是为什么了。
``` 
     List<String> a = new ArrayList<String>();
        list.add("1");
        list.add("2");
        for (String item : list) {
            if ("2".equals(item)) {
                list.remove(item);
            }
        }
```
1. 首先是进行了两次add操作，modCount=2
2. 进入foreach循环后，首先初始化`expectedModCount`为2，调用next方法获取元素"1"的值，checkForComodification，没有问题
3. 然后在元素"2"的时候，使用了ArrayList的remove方法，modCount++后为3
4. iterator.next检查的时候发现modCount != expectedModeCount，抛出异常


那么为什么JDK需要这么做呢，经过查资料后知道了，是为了线程安全。
> 在一个线程遍历集合的同时，另一个线程同时增删集合元素，将无法保证数据的一致性，集合的遍历过程也将被打乱。采用 modCount 机制，在此情景下及时抛出异常，确保同一时间只会有一个线程修改或遍历集合，也即 fail-fast 策略

### 集合遍历方法总结
``` 
//第一种方式  普通for循环  
for(int i=0;i<list.size();i++){  
    Teacher t = (Teacher)list.get(i);  
    System.out.println(t.getName());  
}  


//第二种方式 使用迭代器  
for(Iterator<Teacher> iter = list.iterator(); iter.hasNext();){  
    System.out.println(iter.next().getName());  
}  

//第三种方式 增强型for循环  
for(Teacher t: list){  
    System.out.println(t.getName());  
} 
```

### 参考资料
- [为什么不能在foreach里面调用remove](http://www.jianshu.com/p/724f763fd242)
- [java增强型for循环](http://blog.csdn.net/itmyhome1990/article/details/8797005)