---
title: mysql优化概述
date: 2019-12-06 15:27:51
tags: mysql
categories: mysql
---

### MySQL参数设置

#### 通用配置

1. `max_connections` : MySQL能创建的最大连接数，如果数据库的并发量比较大，建议调高此值，以增加并行连接数量，当然连接数越多，由于MySQL会为每个连接创建连接缓冲区，连接数越多会消耗更多内存

2. `open_files_limit` : MySQL打开的文件描述符限制，默认最小1024

3. `key_buffer_size` : key_buffer_size指定索引缓冲区的大小，它决定索引处理的速度，尤其是索引读的速度。

4. `query_cache_size` : 使用查询缓冲，MySQL将查询结果存放在缓冲区中，今后对于同样的SELECT语句（区分大小写），将直接从缓冲区中读取结果。

5. `wait_timeout` : 一个请求的最大连接时间

#### InnoDB相关配置

1. sync_binlog

   `binlog`的刷新写入方式，这个参数不仅影响到`binlog`对MySQL所带来的性能损耗，而且还影响到MySQL中数据的完整性。参数设置说明如下：
   1).  `sync_binlog=0`
   当事务提交之后，MySQL不做fsync之类的磁盘同步指令刷新binlog_cache中的信息到磁盘，而让文件系统自行决定什么时候来做同步，或者cache满了之后才同步到磁盘。如果没刷新到磁盘前系统宕机，则会丢失最后的binlog内容，但是此参数性能最佳
   2).  `sync_binlog=n`
   当每进行n次事务提交之后，MySQL将进行一次fsync之类的磁盘同步指令来将binlog_cache中的数据强制写入磁盘。

   

2. innodb_flush_logs_at_trx_commit

   InnoDB事务日志（redo log）的刷新写入方式，这个参数对InnoDB的写入性能来说非常重要，有以下3种设置：
   
   1) `innodb_flush_logs_at_trx_commit=0`， 日志缓冲(`log buffer`)由后台线程每秒一次地被写到日志文件(这里可以理解成操作系统的`page cache`并没有落到磁盘上)，并且对日志文件做到磁盘操作的刷新。任何mysqld进程的崩溃会导致丢失一秒的事务数据
   
   2) `innodb_flush_logs_at_trx_commit=1`，在每个事务提交时，日志缓冲被写到日志文件，对日志文件做到磁盘操作的刷新。这是默认的值， 最安全的方式，但是速度最慢。
   3)  `innodb_flush_logs_at_trx_commit=2`，在每个事务提交时，日志缓冲被写到文件，但不对日志文件做到磁盘操作的刷新，操作系统来决定何时刷盘(`page cache`刷盘策略)。只有操作系统崩溃或掉电会丢失事务数据，不然不会丢失事务。
   
   
   
3. innodb_buffer_pool_size

   这是Innodb最重要的一个配置参数，这个参数控制Innodb本身的缓大小，也影响到，多少数据能在缓存中。建议该参数的配置在`物理内存的70％－80％`之间

4. innodb_log_file_size

   这个参数是设置 `redo log`大小。规则很简单:小日志文件写入慢，恢复快；大日志文件写入快，恢复慢。目前设置的是`128M`

   

### SQL性能分析



(1). 查看`mysql`系统状态，分析系统是否正常等:

```
#显示状态信息（扩展show status like ‘XXX’）
Mysql> show status;
#显示系统变量（扩展show variables like ‘XXX’）
Mysql> show variables\G;
#显示InnoDB存储引擎的状态
Mysql> show engine innodb status;
#查看当前SQL执行，包括执行状态、是否锁表等(当执行大SQL时，这个命令可以看到执行进度)
Mysql> show processlist ;
```



(2). 系统慢SQL记录，使用 `slowLog`记录，开启慢查询日志:

```
# 检查是否开启慢查询日志
show variables like '%slow%';
# 如果没有开启，也可以在运行时动态开启这个参数
set global slow_query_log=ON;
# 设置慢查询记录查询耗时多长的SQL,这里设置成100毫秒
set long_query_time = 0.1;
# 设置慢查询日志路径
set slow_query_log_file = /data/log/mysql/slow_query.log
```

这里在慢查询日志中找到了慢SQL后，就需要用执行计划来查看SQL语句是否命中索引，根据具体情况来优化SQL



### explain 执行计划分析

一条查询语句在经过`MySQL`查询优化器的各种基于成本和规则的优化会后生成一个`执行计划`，这个执行计划展示了接下来具体执行查询的方式，比如多表连接的顺序是什么，对于每个表采用什么访问方法来具体执行查询等等。大概使用如下:

```
mysql> EXPLAIN SELECT 1;
+----+-------------+-------+------------+------+---------------+------+---------+------+------+----------+----------------+
| id | select_type | table | partitions | type | possible_keys | key  | key_len | ref  | rows | filtered | Extra          |
+----+-------------+-------+------------+------+---------------+------+---------+------+------+----------+----------------+
|  1 | SIMPLE      | NULL  | NULL       | NULL | NULL          | NULL | NULL    | NULL | NULL |     NULL | No tables used |
+----+-------------+-------+------------+------+---------------+------+---------+------+------+----------+----------------+
```

每个列的作用:

| 列名          | 描述                                                       |
| ------------- | ---------------------------------------------------------- |
| id            | 在一个大的查询语句中每个`SELECT`关键字都对应一个唯一的`id` |
| select_type   | `SELECT`关键字对应的那个查询的类型                         |
| table         | 表名                                                       |
| partitions    | 分区信息                                                   |
| type          | 单表的访问方法                                             |
| possible_keys | 可能用到的索引                                             |
| key           | 实际用上的索引                                             |
| key_len       | 实际使用的索引的长度                                       |
| ref           | 当使用索引列等值查询时，与索引列进行等值匹配的对象信息     |
| rows          | 预估的需要读取的记录条数                                   |
| filtered      | 某个表经过搜索条件过滤后剩余记录条数的百分比               |
| Extra         | 额外提示信息                                               |



#### 执行计划各列详细信息

##### id

查询语句中每出现一个`SELECT`关键字，`MySQL`就会为它分配一个唯一的`id`值。通常简单的查询语句只还有一个`SELECT`关键字，但是有两种情况会出现多个`SELECT`关键字:

1. 包含子查询的情况:`SELECT * FROM s1 WHERE key1 IN (SELECT key3 FROM s2)`。这个查询语句就包含两个`SELECT`关键字
2. 包含`union`关键字: `SELECT * FROM s1  UNION SELECT * FROM s2`

针对于连接查询，一个`SELECT`关键字后边的`FROM`子句中可以跟随多个表，所以在连接查询的执行计划中，每个表都会对应一条记录，但是这些记录的id值都是相同的，比如：

``` 
mysql> EXPLAIN SELECT * FROM s1 INNER JOIN s2;
+----+-------------+-------+------------+------+---------------+------+---------+------+------+----------+---------------------------------------+
| id | select_type | table | partitions | type | possible_keys | key  | key_len | ref  | rows | filtered | Extra                                 |
+----+-------------+-------+------------+------+---------------+------+---------+------+------+----------+---------------------------------------+
|  1 | SIMPLE      | s1    | NULL       | ALL  | NULL          | NULL | NULL    | NULL | 9688 |   100.00 | NULL                                  |
|  1 | SIMPLE      | s2    | NULL       | ALL  | NULL          | NULL | NULL    | NULL | 9954 |   100.00 | Using join buffer (Block Nested Loop) |
+----+-------------+-------+------------+------+---------------+------+---------+------+------+----------+---------------------------------------+
```



对于包含子查询的查询语句来说，就可能涉及多个`SELECT`关键字，所以在包含子查询的查询语句的执行计划中，每个`SELECT`关键字都会对应一个唯一的`id`值，比如这样：

```
mysql> EXPLAIN SELECT * FROM s1 WHERE key1 IN (SELECT key1 FROM s2) OR key3 = 'a';
+----+-------------+-------+------------+-------+---------------+----------+---------+------+------+----------+-------------+
| id | select_type | table | partitions | type  | possible_keys | key      | key_len | ref  | rows | filtered | Extra       |
+----+-------------+-------+------------+-------+---------------+----------+---------+------+------+----------+-------------+
|  1 | PRIMARY     | s1    | NULL       | ALL   | idx_key3      | NULL     | NULL    | NULL | 9688 |   100.00 | Using where |
|  2 | SUBQUERY    | s2    | NULL       | index | idx_key1      | idx_key1 | 303     | NULL | 9954 |   100.00 | Using index |
+----+-------------+-------+------------+-------+---------------+----------+---------+------+------+----------+-------------+
```



##### select_type

每一个`SELECT`关键字代表的小查询都定义了一个称之为`select_type`的属性，代表着这个小查询在整个大查询中的查询类型，`select_type`的取值为:

| 名称               | 描述                                                         |
| ------------------ | ------------------------------------------------------------ |
| SIMPLE             | 查询语句中不包含`UNION`或者子查询                            |
| PRIMARY            | 对于包含`UNION`、`UNION ALL`或者子查询的大查询来说，它是由几个小查询组成的，其中最左边的那个查询的`select_type`值就是`PRIMARY`(顾名思义为主查询) |
| UNION              | 对于包含`UNION`或者`UNION ALL`的大查询来说，它是由几个小查询组成的，其中除了最左边的那个小查询以外，其余的小查询的`select_type`值就是`UNION` |
| UNION RESULT       | MySQL选择使用临时表来完成`UNION`查询的去重工作(UNION ALL)，针对该临时表的查询的`select_type`就是`UNION RESULT` |
| SUBQUERY           | 子查询的第一个SELECT(被物化，只执行一次)                     |
| DEPENDENT SUBQUERY | 子查询的第一个SELECT(可能会被执行多次，取决外层的查询)       |
| DEPENDENT UNION    | 在包含`UNION`或者`UNION ALL`的大查询中，如果各个小查询都依赖于外层查询的话，那除了最左边的那个小查询之外，其余的小查询的`select_type`的值就是`DEPENDENT UNION`。 |
| DERIVED            | 导出表的SELECT(FROM子句的子查询)                             |
| MATERIALIZED       |                                                              |



##### table

不论查询语句有多复杂，里面包含了多少个表，到最后也是需要对每个表进行单表访问的，`MySQL`EXPLAIN语句输出的每条记录都对应着某个单表的访问方法，该条记录的table列代表着该表的表名。假如一个连接查询，执行计划如下:

```
mysql> EXPLAIN SELECT * FROM s1 INNER JOIN s2;
+----+-------------+-------+------------+------+---------------+------+---------+------+------+----------+---------------------------------------+
| id | select_type | table | partitions | type | possible_keys | key  | key_len | ref  | rows | filtered | Extra                                 |
+----+-------------+-------+------------+------+---------------+------+---------+------+------+----------+---------------------------------------+
|  1 | SIMPLE      | s1    | NULL       | ALL  | NULL          | NULL | NULL    | NULL | 9688 |   100.00 | NULL                                  |
|  1 | SIMPLE      | s2    | NULL       | ALL  | NULL          | NULL | NULL    | NULL | 9954 |   100.00 | Using join buffer (Block Nested Loop) |
+----+-------------+-------+------------+------+---------------+------+---------+------+------+----------+---------------------------------------+
```



##### type

执行计划的一条记录就代表着`MySQL`对某个表的执行查询时的访问方法，其中的`type`列就表明了这个访问方法是什么。完整的访问方法依次从好到差如下：`system > const > eq_ref > ref > fulltext > ref_or_null > unique_subquery > index_subquery > range > index_merge > index > ALL`。

- `system` : 表中只有一条记录, 并且存储引擎的统计是精确的(如 Myisam，表结构会存储表中有多少条记录。 InnoDB只会存一个大概的值，并不精确)

- `const`:  根据主键或者唯一二级索引列(`unique`)与常数进行等值匹配。

  如`EXPLAIN SELECT * FROM s1 WHERE id = 5`, 一次就能匹配到

- `eq_ref`: 在连接查询时，如果被驱动表是通过主键或者唯一二级索引(`unique`)等值匹配的方式进行访问的，则对该被驱动表的访问方法就是`eq_ref`。如:

  ```
  mysql> EXPLAIN SELECT * FROM s1 INNER JOIN s2 ON s1.id = s2.id;
  +----+-------------+-------+------------+--------+---------------+---------+---------+-----------------+------+----------+-------+
  | id | select_type | table | partitions | type   | possible_keys | key     | key_len | ref             | rows | filtered | Extra |
  +----+-------------+-------+------------+--------+---------------+---------+---------+-----------------+------+----------+-------+
  |  1 | SIMPLE      | s1    | NULL       | ALL    | PRIMARY       | NULL    | NULL    | NULL            | 9688 |   100.00 | NULL  |
  |  1 | SIMPLE      | s2    | NULL       | eq_ref | PRIMARY       | PRIMARY | 4       | xiaohaizi.s1.id |    1 |   100.00 | NULL  |
  +----+-------------+-------+------------+--------+---------------+---------+---------+-----------------+------+----------+-------+
  ```

  从执行计划的结果中可以看出，`s1`作为驱动表，`s2`作为被驱动表，`s2`的访问方法是`eq_ref`表明在访问`s2`表的时候可以通过主键的等值匹配来进行访问

- `ref` : 当通过普通的二级索引列与常量进行等值匹配时来查询某个表，那么对该表的访问方法就可能是`ref`

- `fulltext`： 全文索引

- `ref_or_null`: 当对普通二级索引进行等值匹配查询，该索引列的值也可以是`NULL`值时，那么对该表的访问方法就可能是`ref_or_null`。如`EXPLAIN SELECT * FROM s1 WHERE key1 = 'a' OR key1 IS NULL`，该查询条件表明 key1 的取值可能是 null， 所以这个查询的 type 就是 `ref_or_null`

- `index_merge`:  一般情况下对于某个表的查询只能使用到一个索引，但在某些场景下可以使用`Intersection`、`Union`、`Sort-Union`这三种索引合并的方式来执行查询。

- `unique_subquery`:  类似于两表连接中被驱动表的`eq_ref`访问方法，`unique_subquery`是针对在一些包含`IN`子查询的查询语句中，如果查询优化器决定将`IN`子查询转换为`EXISTS`子查询，而且子查询可以使用到主键进行等值匹配的话，那么该子查询执行计划的`type`列的值就是`unique_subquery`。

- `index_subquery`: `index_subquery`与`unique_subquery`类似，只不过访问子查询中的表时使用的是普通的索引

- `range`: 如果使用索引获取某些`范围区间`的记录，那么就可能使用到`range`访问方法

- `index` : 当可以使用索引覆盖，但需要扫描全部的索引记录时，该表的访问方法就是`index`。

  如`EXPLAIN SELECT key_part2 FROM s1 WHERE key_part3 = 'a'`。上述查询中的搜索列表中只有`key_part2`一个列，而且搜索条件中也只有`key_part3`一个列，这两个列又恰好包含在`idx_key_part`这个索引中，可是搜索条件`key_part3`不能直接使用该索引进行`ref`或者`range`方式的访问，只能扫描整个`idx_key_part`索引的记录，所以查询计划的`type`列的值就是`index`。

- `ALL`: 全表扫描

  

##### possible key 和 key

`possible_keys`列表示在某个查询语句中，对某个表执行单表查询时可能用到的索引有哪些，`key`列表示实际用到的索引有哪些。



##### key_len

`key_len`列表示当优化器决定使用某个索引执行查询时，该索引记录的最大长度。计算方法如下:

- 对于使用固定长度类型的索引列来说，它实际占用的存储空间的最大长度就是该固定值，对于指定字符集的变长类型的索引列来说，比如某个索引列的类型是`VARCHAR(100)`，使用的字符集是`utf8`，那么该列实际占用的最大存储空间就是`100 × 3 = 300`个字节
- 如果该索引列可以存储`NULL`值，则`key_len`比不可以存储`NULL`值时多1个字节
- 对于变长字段来说，都会有2个字节的空间来存储该变长列的实际长度



##### ref

当使用索引列等值匹配的条件去执行查询时，也就是在访问方法是`const`、`eq_ref`、`ref`、`ref_or_null`、`unique_subquery`、`index_subquery`其中之一时，`ref`列展示的就是与索引列作等值匹配的是什么，比如只是一个常数或者是某个列。

一般情况下 `ref` 的值是`const`，代表与索引列作等值匹配的是常数。也有复杂一些的情况:

```
mysql> EXPLAIN SELECT * FROM s1 INNER JOIN s2 ON s1.id = s2.id;
+----+-------------+-------+------------+--------+---------------+---------+---------+-----------------+------+----------+-------+
| id | select_type | table | partitions | type   | possible_keys | key     | key_len | ref             | rows | filtered | Extra |
+----+-------------+-------+------------+--------+---------------+---------+---------+-----------------+------+----------+-------+
|  1 | SIMPLE      | s1    | NULL       | ALL    | PRIMARY       | NULL    | NULL    | NULL            | 9688 |   100.00 | NULL  |
|  1 | SIMPLE      | s2    | NULL       | eq_ref | PRIMARY       | PRIMARY | 4       | test.s1.id |    1 |   100.00 | NULL  |
+----+-------------+-------+------------+--------+---------------+---------+---------+-----------------+------+----------+-------+
```

可以看到对被驱动表`s2`的访问方法是`eq_ref`，而对应的`ref`列的值是`test.s1.id`，这说明在对被驱动表进行访问时会用到`PRIMARY`索引，也就是聚簇索引与一个列进行等值匹配的条件，于`s2`表的`id`作等值匹配的对象就是`test.s1.id`列（注意这里把数据库名也写出来了）。



##### rows

如果查询优化器决定使用全表扫描的方式对某个表执行查询时，执行计划的`rows`列就代表预计需要扫描的行数，如果使用索引来执行查询时，执行计划的`rows`列就代表预计扫描的索引记录行数。



##### filterd

连接查询的成本中有个`condition filtering`的概念，就是`MySQL`在计算驱动表扇出时采用的一个策略：

- 如果使用的是全表扫描的方式执行的单表查询，那么计算驱动表扇出时需要估计出满足搜索条件的记录到底有多少条。
- 如果使用的是索引执行的单表扫描，那么计算驱动表扇出的时候需要估计出满足除使用到对应索引的搜索条件外的其他搜索条件的记录有多少条。



##### extra

`Extra`列是用来说明一些额外信息的，我们可以通过这些额外信息来更准确的理解`MySQL`到底将如何执行给定的查询语句。常见的提示信息大概有:

- `Using index` : 查询列表以及搜索条件中只包含属于某个索引的列，也就是在可以使用索引覆盖，不需要回表。

- `Using index condition`:  有些搜索条件中虽然出现了索引列，但却不能使用到索引。

  比如`SELECT * FROM s1 WHERE key1 > 'z' AND key1 LIKE '%a'`。

  在原来的 MySQL 版本中(5.7一下)，执行步骤如下:

  1. 先根据`key1 > 'z'`这个条件，从二级索引`idx_key1`中获取到对应的二级索引记录
  2. 根据上一步骤得到的二级索引记录中的主键值进行回表，找到完整的用户记录再检测该记录是否符合`key1 LIKE '%a'`这个条件，将符合条件的记录加入到最后的结果集

  虽然`key1 LIKE '%a'`不能组成范围区间参与`range`访问方法的执行，但这个条件毕竟只涉及到了`key1`列，所以`MySQL`对上边的步骤进行了一下改进:

  1. 先根据`key1 > 'z'`这个条件，定位到二级索引`idx_key1`中对应的二级索引记录
  2. 对于指定的二级索引记录，先不着急回表，而是先检测一下该记录是否满足`key1 LIKE '%a'`这个条件，如果这个条件不满足，则该二级索引记录压根儿就没必要回表
  3. 对于满足`key1 LIKE '%a'`这个条件的二级索引记录执行回表操作

  回表操作其实是一个随机`IO`，比较耗时，所以上述修改虽然只改进了一点，但是可以省去很多回表操作的成本。`MySQL`这个改进称之为`索引条件下推`（`Index Condition Pushdown`）。

- `Using where` : 使用全表扫描来执行对某个表的查询，并且该语句的`WHERE`子句中有针对该表的搜索条件

- `Using filesort`: 排序操作无法使用到索引，只能在内存中（记录较少的时候）或者磁盘中（记录较多的时候）进行排序，`MySQL`中把这种在内存中或者磁盘上进行排序的方式统称为文件排序（`filesort`）。如果某个查询需要使用文件排序的方式执行查询，就会在执行计划的`Extra`列中显示`Using filesort`提示

- `Using join buffer (Block Nested Loop)`:  在连接查询执行过程中，当被驱动表不能有效的利用索引加快访问速度，`MySQL`一般会为其分配一块名叫`join buffer`的内存块来加快查询速度，也就是我们所讲的`基于块的嵌套循环算法`。

  比如以下语句:

  ```
  mysql> EXPLAIN SELECT * FROM s1 INNER JOIN s2 ON s1.common_field = s2.common_field;
  +----+-------------+-------+------------+------+---------------+------+---------+------+------+----------+----------------------------------------------------+
  | id | select_type | table | partitions | type | possible_keys | key  | key_len | ref  | rows | filtered | Extra                                              |
  +----+-------------+-------+------------+------+---------------+------+---------+------+------+----------+----------------------------------------------------+
  |  1 | SIMPLE      | s1    | NULL       | ALL  | NULL          | NULL | NULL    | NULL | 9688 |   100.00 | NULL                                               |
  |  1 | SIMPLE      | s2    | NULL       | ALL  | NULL          | NULL | NULL    | NULL | 9954 |    10.00 | Using where; Using join buffer (Block Nested Loop) |
  +----+-------------+-------+------------+------+---------------+------+---------+------+------+----------+----------------------------------------------------+
  ```

  可以在对`s2`表的执行计划的`Extra`列显示了两个提示：

  - `Using join buffer (Block Nested Loop)`：这是因为对表`s2`的访问不能有效利用索引，只好退而求其次，使用`join buffer`来减少对`s2`表的访问次数，从而提高性能。
  - `Using where`：可以看到查询语句中有一个`s1.common_field = s2.common_field`条件，因为`s1`是驱动表，`s2`是被驱动表，所以在访问`s2`表时，`s1.common_field`的值已经确定下来了，所以实际上查询`s2`表的条件就是`s2.common_field = 一个常数`，所以提示了`Using where`额外信息。

### 优化案例



### 参考资料

- [mysq条件下推物化](http://mysql.taobao.org/monthly/2016/07/08/)
- [explain执行计划](https://juejin.im/book/5bffcbc9f265da614b11b731/section/5c061b576fb9a049aa6ed8a4)
- [SQL性能优化-书写高质量SQL](https://juejin.im/post/5e0f5eec5188253a9d4a436f)

