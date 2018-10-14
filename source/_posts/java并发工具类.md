---
title: java并发工具类
date: 2018-10-13 19:57:21
tags:
categories: 并发
---
### CountDownLatch
CountDownLatch也叫闭锁, 它允许一个或多个线程一直等待，直到其他线程的操作执行完后再执行。

#### 使用示例

CountDownLatch的构造函数接收一个int类型的参数作为计数器，如果你想等待***N个点***完成，这里就传入N。当调用CountDownLatch的countDown方法时，N就会减1，CountDownLatch的await方法会阻塞当前线程，直到N变成零。

> 备注：由于CountDownLatch方法可以用在任何地方，这里说的N个点，可以是N个线程，也可以是1个线程里的N个执行步骤。用在多个线程时，只需要把CountDownLatch的引用传递到线程里即可。


#### 实现原理



### CyclicBarrier

#### 使用示例

#### 实现原理


### Semaphore
#### 使用示例
#### 实现原理


### Exchanger
#### 使用示例
#### 实现原理




### 参考资料
- [java并发工具类-CountDownLatch](https://juejin.im/post/5af3c17f51882567113b37d0)