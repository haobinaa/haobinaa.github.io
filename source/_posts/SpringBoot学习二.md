---
title: SpringBoot(配置及资源)
date: 2018-01-04 22:04:26
tags: springboot
categories: spring
---
### 配置文件
SpringBoot使用***习惯优于配置***(项目中含有大量的自动配置)，能让项目快速的运行起来

#### application.properties(yml)
Spring Boot使用了一个全局的配置文件application.properties，一般放在src/main/resources下

#### 自定义属性
application.properties提供自定义属性的支持，这样我们就可以把一些常量配置在这里:
``` 
com.haobin.name="haobin"
com.haobin.age="17"
```
然后直接在要使用的地方通过注解@Value(value="${config.name}")就可以绑定到你想要的属性上面
``` 
@RestController
public class UserController {

    @Value("${com.haobin.name}")
    private  String name;
    @Value("${com.haobin.age}")
    private  Integer age;

    @RequestMapping("/")
    public String hexo(){
        return name+","+age;
    }
}
```
有时候属性太多了，一个个绑定到属性字段上太累，官方提倡绑定一个对象的bean，这里我们建一个ConfigBean.java类，顶部需要使用注解@ConfigurationProperties(prefix = "com.haobin")来指明使用哪个
``` 
@Component
@Data
@ConfigurationProperties(prefix = "com.dudu")
public class ConfigBean {
    private String name;
    private String age;
}
```
在Controller引入bean
``` 
@RestController
public class UserController {
    @Autowired
    ConfigBean configBean;

    @RequestMapping("/")
    public String hexo(){
        return configBean.getName()+configBean.getWant();
    }
}
```

#### 参数间引用
在application.properties中的各个参数之间也可以直接引用来使用，就像下面的设置：
``` 
com.haobin.name = "haobin"
com.haobin.age = "17"
com.haobin.info=${com.haobin.name}有{com.haobin.age}
```

#### 随机值配置
配置文件中${random} 可以用来生成各种不同类型的随机值，从而简化了代码生成的麻烦，例如 生成 int 值、long 值或者 string 字符串
``` 
haobin.secret=${random.value}
haobin.number=${random.int}
haobin.bignumber=${random.long}
haobin.uuid=${random.uuid}
haobin.number.less.than.ten=${random.int(10)}
haobin.number.in.range=${random.int[1024,65536]}
```


#### 外部配置-命令行参数配置
Spring Boot是基于jar包运行的，打成jar包的程序可以直接通过下面命令运行:
``` 
java -jar xx.jar
```
可以以下命令修改tomcat端口号
``` 
java -jar xx.jar --server.port=9090
```
可以看出，命令行中连续的两个减号--就是对`application.properties`中的属性值进行赋值的标识

#### Profile-多环境配置
创建application-dev.yml（测试环境）和application-prod.yml（生产环境）
application-dev.yml
``` 
server:
  port: 8080

manInfo:
    age: 18
    name: jason
```
application-prod.yml
``` 
server:
  port: 8081

manInfo:
    age: 18
    name: alun
```
原有的application.yml
``` 
spring:
  profiles:
    active: prod
```

### 静态资源
SpringBoot对静态资源的支持以及很重要的一个类WebMvcConfigurerAdapter

#### 默认的资源
SpringBoot默认配置的静态资源映射：
- classpath:/META-INF/resources
- classpath:/resources(classpath就代表了resources文件夹，也就是resources/resources)
- classpath:/static
- classpath:/public

优先级顺序为：META-INF/resources > resources > static > public

#### 接管Spring Boot的Web配置
在你既需要保留Spring Boot提供的便利，有需要增加自己的额外的配置的时候，可以定义一个配置类并继承WebMvcConfigurerAdapter,无需使用@EnableWebMvc注解

##### 自定义资源映射addResourceHandlers
我们想自定义静态资源映射目录的话，只需重写addResourceHandlers方法即可

``` 
@Configuration
public class MyWebMvcConfigurerAdapter extends WebMvcConfigurerAdapter {
    /**
     * 配置静态访问资源
     * @param registry
     */
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/my/**").addResourceLocations("classpath:/my/");
        super.addResourceHandlers(registry);
    }
}
```
通过addResourceHandler添加映射路径，然后通过addResourceLocations来指定路径。我们访问自定义my文件夹中的elephant.jpg 图片的地址为       http://localhost:8080/my/elephant.jpg

如果想指定外部的目录也很简单，直接addResourceLocations指定即可:
``` 
@Override
public void addResourceHandlers(ResourceHandlerRegistry registry) {
    registry.addResourceHandler("/my/**").addResourceLocations("file:E:/my/");
    super.addResourceHandlers(registry);
}
```
addResourceLocations指的是文件放置的目录，addResoureHandler指的是对外暴露的访问路径

##### 页面跳转addViewControllers
以前写SpringMVC的时候，如果需要访问一个页面，必须要写Controller类，然后再写一个方法跳转到页面，感觉好麻烦，其实重写WebMvcConfigurerAdapter中的addViewControllers方法即可达到效果了
```
/**
 *  以前要访问一个页面需要先创建个Controller控制类，再写方法跳转到页面
 *  在这里配置后就不需要那么麻烦了，直接访问http://localhost:8080/toLogin   就跳转到login.htm页面了
 */
@Override
public void addViewControllers(ViewControllerRegistry registry) {
    registry.addViewController("/toLogin").setViewName("login");
    super.addViewControllers(registry);
} 
```

### 拦截器(addInterceptors)
拦截器在我们项目中经常使用的，这里就来介绍下最简单的判断是否登录的使用。
要实现拦截器功能需要完成以下2个步骤:
1. 创建我们自己的拦截器类并实现 HandlerInterceptor 接口
2. 其实重写WebMvcConfigurerAdapter中的addInterceptors方法把自定义的拦截器类添加进来

自定义拦截器代码：
``` 
package com.dudu.interceptor;
public class MyInterceptor implements HandlerInterceptor {
    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        boolean flag =true;
        User user=(User)request.getSession().getAttribute("user");
        if(null==user){
            response.sendRedirect("toLogin");
            flag = false;
        }else{
            flag = true;
        }
        return flag;
    }

    @Override
    public void postHandle(HttpServletRequest request, HttpServletResponse response, Object handler, ModelAndView modelAndView) throws Exception {
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) throws Exception {
    }
}

```

重写WebMvcConfigurerAdapter中的addInterceptors方法如下:
``` 
public void addInterceptors(InterceptorRegistry registry) {
    // addPathPatterns 用于添加拦截规则
    // excludePathPatterns 用户排除拦截
    registry.addInterceptor(new MyInterceptor()).addPathPatterns("/**").excludePathPatterns("/toLogin","/login");
    super.addInterceptors(registry);
}
```



### 参考资料
- [SpringBoot干货](https://www.jianshu.com/p/8df493ad159d)
- [SpringBoot图片上传和显示](http://blog.csdn.net/a625013/article/details/52414470)


