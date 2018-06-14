---
title: springMVC基础原理和配置
date: 2017-12-06 17:45:07
tags: springmvc
categories: spring
---
### SpringMVC原理

#### 组件以及作用
- 前端控制器(DispatcherServlet):收请求，响应结果，相当于转发器，中央处理器。减少了其他组件之间的耦合度
- 处理器映射器(HandlerMapping)：根据请求的url查找Handler
- Handler处理器：按照HandlerAdapter的要求编写
- 处理器适配器(HandlerAdapter)：按照特定规则(HandlerAdapter要求的规则)执行Handler
- 视图解析器(ViewResolver)：进行视图解析，根据逻辑视图解析成真正的视图(View)
- 视图(View)：View是一个接口实现类实现不同的View类型（jsp,pdf等等）

spring mvc核心架构：
![](http://7xph6d.com1.z0.glb.clouddn.com/springmvc_%E6%A0%B8%E5%BF%83%E6%9E%B6%E6%9E%84%E5%9B%BE.jpg)

1. 发起请求到前端控制器(DispatcherServlet)

2. 前端控制器请求处理器映射器(HandlerMapping)查找Handler(可根据xml配置、注解进行查找)

3. 处理器映射器(HandlerMapping)向前端控制器返回Handler

4. 前端控制器调用处理器适配器(HandlerAdapter)执行Handler

5. 处理器适配器(HandlerAdapter)去执行Handler

6. Handler执行完，给适配器返回ModelAndView(Springmvc框架的一个底层对象)

7. 处理器适配器(HandlerAdapter)向前端控制器返回ModelAndView

8. 前端控制器(DispatcherServlet)请求视图解析器(ViewResolver)进行视图解析，根据逻辑视图名解析成真正的视图(jsp)

9. 视图解析器(ViewResolver)向前端控制器(DispatcherServlet)返回View

10. 前端控制器进行视图渲染，即将模型数据(在ModelAndView对象中)填充到request域

11. 前端控制器向用户响应结果

### 配置
#### web.xml
``` 
<servlet>
    <servlet-name>springmvc</servlet-name>
    <servlet-class>org.springframework.web.servlet.DispatcherServlet</servlet-class>
    <!-- contextConfigLocation配置springmvc加载的配置文件(配置处理器映射器、适配器等等)-->
    <init-param>
        <param-name>contextConfigLocation</param-name>
        <param-value>classpath:springmvc.xml</param-value>
    </init-param>
</servlet>
<servlet-mapping>
    <servlet-name>springmvc</servlet-name>
    <!--
    第一种:*.action,访问以.action结尾，由DispatcherServlet进行解析
    第二种:/,所有访问的地址由DispatcherServlet进行解析，对静态文件的解析需要配置不让DispatcherServlet进行解析，
            使用此种方式和实现RESTful风格的url
    第三种:/*,这样配置不对，使用这种配置，最终要转发到一个jsp页面时，仍然会由DispatcherServlet解析jsp地址，
            不能根据jsp页面找到handler，会报错
    -->
    <url-pattern>*.action</url-pattern>
</servlet-mapping>
```

#### contextConfigLocation配置
- 配置handler
``` 
<bean name="/queryItems.action" class="com.iot.ssm.controller.ItemsController"/>
```
- 配置处理器映射器(HandlerMapping)
``` 
  <!-- 处理器映射器
    将bean的name作为url进行查找，需要在配置Handler时指定beanname(就是url)
    所有的映射器都实现了HandlerMapping接口
     -->
<bean class="org.springframework.web.servlet.handler.BeanNameUrlHandlerMapping"/>
```

- 配置处理器适配器
``` 
<!-- 处理器适配器
     所有处理器适配器都实现了HandlerAdapter接口
     -->
    <bean class="org.springframework.web.servlet.mvc.SimpleControllerHandlerAdapter"/>
    此适配器能执行实现了Controller接口的Handler
    
    public class ItemsController implements Controller {
        // to do someting
    }
    
    <!-- 另一个处理器适配器 -->
    <bean class="org.springframework.web.servlet.mvc.HttpRequestHandlerAdapter"/>
    此适配器能执行实现了HttpRequertHandler接口的handler
```
- 配置视图解析器
``` 
<!-- 视图解析器
    解析jsp,默认使用jstl,classpath下要有jstl的包
    -->
    <bean class="org.springframework.web.servlet.view.InternalResourceViewResolver"/>
```

- 视图解析器配置前缀和后缀

``` 
<bean class="org.springframework.web.servlet.view.InternalResourceViewResolver">
         <!-- 配置jsp路径的前缀 -->
         <property name="prefix" value="/WEB-INF/jsp/"/>
         <!-- 配置jsp路径的后缀 -->
         <property name="suffix" value=".jsp"/>
 </bean>
```


#### 注解的处理器映射器和适配器
- 配置注解的处理器映射器和适配器
``` 
<!-- 注解的映射器 -->
    <bean class="org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping"/>

<!-- 注解的适配器 -->
    <bean class="org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerAdapter"/>
```
也可以使用以下代替
``` 
   <!-- 使用mvc:annotation-driven代替上面两个注解映射器和注解适配的配置
     mvc:annotation-driven默认加载很多的参数绑定方法，
     比如json转换解析器默认加载了，如果使用mvc:annotation-driven则不用配置上面的RequestMappingHandlerMapping和RequestMappingHandlerAdapter
     实际开发时使用mvc:annotation-driven
     -->
    <mvc:annotation-driven></mvc:annotation-driven>
```
- 基于注解的handler
```
// 使用@Controller标识他是一个控制器
@Controller
public class ItemsController {
    // url映射
    @RequestMapping("/query")
    public ModelAndView queryItems() throws Exception{
    }
} 
```
- Spring容器加载handler
``` 
<!-- 对于注解的Handler 可以单个配置  -->
    <!--  <bean  class="com.iot.ssm.controller.ItemsController"/> -->
    
    <!--  实际开发中加你使用组件扫描 -->
    <!-- 可以扫描controller、service、...
    这里让扫描controller，指定controller的包
     -->
    <context:component-scan base-package="com.iot.ssm.controller"></context:component-scan>
```

### Controller配置

#### springmvc.xml
该文件配置处理器，适配器，视图解析器
``` 
<beans xmlns="http://www.springframework.org/schema/beans"
       xmlns:context="http://www.springframework.org/schema/context"
       xmlns:mvc="http://www.springframework.org/schema/mvc"
       xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
       xsi:schemaLocation="http://www.springframework.org/schema/beans http://www.springframework.org/schema/beans/spring-beans-4.0.xsd
    http://www.springframework.org/schema/mvc http://www.springframework.org/schema/mvc/spring-mvc-4.0.xsd
    http://www.springframework.org/schema/context http://www.springframework.org/schema/context/spring-context-4.0.xsd">

   <!-- 对于注解的Handler 可以单个配置
    实际开发中加你使用组件扫描
    -->
    <!-- 可以扫描controller、service、...
    这里让扫描controller，指定controller的包
     -->
    <context:component-scan base-package="com.iot.learnssm.firstssm.controller"></context:component-scan>


    <!-- 使用mvc:annotation-driven代替上面两个注解映射器和注解适配的配置
     mvc:annotation-driven默认加载很多的参数绑定方法，
     比如json转换解析器默认加载了，如果使用mvc:annotation-driven则不用配置上面的RequestMappingHandlerMapping和RequestMappingHandlerAdapter
     实际开发时使用mvc:annotation-driven
     -->
    <mvc:annotation-driven></mvc:annotation-driven>


    <!-- 视图解析器
    解析jsp,默认使用jstl,classpath下要有jstl的包
    -->
    <bean class="org.springframework.web.servlet.view.InternalResourceViewResolver">
        <!-- 配置jsp路径的前缀 -->
        <property name="prefix" value="/WEB-INF/jsp/"/>
        <!-- 配置jsp路径的后缀 -->
        <property name="suffix" value=".jsp"/>
    </bean>
</beans>
```

#### web.xml
servlet的web.xml配置,该文件配置：   
- 前端控制器`DispatchServlet`的配置
- 加载Spring容器、Spring监听器
``` 
<?xml version="1.0" encoding="utf-8" ?>
<web-app xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://java.sun.com/xml/ns/javaee"
         xsi:schemaLocation="http://java.sun.com/xml/ns/javaee http://java.sun.com/xml/ns/javaee/web-app_3_0.xsd"
         id="WebApp_ID" version="3.0">
    <display-name>firstssm</display-name>

    <!-- 加载spring容器 -->
    <context-param>
        <param-name>contextConfigLocation</param-name>
        <param-value>WEB-INF/classes/spring/applicationContext-*.xml</param-value>
        <!--  <param-value>classpath:spring/applicationContext-*.xml</param-value>-->
      </context-param>
      <!-- 加载spring监听器 -->
    <listener>
      <listener-class>org.springframework.web.context.ContextLoaderListener</listener-class>
    </listener>


<!-- springmvc 前端控制器  -->
    <servlet>
        <servlet-name>springmvc</servlet-name>
        <servlet-class>org.springframework.web.servlet.DispatcherServlet</servlet-class>
        <!-- contextConfigLocation配置springmvc加载的配置文件(配置处理器映射器、适配器等等)
          若不配置，默认加载WEB-INF/servlet名称-servlet(springmvc-servlet.xml)
        -->
        <init-param>
            <param-name>contextConfigLocation</param-name>
            <param-value>classpath:spring/springmvc.xml</param-value>
        </init-param>
    </servlet>

    <servlet-mapping>
        <servlet-name>springmvc</servlet-name>
        <!--
        第一种:*.action,访问以.action三结尾，由DispatcherServlet进行解析
        第二种:/,所有访问的地址由DispatcherServlet进行解析，对静态文件的解析需要配置不让DispatcherServlet进行解析，
                使用此种方式和实现RESTful风格的url
        第三种:/*,这样配置不对，使用这种配置，最终要转发到一个jsp页面时，仍然会由DispatcherServlet解析jsp地址，
                不能根据jsp页面找到handler，会报错
        -->
        <url-pattern>*.action</url-pattern>
    </servlet-mapping>


    <welcome-file-list>
        <welcome-file>index.html</welcome-file>
        <welcome-file>index.htm</welcome-file>
        <welcome-file>index.jsp</welcome-file>
        <welcome-file>default.html</welcome-file>
        <welcome-file>default.htm</welcome-file>
        <welcome-file>default.jsp</welcome-file>
    </welcome-file-list>
</web-app>
```



### 参考资料
- [spring mvc 基本配置](http://www.jianshu.com/p/5af726f0bc97)
- [spring mvc概览](http://blog.csdn.net/h3243212/article/details/50828141)
