---
title: java多线程(内存模型二)
date: 2017-11-25 19:44:27
tags: java多线程
categories: java并发
---

### 重排序
jvm在执行程序时，为了提升性能，处理器和编译器常常会对指令重排序，满足以下原则：
1. 单线程环境下不改变程序运行结果
2. 存在数据依赖关系不允许重排序
#### as-if-serial
as-if-serial语义的意思是，所有的操作均可以为了优化而被重排序，但是你必须要保证重排序后执行的结果不能被改变，编译器、runtime、处理器都必须遵守as-if-serial语义。注意as-if-serial只保证单线程环境，多线程环境下无效。例如：
``` 
int a = 1 ;      //A
int b = 2 ;      //B
int c = a + b;   //C
```
A、B、C三个操作存在如下关系：A、B不存在数据依赖关系，A和C、B和C存在数据依赖关系，因此在进行重排序的时候，A、B可以随意排序，但是必须位于C的前面，执行顺序可以是A –> B –> C或者B –> A –> C。但是无论是何种执行顺序最终的结果C总是等于3

重排序是在不改变运行结果的前提下尽可能的提升运行效率。
``` 
public class RecordExample1 {
    public static void main(String[] args){
        int a = 1;
        int b = 2;

        try {
            a = 3;           //A
            b = 1 / 0;       //B
        } catch (Exception e) {
            
        } finally {
            System.out.println("a = " + a);
        }
    }
}
```
按照重排序的规则，操作A与操作B有可能会进行重排序，如果重排序了，B会抛出异常（ / by zero），此时A语句一定会执行不到，那么a还会等于3么？如果按照as-if-serial原则它就改变了程序的结果。其实JVM对异常做了一种特殊的处理，为了保证as-if-serial语义，Java异常处理机制对重排序做了一种特殊的处理：JIT在重排序时会在catch语句中插入错误代码（a = 3）,这样做虽然会导致cathc里面的逻辑变得复杂，但是JIT优化原则是：尽可能地优化程序正常运行下的逻辑，哪怕以catch块逻辑变得复杂为代价。

#### 重排序对多线程的影响
``` 
public class RecordExample2 {
    int a = 0;
    boolean flag = false;

    /**
     * A线程执行
     */
    public void writer(){
        a = 1;                  // 1
        flag = true;            // 2
    }

    /**
     * B线程执行
     */
    public void read(){
        if(flag){                  // 3
           int i = a + a;          // 4
        }
    }

}
```
由于操作数1和操作数2之间没有依赖关系，操作数3和操作数4之间也没有依赖关系，如果进行了重排序，线程A先执行了flag=true，那么线程B就读不到线程a=1这个值，就会影响i最后的结果。这样多线程的语义就被重排序破坏了

### volatile的使用分析
volatile有两个特性：
1. 可见性：对一个volatile变量的读，总可以看到这个变量的写的最终结果
2. 原子性：volatile对单个读/写具有原子性(32 long/double)
3. jvm底层用了内存屏障来实现volatile

#### volatile与happens-before
``` 
public class VolatileTest {

    int i = 0;
    volatile boolean flag = false;

    //Thread A
    public void write(){
        i = 2;              //1
        flag = true;        //2
    }

    //Thread B
    public void read(){
        if(flag){                                   //3
            System.out.println("---i = " + i);      //4
        }
    }
}
```
依据happens-before原则，就上面程序得到如下关系:
- 依据happens-before程序顺序原则：1 happens-before 2、3 happens-before 4；
- 根据happens-before的volatile原则：2 happens-before 3；
- 根据happens-before的传递性：1 happens-before 4

操作1、操作4存在happens-before关系，那么1一定是对4可见的。操作1、操作2可能会发生重排序啊？但是volatile除了保证可见性外，还有就是禁止重排序。所以A线程在写volatile变量之前所有可见的共享变量，在线程B读同一个volatile变量后，将立即变得对线程B可见。

#### volatile内存语义以及实现
>当写一个volatile变量时，JMM会把该线程对应的本地内存中的共享变量值立即刷新到主内存中。
 当读一个volatile变量时，JMM会把该线程对应的本地内存设置为无效，直接从主内存中读取共享变量
 
 所以volatile的写内存语义是直接刷新到主内存中，读的内存语义是直接从主内存中读取。那么volatile的内存语义是如何实现的呢？对于一般的变量则会被重排序，而对于volatile则不能，这样会影响其内存语义，所以为了实现volatile的内存语义JMM会限制重排序。其重排序规则如下
 1. 如果第一个操作为volatile读，则不管第二个操作是啥，都不能重排序。这个操作确保volatile读之后的操作不会被编译器重排序到volatile读之前；
 2. 当第二个操作为volatile写是，则不管第一个操作是啥，都不能重排序。这个操作确保volatile写之前的操作不会被编译器重排序到volatile写之后
 3. 当第一个操作volatile写，第二操作为volatile读时，不能重排序。
 
 volatile的底层是通过插入内存屏障，但是对于编译器来说，发现一个最优布置来最小化插入内存屏障的总数几乎是不可能的，所以，JMM采用了保守策略:
 - 在每一个volatile写操作前面插入一个StoreStore屏障
 - 在每一个volatile写操作后面插入一个StoreLoad屏障
 - 在每一个volatile读操作后面插入一个LoadLoad屏障
 - 在每一个volatile读操作后面插入一个LoadStore屏障
 
 StoreStore屏障可以保证在volatile写之前，其前面的所有普通写操作都已经刷新到主内存中。  
 StoreLoad屏障的作用是避免volatile写与后面可能有的volatile读/写操作重排序。  
 LoadLoad屏障用来禁止处理器把上面的volatile读与下面的普通读重排序。  
 LoadStore屏障用来禁止处理器把上面的volatile读与下面的普通写重排序。


#### 参考
(java内存模型之重排序)[http://cmsblogs.com/?p=2116]
(深入理解java内存模型)[http://www.cnblogs.com/skywang12345/p/3447546.html]