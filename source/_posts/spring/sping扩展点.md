---
title: spring IOC中扩展点
date: 2017-11-28 09:29:37
tags: springframework
categories: spring
---
### IOC中的扩展点

Spring在初始化容器的过程中，提供了一些扩展点，可以让用户添加一些自定义的操作来处理Bean。

常用的扩展点有:
- 在构建BeanFactory的时候，有BeanFactoryPostProcessor

- 在构建Bean的时候，有BeanPostProcessor

- 在创建和销毁Bean的时候有InitializingBean（在BPP的调用栈附近）和DisposableBean

IOC Bean的扩展点，也是体现Bean生命周期的一部分， Bean的生命周期如图:

![](/images/spring/bean_lifecycle.png)

### BeanFactoryPostProcessor