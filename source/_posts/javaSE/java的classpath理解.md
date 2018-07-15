---
title: java的classpath理解
date: 2017-11-06 15:57:50
tags: java
categories: javaSE
---
在java中，经常遇到从classpath里面读取配置文件的东西，最开始以为classpath是某个目录，现在好好的理一下。


### classpath和classpath*
classpath： 只会到你的class路径中查找找文件;   
classpath*：不仅包含class路径，还包括jar文件中(class路径)进行查找.   



### 读取classpath下文件的方式

#### 通过ClassLoader来获取文件资源

##### 1.获取文件资源
通过`classLoader`的`getResouce`获取文件资源：
``` 
java.net.URL url = this.getClass().getClassLoader().getResource("spring-base.xml");
String filePath = url.getFile();
File file = new File(filePath);
```

##### 2.获取输入流
通过`classLoader`的`getResouceAsStream`获取文件资源：
``` 
InputStream in = this.getClass().getClassLoader().getResouceAsStream("spring-base.xml");
```

#### 通过Spring来获取classpath下的文件

##### 1.ResourceUtils
``` 
File file = ResouceUtils.getFile("spring-base.xml");
```

##### 2.ClassPathResouce
``` 
org.springframework.core.io.Resouce fileResouce = new ClassPathResource("spring-base.xml");
// 获取文件
File file = fileResouce.getFile();
// 获取文件流
InputStream in = fileResouce.getInputStream()
```
