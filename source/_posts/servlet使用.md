---
title: servlet使用
date: 2017-10-18 14:14:43
tags: javaWeb
categories: javaWeb
---

### 概述


#### 前言
我们一般是建立一个java类，继承servlet，然后利用doGet和doPost方法来接收get和post请求，然后在web.xml里面配置一个`<servlet>`标签，包含了`<servlet-name>`和`<servlet-class>`，`<servlet-mapping>`包含了`<servlet-name>`和`<url-pattern>`。其中一个`<servlet>`可以对应多个`<servlet-mapping>`，并且`<servlet-mapping>`中的`<url-pattern>`可以使用通配符，例如*.扩展名

在网上看到一个url映射的例子：
``` 
现有如下映射关系：
Servlet1 -> /abc/*
Servlet2 -> /*
Servlet3 -> /abc
Servlet4 -> *.do

1.当URL为/abc/a.html时，同时匹配了/abc/*和/*，此时将调用Servlet1
2.当URL为/abc时，同时匹配了/abc 和 /abc/*， 此时将调用Servlet3
3.当URL为/abc/*.do时，同时匹配了 /abc/* 和 *.do， 此时调用 Servlet1
4.当URL为/a.do时， 同时匹配了/* 和  *.do，此时调用 Servlet2
5.当URL为/xxx/yyy/a.do， 同时匹配了/*和 *.do此时调用Servlet2
```


#### Servlet容器

Servlet是J2EE体系中很重要的一部分，不同于LNMP的架构，Servlet是依赖于Servlet容器的，常用的有jetty和Tomcat，这里以Tomcat为例


Tomcat中，Context 容器是直接管理 Servlet 在容器中的包装类 Wrapper，所以 Context 容器如何运行将直接影响 Servlet 的工作方式。 Tomcat的容器模型如下：

![](https://www.ibm.com/developerworks/cn/java/j-lo-servlet/image002.jpg)


可以看到管理Servlet的容器是ConText容器，一个context容器对应一web工程，其实这点在Tomcat的配置文件中也能发现：
``` 
<Context path="/projectOne " docBase="D:\projects\projectOne"
reloadable="true" />
```

### Servlet容器的启动过程

Tomcat支持嵌入式功能，通过`org.apache.catalina.startup.Tomcat`启动类来创建实例对象调用start方法就可以启动Tomcat，并且可以通过这个对象来增加或修改Tomcat的参数如`Context`、`Servlet`等。

1. 给Tomcat增加一个web工程
``` 
Tomcat tomcat = getTomcatInstance(); 
File appDir = new File(getBuildDirectory(), "webapps/examples"); 
tomcat.addWebapp(null, "/examples", appDir.getAbsolutePath()); 
tomcat.start(); 
ByteChunk res = getUrl("http://localhost:" + getPort() + 
              "/examples/servlets/servlet/HelloWorldExample"); 
```

2.上面的addWebapp如下：
``` 
public Context addWebapp(Host host, String url, String path) { 
       silence(url); 
       // 创建context容器
       Context ctx = new StandardContext(); 
       // 设置url和物理路径
       ctx.setPath(url); 
       ctx.setDocBase(path); 
       
       if (defaultRealm == null) { 
           initSimpleAuth(); 
       } 
       ctx.setRealm(defaultRealm); 
       ctx.addLifecycleListener(new DefaultWebXmlListener()); 
       // context配置解析器
       ContextConfig ctxCfg = new ContextConfig(); 
       // 生命周期监听器(基于观察者模式)
       ctx.addLifecycleListener(ctxCfg); 
       ctxCfg.setDefaultWebXml("org/apache/catalin/startup/NO_DEFAULT_XML"); 
       
       if (host == null) { 
           getHost().addChild(ctx); 
       } else { 
           host.addChild(ctx); 
       } 
       return ctx; 
}
```

#### StandardContext启动过程
Tomcat主要类启动的时序图：
![](https://www.ibm.com/developerworks/cn/java/j-lo-servlet/image003.jpg)


ContextConfig继承了LifecycleListener，set到StandardContext容器中，负责 Web 应用的配置解析工作，ContextConfig的init方法完成以下工作：

1. 创建用于解析 xml 配置文件的 contextDigester 对象
2. 读取context.xml配置文件，如果存在就解析它
3. 读取host配置文件，如果存在就解析它
4. 读取context自身配置文件，如果存在解析它
5. 设置context的DocBase


init完成后，context容器会执行startInternal方法：
1. 创建读取资源文件的对象
2. 创建 ClassLoader 对象
3. 设置应用的工作目录
4. 启动相关的辅助类如：logger、realm、resources 等
5. 修改启动状态，通知感兴趣的观察者（Web 应用的配置）
6. 子容器的初始化
7. 获取 ServletContext 并设置必要的参数
8. 初始化“load on startup”的 Servlet


#### Web应用的初始化

Web 应用的初始化工作是在 ContextConfig 的 configureStart 方法中实现的，应用的初始化主要是要解析 web.xml 文件，这个文件描述了一个 Web 应用的关键信息，也是一个 Web 应用的入口

web.xml的搜寻顺序：
1. globalWebXml：engine工作目录下`conf/web.xml`
2. hostWebXml: `System.getProperty("catalina.base")/conf/${EngineName}/${HostName}/web.xml.default`
3. 应用文件配置的web.xml:`examples/WEB-INF/web.xml`


web.xml文件中的各项配置会被解析成相应的属性保存到`WebXml对象`中，接下来会把WebXml对象中的属性设置到Context中，设置Servlet对象、filter、listener等，在`WebXml`的`configureContext`方法中，解析Servlet的代码片段,创建Wrapper实例：
``` 
 for (ServletDef servlet : servlets.values()) { 
            Wrapper wrapper = context.createWrapper(); 
            String jspFile = servlet.getJspFile(); 
            if (jspFile != null) { 
                wrapper.setJspFile(jspFile); 
            } 
            if (servlet.getLoadOnStartup() != null) { 
                wrapper.setLoadOnStartup(servlet.getLoadOnStartup().intValue()); 
            } 
            if (servlet.getEnabled() != null) { 
                wrapper.setEnabled(servlet.getEnabled().booleanValue()); 
            } 
            wrapper.setName(servlet.getServletName()); 
            Map<String,String> params = servlet.getParameterMap(); 
            for (Entry<String, String> entry : params.entrySet()) { 
                wrapper.addInitParameter(entry.getKey(), entry.getValue()); 
            } 
            wrapper.setRunAs(servlet.getRunAs()); 
            Set<SecurityRoleRef> roleRefs = servlet.getSecurityRoleRefs(); 
            for (SecurityRoleRef roleRef : roleRefs) { 
                wrapper.addSecurityReference( 
                        roleRef.getName(), roleRef.getLink()); 
            } 
            wrapper.setServletClass(servlet.getServletClass()); 
            MultipartDef multipartdef = servlet.getMultipartDef(); 
            if (multipartdef != null) { 
                if (multipartdef.getMaxFileSize() != null && 
                        multipartdef.getMaxRequestSize()!= null && 
                        multipartdef.getFileSizeThreshold() != null) { 
                    wrapper.setMultipartConfigElement(new 
 MultipartConfigElement( 
                            multipartdef.getLocation(), 
                            Long.parseLong(multipartdef.getMaxFileSize()), 
                            Long.parseLong(multipartdef.getMaxRequestSize()), 
                            Integer.parseInt( 
                                    multipartdef.getFileSizeThreshold()))); 
                } else { 
                    wrapper.setMultipartConfigElement(new 
 MultipartConfigElement( 
                            multipartdef.getLocation())); 
                } 
            } 
            if (servlet.getAsyncSupported() != null) { 
                wrapper.setAsyncSupported( 
                        servlet.getAsyncSupported().booleanValue()); 
            } 
            context.addChild(wrapper); 
 }
```

这段代码清楚的描述了如何将 Servlet 包装成 Context 容器中的 StandardWrapper，这里有个疑问，为什么要将 Servlet 包装成 StandardWrapper 而不直接是 Servlet 对象。这里 StandardWrapper 是 Tomcat 容器中的一部分，它具有容器的特征，而 Servlet 为了一个独立的 web 开发标准，不应该强耦合在 Tomcat 中

除了将 Servlet 包装成 StandardWrapper 并作为子容器添加到 Context 中，其它的所有 web.xml 属性都被解析到 Context 中，所以说 Context 容器才是真正运行 Servlet 的 Servlet 容器。一个 Web 应用对应一个 Context 容器，容器的配置属性由应用的 web.xml 指定，这样我们就能理解 web.xml 到底起到什么作用了


#### 创建Servlet实例
前面已经完成了 Servlet 的解析工作，并且被包装成 StandardWrapper 添加在 Context 容器中，但并没有被实例化

### 参考资料
- [许令波-Servlet工作原理](https://www.ibm.com/developerworks/cn/java/j-lo-servlet/)

