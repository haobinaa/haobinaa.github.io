---
title: spring-PropertyPlaceholderConfiger读取属性
date: 2019-06-03 11:01:38
tags: 
categories: spring
---

### 概述

spring在读取配置文件的时候，我们时常使用`@Value`注解来注入配置文件中的配置，在配置文件中也可以通过`${}`的方式来引用已经申明的配置，这是依靠Spring提供的`PropertyPlaceholderConfigure`来实现的。

### PropertyPlaceholderConfigure调用流程


`PropertyPlaceholderConfigure`的父类`PropertyResourceConfigurer`是一个实现了`BeanFactoryPostProcessors`的类，所以它在spring的生命周期中会被调用。`PropertyResourceConfigurer`的实现如下：
```
public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException {
    try {
        Properties mergedProps = mergeProperties();

        // Convert the merged properties, if necessary.
        convertProperties(mergedProps);

        // Let the subclass process the properties.
        processProperties(beanFactory, mergedProps);
    }
    catch (IOException ex) {
        throw new BeanInitializationException("Could not load properties", ex);
    }
}
```

- `mergeProperties`主要是从硬盘中加载properties文件
- `convertProperties`用来对PropertyValue做一些自定义对转换，默认是返回原值
- `processProperties`是具体的properties的替换逻辑

#### PropertyPlaceholderConfigure-PropertyPlaceholderConfigure

PropertyPlaceholderConfigure实现替换properties逻辑如下:
```
protected void processProperties(ConfigurableListableBeanFactory beanFactoryToProcess, Properties props)
        throws BeansException {

    StringValueResolver valueResolver = new PlaceholderResolvingStringValueResolver(props);
    doProcessProperties(beanFactoryToProcess, valueResolver);
}
```

`PlaceholderResolvingStringValueResolver`封装了通过占位符从配置文件中获取对应配置的逻辑。大概的思路是遍历BeanDefinition进行占位符替换，在父类`PlaceholderConfigurerSupport`的`doProcessProperties`中实现:
```
protected void doProcessProperties(ConfigurableListableBeanFactory beanFactoryToProcess,
			StringValueResolver valueResolver) {

		BeanDefinitionVisitor visitor = new BeanDefinitionVisitor(valueResolver);

		String[] beanNames = beanFactoryToProcess.getBeanDefinitionNames();
		for (String curName : beanNames) {
			if (!(curName.equals(this.beanName) && beanFactoryToProcess.equals(this.beanFactory))) {
				BeanDefinition bd = beanFactoryToProcess.getBeanDefinition(curName);
				try {
					visitor.visitBeanDefinition(bd);
				}
				catch (Exception ex) {
					throw new BeanDefinitionStoreException(bd.getResourceDescription(), curName, ex.getMessage(), ex);
				}
			}
		}

		// New in Spring 2.5: resolve placeholders in alias target names and aliases as well.
		beanFactoryToProcess.resolveAliases(valueResolver);

		// New in Spring 3.0: resolve placeholders in embedded values such as annotation attributes.
		beanFactoryToProcess.addEmbeddedValueResolver(valueResolver);
	}
```
visitBeanDefinition对文件中对占位符进行了替换，而`@Value`注解中占位符，则通过内嵌ValueResolver的方式，创建bean的时候进行替换

#### 替换占位符对逻辑-BeanDefinitionVisitor

`BeanDefinitionVisitor`封装了操作BeanDefinition的逻辑，对占位符进行了替换:
```
public void visitBeanDefinition(BeanDefinition beanDefinition) {
    visitParentName(beanDefinition);
    visitBeanClassName(beanDefinition);
    visitFactoryBeanName(beanDefinition);
    visitFactoryMethodName(beanDefinition);
    visitScope(beanDefinition);
    if (beanDefinition.hasPropertyValues()) {
        visitPropertyValues(beanDefinition.getPropertyValues());
    }
    if (beanDefinition.hasConstructorArgumentValues()) {
        ConstructorArgumentValues cas = beanDefinition.getConstructorArgumentValues();
        visitIndexedArgumentValues(cas.getIndexedArgumentValues());
        visitGenericArgumentValues(cas.getGenericArgumentValues());
    }
}
```

### 重写PropertyPlaceholderConfigurer

在项目中，我们有时候需要从其他地方(并非项目中的properties文件)读取配置，替换我们在代码中定义的@Value注解标识的变量，比如我们把一些变量定义在了zk，这个时候我们就需要重写`PropertyPlaceholderConfigurer`的`processProperties`


例如:
```
@Component
public class CustomPropertyPlaceholderConfigure extends PropertyPlaceholderConfigurer {


    private static final Logger logger = LoggerFactory.getLogger(CustomPropertyPlaceholderConfigure.class);

    @Override
    protected void processProperties(ConfigurableListableBeanFactory beanFactoryToProcess, Properties props) throws BeansException {
        // 设置为false，将占位符交给其他placeholder来解决
        this.setIgnoreUnresolvablePlaceholders(true);
        // 从此处读取zk，然后put进来
        ........
        super.processProperties(beanFactoryToProcess, props);
    }
}
```

注意这里`this.setIgnoreUnresolvablePlaceholders(true);`,这个标志如果为true的话，如果有无法解析的占位符就忽略，如果为false的话，就会抛出异常，默认为false。

这里我的理解是，每个 PropertyPlaceholderConfigure 都会去读自己定义的properties文件的位置，如果不设置ignore就会无法解析其他PropertyPlaceholderConfigure的properties，从而抛出异常

### 参考资料
- [SpringBoot配置文件加载原理](https://juejin.im/post/5bfa8c5251882511a8529243)
- [SpringSourcePlaceholderConfigure原理](https://blog.csdn.net/qyp199312/article/details/54313784)