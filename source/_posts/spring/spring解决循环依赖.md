---
title: spring解决循环依赖
date: 2019-09-08 17:20:13
tags: springframework
categories: spring
---

spring中存在三种循环依赖:
1. 构造器循环依赖: 这种情况 spring 无法处理，将抛出`BeanCurrentlylnCreationException`异常
2. 单例 Bean setter 循环依赖， 通过三级缓存来解决， 这也是本篇博客描述的地方
3. 非单例循环依赖(如 propertype), 无法提前暴露 Bean， 无法解决


### spring 单例对象的初始化过程

spring 单例对象的实例化、初始化过程是在`doCreateBean`中(之前仅仅是注册好了BeanDefenition)， 大概分为三步:
1. createBeanInstance: 实例化， 调用对象的构造方法来实例化对象
2. populationBean: 填充对象的属性
3. initializeBean: 回调Bean的方法(`postProcessBeforeInitialization->init->postProcessAfterInitialization`)

### 构造器循环依赖

`this.singletonsCurrentlylnCreation.add(beanName` 将当前正要创建的bean 记录在缓存中
Spring 容器将每一个正在创建的bean 标识符放在一个"当前创建 bean 池"中,在创建过程中将一直保持在这个池中，因此如果在创建bean 过程中发现自己已经在"当前创建bean 池" 里时，将抛出`BeanCurrentlylnCreationException`异常表示循环依赖；而对于创建完毕的bean 将从"当前创建bean 池"中清除掉

### setter循环依赖的处理

spring 使用三级缓存来解决单例 setter 循环依赖：
```
private final Map singletonObjects = new ConcurrentHashMap(256);
private final Map> singletonFactories = new HashMap>(16);
private final Map earlySingletonObjects = new HashMap(16);
```

- singletonObjects：完成初始化的单例对象的cache（一级缓存）
- earlySingletonObjects ：完成实例化但是尚未初始化的，提前暴光的单例对象的Cache （二级缓存）
- singletonFactories ： 进入实例化阶段的单例对象工厂的cache （三级缓存）

我们在创建bean的时候，会首先从cache中获取这个bean，这个缓存就是sigletonObjects。主要的调用方法是：
```
protected Object getSingleton(String beanName, boolean allowEarlyReference) {
    Object singletonObject = this.singletonObjects.get(beanName);
    //isSingletonCurrentlyInCreation()判断当前单例bean是否正在创建中
    if (singletonObject == null && isSingletonCurrentlyInCreation(beanName)) {
        synchronized (this.singletonObjects) {
            // 从二级缓存中获取
            singletonObject = this.earlySingletonObjects.get(beanName);
            // allowEarlyReference 是否允许从singletonFactories中通过getObject拿到对象
            if (singletonObject == null && allowEarlyReference) {
                ObjectFactory<?> singletonFactory = this.singletonFactories.get(beanName);
                if (singletonFactory != null) {
                    singletonObject = singletonFactory.getObject();
                    //从singletonFactories中移除，并放入earlySingletonObjects中。
                    //其实也就是从三级缓存移动到了二级缓存
                    this.earlySingletonObjects.put(beanName, singletonObject);
                    this.singletonFactories.remove(beanName);
                }
            }
        }
    }
    return (singletonObject != NULL_OBJECT ? singletonObject : null);
}
```

结合 `doCreateBean`中处理循环依赖的代码一起看一下:
```
boolean earlySingletonExposure = (mbd.isSingleton() && this.allowCircularReferences &&
        isSingletonCurrentlyInCreation(beanName));
if (earlySingletonExposure) {
    if (logger.isDebugEnabled()) {
        logger.debug("Eagerly caching bean '" + beanName +
                "' to allow for resolving potential circular references");
    }
    addSingletonFactory(beanName, () -> getEarlyBeanReference(beanName, mbd, bean));
}

// addSingletonFactory
protected void addSingletonFactory(String beanName, ObjectFactory<?> singletonFactory) {
    Assert.notNull(singletonFactory, "Singleton factory must not be null");
    synchronized (this.singletonObjects) {
        if (!this.singletonObjects.containsKey(beanName)) {
            // 放入singletonFactories
            this.singletonFactories.put(beanName, singletonFactory);
            this.earlySingletonObjects.remove(beanName);
            this.registeredSingletons.add(beanName);
        }
    }
}
// bean 可以通过 SmartInstantiationAwareBeanPostProcessor 进行扩展
// 所以采用了三级缓存而不是两级缓存
// 这里参考 https://blog.csdn.net/weixin_42228338/article/details/97163101
protected Object getEarlyBeanReference(String beanName, RootBeanDefinition mbd, Object bean) {
    Object exposedObject = bean;
    if (!mbd.isSynthetic() && hasInstantiationAwareBeanPostProcessors()) {
        for (BeanPostProcessor bp : getBeanPostProcessors()) {
            if (bp instanceof SmartInstantiationAwareBeanPostProcessor) {
                SmartInstantiationAwareBeanPostProcessor ibp = (SmartInstantiationAwareBeanPostProcessor) bp;
                exposedObject = ibp.getEarlyBeanReference(exposedObject, beanName);
            }
        }
    }
    return exposedObject;
}
```
`addSingletonFactory`这段代码发生在`createBeanInstance`之后，`populateBean`之前，也就是说单例对象此时已经被创建出来(调用了构造器)。这个对象已经被生产出来了，此时将这个对象提前曝光出来，让大家使用。

举例说明一下这样做的用意，假如A依赖了B， B也同时依赖于A:
1. A首先完成了初始化的第一步，并且将自己提前曝光到`singletonFactories`中，此时进行初始化的第二步(populateBean填充属性)，发现自己依赖对象B，此时就尝试去get(B)，发现B还没有被create
，所以走create流程
2. B在初始化第一步的时候发现自己依赖了对象A，于是尝试get(A)，尝试一级缓存singletonObjects(肯定没有，因为A还没初始化完全)，尝试二级缓存earlySingletonObjects（也没有），尝试三级缓存singletonFactories，由于A通过ObjectFactory将自己提前曝光了，所以B能够通过ObjectFactory.getObject拿到A对象
3. B拿到A对象后顺利完成了初始化三个阶段,完全初始化之后将自己放入到一级缓存singletonObjects中。此时返回A中，A此时能拿到B的对象顺利完成自己的初始化阶段2、3，最终A也完成了初始化，进去了一级缓存singletonObjects中

这样就是整个解决 setter 循环依赖的过程

### propertype 类型的Bean无法解决循环引用

代码也在创建bean的时候体现:
``` 
// 创建过了此 beanName 的 prototype 类型的 bean，那么抛异常
if (isPrototypeCurrentlyInCreation(beanName)) {
    throw new BeanCurrentlyInCreationException(beanName);
}
```