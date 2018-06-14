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

#### mybatis配置使用
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

### sqlSession
- SqlSessionFactoryBuilder:  
通过SqlSessionFactoryBuilder创建会话工厂SqlSessionFactory将SqlSessionFactoryBuilder当成一个工具类使用即可，不需要使用单例管理SqlSessionFactoryBuilder。在需要创建SqlSessionFactory时候，只需要new一次SqlSessionFactoryBuilder即可
- SqlSessionFactory:   
通过SqlSessionFactory创建SqlSession，使用单例模式管理sqlSessionFactory（工厂一旦创建，使用一个实例）。将来mybatis和spring整合后，使用单例模式管理sqlSessionFactory
- SqlSession   
SqlSession是一个面向用户（程序员）的接口,提供了很多操作数据库的方法

mybatis是使用sqlSession来操作数据库的，比较两种方法：
#### 原始的dao
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

##### mapper.xml
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





### 参考资料
- [mybatis学习笔记](http://blog.csdn.net/h3243212/article/details/50756622)