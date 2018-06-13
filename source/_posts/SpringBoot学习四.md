---
title: SpringBoot(数据储存)
date: 2018-01-09 23:34:12
tags: springboot
categories: spring
---
### jdbcTemplate
在Spring Boot基础下配置数据源和通过JdbcTemplate编写数据访问的示例

#### 添加依赖
``` 
// spring-boot-starter-jdbc依赖跟mysql依赖
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-jdbc</artifactId>
</dependency>
<dependency>
    <groupId>mysql</groupId>
    <artifactId>mysql-connector-java</artifactId>
</dependency>

// 这里使用阿里系库连接池
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>druid</artifactId>
    <version>1.0.19</version>
</dependency>
```

#### 配置链接信息
- application.yml:
``` 
#### 数据库连接信息
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/spring?useUnicode=true&characterEncoding=utf-8
    username: root
    password: root123
    driver-class-name: com.mysql.jdbc.Driver

#### druid配置
druid:
  initialSize: 3
  minIdle: 3
  maxActive: 19
  minEvictableIdleTimeMillis: 30000
  testWhileIdle: true
  testOnBorrow: false
  testOnReturn: false
  timeBetweenEvictionRunsMillis: 60000
  maxWait: 60000
```
- Durid配置(基于java Code)：
``` 
@Configuration
public class DataSourceConfig {
    @Value("${spring.datasource.url}")
    private String dbUrl;
    @Value("${spring.datasource.username}")
    private String username;
    @Value("${spring.datasource.password}")
    private String password;
    @Value("${spring.datasource.driver-class-name}")
    private String driverClassName;
    @Value("${druid.initialSize}")
    private int initialSize;
    @Value("${druid.minIdle}")
    private int minIdle;
    @Value("${druid.maxActive}")
    private int maxActive;
    @Value("${druid.minEvictableIdleTimeMillis}")
    private int minEvictableIdleTimeMillis;
    @Value("${druid.testWhileIdle}")
    private boolean testWhileIdle;
    @Value("${druid.testOnBorrow}")
    private boolean testOnBorrow;
    @Value("${druid.testOnReturn}")
    private boolean testOnReturn;
    @Value("${druid.timeBetweenEvictionRunsMillis}")
    private int timeBetweenEvictionRunsMillis;
    @Value("${druid.maxWait}")
    private int maxWait;

    @Bean
    public DataSource dataSource() {
        DruidDataSource dataSource = new DruidDataSource();
        dataSource.setUrl(dbUrl);
        dataSource.setUsername(username);
        dataSource.setPassword(password);
        dataSource.setDriverClassName(driverClassName);
        dataSource.setInitialSize(initialSize);
        dataSource.setMinIdle(minIdle);
        dataSource.setMaxActive(maxActive);
        dataSource.setMaxWait(maxWait);
        dataSource.setTimeBetweenEvictionRunsMillis(timeBetweenEvictionRunsMillis);
        dataSource.setMinEvictableIdleTimeMillis(minEvictableIdleTimeMillis);
        dataSource.setTestWhileIdle(testWhileIdle);
        dataSource.setTestOnBorrow(testOnBorrow);
        dataSource.setTestOnReturn(testOnReturn);
        return dataSource;
    }
}
```

#### 开始使用jdbcTemplate
这里只展示dao层怎么使用
- 定义dao
``` 
public interface LearnDao {
    int add(LearnResouce learnResouce);
    int update(LearnResouce learnResouce);
    int deleteByIds(String ids);
    LearnResouce queryLearnResouceById(Long id);
    Page queryLearnResouceList(Map<String,Object> params);
}
```
- 实现类注入jdbcTemplate，下面实现了jdbcTemplate的几个基本操作
``` 
@Repository
public class LearnDaoImpl implements LearnDao {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Override
    public int add(LearnResource learnResouce) {
        return jdbcTemplate.update("insert into learn_resource(author, title,url) values(?, ?, ?)",learnResouce.getAuthor(),learnResouce.getTitle(),learnResouce.getUrl());
    }

    @Override
    public int update(LearnResource learnResouce) {
        return jdbcTemplate.update("update learn_resource set author=?,title=?,url=? where id = ?",new Object[]{learnResouce.getAuthor(),learnResouce.getTitle(),learnResouce.getUrl(),learnResouce.getId()});
    }

    @Override
    public int deleteByIds(String ids){
        return jdbcTemplate.update("delete from learn_resource where id in("+ids+")");
    }

    @Override
    public LearnResource queryLearnResouceById(Long id) {
        List<LearnResource> list = jdbcTemplate.query("select * from learn_resource where id = ?", new Object[]{id}, new BeanPropertyRowMapper(LearnResource.class));
        if(null != list && list.size()>0){
            LearnResource learnResouce = list.get(0);
            return learnResouce;
        }else{
            return null;
        }
    }

    @Override
    public Page queryLearnResouceList(Map<String,Object> params) {
        StringBuffer sql =new StringBuffer();
        sql.append("select * from learn_resource where 1=1");
        if(!StringUtil.isNull((String)params.get("author"))){
            sql.append(" and author like '%").append((String)params.get("author")).append("%'");
        }
        if(!StringUtil.isNull((String)params.get("title"))){
            sql.append(" and title like '%").append((String)params.get("title")).append("%'");
        }
        Page page = new Page(sql.toString(), Integer.parseInt(params.get("page").toString()), Integer.parseInt(params.get("rows").toString()), jdbcTemplate);
        return page;
    }
}
```

#### 总结
可以看出jdbcTemplate是对jdbc操作的一个封装，Spring Boot中使用起来也很简单，对于不太复杂的业务逻辑，可以使用jdbcTemplate

### 使用Mybatis

#### 配置
引入依赖
``` 
<dependency>
    <groupId>org.mybatis.spring.boot</groupId>
    <artifactId>mybatis-spring-boot-starter</artifactId>
    <version>1.3.0</version>
</dependency>
```
数据库连接配置与jdbcTemplate一样，就不重复了

#### 注解方法
Mybatis注解的方式很简单，只要定义一个dao接口，然后sql语句通过注解写在接口方法上。最后给这个接口添加@Mapper注解或者在启动类上添加@MapperScan(“com.dudu.dao”)注解就行。建议使用在启动类添加@MapperScan("packagePath")方式，这样就不用每个都加上@Mapper了
``` 
@Component
@Mapper
public interface LearnMapper {
    @Insert("insert into learn_resource(author, title,url) values(#{author},#{title},#{url})")
    int add(LearnResouce learnResouce);

    @Update("update learn_resource set author=#{author},title=#{title},url=#{url} where id = #{id}")
    int update(LearnResouce learnResouce);

    @DeleteProvider(type = LearnSqlBuilder.class, method = "deleteByids")
    int deleteByIds(@Param("ids") String[] ids);


    @Select("select * from learn_resource where id = #{id}")
    @Results(id = "learnMap", value = {
            @Result(column = "id", property = "id", javaType = Long.class),
            @Result(property = "author", column = "author", javaType = String.class),
            @Result(property = "title", column = "title", javaType = String.class)
    })
    LearnResouce queryLearnResouceById(@Param("id") Long id);

    @SelectProvider(type = LearnSqlBuilder.class, method = "queryLearnResouceByParams")
    List<LearnResouce> queryLearnResouceList(Map<String, Object> params);

    class LearnSqlBuilder {
        public String queryLearnResouceByParams(final Map<String, Object> params) {
            StringBuffer sql =new StringBuffer();
            sql.append("select * from learn_resource where 1=1");
            if(!StringUtil.isNull((String)params.get("author"))){
                sql.append(" and author like '%").append((String)params.get("author")).append("%'");
            }
            if(!StringUtil.isNull((String)params.get("title"))){
                sql.append(" and title like '%").append((String)params.get("title")).append("%'");
            }
            System.out.println("查询sql=="+sql.toString());
            return sql.toString();
        }

        //删除的方法
        public String deleteByids(@Param("ids") final String[] ids){
            StringBuffer sql =new StringBuffer();
            sql.append("DELETE FROM learn_resource WHERE id in(");
            for (int i=0;i<ids.length;i++){
                if(i==ids.length-1){
                    sql.append(ids[i]);
                }else{
                    sql.append(ids[i]).append(",");
                }
            }
            sql.append(")");
            return sql.toString();
        }
    }
}
```
简单的语句只需要使用@Insert、@Update、@Delete、@Select这4个注解即可，但是有些复杂点需要动态SQL语句，就比如上面方法中根据查询条件是否有值来动态添加sql的，就需要使用@InsertProvider、@UpdateProvider、@DeleteProvider、@SelectProvider等注解。

#### xml方式
application.properties指定基础配置文件和实体类映射文件的地址
``` 
#指定bean所在包
mybatis.type-aliases-package=com.dudu.domain
#指定映射文件
mybatis.mapperLocations=classpath:mapper/*.xml

```


编写dao接口，无需具体实现类
``` 
package com.dudu.dao;
@Mapper
public interface LearnMapper {
    int add(LearnResouce learnResouce);
    int update(LearnResouce learnResouce);
    int deleteByIds(String[] ids);
    LearnResouce queryLearnResouceById(Long id);
    public List<LearnResouce> queryLearnResouceList(Map<String, Object> params);
}
```
mapper标签的namespace属性对应dao映射，指向LearnMapper
``` 
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.dudu.dao.LearnMapper">
  <resultMap id="baseResultMap" type="com.dudu.domain.LearnResouce">
    <id column="id" property="id" jdbcType="BIGINT"  />
    <result column="author" property="author" jdbcType="VARCHAR"/>
    <result column="title" property="title" jdbcType="VARCHAR"/>
    <result column="url" property="url" jdbcType="VARCHAR"/>
  </resultMap>

  <sql id="baseColumnList" >
    id, author, title,url
  </sql>

  <select id="queryLearnResouceList" resultMap="baseResultMap" parameterType="java.util.HashMap">
    select
    <include refid="baseColumnList" />
    from learn_resource
    <where>
      1 = 1
      <if test="author!= null and author !=''">
        AND author like CONCAT(CONCAT('%',#{author,jdbcType=VARCHAR}),'%')
      </if>
      <if test="title != null and title !=''">
        AND title like  CONCAT(CONCAT('%',#{title,jdbcType=VARCHAR}),'%')
      </if>

    </where>
  </select>

  <select id="queryLearnResouceById"  resultMap="baseResultMap" parameterType="java.lang.Long">
    SELECT
    <include refid="baseColumnList" />
    FROM learn_resource
    WHERE id = #{id}
  </select>

  <insert id="add" parameterType="com.dudu.domain.LearnResouce" >
    INSERT INTO learn_resource (author, title,url) VALUES (#{author}, #{title}, #{url})
  </insert>

  <update id="update" parameterType="com.dudu.domain.LearnResouce" >
    UPDATE learn_resource SET author = #{author},title = #{title},url = #{url} WHERE id = #{id}
  </update>

  <delete id="deleteByIds" parameterType="java.lang.String" >
    DELETE FROM learn_resource WHERE id in
    <foreach item="idItem" collection="array" open="(" separator="," close=")">
      #{idItem}
    </foreach>
  </delete>
</mapper>
```


### Mybatis通用mapper插件

### 参考资料
- [spring boot集成jdbcTemplate](http://tengj.top/2017/04/24/springboot0/)
- [如何优雅的使用mybatis](http://www.ityouknow.com/springboot/2016/11/06/springboot(%E5%85%AD)-%E5%A6%82%E4%BD%95%E4%BC%98%E9%9B%85%E7%9A%84%E4%BD%BF%E7%94%A8mybatis.html)

