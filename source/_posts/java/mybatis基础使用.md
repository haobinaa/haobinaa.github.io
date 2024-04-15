---
title: mybatis使用(配置入门)
date: 2017-12-08 17:39:56
tags: mybatis
categories: orm
---
### 概览

#### 原生jdbc缺陷
原生jdbc十分繁琐，而且占位符不利于维护，缺点很明显
- 数据库使用时创建连接，不使用就释放，频繁的开启和关闭，十分浪费资源（使用数据库连接池管理连接）
- sql语句写在java代码中，不利于维护(将sql独立出来在xml文件中)
- `preparedStatement`设置参数，十分繁琐且不利于维护(将参数以及占位符也配置在xml中)
- 从resultSet中取得的数据需要遍历获得,很麻烦(将结果集映射成对象)


### 基本使用

#### mybatis配置
![](http://7xph6d.com1.z0.glb.clouddn.com/mybatis_%E6%A1%86%E6%9E%B6%E5%9B%BE.png)

执行过程：
- 配置mybatis的配置文件(sqlMapConfig.xml)
- 通过配置文件，加载mybatis运行环境，创建SqlSessionFactory会话工厂
- 通过SqlSessionFactory创建SqlSession。SqlSession是一个面向用户接口（提供操作数据库方法）
- 调用sqlSession的方法去操作数据。sqlSession通过Executor去执行操作
- 释放资源，关闭sqlSession

sqlMapConfig.xml配置：
``` 
<?xml version="1.0" encoding="UTF-8" ?>
 <!DOCTYPE configuration
         PUBLIC "-//mybatis.org//DTD Config 3.0//EN"
         "http://mybatis.org/dtd/mybatis-3-config.dtd">
 <configuration>
     <!-- 和spring整合后 environments配置将废除-->
     <environments default="development">
         <environment id="development">
             <!-- 使用jdbc事务管理，事务控制由mybatis-->
             <transactionManager type="JDBC" />
             <!-- 数据库连接池,由mybatis管理-->
             <dataSource type="POOLED">
                 <property name="driver" value="com.mysql.jdbc.Driver" />
                 <property name="url" value="jdbc:mysql://localhost:3306/mybatis_learn?characterEncoding=utf-8" />
                 <property name="username" value="root" />
                 <property name="password" value="xxx" />
             </dataSource>
         </environment>
     </environments>
 
 </configuration>
```

#### sqlSession
- SqlSessionFactoryBuilder:  
通过SqlSessionFactoryBuilder创建会话工厂SqlSessionFactory将SqlSessionFactoryBuilder当成一个工具类使用即可，不需要使用单例管理SqlSessionFactoryBuilder。在需要创建SqlSessionFactory时候，只需要new一次SqlSessionFactoryBuilder即可
- SqlSessionFactory:   
通过SqlSessionFactory创建SqlSession，使用单例模式管理sqlSessionFactory（工厂一旦创建，使用一个实例）。将来mybatis和spring整合后，使用单例模式管理sqlSessionFactory
- SqlSession   
SqlSession是一个面向用户（程序员）的接口,提供了很多操作数据库的方法

mybatis是使用sqlSession来操作数据库的，比较两种方法：


#### 定义dao

#### 原始的dao的实现(sqlSession方式)
定义interface
``` 
public interface UserDao {
 
    public User findUserById(int id) throws Exception;

    public List<User> findUserByName(String name) throws Exception;

    public void insertUser(User user) throws Exception;

    public void deleteUser(int id) throws Exception;
}
```
dao的实现
``` 
public class UserDaoImpl implements UserDao{
    // 需要向dao实现类中注入SqlSessionFactory
    // 这里通过构造方法注入
    private SqlSessionFactory sqlSessionFactory;

    public UserDaoImpl(SqlSessionFactory sqlSessionFactory){
        this.sqlSessionFactory = sqlSessionFactory;
    }



    @Override
    public User findUserById(int id) throws Exception {
        SqlSession sqlSession = sqlSessionFactory.openSession();
        User user = sqlSession.selectOne("test.findUserById",id);
        //释放资源
        sqlSession.close();
        return user;
    }

    @Override
    public List<User> findUserByName(String name) throws Exception {
        SqlSession sqlSession = sqlSessionFactory.openSession();

        List<User> list = sqlSession.selectList("test.findUserByName", name);

        // 释放资源
        sqlSession.close();

        return list;
    }

    @Override
    public void insertUser(User user) throws Exception {
        SqlSession sqlSession = sqlSessionFactory.openSession();
        //执行插入操作
        sqlSession.insert("test.insertUser", user);

        // 提交事务
        sqlSession.commit();

        // 释放资源
        sqlSession.close();
    }

    @Override
    public void deleteUser(int id) throws Exception {
        SqlSession sqlSession = sqlSessionFactory.openSession();

        //执行插入操作
        sqlSession.delete("test.deleteUser", id);

        // 提交事务
        sqlSession.commit();

        // 释放资源
        sqlSession.close();
    }
}
```
这种方法存在大量的重复代码，调用sqlSession方法的时候会存在硬编码的问题


#### mapper代理的方法
写好mapper接口(相当于dao的接口)和mapper.xml映射文件，mybatis可以自动生成mapper接口的实现类对象

namespace为mapper映射的接口地址
``` 
<mapper namespace="com.iot.mybatis.mapper.UserMapper">
```

mapper.java接口中的方法名和mapper.xml中statement的id一致

mapper.java接口中的方法输入参数类型和mapper.xml中statement的parameterType指定的类型一致。

mapper.java接口中的方法返回值类型和mapper.xml中statement的resultType指定的类型一致
```
<select id="findUserById" parameterType="int" resultType="com.iot.mybatis.po.User">
    SELECT * FROM  user  WHERE id=#{value}
</select>
```

mapper.java中对应的方法应该这么写:
``` 
public User findUserById(int id) throws Exception;
```

在SqlMapConfig.xml中加载mapper
``` 
<mappers>  
    <mapper resource="mapper/UserMapper.xml"/>  
</mappers> 

另外还有一种批量加载mapper方法：
mybatis自动扫描包下边所有mapper接口进行加载
<package name="com.iot.mybatis.mapper"/>
```

更多 mapper映射文件的使用，参考[mybatis中文官网——Mapper XML文件](http://www.mybatis.org/mybatis-3/zh/sqlmap-xml.html)


### 复杂查询

user表:  id  username ........

oder表： id   user_id number(订单编号)

oder_detail表: id    orders_id   items_id    items_num

items表： id  name price .......



#### 一对一查询

实现用户表和订单表的查询，查询出某用户的订单信息

- resultType方式

mapper.xml
``` 
<select id="findOrdersUser"  resultType="com.iot.mybatis.po.OrdersCustom">
  SELECT
      orders.*,
      user.username,
      user.sex,
      user.address
    FROM
      orders,
      user
    WHERE orders.user_id = user.id
</select>
```
mapper.java
``` 
public List<OrdersCustom> findOrdersUser()throws Exception;
```

- resultMap实现
使用resultMap将查询结果中的订单信息映射到Orders对象中，在orders类中添加User属性，将关联查询出来的用户信息映射到orders对象中的user属性中。

mapper.xml
``` 
<!-- 订单查询关联用户的resultMap
将整个查询的结果映射到com.iot.mybatis.po.Orders中
 -->
<resultMap type="com.iot.mybatis.po.Orders" id="OrdersUserResultMap">
    <!-- id：指定查询列中的唯一标识，订单信息的中的唯 一标识，如果有多个列组成唯一标识，配置多个id
        column：订单信息的唯一标识列
        property：订单信息的唯一标识列所映射到Orders中哪个属性
      -->
    <id column="id" property="id"/>
    <result column="user_id" property="userId"/>
    <result column="number" property="number"/>
    <result column="createtime" property="createtime"/>
    <result column="note" property="note"/>

    <!-- 配置映射的关联的用户信息 -->
    <!-- association：用于映射关联查询单个对象的信息
    property：要将关联查询的用户信息映射到Orders中哪个属性
     -->
    <association property="user"  javaType="com.iot.mybatis.po.User">
        <!-- id：关联查询用户的唯 一标识
        column：指定唯 一标识用户信息的列
        javaType：映射到user的哪个属性
         -->
        <id column="user_id" property="id"/>
        <result column="username" property="username"/>
        <result column="sex" property="sex"/>
        <result column="address" property="address"/>
    </association>
</resultMap>

statement定义：
<select id="findOrdersUserResultMap" resultMap="OrdersUserResultMap">
    SELECT
    orders.*,
    user.username,
    user.sex,
    user.address
    FROM
    orders,
    user
    WHERE orders.user_id = user.id
</select>
```

mapper.java
``` 
public List<Orders> findOrdersUserResultMap()throws Exception;
```

#### 一对多查询
``` 
SELECT 
  orders.*,
  user.username,
  user.sex,
  user.address,
  orderdetail.id as orderdetail_id,
  orderdetail.items_id,
  orderdetail.items_num,
  orderdetail.orders_id
FROM
  orders,
  user,
  orderdetail
WHERE orders.user_id = user.id AND orderdetail.orders_id=orders.id
```

由于一个订单对应多个商品，那么订单的信息就是重复的，可以在`order.java`中添加`List<OrderDetail> orderDetail`属性，订单信息映射到order中，订单详情映射到orderDetail属性当中

使用resultMap来实现这个功能：

``` 
// 查询映射
<select id="findOrdersAndOrderDetailResultMap" resultMap="OrdersAndOrderDetailResultMap">
   SELECT
      orders.*,
      user.username,
      user.sex,
      user.address,
      orderdetail.id orderdetail_id,
      orderdetail.items_id,
      orderdetail.items_num,
      orderdetail.orders_id
    FROM
      orders,
      user,
      orderdetail
    WHERE orders.user_id = user.id AND orderdetail.orders_id=orders.id
</select>

// resultMap映射
<resultMap type="com.iot.mybatis.po.Orders" id="OrdersAndOrderDetailResultMap" extends="OrdersUserResultMap">
    <!-- 订单信息 -->
    <!-- 用户信息 -->
    <!-- 使用extends继承，不用在中配置订单信息和用户信息的映射 -->


    <!-- 订单明细信息
    一个订单关联查询出了多条明细，要使用collection进行映射
    collection：对关联查询到多条记录映射到集合对象中
    property：将关联查询到多条记录映射到com.iot.mybatis.po.Orders哪个属性
    ofType：指定映射到list集合属性中pojo的类型
     -->
    <collection property="orderdetails" ofType="com.iot.mybatis.po.Orderdetail">
        <!-- id：订单明细唯 一标识
        property:要将订单明细的唯 一标识 映射到com.iot.mybatis.po.Orderdetail的哪个属性
          -->
        <id column="orderdetail_id" property="id"/>
        <result column="items_id" property="itemsId"/>
        <result column="items_num" property="itemsNum"/>
        <result column="orders_id" property="ordersId"/>
    </collection>
</resultMap>
``` 
#### 多对多查询
在查询用户以及购买商品的信息，是多对多的关系
``` 
SELECT 
  orders.*,
  user.username,
  user.sex,
  user.address,
  orderdetail.id orderdetail_id,
  orderdetail.items_id,
  orderdetail.items_num,
  orderdetail.orders_id,
  items.name items_name,
  items.detail items_detail,
  items.price items_price
FROM
  orders,
  user,
  orderdetail,
  items
WHERE orders.user_id = user.id AND orderdetail.orders_id=orders.id AND orderdetail.items_id = items.id
```

将查询结果映射到User类

User类中添加`List<Order> orderList`来保存用户的订单信息

添加`List<OrderDetail> orderDetail`来保存订单明细

在OrderDetail类中添加`Items`属性，保存订单明细所对应的商品

``` 
<select id="findUserAndItemsResultMap" resultMap="UserAndItemsResultMap">
   SELECT
      orders.*,
      user.username,
      user.sex,
      user.address,
      orderdetail.id orderdetail_id,
      orderdetail.items_id,
      orderdetail.items_num,
      orderdetail.orders_id,
      items.name items_name,
      items.detail items_detail,
      items.price items_price
    FROM
      orders,
      user,
      orderdetail,
      items
    WHERE orders.user_id = user.id AND orderdetail.orders_id=orders.id AND orderdetail.items_id = items.id
</select>

<resultMap type="com.iot.mybatis.po.User" id="UserAndItemsResultMap">
    <!-- 用户信息 -->
    <id column="user_id" property="id"/>
    <result column="username" property="username"/>
    <result column="sex" property="sex"/>
    <result column="address" property="address"/>

    <!-- 订单信息
    一个用户对应多个订单，使用collection映射
     -->
    <collection property="ordersList" ofType="com.iot.mybatis.po.Orders">
        <id column="id" property="id"/>
        <result column="user_id" property="userId"/>
        <result column="number" property="number"/>
        <result column="createtime" property="createtime"/>
        <result column="note" property="note"/>

        <!-- 订单明细
         一个订单包括 多个明细
         -->
        <collection property="orderdetails" ofType="com.iot.mybatis.po.Orderdetail">
            <id column="orderdetail_id" property="id"/>
            <result column="items_id" property="itemsId"/>
            <result column="items_num" property="itemsNum"/>
            <result column="orders_id" property="ordersId"/>

            <!-- 商品信息
             一个订单明细对应一个商品
             -->
            <association property="items" javaType="com.iot.mybatis.po.Items">
                <id column="items_id" property="id"/>
                <result column="items_name" property="name"/>
                <result column="items_detail" property="detail"/>
                <result column="items_price" property="price"/>
            </association>

        </collection>

    </collection>
</resultMap>
```

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


### 懒加载

### 参考资料
- [mybatis学习笔记](http://blog.csdn.net/h3243212/article/details/50756622)
- [mybatis官网](http://www.mybatis.org/mybatis-3/zh/index.html)
- [mybatis延迟加载](https://blog.csdn.net/mwj_88/article/details/50295131)