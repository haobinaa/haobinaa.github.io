---
title: TomCat使用
date: 2017-10-18 11:16:21
tags: java
categories: javaWeb
---

### Tomcat目录结构
- bin:存放开关Tomcat的脚本
- conf: Tomcat配置文件
- lib： Tomcat服务的jar包
- logs： 日志文件
- temp： 存放运行期间产生的临时文件
- webapp： web应用所在目录，即外部访问web资源的目录
- work： Tomcat工作目录

### web应用
1. web应用与web应用所在的目录： 一个web应用由多个静态web资源和动态web资源组成；
组成web应用的这些文件会由一个目录组织起来，这个目录称为web应用所在目录
2. 虚拟目录映射： 把主机上的资源映射到服务器对外访提供的访问路径上
3. example: tomcat的`conf/server.xml`中，`<Host>`元素中一个`<Context>`对应一个web应用，例如`<Context path="" docBase="D:\test"></Context>`  
`path`代表网站路径 `doBase`是文件路径
4. web应用结构：
```
webapp------------------webroot目录
        |---html、jsp、css、js等文件，外部可直接访问
        |---WEB-INF目录
            |---classes目录（java类）
            |---lib（java类运行依赖的jar包）
            |---web.xml（web应用配置文件）
```

### Tomcat运行体系
![运行体系](https://camo.githubusercontent.com/228a8cc0748b7e49d8ae991f625c71b43b0e2143/687474703a2f2f3778706836642e636f6d312e7a302e676c622e636c6f7564646e2e636f6d2f6a6176617765625f746f6d6361742545342542442539332545372542332542422545372542422539332545362539452538342e706e67)


