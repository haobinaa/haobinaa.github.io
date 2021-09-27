---
title: mysql语句加锁分析
date: 2020-03-22 13:35:18
tags: mysql
categories: mysql
---

### 概述

#### 锁类型

- S/X Lock: 读/写锁， 又称共享锁和排他锁
- Gap Lock: 间隙锁, 锁的是与下一条记录之间的间隙
- Next-Key Lock: Gap + Lock, 锁间隙和下一条记录(左开右闭)

#### 普通 select 语句

- `READ UNCOMMITTED`隔离级别下，不加锁，直接读取记录的最新版本，可能发生脏读、不可重复读和幻读问题。
- `READ COMMITTED`隔离级别下，不加锁，在每次执行普通的SELECT语句时都会生成一个ReadView，这样解决了脏读问题，但没有解决不可重复读和幻读问题
- `REPEATABLE READ`隔离级别下，不加锁，只在第一次执行普通的SELECT语句时生成一个ReadView，这样把脏读、不可重复读和幻读问题都解决了。其实并不能完全解决幻读问题， 这里可以参考另一篇博客[mysql事务隔离级别与加锁分析]
- SERIALIZABLE隔离级别下，需要分为两种情况讨论：
 1. 在系统变量`autocommit=0`时，也就是禁用自动提交时，普通的SELECT语句会被转为SELECT ... LOCK IN SHARE MODE这样的语句，也就是在读取记录前需要先获得记录的S锁，具体的加锁情况和REPEATABLE READ隔离级别下一样
 2. 在系统变量`autocommit=1`时，也就是启用自动提交时，普通的SELECT语句并不加锁，只是利用MVCC来生成一个ReadView去读取记录。 为啥不加锁呢？因为启用自动提交意味着一个事务中只包含一条语句，一条语句也就没有啥不可重复读、幻读这样的问题了。

#### 锁定读语句

1. SELECT ... LOCK IN SHARE MODE;
2. SELECT ... FOR UPDATE;
3. UPDATE ...
4. DELETE ...

### RU/RC 情况下加锁分析

RU/RC 情况下加锁情况基本一致, 在加锁情况下`脏读`和`不可重复读`在任何一个隔离级别下都不会发生（因为读-写操作需要排队进行)

#### 主键查询情况

##### 等值查询

1. `SELECT ... LOCK IN SHARE MODE` 为记录 + XLock
``` 
-- number 是主键(聚簇索引)
SELECT * FROM hero WHERE number = 8 LOCK IN SHARE MODE;
```
这条语句只需要访问 number 为8的记录，只给这个记录加普通的S锁

2. 使用`SELECT ... FOR UPDATE`来为记录 + XLock
``` 
SELECT * FROM hero WHERE number = 8 FOR UPDATE;
```
这种情况也只访问 number 为 8 的记录，只给这个记录加普通的X锁

3. 使用`UPDATE ...`来为记录加锁，分两个情况，比方说：
- 如果没有对二级索引进行更新，跟`Select .. for update`一样， 只对聚簇索引 + XLock
- 如果对二级索引进行了更新, 不但对聚簇索引 + XLock, 还需要给对应二级索引 + XLock
``` 
-- country 列上无索引， 只锁定聚簇索引记录
UPDATE hero SET country = '汉' WHERE number = 8;
-- name 列上是二级索引, 还需要锁定对应二级索引
UPDATE hero SET name = 'cao曹操' WHERE number = 8;
```

4. 使用`DELETE ...`来为记录加锁， 与 update 一样


##### 范围查询

1. `SELECT ... LOCK IN SHARE MODE`来为记录加锁，满足条件每条记录 + SLock, 比方说：
``` 
SELECT * FROM hero WHERE number <= 8 LOCK IN SHARE MODE; 
```
- 先到聚簇索引中定位到满足number <= 8的第一条记录，然后为其 + SLock
- 判断一下该记录是否符合范围查的边界条件(如果不符合条件就直接返回了)
- 沿着符合第一条符合条件的记录向下查找，直到满足所有条件就返回。这个过程会给满足条件的记录加普通S锁.
备注: 这里有个点需要注意，假如number为8后面还有一条记录number=9，找到了number=8后还会往后找一条记录，为其加上锁，然后判断不符合条件，在释放这条记录的锁

4. 使用`SELECT ... FOR UPDATE`语句。与上面过程类似，不过加的是X锁

5. 使用`UPDATE ...`来为记录加锁。这里还是分是否有更新二级索引的情况，如果不更新就只往符合条件的聚簇索引加锁

6. 使用`DELETE ...来为记录`加锁, 与UPDATE一样

#### 二级索引

##### 等值查询

1. `SELECT ... LOCK IN SHARE MODE`
- 二级索引对应记录 + SLock
- 对应聚簇索引 + SLock

2. `SELECT ... FOR UPDATE`, 与上面类似， 不过换成 XLock

3. `UPDATE ...`， 与上面类似， 不过如果被更新的列中有别的二级索引列话， 对应二级索引列也 + XLock

4. `DELETE ...`, 与 update 一样

##### 范围查询

1. `SELECT ... LOCK IN SHARE MODE`
- 遍历对应二级索引， 找到第一条满足条件记录 +SLock
- 第一条记录对应聚簇索引 +SLock
- 继续遍历对所有满足条件记录, 先对二级索引 +SLock， 然后对聚簇索引 +SLock

2. `SELECT ... FOR UPDATE` 与上面类似， 不过 +XLock

3. `UPDATE ...`, 与 for update 类似， 如果有其他二级索引列被更新， 对应二级索引也 +XLock

4. `DELETE ...` 与 update 类似

####  全表扫描情况

1. `SELECT ... LOCK IN SHARE MODE`, 比如说
```
SELECT * FROM hero WHERE country  = '魏' LOCK IN SHARE MODE;
```
- 由于country列上未建索引，所以只能采用全表扫描的方式来执行这条查询语句，存储引擎每读取一条聚簇索引记录，就会为这条记录加锁一个S型正常记录锁
- 然后返回给server层，如果server层判断country = '魏'这个条件是否成立，如果成立则将其发送给客户端，否则会释放掉该记录上的锁，画个图就像这样：

![](/images/mysql/ru_rc_table_scan.png)


2. `SELECT ... FOR UPDATE`进行加锁的情况与上边类似，只不过加的是+ XLock

3. `DELETE/UPDATE`在遍历聚簇索引中的记录，都会为该聚簇索引记录加上X型正经记录锁，然后：
- 如果该聚簇索引记录不满足条件，直接把该记录上的锁释放掉
- 如果该聚簇索引记录满足条件，则会对相应的二级索引记录+X Lock

### REPEATABLE READ隔离级别下

`REPEATABLE READ`隔离级别与`READ UNCOMMITTED`和`READ COMMITTED`这两个隔离级别相比，最主要的就是要解决幻读问题，幻读问题的解决还得靠gap锁(间隙锁)。

#### 主键情况

##### 等值查询

1. 使用`SELECT ... LOCK IN SHARE MODE`来为记录加锁， 
- 若命中记录，由于主键具有唯一性，这种情况只需要为满足条件的记录+ SLock 就好了，并不会产生幻读，不可重复读的情况
- 特别注意的是在查询主键值不存在的情况，比如:
``` 
-- 数据库没有 number=7 这条记录
SELECT * FROM hero WHERE number = 7 LOCK IN SHARE MODE;
```
由于number值为7的记录不存在，为了禁止幻读现象（也就是避免在同一事务中下一次执行相同语句时得到的结果集中包含number值为7的记录），在当前事务提交前我们需要预防别的事务插入number值为7的新记录，所以需要在number值为7的下一条记录记录上加一个gap锁(假设是number=8是下一条记录，number=3是上一条记录，就是在(3,8)之间加上间隙锁)


2. 其余三种情况与 `READ UNCOMMITTED／READ COMMITTED` 是一样的

##### 范围查询

1. 使用`SELECT ... LOCK IN SHARE MODE`语句来为记录加锁，比方：
``` 
SELECT * FROM hero WHERE number >= 8 LOCK IN SHARE MODE;
```
因为要解决幻读问题，所以需要禁止别的事务插入number值符合number >= 8的记录，又因为主键本身就是唯一的，所以我们不用担心在number值为8的前边有新记录插入，只需要保证不要让新记录插入到number值为8的后边就好了，所以：
- 为number值为8的聚簇索引记录 + SLock
- 为number值大于8的所有聚簇索引记录(是每一条记录)都加一个S型 next-key Lock（包括Supremum伪记录）。


2. 使用`SELECT ... FOR UPDATE`语句,与上面基本一样，只不过需要将上边提到的S型 next-key Lock 替换成X型 next-key Lock

3. 使用`UPDATE ...`来为记录加锁，也要区分是否更新二级索引的场景:
``` 
-- country 没有索引
UPDATE hero SET country = '汉' WHERE number >= 8;
-- name 是二级索引
UPDATE hero SET name = 'cao曹操' WHERE number >= 8;
```
- 如果不需要更新二级索引，那么就和`SELECT..FOR UPDATE`一样
- 如果需要更新二级索引，对于聚簇索引的加锁和`SELECT..FOR UPDATE`一样，然后再给对应的二级索引加上普通X锁

4. 使用`DELETE ...`来为记录加锁的情况和UPDATE一致
   
   
####  唯一二级索引

##### 等值查询

1. 使用`SELECT ... LOCK IN SHARE MODE`语句来为记录加锁，比方说：
``` 
-- 这里给 name 列是唯一二级索引
SELECT * FROM hero WHERE name = 'c曹操' LOCK IN SHARE MODE;
```
- 由于是唯一二级索引，那么肯定也不会有重复插入的情况，这种也是只需要给对应的二级索引+ SLock，然后对聚簇索引对应记录+ SLock
- 但是如果唯一索引查询的记录并不存在的情况，跟主键索引一样，就要对查询记录与下一条记录之间加个间隙锁，值得注意的是，这里只需要对二级索引加锁就好了，不需要还另外对主键索引加锁

2. 使用`SELECT ... FOR UPDATE`语句来为记录加锁,这里和上面过程一样，不过这里加的是 XLock

3. 使用`UPDATE ...`来为记录加锁，这里与`SELECT .. FOR UPDATE`类似，不过如果更新的列还有别的二级索引，对应的二级索引也要加锁

4. `DELETE ...` 与上面 update 一样

##### 范围查询

1. 使用`SELECT ... LOCK IN SHARE MODE`语句来为记录加锁
- 对满足条件的二级索引加上 S 型 next-key Lock
- 然后给对应聚簇索引 + SLock

2. `SELECT ... FOR UPDATE` 和上面基本类似，不过加的是X型 next-key Lock 和 XLock

3. `UPDATE ...`的情况， 这里其实跟上面`SELECT .. for UPDATE`基本一样，只不过如果更新了其他的二级索引，需要对其他的二级索引对应加锁。

- `DELETE` 和 上面 update情况一样

####  普通二级索引


##### 等值查询

1. `SELECT ... LOCK IN SHARE MODE` 语句，比如:
``` 
SELECT * FROM hero WHERE name = 'c曹操' LOCK IN SHARE MODE;
```
- 由于普通二级索引没有唯一性，要阻止其他事务插入name='c曹操'的记录
- 对所有name值为'c曹操'的二级索引记录加S型 next-key Lock，它们对应的聚簇索引记录 + SLock 
- 对最后一个name值为'c曹操'的二级索引记录的下一条二级索引记录加gap锁, 如:

![](/images/mysql/rr_index_equal.png)

- 如果命中 miss， 同唯一二级索引一样， 需要在前后两条记录之间 + Gap Lock

3. 其他三种情况分析都一样了

##### 范围查询

与唯一二级索引类似


####  全表扫描

这里需要说明一下，再`REPEATABLE READ`隔离级别下，如果是全表扫描的方式，表里面的所有记录都会被加上`next-key`锁，直到事务提交才释放。
这样会极大的影响该表的并发事务处理能力，如果遇到这个情况，还是尽量对表建立合适的索引
另外可以通过设置`innodb_locks_unsafe_for_binlog`来提前释放锁

### insert 语句

INSERT语句一般情况下不加锁，不过当前事务在插入一条记录前需要先定位到该记录在B+树中的位置，如果该位置的下一条记录已经被加了gap锁（next-key锁也包含gap锁），那么当前事务会在该记录上加上一种类型为插入意向锁的锁，并且事务进入等待状态。
INSERT 在执行成功后会给记录+X Lock

这里有一些 insert 语句的特殊情况

#### 重复键(duplicate key)

在插入一条新记录时，首先要做的事情其实是定位到这条新记录应该插入到B+树的哪个位置。如果定位位置时发现了有已存在记录的主键或者唯一二级索引列与待插入记录的主键或者唯一二级索引列相同，那么此时此时是会报错.在生成报错信息前，其实还需要做一件非常重要的事情 —— 对聚簇索引中那条记录加S锁。不过具体的行锁类型在不同隔离级别下是不一样的：

- 在READ UNCOMMITTED/READ COMMITTED隔离级别下，加的是普通S锁
- 在REPEATABLE READ/SERIALIZABLE隔离级别下，加的是S型next-key锁

#### 外键检查

外键的情况也是特殊处理，再插入子表的时候，也要对相应关联的父表做一些加锁的操作


#### INSERT 加锁分析整个流程
- 首先对插入的间隙加插入意向锁(Insert Intension Locks)
  - 如果该间隙已被加上了 GAP 锁或 Next-Key 锁，则加锁失败进入等待
  - 如果没有，则加锁成功，表示可以插入；

- 然后判断插入记录是否有唯一键，如果有，则进行唯一性约束检查
  - 如果不存在相同键值，则完成插入
  - 如果存在相同键值，则判断该键值是否加锁
    - 如果没有锁， 判断该记录是否被标记为删除
      - 如果标记为删除，说明事务已经提交，还没来得及 purge，这时加 S 锁等待；
      - 如果没有标记删除，则报 1062 duplicate key 错误；
    - 如果有锁，说明该记录正在处理（新增、删除或更新），且事务还未提交，加 S 锁等待；
- 插入记录并对记录加 X 记录锁；

 ### 参考资料
 
- [掘金小册-从根上理解MySQL]
- [公众号:我们都是小青蛙 - MySQL加锁分析三部曲]