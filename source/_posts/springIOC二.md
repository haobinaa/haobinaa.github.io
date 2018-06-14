---
title: springIOC(注解和java类配置bean)
date: 2017-11-28 16:04:34
tags: springframework
categories: spring
---
### java注解配置bean

#### @Component
- @Controller 控制器(注入服务)
- @Service 服务(注入Dao)
- @Repositroy dao的访问
- @Compoent 把普通的pojo实例化到Spring容器，相当于`<bean id="" class=""`

利用以上注解标注类，然后在xml中配置`<context:component-scan base.package="XX">`来扫描对应包下所有的注解，可以把标注的类自动转换成bean
``` 
<?xml version="1.0" encoding="UTF-8"?>  
<beans xmlns="http://www.springframework.org/schema/beans"  
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:p="http://www.springframework.org/schema/p"  
    xmlns:context="http://www.springframework.org/schema/context"  
    xsi:schemaLocation="http://www.springframework.org/schema/beans    
                http://www.springframework.org/schema/beans/spring-beans-3.0.xsd    
        http://www.springframework.org/schema/context    
        http://www.springframework.org/schema/context/spring-context-3.0.xsd">  
     <!-- 配置的bean所在包的位置 -->    
    <context:component-scan base-package="com.haobin" />  
</beans>
```

#### @Autowired
 @Autowired 注释，它可以对类成员变量、方法及构造函数进行标注，完成自动装配的工作。 
 
 在默认情况下使用@Autowired注释进行自动注入时，Spring容器中匹配的候选Bean数目必须有且仅有一个。当找不到一个匹配的Bean时，Spring容器将抛出BeanCreationException异常，并指出必须至少拥有一个匹配的Bean。当不能确定Spring容器中一定拥有某个类的Bean时，可以在需要自动注入该类Bean的地方可以使用@Autowired(required=false)，这等于告诉Spring：在找不到匹配Bean时也不报错。  
 和找不到一个类型匹配Bean相反的一个错误是：如果Spring容器中拥有多个候选Bean，Spring容器在启动时也会抛出BeanCreationException异常。
 
 如果一个接口有多个实现类，需要配合@Qualifier配合使用，注明是哪个实现类
 
 @AutoWired一般是注入到接口上，接口的实现类需要标注@Service等component注解
 
 #### @Resource
 @Resource的作用相当于@Autowired，只不过@Autowired按byType自动注入，而@Resource默认按byName自动注入。
 
 @Resource有两个属性是比较重要的，分别是name和type，Spring将 @Resource注解的name属性解析为bean的名字，而type属性则解析为bean的类型。

### java类配置bean
基于Java配置选项，可以编写大多数的Spring不用配置XML，但有几个基于Java的注释的帮助下解释。从Spring3.0开始支持使用java代码来代替XML来配置Spring，基于Java配置Spring依靠Spring的JavaConfig项目提供的很多优点。通过使用@Configuration， @Bean ，@Importand，@DependsOnannotations来实现Java的配置Spring.

#### @Configuration和@Bean
 @Configuration注解的类指明该类主要是作为一个bean的来源定义。此外，@Configurationd定义的classes允许在同一个类中使用@Bean定义的方法来定义依赖的bean 
 ``` 
 @Configuration  
 public class CompanyConfig {  
     @Bean  
     public Employee employee(){  
         return new Employee();  
     }  
   
 }  
 ```
 以上等同于配置文件:
 ``` 
 <bean id="companyConfig" class="com.haobin.anno.CompanyConfig"/> 
 ```
 配置类可以有声明多个@Bean。一旦配置类定义，可以加载和提供他们使用AnnotationConfigApplicationContext 如下，以Spring容器：
 ``` 
 public static void main(String[] args) {  
     ApplicationContext ctx= new AnnotationConfigApplicationContext(CompanyConfig.class);  
     Employee employee=ctx.getBean(Employee.class);  
     employee.setName("笨笨");  
     employee.setId(2012);  
     System.out.println(employee);  
 ```
 
 `ApplicationContext` 接口的最常用的实现类是 `ClassPathXmlApplicationContext` 和 `FileSystemXmlApplicationContext`，以及面向 Portlet 的 `XmlPortletApplicationContext` 和面向 web 的 `XmlWebApplicationContext`，它们都是面向 XML 的。
 
Spring 3.0 新增了另外两个实现类：`AnnotationConfigApplicationContext` 和 `AnnotationConfigWebApplicationContext`。从名字便可以看出，它们是为注解而生，直接依赖于注解作为容器配置信息来 源的 IoC 容器初始化类。由于 `AnnotationConfigWebApplicationContext` 是 `AnnotationConfigApplicationContext` 的 web 版本，其用法与后者相比几乎没有什么差别

`AnnotationConfigApplicationContext` 搭配上 @Configuration 和 @Bean 注解，自此，XML 配置方式不再是 Spring IoC 容器的唯一配置方式。两者在一定范围内存在着竞争的关系，但是它们在大多数情况下还是相互协作的关系，两者的结合使得 Spring IoC 容器的配置更简单，更强大。之前，我们将配置信息集中写在 XML 中，如今使用注解，配置信息的载体由 XML 文件转移到了 Java 类中。我们通常将用于存放配置信息的类的类名以 “Config” 结尾，比如 AppDaoConfig.java、AppServiceConfig.java 等等。我们需要在用于指定配置信息的类上加上 @Configuration 注解，以明确指出该类是 Bean 配置的信息源

>配置类不能是 `final` 的；配置类不能是本地化的，亦即不能将配置类定义在其他类的方法内部；配置类必须有一个无参构造函数。`AnnotationConfigApplicationContext` 将配置类中标注了 @Bean 的方法的返回值识别为 Spring Bean，并注册到容器中，受 IoC 容器管理。@Bean 的作用等价于 XML 配置中的 标签


### 参考资料
[spring基于注解的配置](http://blog.csdn.net/evankaka/article/details/44942615)