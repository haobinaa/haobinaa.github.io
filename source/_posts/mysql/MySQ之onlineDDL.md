---
title: MySQ之onlineDDL
date: 2024-08-08 18:47:06
tags: mysql
categories: mysql
---

### DDL 的算法

#### copy

COPY是MYSQL 5.5以及之前的默认算法，使用COPY算法会锁表，不支持online ddl，COPY算法在server层创建一个临时表用于copy数据，最后用新表替换旧表。

copy 算法的执行执行流程:
1. 准备：
   1. 对表加 DML 读锁，读取元数据（DDL不并行，DML可以并行）
   2. 升级 DML 写锁（DDL和DML都不并行） 
   3. 按照原表定义创建一个新的临时表
2. 执行:
   1. 对临时表进行DDL，修改临时表元数据 
   2. 将原表中的数据copy到临时表（最耗时） 
   3. 将原表删除，将临时表重命名为原表
3. 提交
   1. 释放原表的写锁

#### INPLACE

与 COPY 算法不同，INPLACE 算法直接在原始表上进行修改，无需创建临时表和拷贝数据。
另外 copy 是在 Server 层处理的， INPLACE 是在 innodb 引擎层处理的。 
其中 INPLACE 有两种情况(两者差异在总结部分说明)： 
- rebuild table
- no rebuild table

整体流程:
1. 记录DML操作：在DDL操作执行期间，如果有DML操作（如INSERT、UPDATE、DELETE）尝试修改表，这些操作会被记录下来。
2. 应用DML更改：DDL操作完成后，之前记录的DML更改会被应用到表上，确保数据的完整性和一致性。

#### INSTANT 

对于某些简单的DDL操作（如修改表的默认字符集），INSTANT算法可以 **直接修改数据字典中的元数据** ，而无需对表数据进行任何更改。


#### 总结


| 方式                           | 区别                                                                                                                                                                            | 开销  | 场景示例     |
|------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----|----------|
| copy                         | Server层创建一个临时表用于copy数据，然后用新表替换旧表。不支持变更期间的 DML，且会产生大量的 redolog </br>1. 按照原表的定义创建一个新的临时表2.对原表加写锁</br>3.对新的临时表进行修改<br>4.将原表中的数据逐行复制到新表中<br>5.释放原表的写锁<br>6.将旧表删除，并将新的临时表重命名RENAME | 大   | 修改列的数据类型 |
| INPLACE( rebuild table)	     | 由 InnoDB 引擎完成，涉及数据变更，需要重建聚簇索引（而不是像 COPY 那种方式把数据一行行从原表复制到新表）                                                                                                                   | 中   | 删除列      |
| INPLACE( no rebuild table)		 | 由 InnoDB 引擎完成，不涉及数据变更	                                                                                                                                                        | 小   | 创建二级索引   |
| Only Modifies Metadata	      | 只变更表的元信息，不涉及数据变更	                                                                                                                                                             | 最小	 | 设置列的默认值  |

### DDL 参数

#### ALGORITHM

| ALGORITHM          | 描述                                                   |
|--------------------|------------------------------------------------------|
| ALGORITHM=INPLACE	 | 使用 INPLACE 的方式进行 DDL 变更。如果你的操作本身不支持 INPLACE，会立刻中断退出。 |
|
| ALGORITHM=COPY	    | 以复制临时表的方式进行 DDL 变更（尽量避免使用这个参数）                       |


#### Lock

| Lock            | 描述                                                |
|-----------------|---------------------------------------------------|
| LOCK=NONE	      | 允许并发查询和DML                                        |
| LOCK=SHARED	    | 允许并发查询，但阻止 DML                                    |
| LOCK=EXCLUSIVE	 | 阻止并发查询和 DML                                       |
| LOCK=DEFAULT	   | 允许尽可能多的并发(并发查询，DML 或两者)。省略LOCK子句与指定LOCK=DEFAULT相同 |


#### 总结

这个章节大家可能会有些疑惑，mysql 在做 ddl 变更的时候会智能的选择 algorithm 和 lock， 那手动指定还有什么意义？

官方文档给了一个非常好的解释：如果你要确定你的操作对当前的数据库查询是“无害”的，那你就可以指定这两个参数。因为当一个DDL不能以 ALGORITHM=INPLACE 和 LOCK=NONE，命令会直接中断报错，那么你就知道你的操作对线上数据库是有很大风险的。

为避免意外使 table 不可用于读取和/或写入 LOCK=NONE。如果请求的并发级别不可用，该操作将立即停止。

为避免意外使用复制 table 的ALTER TABLE操作（增大磁盘空间使用和 I/O 开销），使用 ALGORITHM=INPLACE。如果无法使用就地机制，该语句将立即暂停。


### Online DDL

什么是 Online DDL?

首先看一张 mysql 官方的图:

![](/images/mysql/online-ddl.png)



首先要明确 INPLACE 和 Online 是两个不同维度的事情。
ALGORITHM=INPLACE 和 ALGORITHM=COPY 描述的是 DDL 内部的执行方式，与是否是 Online 的没有关系。

通常，我们关注是否是 Online 的，想关注的其实是是否影响业务的正常数据写入，也就是官方文档中 "Permits Online DML" 这一列是否为 YES

COPY 算法执行的 DDL 肯定不是 Online 的，INPLACE 算法执行的 DDL 不一定是 Online 的

#### DDL 空间要求

##### 临时日志文件 Temporary log files

作用：记录DDL期间的DML操作

大小：`innodb_online_alter_log_max_size`

如果做DDL期间对表做了大量DML导致超出innodb_online_alter_log_max_size大小，那么DML会失败并 rollback



##### 临时排序文件 Temporary sort files

rebuild table 将临时排序文件写入 MySQL 临时目录(在 Unix 上为$TMPDIR，在 Windows 上为%TEMP%，或由--tmpdir指定的目录)。排序文件的数据合并到最终 table 或索引中时都将被删除。临时排序文件的大小等于表中数据量的大小+索引的大小



##### 中间表文件 Intermediate table files

一些重建 table 的在线 DDL 操作会在与原始 table 相同的目录中创建一个临时中间 table 文件。中间 table 文件可能需要的空间等于原始 table 的大小。


#### 注意事项

##### 创建表的时候对字段定义要慎重
1. 在创建表的时候如果一开始没有指定 auto-increment 字段，添加auto-increment列时不允许使用并发 DML，对线上影响较大。
2. 如果不使用自增ID做主键，插入新数据是乱序的，存储引擎不得不频繁的做页分裂操作，以便为新的行分配空间。但如果是自增ID，下一条记录就会写入新的页中，一旦数据按照这种顺序的方式加载，主键页就会近乎于顺序的记录填满，提升了页面的最大填充率，不会有页的浪费。

##### VARCHAR字段的变更
由于varchar 是变长，所以varchar字段本身需要使用一个（如果字符串长度小于255）或两个字节（长度大于255）来存储字符串的长度。所需的长度字节数从 1 更改为 2，则只能使用 ALGORITHM=COPY，完成前无法对源表进行数据写入。

##### 即使有 Online DLL，依然建议在低峰期进行 DLL 操作
https://dev.mysql.com/doc/refman/5.7/en/innodb-online-ddl-performance.html

1. 如果做DDL期间对表做了大量DML导致记录DML的临时日志文件超出innodb_online_alter_log_max_size定义的大小，那么DML会失败并 rollback
2. 由于 DDL 操作会获取 MDL 排他锁，所以必须等待 针对该表的所有事务 commit 后才能获取 MDL 排他锁。所以当时如果正好有一个长事务在执行，DDL操作会等待 MDL独占锁超时，并且会 block 后续的所有该表的 transaction

##### 从库复制滞后
主库的DDL执行完毕之后，才会开始在从库执行。在主库上执行的DML只有在从库DDL完成之后才会执行。

### 参考
- [aliyun RDS onlineDDL 使用](https://help.aliyun.com/zh/rds/support/how-do-i-perform-ddl-operations-online-on-apsaradb-rds-for-mysql)