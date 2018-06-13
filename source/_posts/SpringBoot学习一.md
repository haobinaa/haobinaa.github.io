---
title: SpringBoot一(启动和热部署)
date: 2017-11-13 10:20:16
tags: springboot
categories: spring
---

#### 一、启动SpringBoot
1. pom依赖文件
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
2.启动方法
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

#### 二、使用SpringBoot
1. 自动配置  
    - @Import和@ComponentScan类似
    - @EnableAutoConfiguration和@SpringBootApplication类似，但是只能使用一次
2. Developer Tools  
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
不要将App启动类放在默认的java包里面，不然会出各种奇怪的错误，比如SpringBoot会自动扫描包，如果不在一个包下面，就会报类似于这样的错误(太长了只粘贴出一部分)：
``` 
nnotation-specified bean name 'errorPageFilter' for bean class [org.springframework.boot.web.support
```

 
