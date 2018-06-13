---
title: mybatis(缓存)
date: 2017-12-19 17:19:46
tags: mybatis
categories: spring
---
### 缓存
数据库缓存可以减轻数据库压力，提高性能。mybatis提供一级缓存和二级缓存

![](http://7xph6d.com1.z0.glb.clouddn.com/mybatis_%E6%9F%A5%E8%AF%A2%E7%BC%93%E5%AD%98.png)

根据上图可以看到一级缓存是sqlSession级别的缓存，不同sqlSession之间缓存的数据是互相不影响的

二级缓存是mapper级别的缓存，多个SqlSession去操作同一个Mapper的sql语句，多个SqlSession可以共用二级缓存，二级缓存是跨SqlSession的


#### 一级缓存
mybatis默认支持一级缓存，不需要配置，代码如下：

``` 
@Test
public void testCache1() throws Exception {
    SqlSession sqlSession = sqlSessionFactory.openSession();// 创建代理对象
    UserMapper userMapper = sqlSession.getMapper(UserMapper.class);

    // 下边查询使用一个SqlSession
    // 第一次发起请求，查询id为1的用户
    User user1 = userMapper.findUserById(1);
    System.out.println(user1);

    // 如果sqlSession去执行commit操作（执行插入、更新、删除），清空SqlSession中的一级缓存，这样做的目的为了让缓存中存储的是最新的信息，避免脏读。

    // 更新user1的信息
    // user1.setUsername("测试用户22");
    // userMapper.updateUser(user1);
    // //执行commit操作去清空缓存
    // sqlSession.commit();

    // 第二次发起请求，查询id为1的用户
    User user2 = userMapper.findUserById(1);
    System.out.println(user2);

    sqlSession.close();

}
```

#### 二级缓存
1. 开启二级缓存
``` 
全局开启：
<setting name="cacheEnabled" value="true"/>

某个mapper开启：
<mapper namespace="com.iot.mybatis.mapper.UserMapper">
<!-- 开启本mapper的namespace下的二级缓存-->
<cache />
......
</mapper>
```

2.使用
``` 
@Test
public void testCache2() throws Exception {
    SqlSession sqlSession1 = sqlSessionFactory.openSession();
    SqlSession sqlSession2 = sqlSessionFactory.openSession();
    SqlSession sqlSession3 = sqlSessionFactory.openSession();
    // 创建代理对象
    UserMapper userMapper1 = sqlSession1.getMapper(UserMapper.class);
    // 第一次发起请求，查询id为1的用户
    User user1 = userMapper1.findUserById(1);
    System.out.println(user1);

    //这里执行关闭操作，将sqlsession中的数据写到二级缓存区域
    sqlSession1.close();


//      //使用sqlSession3执行commit()操作
//      UserMapper userMapper3 = sqlSession3.getMapper(UserMapper.class);
//      User user  = userMapper3.findUserById(1);
//      user.setUsername("张明明");
//      userMapper3.updateUser(user);
//      //执行提交，清空UserMapper下边的二级缓存
//      sqlSession3.commit();
//      sqlSession3.close();



    UserMapper userMapper2 = sqlSession2.getMapper(UserMapper.class);
    // 第二次发起请求，查询id为1的用户
    User user2 = userMapper2.findUserById(1);
    System.out.println(user2);

    sqlSession2.close();
}
```

#### useCache和flushCache
- useCache     
在statement中设置`useCache=flase`可以禁用当前select语句的二级缓存，如果每次查询都需要是最新数据，需要设置useCache为false
``` 
<select id="findOrderListResultMap" resultMap="ordersUserMap" useCache="false">
```


- 清空缓存    
刷新缓存就是清空缓存。在mapper的同一个namespace中，如果有其它insert、update、delete操作数据后需要刷新缓存，如果不执行刷新缓存会出现脏读

在statement设置`flushCache = "true"`,默认情况也是true既刷新缓存，也可以设置成false不刷新缓存（可能引起脏读），如下：
``` 
<insert id="insertUser" parameterType="cn.itcast.mybatis.po.User" flushCache="true">
```

### 整合ehcache

有时候为了提供系统的并发和性能一般是对系统进行分布式部署，就需要使用分布式缓存，mybatis无法自己实现，需要与其他框架进行整合

mybatis只要实现一个cache接口就能自定义缓存逻辑，ehcache和mybatis的整合包提供了一个cache的实现类

#### 整合ehcache  
1. 添加ehcache的包
``` 
ehcache-core
mybatis-ehcache
```
2. mybatis配置cache的type为ehcache
``` 
比如在某个mapper下
 <cache type="org.mybatis.caches.ehcache.EhcacheCache"/>
```
3. classpath加入ehcache.xml配置
``` 
<ehcache xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:noNamespaceSchemaLocation="../config/ehcache.xsd">
    <diskStore path="F:\develop\ehcache" />
    <defaultCache 
        maxElementsInMemory="1000" 
        maxElementsOnDisk="10000000"
        eternal="false" 
        overflowToDisk="false" 
        timeToIdleSeconds="120"
        timeToLiveSeconds="120" 
        diskExpiryThreadIntervalSeconds="120"
        memoryStoreEvictionPolicy="LRU">
    </defaultCache>
</ehcache>
```
### 参考资料
- [mybatis缓存](http://blog.csdn.net/h3243212/article/details/50774921)