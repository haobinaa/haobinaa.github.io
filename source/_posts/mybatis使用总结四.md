---
title: mybatis使用(懒加载)
date: 2017-12-18 16:06:56
tags: mybatis
categories: spring
---
### 懒加载(lazy load)

在映射查询的时候需要联表，单表查询的速度显然是高于多表查询的，联表查询的时候就可以使用懒加载(lazy load)：先从单表查询，需要时才关联表查询。

例子：查询订单时需要关联订单用户的信息，如果先查询订单的信息，需要查询用户信息的时候才查询用户信息

#### association实现懒加载

1.查询订单使用懒加载
``` 
<select id="findOrdersUserLazyLoading" resultMap="OrdersUserLazyLoadingResultMap">
    SELECT * FROM orders
</select>
```
2.查询用互信息的select
``` 
<select id="findUserById" parameterType="int" resultType="com.iot.mybatis.po.User">
    SELECT * FROM  user  WHERE id=#{value}
</select>
```
3.配置resultMap，先执行`findOrdersUserLazyLoading`需要用户信息时在执行`findUserById`
``` 
<resultMap type="com.iot.mybatis.po.Orders" id="OrdersUserLazyLoadingResultMap">
    <!--对订单信息进行映射配置  -->
    <id column="id" property="id"/>
    <result column="user_id" property="userId"/>
    <result column="number" property="number"/>
    <result column="createtime" property="createtime"/>
    <result column="note" property="note"/>
    <!-- 实现对用户信息进行懒加载
    select：指定懒加载需要执行的statement的id（是根据user_id查询用户信息的statement）
    要使用userMapper.xml中findUserById完成根据用户id(user_id)用户信息的查
    询，如果findUserById不在本mapper中需要前边加namespace
    column：订单信息中关联用户信息查询的列，是user_id
    关联查询的sql理解为：
    SELECT orders.*,
    (SELECT username FROM USER WHERE orders.user_id = user.id)username,
    (SELECT sex FROM USER WHERE orders.user_id = user.id)sex
     FROM orders
     -->
    <association property="user"  javaType="com.iot.mybatis.po.User"
                 select="com.iot.mybatis.mapper.UserMapper.findUserById"
                 column="user_id">
     <!-- 实现对用户信息进行懒加载 -->

    </association>

</resultMap>
```
可以看到与非懒加载的区别就是`association`标签中多了`select`和`column`

### 调试和确认配置成功

#### 运行思路
先分析一下以上resultMap的运行思路:  
1. 首先执行findOrdersUserLazyLoading 
2. findOrdersUserLazyLoading只查出了orders表的单表信息
3. 程序去遍历查询出来的List，在程序中调用getUser的时候，执行懒加载
4. 调用UserMapper中的findUserById


代码如下:
``` 
@Test
public void testFindOrdersUserLazyLoading() throws Exception {
    SqlSession sqlSession = sqlSessionFactory.openSession();// 创建代理对象
    OrdersMapperCustom ordersMapperCustom = sqlSession
            .getMapper(OrdersMapperCustom.class);
    // 查询订单信息（单表）
    List<Orders> list = ordersMapperCustom.findOrdersUserLazyLoading();

    // 遍历上边的订单列表
    for (Orders orders : list) {
        // 执行getUser()去查询用户信息，这里实现按需加载
        User user = orders.getUser();
        System.out.println(user);
    }
}
```
#### 懒加载配置

| 选项        |   描述      |  值        | 默认值       |
|-------------|------------|------------|-------------|
| lazyLoadingEnabled | 全局性设置懒加载。如果设为‘false’，则所有相关联的都会被初始化加载| true/false | false|
|aggressiveLazyLoading | 当设置为‘true’的时候，懒加载的对象可能被任何懒属性全部加载。否则，每个属性都按需加载。 | true/false | true |

配置如下:
``` 
<settings>
    <!-- 打开延迟加载 的开关 -->
    <setting name="lazyLoadingEnabled" value="true"/>
    <!-- 将积极加载改为消极加载即按需要加载 -->
    <setting name="aggressiveLazyLoading" value="false"/>
</settings>
```