---
title: SpringBoot(JPA基础)
date: 2018-01-15 22:58:54
tags: springboot
categories: spring
---
### 概述
#### JPA
JPA(Java Persistence API)是Sun官方提出的Java持久化规范。它为Java开发人员提供了一种对象/关联映射工具来管理Java应用中的关系数据。他的出现主要是为了简化现有的持久化开发工作和整合ORM技术，结束现在Hibernate，TopLink，JDO等ORM框架各自为营的局面。值得注意的是，JPA是在充分吸收了现有Hibernate，TopLink，JDO等ORM框架的基础上发展而来的，具有易于使用，伸缩性强等优点。从目前的开发社区的反应上看，JPA受到了极大的支持和赞扬，其中就包括了Spring与EJB3.0的开发团队

注意:JPA是一套规范，不是一套产品，那么像Hibernate,TopLink,JDO他们是一套产品，如果说这些产品实现了这个JPA规范，那么我们就可以叫他们为JPA的实现产品。

#### spring data jpa
Spring Data JPA 是 Spring 基于 ORM 框架、JPA 规范的基础上封装的一套JPA应用框架，可使开发者用极简的代码即可实现对数据的访问和操作。

### 基本查询

#### 预先生成的方法
spring data jpa 默认预先生成了一些基本的CURD的方法，例如：增、删、改等等
``` 
public interface CustomerRepostory extends JpaRepository<Customer, Long> {
}
```
CustomerRepository继承了JpaRepository之后就拥有了CrudRepository、QueryByExampleExecutor、PagingAndSortingRepository的基本能力了，包括基本的增删改查都有了。

示例：
``` 
@RequestMapping("/add")
public void add() {
    Customer customer = new Customer("bin", "hao");
    this.customerRepostory.save(customer);
}

@RequestMapping(value = "/all")
public Object findAll() {
    return this.customerRepostory.findAll();
}

@RequestMapping(value = "/one")
public Object findOne() {
    // id是long
    return this.customerRepostory.findOne(1l);
}

@RequestMapping(value = "/delete")
public void delete() {
    this.customerRepostory.delete(1l);
}
```
#### 自定义简单查询

自定义的简单查询就是根据方法名来自动生成SQL，主要的语法是findXXBy,readXXBy,queryXXBy,countXXBy, getXXBy后面跟属性名称：
``` 
// 等于 `select * from user where user_name=${userName}`
User findByUserName(String userName);
```
也可以加一些关键字`And`、`Or`
``` 
User findByUserNameOrEmail(String username, String email);
```
修改、删除、统计也是类似语法
``` 
Long deleteById(Long id);

Long countByUserName(String userName)
```
基本上SQL体系中的关键词都可以使用，例如：LIKE、 IgnoreCase、 OrderBy
``` 
List<User> findByEmailLike(String email);

User findByUserNameIgnoreCase(String userName);
    
List<User> findByUserNameOrderByEmailDesc(String email);
```


具体的创建查询的命名如下：
![](http://springforall.ufile.ucloud.com.cn/static/img/a0af26b59b775a77cf5d5702ce0597a21515160)

#### 预定义查询(@NamedQuery)
还可以自己预定义查询方法


预定义查询有两种，一种是通过XML配置<named-query />或配置`@NamedQuery`，另一种是通过XML配置<named-native-query />或配置`@NamedNativeQuery`实现。这里演示annotation的方式

1.修改实体(Entity)

在`@Entity`下增加`@NamedQuery`定义，需要注意，这里的sql表达式里的表名要和当前的Entity一致，否则会找不到，报错！查询参数也要和实体进行对应起来，是firstName而不是first_name
``` 
@Entity
@NamedQuery(name="Customer.findByFirstName",query = "select c from Customer c where c.firstName = ?1")
public class Customer {
```
2.repository增加方法
``` 
Customer findByFirstName(String bauer);
```
3. 使用

这样就可以使用自定义的findByFirstName方法了

#### @Query

使用`@Quey`注解，使用注解有两种方式，一种是JPQL的SQL语言方式，一种是原生SQL的语言

使用示例：
``` 
   @Query("select c from Customer c where c.firstName=?1")
    Customer findByFirstName2(String bauer);

    @Query("select c from Customer c where c.lastName=?1 order by c.id desc")
    List<Customer> findByLastName2(String lastName);

    /**
     * 一个参数匹配两个字段
     * 这里Param的值和=:后面的参数匹配，但不需要和方法名对应的参数值对应
     */
    @Query("select c from Customer c where c.firstName=:name or c.lastName=:name  order by c.id desc")
    List<Customer> findByName(@Param("name") String name);

    /**
     * 这里的%只能放在占位的前面，后面不行
     */
    @Query("select c from Customer c where c.firstName like %?1")
    List<Customer> findByName2(@Param("name") String name);

    /**
     * 开启nativeQuery=true，在value里可以用原生SQL语句完成查询
     */
    @Query(nativeQuery = true,value = "select * from Customer c where c.first_name like concat('%' ,?1,'%') ")
    List<Customer> findByName3(String name);
```
？加数字表示占位符，？1代表在方法参数里的第一个参数，区别于其他的index，这里从1开始

=:加上变量名，这里是与方法参数中有@Param的值匹配的，而不是与实际参数匹配的

JPQL的语法中，表名的位置对应Entity的名称，字段对应Entity的属性,详细语法见相关文档

要使用原生SQL需要在@Query注解中设置nativeQuery=true，然后value变更为原生SQL即可

### 使用sort进行排序
1.在CustomerRepository内添加方法
``` 
@Query("select c from Customer c where c.firstName=:name or c.lastName=:name")
List<Customer> findByName4(@Param("name") String name, Sort sort);
```
2.测试使用
``` 
 //按照ID倒序排列
        System.out.println("直接创建sort对象，通过排序方法和属性名");
        Sort sort = new Sort(Sort.Direction.DESC,"id");
        List<Customer> result = this.customerRepostory.findByName4("san",sort);
        for (Customer customer:result){
            System.out.println(customer.toString());
        }
        System.out.println("-------------------------------------------");
        //按照ID倒序排列
        System.out.println("通过Sort.Order对象创建sort对象");
        Sort sortx = new Sort(new Sort.Order(Sort.Direction.DESC,"id"));
        List<Customer> resultx = this.customerRepostory.findByName4("zhang",sort);
        for (Customer customer:result){
            System.out.println(customer.toString());
        }
        System.out.println("-------------------------------------------");
        System.out.println("通过排序方法和属性List创建sort对象");
        List<String> sortProperties = new ArrayList<String>();
        sortProperties.add("id");
        sortProperties.add("firstName");
        Sort sort2 = new Sort(Sort.Direction.DESC,sortProperties);
        List<Customer> result2 = this.customerRepostory.findByName4("san",sort2);
        for (Customer customer:result2){
            System.out.println(customer.toString());
        }
        System.out.println("-------------------------------------------");

        System.out.println("通过创建Sort.Order对象的集合创建sort对象");
        List<Sort.Order> orders = new ArrayList<Sort.Order>();
        orders.add(new Sort.Order(Sort.Direction.DESC,"id"));
        orders.add(new Sort.Order(Sort.Direction.ASC,"firstName"));
        List<Customer> result3 = this.customerRepostory.findByName4("san",new Sort(orders));
        for (Customer customer:result3){
            System.out.println(customer.toString());
        }
        System.out.println("-------------------------------------------");
```
这四种排序：

1) 直接创建Sort对象，适合对单一属性做排序

2) 通过Sort.Order对象创建Sort对象，适合对单一属性做排序

3) 通过属性的List集合创建Sort对象，适合对多个属性，采取同一种排序方式的排序

4) 通过Sort.Order对象的List集合创建Sort对象，适合所有情况，比较容易设置排序方式

### Modifying queries(更新)
1.新增repositoy方法
``` 
/**
 * 根据lastName去更新firstName，返回结果是更改数据的行数
 * 使用@Modifying注解的时候，一定要加上事务注解@Transactional
 */
@Modifying//更新查询
@Transactional//开启事务
@Query("update Customer c set c.firstName = ?1 where c.lastName = ?2")
int setFixedFirstnameFor(String firstName, String lastName);
```
2. 调用repository

这里返回的是受影响的行数


### 分页
1.在repository定义分页查询
``` 
@QueryHints(value = { @QueryHint(name = HINT_COMMENT, value = "a query for pageable")})
@Query("select c from Customer c where c.firstName=:name or c.lastName=:name")
Page<Customer> findByName5(@Param("name") String name, Pageable pageable);
```
2.调用分页
``` 
//Pageable是接口，PageRequest是接口实现
//PageRequest的对象构造函数有多个，page是页数，初始值是0，size是查询结果的条数，后两个参数参考Sort对象的构造方法
Pageable pageable = new PageRequest(0,3, Sort.Direction.DESC,"id");
Page<Customer> page = this.customerRepostory.findByName5("san",pageable);
//查询结果总行数
System.out.println(page.getTotalElements());
//按照当前分页大小，总页数
System.out.println(page.getTotalPages());
//按照当前页数、分页大小，查出的分页结果集合
for (Customer customer: page.getContent()) {
    System.out.println(customer.toString());
}
```

#### 限制查询
有时候我们只需要查询前N个元素，或者支取前一个实体。
```
// 根据lastname升序，取第一 
User findFirstByOrderByLastnameAsc();

// 根据age降序，取第一个
User findTopByOrderByAgeDesc();

// 取前十条
Page<User> queryFirst10ByLastname(String lastname, Pageable pageable);

List<User> findFirst10ByLastname(String lastname, Sort sort);

List<User> findTop10ByLastname(String lastname, Pageable pageable);
```

### 投影 

在JPA的查询中，有一个不方便的地方，@Query注解，如果查询直接是Select C from Customer c,这时候，查询的返回对象就是Customer这个完整的对象，包含所有字段，对于我们的示例并没有什么问题，但是对于比较庞大的domain类，这个查询时就比较要命，并不是所有的字段都能用到，比较头疼。另外，如果定义select c.firstName as firstName,c.lastName as lastName from Customer c这个查询结果，返回的对象是Object类型，而且无法直接转换成Customer对象，这样用起来就不是很方便。
对于这种情况，JPA提供了一种声明方式来解决，即声明一个接口类，然后直接使用这个接口类接受返回的数据即可

1. 增加CustomerProjection接口
``` 
public interface CustomerProjection {
// 这里声明的方式是可以直接通过get+属性名，这是普通的，另外也可以通过@Value注解来实现指定字段
// 除了指定字段也可以做聚合展示，比如有些地方需要展示客户的全名，这里定义的getFullName()方法及注解@Value即完成这一操作。
// 需要注意这里的@Value中的target表达式写法及拼接方法。
    @Value("#{target.firstName + ' ' + target.lastName}")
    String getFullName();

    String getFirstName();

    String getLastName();
}
```
2.增加CustomerRepository方法
``` 
@Query("SELECT c.firstName as firstName,c.lastName as lastName from Customer  c")
Collection<CustomerProjection> findAllProjectedBy();
```
3.使用
``` 
public void findAllProjections(){
    Collection<CustomerProjection> projections = this.customerRepostory.findAllProjectedBy();
    System.out.println(projections);
    System.out.println(projections.size());
    for (CustomerProjection projection:projections){
        System.out.println("FullName:"+projection.getFullName());
        System.out.println("FirstName:"+projection.getFirstName());
        System.out.println("LastName:"+projection.getLastName());
    }
}
```

注意：

1. projection是一个声明式的接口

2. 包含要导出属性的getter，firstName属性的getter写成getFirstName，这样Spring Data框架才能根据约定正确取得属性

3. 在返回值中使用定义好的projection就会只返回projection定义的属性，不会返回所有

### 多表查询

多表查询在spring data jpa中有两种实现方式，第一种是利用hibernate的级联查询来实现，第二种是创建一个结果集的接口来接收连表查询后的结果，这里主要第二种方式

1.定义一个结果集的接口类
``` 
public interface HotelSummary {

	City getCity();

	String getName();

	Double getAverageRating();

	default Integer getAverageRatingRounded() {
		return getAverageRating() == null ? null : (int) Math.round(getAverageRating());
	}

}
```
2.查询的方法返回类型为新创建的接口
``` 
@Query("select h.city as city, h.name as name, avg(r.rating) as averageRating "
		- "from Hotel h left outer join h.reviews r where h.city = ?1 group by h")
Page<HotelSummary> findByCity(City city, Pageable pageable);

@Query("select h.name as name, avg(r.rating) as averageRating "
		- "from Hotel h left outer join h.reviews r  group by h")
Page<HotelSummary> findByCity(Pageable pageable);
```

### 参考资料
- [jpa基本配置](http://www.spring4all.com/article/459)
- [springboot JPA的使用](http://www.ityouknow.com/springboot/2016/08/20/springboot(%E4%BA%94)-spring-data-jpa%E7%9A%84%E4%BD%BF%E7%94%A8.html)
- [官方文档](https://docs.spring.io/spring-data/jpa/docs/current/reference/html)
- [jpql文档](http://www.blogjava.net/calmJava/archive/2011/04/01/347450.html)