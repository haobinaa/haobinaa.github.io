---
title: SpringBoot一(基础概览)
date: 2017-11-13 10:20:16
tags: springboot
categories: spring
---

### 一、启动SpringBoot

#### 1. pom依赖配置
``` 
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>1.4.0.RELEASE</version>
</parent>

<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
</dependencies>
```

#### 2.启动方法

``` 
@Controller
@EnableAutoConfiguration
public class SampleController {

    @RequestMapping("/")
    @ResponseBody
    String home() {
        return "Hello World!";
    }

    public static void main(String[] args) throws Exception {
        SpringApplication.run(SampleController.class, args);
    }
}
```
关于@EnableAutoConfiguration和SpringApplication:  
- @EnableAutoConfiguration判断出这是一个web应用，创建对应的web环境
- SpringApplication则是用于main 方法启动Spring应用类。默认执行以下步骤：
    1. 创建一个合适的ApplicationContext实例
    2. 注册一个CommandLinePropertySource， 以便将命令行参数作为Spring properties
    3. 刷新application context, 加载所有的单例bean
    4. CommandLineRunner beans
    
然后点击run就可以在默认的Tomcat（或者其他容器如jetty）端口访问到项目了，配置的话需要在classpath下新建application.yml或者application.properties进行相应的配置。

### 二、使用SpringBoot

#### 1. 自动配置  
    - @Import和@ComponentScan类似
    - @EnableAutoConfiguration和@SpringBootApplication类似，但是只能使用一次
    
#### 2.Developer Tools热启动  
Spring Boot的开发工具
``` 
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-devtools</artifactId>
    <optional>true</optional>
</dependency>
```
- property default  
一些Spring Boot支持的库使用了cache增进性能。但是cache，在开发过程中可能会是一个阻碍。例如你无法立即更新一个模板（thymeleaf的）。
cache设置通常在 application.properties 中。但是，比起手动设置这些，spring-boot-devtools模块会自动应用这些开发期的设置。
- 自动重启  
使用spring-boot-devtools模块的应用，当classpath中的文件有改变时，会自动重启。  
idea设置热部署的步骤：
    1. settings->build->compiler，勾选build project automatically
    2. ctrl + shift + alt + /, registry->compliler.automake.allow.when.app.running勾选上
    3. 配置plugin，并重启
``` 
<plugin>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-maven-plugin</artifactId>
    <configuration>
        <fork>true</fork>//该配置必须
    </configuration>
</plugin>
```

！！！注意：
不要将App启动类放在`src/main/java`下，必须放在一个包中。且启动类默认扫描当前目录下的包和其子包。

如果放在`src/main/java`下，需要指定`ComponentScan`的basePackage，因为SpringBoot默认的basePackage是启动类的package，如果放在`src/mian/java
`在，启动类的package为空，所以无法开始扫描


### 三、配置属性

#### 1.自定义属性

application.properties提供自定义属性的支持，这样我们就可以把一些常量配置在这里:
``` 
com.haobin.name="haobin"
com.haobin.age="17"
```
然后直接在要使用的地方通过注解@Value(value="${config.name}")就可以绑定到你想要的属性上面
``` 
    @Value("${com.haobin.name}")
    private  String name;
    @Value("${com.haobin.age}")
    private  Integer age;
```

有时候属性太多了，一个个绑定到属性字段上太累，官方提倡绑定一个对象的bean，这里我们建一个ConfigBean.java类，顶部需要使用注解`@ConfigurationProperties(prefix = "com.haobin")`来指明使用
``` 
@Component
@ConfigurationProperties(prefix = "com.dudu")
public class ConfigBean {
    private String name;
    private String age;
    // .........getter 和 setter
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
        return configBean.getName()+configBean.getAge();
    }
}
```

#### 2.参数间引用

在application.properties中的各个参数之间也可以直接引用来使用，就像下面的设置：
``` 
com.haobin.name = "haobin"
com.haobin.age = "17"
com.haobin.info=${com.haobin.name}有${com.haobin.age}
```

#### 3.Profile-多环境配置

开发环境配置：`application-dev.yml`
``` 
server:
  port: 8080

manInfo:
    age: 18
    name: jason
```
生产环境配置：`application-prod.yml`
``` 
server:
  port: 8081

manInfo:
    age: 18
    name: alun
```

选择使用哪个配置文件：
``` 
spring:
  profiles:
    active: prod
```


### 静态资源

#### 1.默认的静态资源地址
- classpath:/META-INF/resources
- classpath:/resources(classpath就代表了resources文件夹，也就是resources/resources)
- classpath:/static
- classpath:/public

>需要注意的是，如果是用Intellij IDEA开发，项目默认生成的Resources目录，不是上面说的“classpath:/resources/”，这个Resources目录是直接指向“classpath:/”的。Resources目录下新建一个“resources”文件夹，此时“resources”文件夹的路径才是“classpath:/resources/”。

##### 2.自定义资源映射addResourceHandlers

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
 
 
