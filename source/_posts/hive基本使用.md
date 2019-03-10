---
title: hive基本使用
date: 2019-03-08 17:48:51
tags: hive
categories: bigdata
---

由于最近项目需要和大数据对接，需要了解一下数仓的基本知识，所以记录一下hive的基础原理和使用




### hive简介

>Hive是一种用类SQL语句来协助读写、管理那些存储在分布式存储系统上大数据集的数据仓库软件

hive的特点:
- 通过类SQL来分析大数据，而避免了写MapReduce程序来分析数据，这样使得分析数据更容易
- 数据是存储在HDFS上的，Hive本身并不提供数据的存储功能
- Hive是将数据映射成数据库和一张张的表，库和表的元数据信息一般存在关系型数据库上（比如MySQL）
- 数据存储方面：它能够存储很大的数据集，并且对数据完整性、格式要求并不严格
- 数据处理方面：因为Hive语句最终会生成MapReduce任务去计算，所以不适用于实时计算的场景，它适用于离线分析

### 整体架构

![](/images/bigdata/hive-arch.jpg)

#### 驱动引擎

Hive的核心是驱动引擎，驱动引擎由四部分组成：
- 解释器：解释器的作用是将HiveSQL语句转换为语法树（AST）
- 编译器：编译器是将语法树编译为逻辑执行计划
- 优化器：优化器是对逻辑执行计划进行优化
- 执行器：执行器是调用底层的运行框架执行逻辑执行计划

#### 底层存储和执行流程

Hive的数据是存储在HDFS上的。Hive中的库和表可以看作是对HDFS上数据做的一个映射。所以Hive必须是运行在一个Hadoop集群上的

Hive中的执行器，是将最终要执行的MapReduce程序放到YARN上以一系列Job的方式去执行

#### Hive元数据的存储结构

Hive的元数据是一般是存储在MySQL这种关系型数据库上的，Hive和MySQL之间通过MetaStore服务交互

| 元数据项 |  说明  |
| ---------| ------|
| Owner |	库、表的所属者 |
|LastAccessTime |	最后修改时间 |
|Table Type |	表类型（内部表、外部表） |
| CreateTime | 创建时间 |
| Location |	存储位置 |

#### Hive客户端

Hive的客户端种类:
- cli命令行客户端：采用交互窗口，用hive命令行和Hive进行通信。
- HiveServer2客户端：用Thrift协议进行通信，Thrift是不同语言之间的转换器，是连接不同语言程序间的协议，通过JDBC或者ODBC去访问Hive
- HUE客户端：通过Web页面来和Hive进行交互，使用的比较多


#### Hive基本数据类型

Hive支持关系型数据中大多数基本数据类型，同时Hive中也有特有的三种复杂类型。

| 数据类型 | 长度   | 备注 | 
| ----- | --------- | ----------- | 
| Tinyint | 1字节的有符号整数 |     -128~127        |     
| SmallInt | 1个字节的有符号整数 |-32768~32767|         
|Int	| 4个字节的有符号整数	  |-2147483648 ~ 2147483647|
|BigInt	|8个字节的有符号整数	|   |
|Boolean|	布尔类型，true或者false	|true、false|
|Float	| 单精度浮点数	| |
|Double	|双精度浮点数| |	
|String	|字符串	 | |
|TimeStamp|	整数	支持Unix timestamp，可以达到纳秒精度| |
|Binary	|字节数组	    ||
|Date	 | 日期	0000-01-01 ~ 9999-12-31，常用String代替| |


### DDL操作(库和表的定义)

#### 库操作

创建一个数据库会在HDFS上创建一个目录，Hive里数据库的概念类似于程序中的命名空间，用数据库来组织表，在大量Hive的情况下，用数据库来分开可以避免表名冲突。Hive默认的数据库是default。

> hive> create database if not exists user_db;


Describe 命令来查看数据库定义，包括：数据库名称、数据库在HDFS目录、HDFS用户名称。

> hive> describe database user_db;    
 数据库名称  数据库在HDFS的目录  HDFS用户名称
 
 
 删除、切换数据库与mysql命令一样(drop、use)
 
 #### 创建表
 
 创建表一般有几种方式：
 - create table 方式
 - create table as select 方式：根据查询的结果自动创建表，并将查询结果数据插入新建的表中
 - create table like tablename1 方式：是克隆表，只复制tablename1表的结构
 
 ##### 外部表
 外部表是没有被hive完全控制的表，当表删除后，数据不会被删除。

``` 
hive> create external table iislog_ext (
    >  ip string,
    >  logtime string    
    > )
    > ;
```

##### 创建分区表

Hive查询一般是扫描整个目录，但是有时候我们关心的数据只是集中在某一部分数据上，比如我们一个Hive查询，往往是只是查询某一天的数据，这样的情况下，可以使用分区表来优化，一天是一个分区，查询时候，Hive只扫描指定天分区的数据

普通表和分区表的区别在于：一个Hive表在HDFS上是有一个对应的目录来存储数据，普通表的数据直接存储在这个目录下，而分区表数据存储时，是再划分子目录来存储的。一个分区一个子目录。主要作用是来优化查询性能。

例如:
``` 
--创建经销商操作日志表
create table user_action_log
(
companyId INT comment   '公司ID',
userid INT comment   '销售ID',
originalstring STRING comment   'url', 
host STRING comment   'host',
absolutepath STRING comment   '绝对路径',
query STRING comment   '参数串',
refurl STRING comment   '来源url',
clientip STRING comment   '客户端Ip',
cookiemd5 STRING comment   'cookiemd5',
timestamp STRING comment   '访问时间戳'
)
partitioned by (dt string)
row format delimited fields terminated by ','
stored as textfile;
```

这个日志表以dt字段分区，dt是个虚拟的字段，dt下并不存储数据，而是用来分区的，实际数据存储时，dt字段值相同的数据存入同一个子目录中，插入数据或者导入数据时，同一天的数据dt字段赋值一样，这样就实现了数据按dt日期分区存储。

当Hive查询数据时，如果指定了dt筛选条件，那么只需要到对应的分区下去检索数据即可，大大提高了效率。所以对于分区表查询时，尽量添加上分区字段的筛选条件

##### 创建桶表

桶表也是一种用于优化查询而设计的表类型。创建通表时，指定桶的个数、分桶的依据字段，hive就可以自动将数据分桶存储。查询时只需要遍历一个桶里的数据，或者遍历部分桶，这样就提高了查询效率。

例如:
``` 
------创建订单表
create table user_leads
(
leads_id string,
user_id string,
user_id string,
user_phone string,
user_name string,
create_time string
)
clustered by (user_id) sorted by(leads_id) into 10 buckets 
row format delimited fields terminated by '\t' 
stored as textfile;
```

- clustered by是指根据userid的值进行哈希后模除分桶个数，根据得到的结果，确定这行数据分入哪个桶中，这样的分法，可以确保相同userid的数据放入同一个桶中。而经销商的订单数据，大部分是根据user_id进行查询的。这样大部分情况下是只需要查询一个桶中的数据就可以了
- sorted by 是指定桶中的数据以哪个字段进行排序，排序的好处是，在join操作时能获得很高的效率
- into 10 buckets是指定一共分10个桶
- 在HDFS上存储时，一个桶存入一个文件中，这样根据user_id进行查询时，可以快速确定数据存在于哪个桶中，而只遍历一个桶可以提供查询效率

分桶表读写过程如下:
![](/images/bigdata/hive-buckets.jpg)

##### 其他表操作

- 查看表定义:`describe userinfo;`

- 查看表的详细信息:`describe formatted userinfo;`

- 修改表名:
``` 
describe formatted userinfo;
```

- 添加字段：
``` 
---在user_info表添加一个字段provinceid，int 类型
alter table user_info add columns (provinceid int );
```

- 修改字段：
``` 
alter table user_info replace columns (userid int,username string,cityid int,joindate date,provinceid int);
```
修改字段，只是修改了Hive表的元数据信息（元数据信息一般是存储在MySql中），并不对存在于HDFS中的表数据做修改。并不是所有的Hive表都可以修改字段，只有使用了native SerDe (序列化反序列化类型)的表才能修改字段

- 删除表:`drop table if exists user_info;`

### DML操作(数据操作)

#### 加载数据到Hive

##### 加载到普通表

可以将本地文本文件内容批量加载到Hive表中，要求文本文件中的格式和Hive表的定义一致，包括：字段个数、字段顺序、列分隔符都要一致。

例如:
```
load data local inpath '/home/hadoop/userinfodata.txt' overwrite into table user_info;
```
- local关键字表示源数据文件在本地，源文件可以在HDFS上，如果在HDFS上，则去掉local，inpath后面的路径是类似”hdfs://namenode:9000/user/datapath”这样的HDFS上文件的路径。
- overwrite关键字表示如果hive表中存在数据，就会覆盖掉原有的数据。如果省略overwrite，则默认是追加数据\


##### 加载到分区表

``` 
load data local inpath '/home/hadoop/actionlog.txt' overwrite into table user_action_log 
PARTITION (dt='2017-05-26');
```
将这批数据加载到dt为2017-05-26的分区中

##### 加载到分桶表

``` 
------先创建普通临时表
create table user_leads_tmp
(
leads_id string,
user_id string,
user_id string,
user_phone string,
user_name string,
create_time string
)
row format delimited fields terminated by ',' 
stored as textfile;
------数据载入临时表
load data local inpath '/home/hadoop/lead.txt' overwrite into table user_leads_tmp;
------导入分桶表
set hive.enforce.bucketing = true;
insert overwrite table user_leads select * from  user_leads_tmp;
```
`set hive.enforce.bucketing = true;`表明了启用分桶表

#### 导出数据
将hive数据导出到本地文件(也可导出到HDFS，将local关键字去掉即可)
``` 
insert overwrite local directory '/home/hadoop/user_info.bak2016-08-22 '
select * from user_info;
```

#### 插入数据

##### insert select导入

这里是将查询结果导入到表中，overwrite关键字是覆盖目标表中的原来数据。如果缺省，就是追加数据:
``` 
insert overwrite table user_leads select * from  user_leads_tmp;
```

如果插入数据的表是分区表，则需要加入dt
``` 
insert overwrite table user_leads PARTITION (dt='2017-05-26') 
select * from  user_leads_tmp;
```

hive每次查询都会将结果集遍历一遍，也可以将一个结果集插入多个表，提高效率:
```
from user_action_log
insert overwrite table log1 select companyid,originalstring  where companyid='100006'
insert overwrite table log2 select companyid,originalstring  where companyid='10002'
```

##### 复制表

复制表是将源表的结构和数据复制并创建为一个新表，复制过程中，可以对数据进行筛选，列可以进行删减。

对user_leads表进行复制备份，复制时筛选了2016-08-22以前的数据，减少几个列，并添加了一个bakdate列:
``` 
create table user_leads_bak
row format delimited fields terminated by '\t'
stored as textfile
as
select leads_id,user_id,'2016-08-22' as bakdate
from user_leads
where create_time<'2016-08-22';
```


##### 克隆表
克隆表时会克隆源表的所有元数据信息，但是不会复制源表的数据:
``` 
--克隆表user_leads，创建新表user_leads_like
create table user_leads_like like  user_leads;
```

##### 备份表
备份是将表的元数据和数据都导出到HDFS上:
``` 
export table user_action_log partition (dt='2016-08-19')
to '/user/hive/action_log.export'
```

### HQL语句

#### select查询

- 指定列
``` 
select * from user_leads;

select leads_id,user_id,create_time from user_leads;
select e.leads_id from user_leads e;
```

- 函数列, 函数可以是hive自带，也可以是用户自定位的
``` 
select companyid,upper(host),UUID(32) from user_action_log;
```

- 算数运算列，可以进行各种算数运算(加减乘除取模等)，运算结果做为结果列:
``` 
select companyid,userid, (companyid + userid) as sumint from useractionlog;
```

- 限制返回条数, 与mysql limit类似:
``` 
select * from user_action_log limit 100;
```

- Case When Then 条件判断语句:
``` 
---case when 两种写法
select case companyid when 0 then '未登录' else companyid end from user_action_log;

select case  when companyid=0 then '未登录' else companyid end from user_action_log;
```

#### where筛选

支持：=,<,>,<>(不等于),between and等于mysql类似。

还支持匹配操作，如Link, RLike

#### group by 分组

Hive不支持having语句，有对group by 后的结果进行筛选的需求，可以先将筛选条件放入group by的结果中，然后在包一层，在外边对条件进行筛选。

如mysql中类似`SELECT col1 FROM t1 GROUP BY col1 HAVING SUM(col2) > 10`,转换为hive中:
```` 
SELECT col1 FROM 
(SELECT col1, SUM(col2) AS col2sum
       FROM t1 GROUP BY col1
) t2
WHERE t2.col2sum > 10
````


### 参考资料
- [Hive快速入门](https://gitbook.cn/books/5924bd0523245b0aa3776b65/index.html)
- [Hive sql编译过程-美团点评](https://tech.meituan.com/2014/02/12/hive-sql-to-mapreduce.html)

    
