---
title: spring IOC中扩展点
date: 2017-11-28 09:29:37
tags: springframework
categories: spring
---
### IOC中的扩展点

Spring在初始化容器的过程中，提供了一些扩展点，可以让用户添加一些自定义的操作来处理Bean。

这里先贴出ioc创建过程的主要流程代码:
```
public void refresh() throws BeansException, IllegalStateException {
   // 加锁，防止创建过程中其他线程对容器的影响
   synchronized (this.startupShutdownMonitor) {
      // 准备工作，记录下容器的启动时间、标记“已启动”状态、处理配置文件中的占位符(对整个过程没什么影响)
      prepareRefresh();

      // 解析配置文件成 BeanDefinition, 并注册
      // 注册也只是将这些信息都保存到了注册中心(说到底核心是一个 beanName-> beanDefinition 的 map)
      ConfigurableListableBeanFactory beanFactory = obtainFreshBeanFactory();

      // 设置 BeanFactory 的类加载器，添加几个 BeanPostProcessor，手动注册几个特殊的 bean
      prepareBeanFactory(beanFactory);

      try {
         // 这里是提供给子类的扩展点，到这里的时候，所有的 Bean 都加载、注册完成了，但是都还没有初始化
         // 具体的子类可以在这步的时候添加一些特殊的 BeanFactoryPostProcessor 的实现类
         postProcessBeanFactory(beanFactory);
         // 调用 BeanFactoryPostProcessor 各个实现类的 postProcessBeanFactory(factory) 方法
         invokeBeanFactoryPostProcessors(beanFactory);

         // 注册 BeanPostProcessor 的实现类，注意看和 BeanFactoryPostProcessor 的区别
         // 此接口两个方法: postProcessBeforeInitialization 和 postProcessAfterInitialization
         // 两个方法分别在 Bean 初始化之前和初始化之后得到执行。到这里 Bean 还没初始化
         registerBeanPostProcessors(beanFactory);

         // 初始化当前 ApplicationContext 的 MessageSource(一些国际化的处理，也不重要)
         initMessageSource();

         // 初始化当前 ApplicationContext 的事件广播器
         initApplicationEventMulticaster();

         // 模板方法(钩子方法)，
         // 具体的子类可以在这里初始化一些特殊的 Bean（在初始化 singleton beans 之前）
         onRefresh();

         // 注册事件监听器，监听器需要实现 ApplicationListener 接口
         registerListeners();

         // 初始化所有的 singleton beans
         //（lazy-init 的除外）
         finishBeanFactoryInitialization(beanFactory);

         // 最后，广播事件，ApplicationContext 初始化完成
         finishRefresh();
      }

      catch (BeansException ex) {
         if (logger.isWarnEnabled()) {
            logger.warn("Exception encountered during context initialization - " +
                  "cancelling refresh attempt: " + ex);
         }

         // Destroy already created singletons to avoid dangling resources.
         // 销毁已经初始化的 singleton 的 Beans，以免有些 bean 会一直占用资源
         destroyBeans();

         // Reset 'active' flag.
         cancelRefresh(ex);

         // 把异常往外抛
         throw ex;
      }

      finally {
         // Reset common introspection caches in Spring's core, since we
         // might not ever need metadata for singleton beans anymore...
         resetCommonCaches();
      }
   }
}
```
常用的扩展点有:
- 在构建BeanFactory的时候，有BeanFactoryPostProcessor

- 在构建Bean的时候，有BeanPostProcessor

- 在创建和销毁Bean的时候有InitializingBean（在BPP的调用栈附近）和DisposableBean

IOC Bean的扩展点，也是体现Bean生命周期的一部分， Bean的生命周期如图:

![](/images/spring/bean_lifecycle.png)

### BeanFactoryPostProcessor

``` 
public interface BeanFactoryPostProcessor {
	void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException;
}
```

可以看到这个接口需要实现`postProcessBeanFactory`, 然后可以通过参数`beanFacory`来操作，实现该接口，可以在spring的bean创建之前，修改bean的定义属性(这个阶段其实就是修改`beandefinitiaon`)。也就是说，Spring允许BeanFactoryPostProcessor在容器实例化任何其它bean之前读取配置元数据，并可以根据需要进行修改，例如可以把bean的`scope`从`singleton`改为`prototype
`，也可以把property的值给修改掉。可以同时配置多个BeanFactoryPostProcessor，并通过设置`order`属性来控制各个BeanFactoryPostProcessor的执行次序。

ioc加载过程中(`refresh`方法)，真正调用`BeanFactoryPostProcessor`的方法是`invokeBeanFactoryPostProcessors`


### BeanPostProcessor

如果我们需要在Spring容器完成Bean的实例化、配置和其他的初始化前后添加一些自己的逻辑处理，我们就可以定义一个或者多个`BeanPostProcessor`接口的实现，然后注册到容器中。它是针对已经初始化的 beans 进行的回调，也就是说是对实例化好以后的 beans 进行的回调

接口定义如下:
``` 
public interface BeanPostProcessor {

  //实例化、依赖注入完毕，在调用显示的初始化之前完成一些定制的初始化任务
	Object postProcessBeforeInitialization(Object bean, String beanName) throws BeansException;


  //实例化、依赖注入、初始化完毕时执行
	Object postProcessAfterInitialization(Object bean, String beanName) throws BeansException;

}
```


`BeanPostProcessor`的注册是在Ioc的加载过程中的`registerBeanPostProcessors()`,该过程中会实例化所有的BPP，并根据优先级排序。调用BPP的逻辑是在初始化所有的Bean之后