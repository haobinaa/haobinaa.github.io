---
title: springAOP的基本使用
date: 2017-11-30 15:50:24
tags: springframework
categories: spring
---

### AOP概念

AOP 要实现的是在我们原来写的代码的基础上，进行一定的包装，如在方法执行前、方法返回后、方法抛出异常后等地方进行一定的拦截处理或者叫增强处理.AOP是通过生成代理类来增强方法。

#### spring aop

- 它基于动态代理来实现。默认地，如果使用接口的，用 JDK 提供的动态代理实现，如果没有接口，使用 CGLIB 实现
- Spring AOP 依赖 IOC 容器来管理
- Spring AOP 只能作用于 Spring 容器中的 Bean

#### AspectJ

- AspectJ 属于静态织入，它是通过修改代码来实现的，它的织入时机可以是
    - Compile-time weaving：编译期织入
    - Post-compile weaving：也就是已经生成了 .class 文件，或已经打成 jar 包了，这种情况需要增强处理的话，就要用到编译后织入
    - Load-time weaving：指的是在加载类的时候进行织入，要实现这个时期的织入，有几种常见的方法。
     1、自定义类加载器来干这个，这个应该是最容易想到的办法，在被织入类加载到 JVM 前去对它进行加载，这样就可以在加载的时候定义行为了。
     2、在 JVM 启动的时候指定 AspectJ 提供的 agent：-javaagent:xxx/xxx/aspectjweaver.jar(链路追踪一般都是这个方式)

#### 术语
 
 - join point(连接点)：是程序执行中的一个精确执行点，例如类中的一个方法。它是一个抽象的概念，在实现AOP时，并不需要去定义一个join point
 - point cut（切入点）：本质上是一个捕获连接点的结构。在AOP中，可以定义一个point cut，来捕获相关方法的调用
 - advice（通知）：是point cut的执行代码，是执行“切面”的具体逻辑
 - aspect（切面）：point cut和advice结合起来就是aspect
 - introduce（引入）：为对象引入附加的方法或属性，从而达到修改对象结构的目的
 - Target Object（目标对象）：包含一个连接点的对象，也被称为代理对象
 - 前置通知（Before advice）：在某连接点（JoinPoint）之前执行的通知，但这个通知不能阻止连接点前的执行。ApplicationContext中在`<aop:aspect>`里面使用`<aop:before>`元素进行声明
- 后通知（After advice） ：当某连接点退出的时候执行的通知（不论是正常返回还是异常退出）。ApplicationContext中在`<aop:aspect>`里面使用`<aop:after>`元素进行声明。
- 返回后通知（After return advice） ：在某连接点正常完成后执行的通知，不包括抛出异常的情况。ApplicationContext中在`<aop:aspect>`里面使用`<after-returning>`元素进行声明
- 环绕通知（Around advice） ：包围一个连接点的通知，类似Web中Servlet规范中的Filter的doFilter方法。可以在方法的调用前后完成自定义的行为，也可以选择不执行。ApplicationContext中在`<aop:aspect>`里面使用`<aop:around>`元素进行声明

### 基于Schema的AOP配置
Spring配置文件中，所有AOP相关的定义存放于`<aop:config>`下，该标签下可配置：
- `<aop:pointcut>` 切点定义
- `<aop:advisor>` 定义只有一个通知和一个切入点的切面
- `<aop:aspect>` 用来定义切面，该切面可以包含多个切入点和通知，而且标签内部的通知和切入点定义是无序的；和advisor的区别就在此，advisor只包含一个通知和一个切入点
``` 
<aop:config>  //aop定义开始
    <aop:pointcut/> //切入点定义
    <aop:advisor/> //advisor定义
    <aop:aspect/> //切面定义
        <aop:pointcut/> 
        <aop:before/> //前置通知
        <aop:after-returning/> //后置返回通知
        <aop:after-throwing/> //后置异常通知
        <aop:after/> //后置通知
        <aop:around/> //后置最终通知
        <aop:declare-parents/> //引入定义
    </aop:aspect>   //切面定义结束
</aop:config> //aop定义完成
```

#### 声明切入点
- 在`<aop:config>`下使用`<aop:pointcut>`声明一个切点bean，该切点可以供多个切面使用
- 在`<aop:aspect>`标签下使用`<aop:pointcut>`声明一个切入点Bean，该切入点可以被多个切面使用，但一般该切入点只被该切面使用。
- 匿名切入点Bean，可以在声明通知时通过pointcut属性指定切入点表达式，该切入点是匿名切入点，只被该通知使用，如下：
``` 
匿名切入点
<aop:config>      
 <aop:aspect ref="aspectSupportBean">      
     <aop:after pointcut="execution(* cn.javass..*.*(..))" method="afterAdvice"/>      
 </aop:aspect>    
</aop:config> 
```
这里介绍一下切点表达式`execution(*com.hao.demo.dao.adviseimpl.*.*(..))`表示com.haobin.demo.dao.adviseimpl包下所有类的所有方法
- 第一个*代表所有的返回值类型
- 第二个*代表所有的类
- 第三*代表类所有方法
- 最后一个..代表所有参数

#### 声明通知
1.前置通知   
在切入点选择的连接点处的方法之前执行的通知，该通知不影响正常程序执行流程（除非该通知抛出异常，该异常将中断当前方法链的执行而返回）
```
<aop:before pointcut="切入点表达式" （或者pointcut-ref="切入点Bean引用"）     
     method="前置通知实现方法名" arg-names="前置通知实现方法参数列表参数名字"/> 
```
- pointcut和pointcut-ref： 二选一，指定切入点
- method： 指定前置通知的方法名
- arg-names: 指定实现方法的参数名称


2.后置通知    
在切入点选择的连接点处的方法正常执行完毕时执行的通知，必须是连接点处的方法没抛出任何异常正常返回时才调用后置通知。
``` 
<aop:after-returning pointcut="切入点表达式"  pointcut-ref="切入点Bean引用"  
        method="后置返回通知实现方法名"      
        arg-names="后置返回通知实现方法参数列表参数名字"      
        returning="返回值对应的后置返回通知实现方法参数名"      
/>
```

3.环绕通知
环绕着在切入点选择的连接点处的方法所执行的通知，环绕通知可以在方法调用之前和之后自定义任何行为，并且可以决定是否执行连接点处的方法、替换返回值、抛出异常等等。
``` 
<aop:around pointcut="切入点表达式"  pointcut-ref="切入点Bean引用"      
                     method="后置最终通知实现方法名"      
                     arg-names="后置最终通知实现方法参数列表参数名字"/> 
```
环绕通知第一个参数必须是org.aspectj.lang.ProceedingJoinPoint类型，在通知实现方法内部使用ProceedingJoinPoint的proceed()方法使目标方法执行，proceed 方法可以传入可选的Object[]数组，该数组的值将被作为目标方法执行时的参数。 


4.引入
Spring允许为目标对象引入新的接口，通过在< aop:aspect>标签内使用< aop:declare-parents>标签进行引入
``` 
<aop:declare-parents      
          types-matching="AspectJ语法类型表达式"      
          implement-interface=引入的接口"                   
          default-impl="引入接口的默认实现"      
          delegate-ref="引入接口的默认实现Bean引用"/>    
```
5.advisor
Advisor表示只有一个通知和一个切入点的切面
``` 
<aop:advisor pointcut="切入点表达式" pointcut-ref="切入点Bean引用"      
                     advice-ref="通知API实现引用"/>    
    
<bean id="beforeAdvice" class="cn.javass.spring.chapter6.aop.BeforeAdviceImpl"/>    
<aop:advisor pointcut="execution(* cn.javass..*.sayAdvisorBefore(..))"      
                     advice-ref="beforeAdvice"/>  
```

### AspectJ风格的AOP
spring自带的AOP是基于JDK和cglib的动态织入，指的是每次调用Target的时候在执行。而AspectJ是采用的静态织入，编译出来的class文件字节码就已经被织入了。
#### 启用@AspectJ
``` 
<!-- 启动@AspectJ支持 -->  
<!-- proxy-target-class默认"false",更改为"ture"使用CGLib动态代理 -->    
<aop:aspectj-autoproxy proxy-target-class="false"/>
```

#### 声明切面
``` 
@Component  
@Aspect  
public class AdivceMethod {  
```

#### 声明切入点
@Pointcut(value="切入点表达式", argNames = "参数名列表")  
public void pointcutName(……) {} 
- value：切入点表达式
- argNames： 参数名列表
- pointcutName： 切入点名字
``` 
@Pointcut(value="execution(* cn.javass..*.sayAdvisorBefore(..)) && args(param)", argNames = "param")    
public void beforePointcut(String param) {}   
```

#### 声明通知
- 前置通知
``` 
@Before(value = "切入点表达式或命名切入点", argNames = "参数列表参数名")  
```

#### 后置返回通知
``` 
@AfterReturning(    
value="切入点表达式或命名切入点",    
pointcut="切入点表达式或命名切入点",    
argNames="参数列表参数名",    
returning="返回值对应参数名") 
```

#### 后置异常通知
``` 
@AfterThrowing (    
value="切入点表达式或命名切入点",    
pointcut="切入点表达式或命名切入点",    
argNames="参数列表参数名",    
throwing="异常对应参数名") 
```

#### 后置最终通知
``` 
@After (    
value="切入点表达式或命名切入点",    
argNames="参数列表参数名")  
```

#### 环绕通知
``` 
@Around (    
value="切入点表达式或命名切入点",    
argNames="参数列表参数名") 
```


#### xml文件的定义
``` 
<?xml version="1.0" encoding="UTF-8"?>  
<beans xmlns="http://www.springframework.org/schema/beans"  
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:context="http://www.springframework.org/schema/context"  
    xmlns:aop="http://www.springframework.org/schema/aop"  
    xsi:schemaLocation="    
           http://www.springframework.org/schema/beans    
           http://www.springframework.org/schema/beans/spring-beans-3.0.xsd    
           http://www.springframework.org/schema/aop    
           http://www.springframework.org/schema/aop/spring-aop-3.0.xsd  
           http://www.springframework.org/schema/context    
           http://www.springframework.org/schema/context/spring-context-3.0.xsd">  
  
    <!-- 指定自动搜索bean组件、自动搜索切面类 -->  
        <context:component-scan base-package="com.haobin.spring.aop.aspectj"/>  
    <!-- 启动@AspectJ支持 -->  
    <!-- proxy-target-class默认"false",更改为"ture"使用CGLib动态代理 -->    
    <aop:aspectj-autoproxy proxy-target-class="false"/>  
</beans>  
```
这里通过component-scan扫描bean，spring生成bean的策略，如果没有name属性的申明，就会采取首字母小写的风格

### 参考资料

- [基于Schema的AOP](http://blog.csdn.net/evankaka/article/details/45242505)
- [基于AspectJ注解的AOP](http://blog.csdn.net/evankaka/article/details/45394409)