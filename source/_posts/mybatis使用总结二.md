---
title: mybatis映射文件(mapper xml文件)
date: 2017-12-12 22:50:24
tags: mybatis
categories: orm
---
读了mybatis官方文档，总结mapper.xml使用规则

### 基本使用

#### 增删改查
``` 
<select id="selectPerson" parameterType="int" resultType="hashmap">
  SELECT * FROM PERSON WHERE ID = #{id}
</select>

<insert id="insertAuthor">
  insert into Author (id,username,password,email,bio)
  values (#{id},#{username},#{password},#{email},#{bio})
</insert>

<update id="updateAuthor">
  update Author set
    username = #{username},
    password = #{password},
    email = #{email},
    bio = #{bio}
  where id = #{id}
</update>

<delete id="deleteAuthor">
  delete from Author where id = #{id}
</delete>
```
除了id之外，每种语句还有很多配置项可供选择，具体参考[官网](http://www.mybatis.org/mybatis-3/zh/sqlmap-xml.html)


#### 字符串替换
我们一般是使用`#{}`填入变量，这样mybatis会创建预处理语句，有时候并不想这样，仅仅是想传入一个不变的字符串，使用`${}`。这样做并不安全，会引起sql注入，尽量避免这样使用


### ResultMap
通常我们从结果集中映射出来的是使用`resultType`，resultType的底层其实也是转换成了resultMap，如果resultType指定了java bean，那么mybatis会创建一个resultMap基于属性名映射到java bean上，如果是默认的map，则列名和值会映射到一个hashmap上

如果列名没有完全匹配，则使用select的别名
``` 
<select id="selectUsers" resultType="User">
  select
    user_id             as "id",
    user_name           as "userName",
    hashed_password     as "hashedPassword"
  from some_table
  where id = #{id}
</select>
```
以上的resultType相当于resultMap这么写：
``` 
<resultMap id="userResultMap" type="User">
  <id property="id" column="user_id" />
  <result property="username" column="user_name"/>
  <result property="password" column="hashed_password"/>
</resultMap>

<select id="selectUsers" resultMap="userResultMap">
  select user_id, user_name, hashed_password
  from some_table
  where id = #{id}
</select>
```


resultMap有很多子元素：

#### id & result
``` 
<id property="id" column="post_id"/>
<result property="subject" column="post_subject"/>
```
id和result都映射一个列的值到某个字段，不同的是id用于一个对象实例的标识（类似于数据库的主键），对缓存和嵌入结果映射会有帮助

这两个都有一些属性：   
- property： 映射到列结果的字段或属性
- column： 从数据库中得到的列名
- javaType： 一个 Java 类的完全限定名,或一个类型别名

#### 构造方法
有些java bean需要用到构造方法来设置初始值，mybatis同样提供了映射的方法。

例如：
``` 
public class User {

   public User(Integer id, String username, int age) {

  }
}
```
要将结果映射到构造方法,三个形参分别是`Integer`、`int`、`String`
``` 
<constructor>
   <idArg column="id" javaType="int" name="id" />
   <arg column="age" javaType="_int" name="age" />
   <arg column="username" javaType="String" name="username" />
</constructor>
```

#### 关联
有时候，结果集有一个关联的关系，比如每个博客都会有一个用户，mybatis可以将查询出来的列映射到对应的属性上，比如Blog有个Author的属性:
``` 
<association property="author" column="blog_author_id" javaType="Author">
  <id property="id" column="author_id"/>
  <result property="username" column="author_username"/>
</association>
```
mybatis有两种加载关联的方式：

##### 关联的嵌套查询
- column: 来自数据库的类名,或重命名的列标签
- select: 另外一个映射语句的 ID

示例：
``` 
<resultMap id="blogResult" type="Blog">
  <association property="author" column="author_id" javaType="Author" select="selectAuthor"/>
</resultMap>

<select id="selectBlog" resultMap="blogResult">
  SELECT * FROM BLOG WHERE ID = #{id}
</select>

<select id="selectAuthor" resultType="Author">
  SELECT * FROM AUTHOR WHERE ID = #{id}
</select>
```
两个查询语句:一个来加载博客,另外一个来加载作者,而且博客的结果映射描 述了“selectAuthor”语句应该被用来加载它的 author 属性

##### 关联的嵌套结果
- resultMap: 这是结果映射的 ID,可以映射关联的嵌套结果到一个合适的对象图中
- columnPrefix: 当连接多表时，你将不得不使用列别名来避免ResultSet中的重复列名。指定columnPrefix允许你映射列名到一个外部的结果集中

简单的嵌套关联：
```
<select id="selectBlog" resultMap="blogResult">
  select
    B.id            as blog_id,
    B.title         as blog_title,
    B.author_id     as blog_author_id,
    A.id            as author_id,
    A.username      as author_username,
    A.password      as author_password,
    A.email         as author_email,
    A.bio           as author_bio
  from Blog B left outer join Author A on B.author_id = A.id
  where B.id = #{id}
</select>
```
查出每个博客文章的信息，并且每篇文章的作者，这个结果应该这样映射:
```   
<resultMap id="blogResult" type="Blog">
  <id property="id" column="blog_id" />
  <result property="title" column="blog_title"/>
  <association property="author" column="blog_author_id" javaType="Author" resultMap="authorResult"/>
</resultMap>

<resultMap id="authorResult" type="Author">
  <id property="id" column="author_id"/>
  <result property="username" column="author_username"/>
  <result property="password" column="author_password"/>
  <result property="email" column="author_email"/>
  <result property="bio" column="author_bio"/>
</resultMap
```
这个映射结果用authorResult来映射作者的实例

### 集合
如果说关联是把结果映射到某个java bean属性上，集合就是把结果映射到某个collection属性上
``` 
<collection property="posts" ofType="domain.blog.Post">
  <id property="id" column="post_id"/>
  <result property="subject" column="post_subject"/>
  <result property="body" column="post_body"/>
</collection>
```
这个结果可以映射到：
``` 
private List<Post> posts;
```

#### 集合的嵌套查询
``` 
<resultMap id="blogResult" type="Blog">
  // javaType和ofType确定了集合的类型，如下是个post的ArrayList
  <collection property="posts" javaType="ArrayList" column="id" ofType="Post" select="selectPostsForBlog"/>
</resultMap>

<select id="selectBlog" resultMap="blogResult">
  SELECT * FROM BLOG WHERE ID = #{id}
</select>

<select id="selectPostsForBlog" resultType="Post">
  SELECT * FROM POST WHERE BLOG_ID = #{id}
</select>
```
以上可以看出通过`javaType`和`ofType`让mybatis确定集合的类型，通常mybatis会根据查询结果自动判断`javaType`，所以也可以这样写`<collection property="posts" column="id" ofType="Post" select="selectPostsForBlog"/>`


### 缓存
mybatis提供了缓存功能，在sql映射文件加上一行`<cache/>`就好，这个缓存语句的效果是：  
- 映射语句文件中的所有 select 语句将会被缓存
- 映射语句文件中的所有 insert,update 和 delete 语句会刷新缓存
- 缓存会使用 Least Recently Used(LRU,最近最少使用的)算法来收回
- 根据时间表(比如 no Flush Interval,没有刷新间隔), 缓存不会以任何时间顺序 来刷新
- 缓存会存储列表集合或对象(无论查询方法返回什么)的 1024 个引用
- 缓存会被视为是 read/write(可读/可写)的缓存,意味着对象检索不是共享的,而 且可以安全地被调用者修改,而不干扰其他调用者或线程所做的潜在修改

以上都是默认的配置，还可以通过缓存元素的属性来修改：
``` 
<cache
  eviction="FIFO"
  flushInterval="60000"
  size="512"
  readOnly="true"/>
```
这个配置创建了一个 FIFO(先进先出) 缓存,并每隔 60 秒刷新,存数结果对象或列表的 512 个引用,而且返回的对象被认为是只读的,因此在不同线程中的调用者之间修改它们会导致冲突

#### 自定义缓存
mybatis还支持自定义的缓存类或第三方的缓存方案，类似：
``` 
<cache type="com.domain.something.MyCustomCache"/>
```
type的类必须继承于org.mybatis.cache.Cache接口