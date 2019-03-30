---
title: mysql基础
date: 2017-12-07 10:49:21
tags: mysql
categories: mysql
---
### 数据类型
创建mysql数据表的时候，通常会指定类型和长度，那么到底代表什么意思呢，每种类型最大长度又是多少，经过我的查阅资料和实验，把结果记录一下

#### tinyint、smallint等整型
对于tinyint、smallint、mediumint、int、bigint等指定长度是没有意义的，后面那个length只是影响显示字符的个数，比如int(10)，如果不足十位会补足0(zerofill)，如果超过了宽度则不受此限制。

#### float,double,decimal等实数
值得注意的是decimal(十六个字节)一般用于精度高的存储，decimal(4,1)指的是一共四位，小数点后1位，如果插入1234，则显示999.9

长度表：

| type |  length | 
|-----|---------|
| tinyint | 1 字节 | 
| smallint | 2 字节 |
| mediumint | 3 字节 |
| int   | 4 字节 |
| bigint | 8 字节 |
| float(length, decimals) | 4 字节 |
| double (length, decimals)| 8 字节 |
| decimal (length, decimals) | 16 字节 |

#### 日期和时间类型
timestamp比datatime空间效率更高

| type |  length | description |
|-----|---------|--------------|
| date | 3 字节 | YYYY-MM-DD 格式|
| time | 3 字节 | HH:MM:SS 格式|
| datetime | 8 字节 | YYYY-MM-DD HH:MM:SS |
| TIMESTAMP | 4 字节 | YYYYMMDDHHMMSS |

> 注：一般 mysql 的每个表都会设置两个 datatime 的字段： gmtCreate(创建时间)、gmtModified(更新时间)。 默认值是 mysql 函数 : CURRENT_TIMESTAMP。 并且 gmtModified 根据当前时间更新

#### char和varchar

对于char来说，长度是固定的，最大为255字符，最大长度=255*每个字符占用的字节数，由编码来决定的。

对于varchar来说，长度不是固定的，最大长度为65535个字节，但是varchar需要用额外的字节来存储长度信息，小于255时一个字节来存储，大于255需要两个字节。varchar(length)这个length实际上是字符数，最大长度也是根据编码来决定的，比如utf8一个字符占三个字节，那么varchar的最大长度=65535/3约为21485个字符。

但是！！！！varchar的最大长度可不是这么算的，干货来了！

mysql有个限制规则
##### 限制规则
- 存储限制：varchar 字段是将实际内容单独存储在聚簇索引之外，内容开头用1到2个字节表示实际长度（长度超过255时需要2个字节），因此最大长度不能超过65535
- 编码长度限制：
    - 字符类型若为gbk，每个字符最多占2个字节，最大长度不能超过32766;
    - 字符类型若为utf8，每个字符最多占3个字节，最大长度不能超过21845  
 若定义的时候超过上述限制，则varchar字段会被强行转为text类型，并产生warning
 
- 行长度限制

导致实际应用中varchar长度限制的是一个行定义的长度。 MySQL要求一个行的定义长度不能超过65535。

举个例子：
``` 
create table t4(c int, c2 char(30), c3 varchar(N)) charset=utf8;
```
此刻N =  (65535-1-2-4-30*3)/3=21812

减1的原因是实际行存储从第二个字节开始’;

减2的原因是varchar头部的2个字节表示长度;

减的4原因是字符编码是int占4个字节。

减30*3的原因是char(30)占90个字节

除3的原因是utf8一个字符占三个字节


### 索引

mysql主要有以下索引类型：
1. 普通索引
2. 唯一索引
3. 主键索引
4. 组合索引
5. 全文索引

创建方式

``` 
CREATE TABLE table_name[col_name data type]
[unique|fulltext][index|key][index_name](col_name[length])[asc|desc]
```

#### 普通索引
最基本的索引，没有任何限制


1.创建索引
``` 
CREATE INDEX index_name ON table(column(length))
```
2.删除索引
``` 
DROP INDEX index_name ON table
```

#### 唯一索引
索引列的值必须唯一，但允许有空值。如果是组合索引，则列值的组合必须唯一

1.创建索引
``` 
CREATE UNIQUE INDEX indexName ON table(column(length))
```

#### 主键索引
一个表只能有一个主键，不允许有空值,一般是建表的时候创建的
``` 
CREATE TABLE `table` (
    `id` int(11) NOT NULL AUTO_INCREMENT ,
    `title` char(255) NOT NULL ,
    PRIMARY KEY (`id`)
);
```

#### 组合索引
``` 
ALTER TABLE `table` ADD INDEX name_city_age (name,city,age); 
```
***mysql执行查询中，只会使用到一个索引***  
>最左前缀：意思是使用组合索引的时候，从左到右依次匹配，否则不会使用组合索引。  
例如`ALTER TABLE people ADD INDEX lname_fname_age (lame,fname,age); `其实我们是建立了三个索引，分别是：单列索引lame，组合索引（lame，fname），组合索引（lame，fname，age），mysql索引的时候只会使用其中一个索引。所以创建组合索引的时候，尽量把使用频繁的放在左边

#### 全文索引
主要用来查找文本中的关键字，而不是直接与索引中的值相比较。fulltext索引跟其它索引大不相同，它更像是一个搜索引擎，而不是简单的where语句的参数匹配。fulltext索引配合match against操作使用，而不是一般的where语句加like。它可以在create table，alter table ，create index使用，不过目前只有char、varchar，text 列上可以创建全文索引。值得一提的是，在数据量较大时候，现将数据放入一个没有全局索引的表中，然后再用CREATE index创建fulltext索引，要比先为一张表建立fulltext然后再将数据写入的速度快很多

``` 
CREATE FULLTEXT INDEX index_content ON article(content)
```

#### 索引创建的原则和注意事项
1. 最适合创建索引的是出现在where子句中的列或是出现在连接子句中的列
2. 对字符串类型进行索引的时候，应该指定一个前缀长度，比如索引前多少个字符  
3. 根据业务情况创建组合索引（比如某个业务需要查询两个列）
4. 组合索引遵循前缀原则（最左前缀原则）TODO  
5. like查询，%不能在前，可以使用全文检索引擎

>例如： where name like '%wang%'，查询姓名中有wang的，此时索引不会生效，还是会全表扫描，因为前面有个%，如果是like 'wang%'这样会使用到索引，但是没有前缀匹配了，如果想达到索引的效果，可以使用全文检索引擎，例如es（Elasticsearch）

6.如果mysql觉得全表扫描比索引扫描快，他会自动放弃使用索引

7.mysql查询只使用一个索引，如果where子句中使用了索引，那么order by中的列是不会使用索引的

8.列中包含null值是不会使用索引的，如果column_name is null还是会使用索引，但是建表的时候尽量设置一个非null的默认值。


### 参考资料
- [varchar最大长度的计算](http://www.voidcn.com/article/p-qbqrcutb-kq.html)
- 高性能MySQL
- [mysql索引原理以及慢查询](https://tech.meituan.com/mysql-index.html)
- [mysql索引类型](http://www.cnblogs.com/luyucheng/p/6289714.html)
