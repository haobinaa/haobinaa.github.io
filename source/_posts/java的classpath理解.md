---
title: java的classpath理解
date: 2017-11-06 15:57:50
tags: java
categories: javaSE
---
在java中，经常遇到从classpath里面读取配置文件的东西，最开始以为classpath是某个目录，现在好好的理一下。

>java项目中src路径下的文件在编译后会放到WEB-INF/clases路径下吧。默认的classpath是在这里。直接放到WEB-INF下的话，是不在classpath下的。用ClassPathXmlApplicationContext当然获取不到。 

>maven项目中resource目录就是默认的classpath  
classPath即为java文件编译之后的class文件的编译目录一般为web-inf/classes，src下的xml在编译时也会复制到classPath下  
ApplicationContext ctx = new ClassPathXmlApplicationContext("xxxx.xml");  //读取classPath下的spring.xml配置文件  
ApplicationContext ctx = new FileSystemXmlApplicationContext("WebRoot/WEB-INF/xxxx.xml");   //读取WEB-INF 下的spring.xml文件  

### classpath和classpath*
classpath： 只会到你的class路径中查找找文件;   
classpath*：不仅包含class路径，还包括jar文件中(class路径)进行查找.   
java从classpath中获取资源的方法, ClassLoader提供的两个方法：
- public URL getResource(String name)
- public InputStream getResourceAsStream(String name)

这里name是资源的类路径，它是相对与“/”根路径下的位置。getResource得到的是一个URL对象来定位资源，而getResourceAsStream取得该资源输入流的引用保证程序可以从正确的位置抽取数据。但是真正使用的不是ClassLoader的这两个方法，而是Class的getResource和getResourceAsStream方法，因为Class对象可以从你的类得到（如YourClass.class或 YourClass.getClass()），而ClassLoader则需要再调用一次YourClass.getClassLoader()方法，不过根据JDK文档的说法，Class对象的这两个方法其实是“委托”（delegate）给装载它的ClassLoader来做的，所以只需要使用 Class对象的这两个方法就可以了

使用例子
``` 
1.this.getClass().getResource（""） 
得到的是当前类class文件的URI目录。不包括自己！
如：file：/D：/workspace/jbpmtest3/bin/com/test/

2.this.getClass().getResource（"/"） 
得到的是当前的classpath的绝对URI路径 。
如：file：/D：/workspace/jbpmtest3/bin/

3.this.getClass() .getClassLoader().getResource（""） 
得到的也是当前ClassPath的绝对URI路径 。
如：file：/D：/workspace/jbpmtest3/bin/

4.ClassLoader.getSystemResource（""） 
得到的也是当前ClassPath的绝对URI路径 。
如：file：/D：/workspace/jbpmtest3/bin/

5.Thread.currentThread().getContextClassLoader ().getResource（""） 
得到的也是当前ClassPath的绝对URI路径 。
如：file：/D：/workspace/jbpmtest3/bin/

6.ServletActionContext.getServletContext().getRealPath(“/”) 
Web应用程序 中，得到Web应用程序的根目录的绝对路径。这样，我们只需要提供相对于Web应用程序根目录的路径，就可以构建出定位资源的绝对路径。
如：file：/D:/workspace/.metadata/.plugins/org.eclipse.wst.server.core/tmp0/wtpwebapps/WebProject
```

