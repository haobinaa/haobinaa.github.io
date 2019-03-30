---
title: mysql连接查询与分组查询
date: 2017-12-13 18:08:55
tags: mysql
categories: mysql
---
连表查询在项目中用的很频繁，今天在这里总结一下

假设两张表
user:       id      name        dept_id
dept:       id      dept_name



### 交叉连接(cross join)

交叉连接是一个笛卡尔积的结果，表1中每条数据都会跟表2中的数据联系起来。假t1有两条数据，t2有三条数据，那么 `select * from t1,t2`就会出现6条数据

### 内连接(inner join)

内连接返回两个表同时匹配的数据。(重点是同时满足)  
 
#### 等值连接  

`select * from t1 inner join t2 on t1.id = t2.id`,或者是`select * from t1,t2 where t1.id = t2.id`

#### 不等值连接
`select * from t1 inner join t2 on t1.id > t2.id`

#### 自连接
把一个表当做两个表来看，自己与自己做连接，常用的如同菜单的id和pid关系

`select * from menu t1 inner join menu t2 on t1.pid = t2.id`


通常可以把`inner join`简写成`join`

总结：内连接类似从笛卡尔积中返回符合条件的所有集合
### 外连接
外连接返回两个表中满足一个表的条件即可

#### 左连接(left [outer] join)
左连接返回左边表所有数据，如果右表没有满足条件的行则用null填充

`select * from t1 left join t2 on t1.id = t2.id`

t1的所有行都会匹配出来，t1中符合条件的记录会和t2中符合条件记录的将连接起来(即t1的id等于t2的id的记录)，t1中不符合条件的记录将会用null来连接

#### 右连接(left [outer] join)
与左连接相反，返回的数据将以右表为主，匹配不到的用null来连接


### 联合查询(union 和 union all)

语法：`select column_name from table1 union select column_name from table2`

加入有两个表
t1:

| t1id | t1str |
|------|-------|
| 1     | 1    |
|2      | 2     |
| 3     | 3     |

t2:

| t2id  |  t2str |
|-------|--------|
| 2     | a     |
| 3     |  b    |


`select * from t1 union select * from t2`

| t1id | t1str |
|-------|-------|
| 1     | 1     |
| 2     | 2     |
| 3     | 3     |
| 2     | a     |
| 3     | b     |

t1和t2的结果集被显示在了一起，默认以t1的字段为准，这里要注意：  
- 使用union查询的时候，两个语句查询出的字段数目必须要相同
- 查询的结果中两个语句重复的数据会被合成一条，如果要显示重复的记录，就需要使用 `union all`

### 全连接(full join)

我查了一下资料，mysql并不支持全连接(full join)这个功能，但是可以通过`left join`、`right join`、`union`实现全连接

还是上面例子的两个表t1、t2

`select * from t1 left join t2 on t1.t1id = t2.t2id`

| t1id | t1str | t2id | t2str |
|------|-------|------|-------|
| 1     | 1    |  null| null   |
|2      | 2     | 2    | a      |
| 3     | 3     | 3     |  b     |

`select * from t1 left join t2 on t1.t1id = t2.t2id`

| t1id | t1str | t2id | t2str |
|------|-------|------|-------|
|2      | 2     | 2    | a      |
| 3     | 3     | 3     |  b     |

实现全连接即把左右连接结合在一起:

``` 
select * from t1 left join t2 on t1.t1id = t2.t2id
union
select * from t1 left join t2 on t1.t1id = t2.t2id
```

| t1id | t1str | t2id | t2str |
|------|-------|------|-------|
| 1     | 1    |  null| null   |
|2      | 2     | 2    | a      |
| 3     | 3     | 3     |  b     |









#### 参考资料
- [mysql多表查询](http://www.zsythink.net/archives/1105)
- [mysql联表查询总结](http://www.jianshu.com/p/1d02f1e9aad1)