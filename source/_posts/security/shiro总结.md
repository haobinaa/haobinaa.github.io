---
title: shiro总结
date: 2018-02-01 11:36:05
tags: shiro
categories: security
---
### 概述

Apache Shiro是一个安全验证框架，具有认证、授权、加密、会话管理、与Web集成、缓存等功能。

基本功能点如图所示：
![](http://dl2.iteye.com/upload/attachment/0093/9788/d59f6d02-1f45-3285-8983-4ea5f18111d5.png)

- Authentication：身份认证/登录，验证用户是不是拥有相应的身份

- Authorization：授权，即权限验证，验证某个已认证的用户是否拥有某个权限；即判断用户是否能做事情，常见的如：验证某个用户是否拥有某个角色。或者细粒度的验证某个用户对某个资源是否具有某个权限

- Session Manager：会话管理，即用户登录后就是一次会话，在没有退出之前，它的所有信息都在会话中；会话可以是普通JavaSE环境的，也可以是如Web环境的

- Cryptography：加密，保护数据的安全性，如密码加密存储到数据库，而不是明文存储

- Web Support：Web支持，可以非常容易的集成到Web环境

- Caching：缓存，比如用户登录后，其用户信息、拥有的角色/权限不必每次去查，这样可以提高效率

- Concurrency：shiro支持多线程应用的并发验证，即如在一个线程中开启另一个线程，能把权限自动传播过去

- Remember Me：记住我，这个是非常常见的功能，即一次登录后，下次再来的话不用登录了


shiro提供了很多好用的API，让我们自己去扩展功能,shiro的流程如下：

![](http://dl2.iteye.com/upload/attachment/0093/9790/5e0e9b41-0cca-367f-8c87-a8398910e7a6.png)

- Subject：主体，代表了当前“用户”，这个用户不一定是一个具体的人，与当前应用交互的任何东西都是Subject，如网络爬虫，机器人等；即一个抽象概念；所有Subject都绑定到SecurityManager，与Subject的所有交互都会委托给SecurityManager；可以把Subject认为是一个门面；SecurityManager才是实际的执行者

- SecurityManager：安全管理器；即所有与安全有关的操作都会与SecurityManager交互；且它管理着所有Subject；可以看出它是Shiro的核心，它负责与后边介绍的其他组件进行交互，如果学习过SpringMVC，你可以把它看成DispatcherServlet前端控制器

- Realm：域，Shiro从从Realm获取安全数据（如用户、角色、权限），就是说SecurityManager要验证用户身份，那么它需要从Realm获取相应的用户进行比较以确定用户身份是否合法；也需要从Realm得到用户相应的角色/权限进行验证用户是否能进行操作；可以把Realm看成DataSource，即安全数据源


shiro的内部结构：
![](http://dl2.iteye.com/upload/attachment/0093/9792/9b959a65-799d-396e-b5f5-b4fcfe88f53c.png)

- Subject：主体，可以看到主体可以是任何可以与应用交互的“用户”

- SecurityManager：相当于SpringMVC中的DispatcherServlet是Shiro的心脏；所有具体的交互都通过SecurityManager进行控制；它管理着所有Subject、且负责进行认证和授权、及会话、缓存的管理

- Authenticator：认证器，负责主体认证的，这是一个扩展点，如果用户觉得Shiro默认的不好，可以自定义实现；其需要认证策略（Authentication Strategy），即什么情况下算用户认证通过了

- Authrizer：授权器，或者访问控制器，用来决定主体是否有权限进行相应的操作；即控制着用户能访问应用中的哪些功能；

- Realm：可以有1个或多个Realm，可以认为是安全实体数据源，即用于获取安全实体的；可以是JDBC实现，也可以是LDAP实现，或者内存实现等等；由用户提供；注意：Shiro不知道你的用户/权限存储在哪及以何种格式存储；所以我们一般在应用中都需要实现自己的Realm

- SessionManager：SessionManager用来管理session的生存周期,而Shiro并不仅仅可以用在Web环境，也可以用在如普通的JavaSE环境、EJB等环境；所有呢，Shiro就抽象了一个自己的Session来管理主体与应用之间交互的数据；这样的话，比如我们在Web环境用，刚开始是一台Web服务器；接着又上了台EJB服务器；这时想把两台服务器的会话数据放到一个地方，这个时候就可以实现自己的分布式会话（如把数据放到Memcached服务器）

- SessionDAO：DAO大家都用过，数据访问对象，用于会话的CRUD，比如我们想把Session保存到数据库，那么可以实现自己的SessionDAO，通过如JDBC写到数据库；比如想把Session放到Memcached中，可以实现自己的Memcached SessionDAO；另外SessionDAO中可以使用Cache进行缓存，以提高性能

- CacheManager：缓存控制器，来管理如用户、角色、权限等的缓存的；因为这些数据基本上很少去改变，放到缓存中后可以提高访问的性能

- Cryptography：密码模块，Shiro提高了一些常见的加密组件用于如密码加密/解密的

### 身份验证

#### 登录过程示例
``` 
public void testLogin() {  
    //1、获取SecurityManager工厂，此处使用Ini配置文件初始化SecurityManager  
    Factory<org.apache.shiro.mgt.SecurityManager> factory =  
            new IniSecurityManagerFactory("classpath:shiro.ini");  
    //2、得到SecurityManager实例 并绑定给SecurityUtils  
    org.apache.shiro.mgt.SecurityManager securityManager = factory.getInstance();  
    SecurityUtils.setSecurityManager(securityManager);  
    //3、得到Subject及创建用户名/密码身份验证Token（即用户身份/凭证）  
    Subject subject = SecurityUtils.getSubject();  
    UsernamePasswordToken token = new UsernamePasswordToken("zhang", "123");  
    try {  
        //4、登录，即身份验证  
        subject.login(token);  
    } catch (AuthenticationException e) {  
        //5、身份验证失败  
    }  
  
    Assert.assertEquals(true, subject.isAuthenticated()); //断言用户已经登录  
  
    //6、退出  
    subject.logout();  
}  
```

逻辑流程：

1. 首先通过new IniSecurityManagerFactory并指定一个ini配置文件来创建一个SecurityManager工厂

2. 接着获取SecurityManager并绑定到SecurityUtils，这是一个全局设置，设置一次即可

3. 通过SecurityUtils得到Subject，其会自动绑定到当前线程；如果在web环境在请求结束时需要解除绑定；然后获取身份验证的Token，如用户名/密码

4. 调用subject.login方法进行登录，其会自动委托给SecurityManager.login方法进行登录

5. 如果身份验证失败请捕获AuthenticationException或其子类，常见的如： DisabledAccountException（禁用的帐号）、LockedAccountException（锁定的帐号）、UnknownAccountException（错误的帐号）、ExcessiveAttemptsException（登录失败次数过多）、IncorrectCredentialsException （错误的凭证）、ExpiredCredentialsException（过期的凭证）等，具体请查看其继承关系；对于页面的错误消息展示，最好使用如“用户名/密码错误”而不是“用户名错误”/“密码错误”，防止一些恶意用户非法扫描帐号库

6. 最后可以调用subject.logout退出，其会自动委托给SecurityManager.logout方法退出


上述过程总结为：
1. 收集用户身份/凭证，即如用户名/密码

2. 调用Subject.login进行登录，如果失败将得到相应的AuthenticationException异常，根据异常提示用户错误信息；否则登录成功

3. 最后调用Subject.logout进行退出操作

#### Realm

Realm：域，Shiro从从Realm获取安全数据（如用户、角色、权限），就是说SecurityManager要验证用户身份，那么它需要从Realm获取相应的用户进行比较以确定用户身份是否合法；也需要从Realm得到用户相应的角色/权限进行验证用户是否能进行操作；可以把Realm看成DataSource，即安全数据源

一般Reaml继承AuthorizingReaml就好了

这里演示一下自定义Reaml：
``` 
public class MyRealm extends AuthorizingRealm {  
    @Override  
    protected AuthorizationInfo doGetAuthorizationInfo(PrincipalCollection principals) {  
        SimpleAuthorizationInfo authorizationInfo = new SimpleAuthorizationInfo();  
        authorizationInfo.addRole("role1");  
        authorizationInfo.addRole("role2");  
        authorizationInfo.addObjectPermission(new BitPermission("+user1+10"));  
        authorizationInfo.addObjectPermission(new WildcardPermission("user1:*"));  
        authorizationInfo.addStringPermission("+user2+10");  
        authorizationInfo.addStringPermission("user2:*");  
        return authorizationInfo;  
    }  
    @Override  
    protected AuthenticationInfo doGetAuthenticationInfo(AuthenticationToken token) throws AuthenticationException {  
        //和com.github.zhangkaitao.shiro.chapter2.realm.MyRealm1. getAuthenticationInfo代码一样，省略  
}  
}  
```
- AuthenticationInfo doGetAuthenticationInfo(AuthenticationToken token)：表示获取身份验证信息

首先根据传入的用户名获取User信息；然后如果user为空，那么抛出没找到帐号异常UnknownAccountException；如果user找到但锁定了抛出锁定异常LockedAccountException；最后生成AuthenticationInfo信息，交给间接父类AuthenticatingRealm使用CredentialsMatcher进行判断密码是否匹配，如果不匹配将抛出密码错误异常IncorrectCredentialsException；另外如果密码重试此处太多将抛出超出重试次数异常ExcessiveAttemptsException；在组装SimpleAuthenticationInfo信息时，需要传入：身份信息（用户名）、凭据（密文密码）、盐（username+salt），CredentialsMatcher使用盐加密传入的明文密码和此处的密文密码进行匹配

- AuthorizationInfo doGetAuthorizationInfo(PrincipalCollection principals)：表示根据用户身份获取授权信息

PrincipalCollection是一个身份集合，因为我们现在就一个Realm，所以直接调用getPrimaryPrincipal得到之前传入的用户名即可；然后根据用户名调用UserService接口获取角色及权限信息


### 拦截器
shiro可以与web集成，，其通过一个ShiroFilter入口来拦截需要安全控制的URL，然后进行相应的控制，ShiroFilter类似于如Strut2/SpringMVC这种web框架的前端控制器，其是安全控制的入口点，其负责读取配置（如ini配置文件），然后判断URL是否需要登录、权限等工作

#### 拦截器链

Shiro会在servlet容器的FilterChain之前执行自己的FilterChain，可以对URL进行设置进行拦截，一般有几个参数:anon(不需要登录，可以匿名访问)、authc(需要身份认证通过后才能访问,而user模式下rememberMe也可)、user(需要登录或者rememberMe)、logout(退出拦截器)

配置示例，基于java code：
``` 
    ShiroFilterFactoryBean shiroFilterFactoryBean(SecurityManager securityManager) {
		ShiroFilterFactoryBean shiroFilterFactoryBean = new ShiroFilterFactoryBean();
		shiroFilterFactoryBean.setSecurityManager(securityManager);
		// 登录
		shiroFilterFactoryBean.setLoginUrl("/login");
		// 登录成功跳转
		shiroFilterFactoryBean.setSuccessUrl("/index");
		// 无权限页面
		shiroFilterFactoryBean.setUnauthorizedUrl("/403");
		LinkedHashMap<String, String> filterChainDefinitionMap = new LinkedHashMap<>();
		filterChainDefinitionMap.put("/logout", "logout");
		filterChainDefinitionMap.put("/", "anon");
		filterChainDefinitionMap.put("/blog/open/**", "anon");
		filterChainDefinitionMap.put("/**", "authc");
		shiroFilterFactoryBean.setFilterChainDefinitionMap(filterChainDefinitionMap);
		return shiroFilterFactoryBean;
	}
```

### 会话管理

会话管理器管理着应用中所有Subject的会话的创建、维护、删除、失效、验证等工作。是Shiro的核心组件，顶层组件SecurityManager直接继承了SessionManager，且提供了SessionsSecurityManager实现直接把会话管理委托给相应的SessionManager，DefaultSecurityManager及DefaultWebSecurityManager默认SecurityManager都继承了SessionsSecurityManager


#### 会话配置
这里展示一些DefaultSessionManager的一些配置：

- sessionIdCookie是sessionManager创建会话Cookie的模板：
- sessionIdCookie.name：设置Cookie名字，默认为JSESSIONID；
- sessionIdCookie.domain：设置Cookie的域名，默认空，即当前访问的域名；
- sessionIdCookie.path：设置Cookie的路径，默认空，即存储在域名根下；
- sessionIdCookie.maxAge：设置Cookie的过期时间，秒为单位，默认-1表示关闭浏览器时过期Cookie；
- sessionIdCookie.httpOnly：如果设置为true，则客户端不会暴露给客户端脚本代码，使用HttpOnly cookie有助于减少某些类型的跨站点脚本攻击；此特性需要实现了Servlet 2.5 MR6及以上版本的规范的Servlet容器支持；
- sessionManager.sessionIdCookieEnabled：是否启用/禁用Session Id Cookie，默认是启用的；如果禁用后将不会设置Session Id Cookie，即默认使用了Servlet容器的JSESSIONID，且通过URL重写（URL中的“;JSESSIONID=id”部分）保存Session Id。

#### 会话持久化

Shiro提供SessionDAO用于会话的CRUD，即DAO（Data Access Object）模式实现

如果要自定义SessionDao可以继承AbstractSessionDao


#### rememberMe
rememberMe配置：
``` 
<!-- 会话Cookie模板 -->  
<bean id="sessionIdCookie" class="org.apache.shiro.web.servlet.SimpleCookie">  
    <constructor-arg value="sid"/>  
    <property name="httpOnly" value="true"/>  
    <property name="maxAge" value="-1"/>  
</bean>  
<bean id="rememberMeCookie" class="org.apache.shiro.web.servlet.SimpleCookie">  
    <constructor-arg value="rememberMe"/>  
    <property name="httpOnly" value="true"/>  
    <property name="maxAge" value="2592000"/><!-- 30天 -->  
</bean> 
```

### Spring集成配置

shiro可以与Spring进行集成，有Spring-xml或者在Spring Boot中通过Java Code的方式进行配置，具体参考网上，或已做项目


### 参考资料
- [跟我学Shiro-张开涛](http://jinnianshilongnian.iteye.com/blog/2018936)
