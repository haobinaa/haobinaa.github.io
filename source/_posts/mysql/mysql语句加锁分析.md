---
title: mysql语句加锁分析
date: 2020-03-22 13:35:18
tags: mysql
categories: mysql
---

### 普通Select语句情况

- `READ UNCOMMITTED`隔离级别下，不加锁，直接读取记录的最新版本，可能发生脏读、不可重复读和幻读问题。

- `READ COMMITTED`隔离级别下，不加锁，在每次执行普通的SELECT语句时都会生成一个ReadView，这样解决了脏读问题，但没有解决不可重复读和幻读问题。

- `REPEATABLE READ`隔离级别下，不加锁，只在第一次执行普通的SELECT语句时生成一个ReadView，这样把脏读、不可重复读和幻读问题都解决了。

- `SERIALIZABLE`隔离级别下，需要分为两种情况讨论：
    1. 在系统变量autocommit=0时，也就是禁用自动提交时，普通的SELECT语句会被转为`SELECT ... LOCK IN SHARE MODE`这样的语句，也就是在读取记录前需要先获得记录的S锁
    2. 在系统变量autocommit=1时，也就是启用自动提交时，普通的SELECT语句并不加锁，只是利用MVCC来生成一个ReadView去读取记录。因为在自动提交的情况下一条语句就是一个事务，也没有什么不可重复读，幻读这个说法了。
    
### 锁定读的语句

1. `SELECT .. LOCK IN SHARE MODE`
2. `SELECT * FROM UPDATE`
3. `UPDATE ....`
4 `DELETE ...`

这几种情况都属于锁定读，虽然最后两种是更新和删除但是都要先锁定到对应的记录才能操作


#### READ UNCOMMITTED/READ COMMITTED隔离级别下

在READ UNCOMMITTED下语句的加锁方式和READ COMMITTED隔离级别下语句的加锁方式基本一致。如果采用加锁的方式，脏读和不可重复读在任何一个隔离级别下都不会发生（因为读-写操作需要排队进行）。

##### (1) 对于使用主键进行等值查询的情况

- 使用`SELECT ... LOCK IN SHARE MODE`来为记录加锁，比方说：
``` 
-- number 是主键(聚簇索引)
SELECT * FROM hero WHERE number = 8 LOCK IN SHARE MODE;
```
这条语句只需要访问 number 为8的记录，只给这个记录加普通的S锁

- 使用`SELECT ... FOR UPDATE`来为记录加锁，比方说：
``` 
SELECT * FROM hero WHERE number = 8 FOR UPDATE;
```
这种情况也只访问 number 为 8 的记录，只给这个记录加普通的X锁
 
- 使用`UPDATE ...`来为记录加锁，分两个情况，比方说：
``` 
-- country 列上无索引
UPDATE hero SET country = '汉' WHERE number = 8;
-- name 列上是二级索引
UPDATE hero SET name = 'cao曹操' WHERE number = 8;
```
如果没有对二级索引进行更新，跟`Select .. for update`一样，只锁定聚簇索引记录
如果对二级索引进行了更新(第二条sql),这里的步骤就是
1. 为number值为8的聚簇索引记录加上普通X锁
2.  为该聚簇索引记录对应的idx_name二级索引记录（也就是name值为'c曹操'，number值为8的那条二级索引记录）加普通X锁

- 使用`DELETE ...`来为记录加锁，比方说：
``` 
DELETE FROM hero WHERE number = 8;
```
DELETE表中的一条记录意味着对聚簇索引和所有的二级索引中对应的记录做DELETE操作。加锁跟UPDATE语句一样，然后对聚簇索引和所有二级索引进行删除

##### (2) 使用主键进行范围查询

- 使用`SELECT ... LOCK IN SHARE MODE`来为记录加锁，比方说：
``` 
SELECT * FROM hero WHERE number <= 8 LOCK IN SHARE MODE; 
```
1. 先到聚簇索引中定位到满足number <= 8的第一条记录，然后为其加锁
2. 判断该记录是否符合ICP(索引条件下推)。需要注意的是，ICP只是把查询中与被使用索引有关的查询条件下推到存储引擎中判断，而不是返回到server层再判断，这样是为了减少回表次数，但是对于聚簇索引来说不需要回表(本身就包括了全部的列),这里Number是聚簇索引，不需要判断是否符合ICP
3. 判断一下该记录是否符合范围查的边界条件(如果不符合条件就直接返回了)
4. 沿着符合第一条符合条件的记录向下查找，直到满足所有条件就返回。这个过程会给满足条件的记录加普通S锁.(这里有个点需要注意，假如number为8后面还有一条记录number=9，找到了number=8后还会往后找一条记录，为其加上锁，然后判断不符合条件，在释放这条记录的锁)

- 使用`SELECT ... FOR UPDATE`语句。与上面过程类似，不过加的是X锁

- 使用`UPDATE ...`来为记录加锁。这里还是分是否有更新二级索引的情况，如果不更新就只往符合条件的聚簇索引加锁

- 使用`DELETE ...来为记录`加锁, 与UPDATE一样

##### (3) 二级索引等值查询

这里的分析流程和主键索引等值查询基本一致，不过是先通过二级索引找到符合条件的记录，对二级索引记录加锁然后通过回表找到聚簇索引对应记录在加上锁。

##### (4) 二级索引范围查询

同样与主键索引类似

##### (5) 全表扫描情况

全表扫描会遍历每一条记录，并且为记录加上锁，然后判断是否符合查询条件，不符合就释放锁

#### REPEATABLE READ隔离级别下

REPEATABLE READ隔离级别与READ UNCOMMITTED和READ COMMITTED这两个隔离级别相比，最主要的就是要解决幻读问题，幻读问题的解决还得靠gap锁(间隙锁)。

##### (1)对于使用主键进行等值查询的情况

- 使用`SELECT ... LOCK IN SHARE MODE`来为记录加锁，比方说：
``` 
SELECT * FROM hero WHERE number = 8 LOCK IN SHARE MODE;
```
由于主键具有唯一性，这种情况只需要为这条number值为8的记录加一个普通S锁就好了，并不会产生幻读，不可重复读的情况

但是要查询主键值不存在的情况，比如:
``` 
-- 数据库没有 number=7 这条记录
SELECT * FROM hero WHERE number = 7 LOCK IN SHARE MODE;
```
由于number值为7的记录不存在，为了禁止幻读现象（也就是避免在同一事务中下一次执行相同语句时得到的结果集中包含number值为7的记录），在当前事务提交前我们需要预防别的事务插入number值为7的新记录，所以需要在number值为7的下一条记录记录上加一个gap锁(假设是number=8是下一条记录，number=3是上一条记录，就是在(3,8)之间加上间隙锁)

因为 READ UNCOMMITTED／READ COMMITTED 不会禁止幻读，所以之前是不加间隙锁

- 其余三种情况与 `READ UNCOMMITTED／READ COMMITTED` 是一样的

##### (2) 对于使用主键进行范围查询的情况

- 使用`SELECT ... LOCK IN SHARE MODE`语句来为记录加锁，比方：
``` 
SELECT * FROM hero WHERE number >= 8 LOCK IN SHARE MODE;
```
因为要解决幻读问题，所以需要禁止别的事务插入number值符合number >= 8的记录，又因为主键本身就是唯一的，所以我们不用担心在number值为8的前边有新记录插入，只需要保证不要让新记录插入到number值为8
的后边就好了，所以：
1. 为number值为8的聚簇索引记录加一个普通S锁。
2. 为number值大于8的所有聚簇索引记录(是每一条记录)都加一个S型next-key锁（包括Supremum伪记录）。

在之前说过，会对number=8后面的一条记录先加锁在释放锁，而在 REPEATABLE READ 级别下是不会释放后面一条记录的锁的。

- 使用`SELECT ... FOR UPDATE`语句,与上面基本一样，只不过需要将上边提到的S型next-key锁替换成X型next-key锁。

- 使用`UPDATE ...`来为记录加锁，也要区分是否更新二级索引的场景:
``` 
-- country 没有索引
UPDATE hero SET country = '汉' WHERE number >= 8;
-- name 是二级索引
UPDATE hero SET name = 'cao曹操' WHERE number >= 8;
```
1. 如果不需要更新二级索引，那么就和`SELECT..FOR UPDATE`一样
2. 如果需要更新二级索引，对于聚簇索引的加锁和`SELECT..FOR UPDATE`一样，然后再给对应的二级索引加上普通X锁

- 使用`DELETE ...`来为记录加锁的情况和UPDATE一致
   
   
##### (3) 使用唯一二级索引进行等值查询

- 使用`SELECT ... LOCK IN SHARE MODE`语句来为记录加锁，比方说：
``` 
-- 这里给 name 列加了一个唯一索引 uk_name(name)
SELECT * FROM hero WHERE name = 'c曹操' LOCK IN SHARE MODE;
```
由于是唯一二级索引，那么肯定也不会有重复插入的情况，这种也是只需要给对应的二级索引加个普通S锁，然后对聚簇索引对应记录加个普通S锁

但是如果唯一索引查询的记录并不存在的情况，跟主键索引一样，就要对查询记录与下一条记录之间加个间隙锁，值得注意的是，这里只需要对二级索引加锁就好了，不需要还另外对主键索引加锁

- 使用`SELECT ... FOR UPDATE`语句来为记录加锁,这里和上面过程一样，不过这里加的是普通X锁

- 使用`UPDATE ...`来为记录加锁，这里与`SELECT .. FOR UPDATE`类似，不过如果更新的列还有别的二级索引，对应的二级索引也要加锁

- `DELETE ...` 与上面 update 一样

##### (4) 使用唯一二级索引进行范围查询

- 使用`SELECT ... LOCK IN SHARE MODE`语句来为记录加锁，比方说：
``` 
SELECT * FROM hero FORCE INDEX(uk_name) WHERE name >= 'c曹操' LOCK IN SHARE MODE;
```
这个语句的执行过程其实是先到二级索引中定位到满足name >= 'c曹操'的第一条记录，也就是name值为c曹操的记录，然后就可以沿着由记录组成的单向链表一路向后找。对于所有满足条件的记录都会被加上`S型next-key
锁`，包括二级索引的最后一条`Supremum`。对二级索引加锁完，还会对聚簇索引记录加锁，聚簇索引加的是`普通S锁`

- `SELECT ... FOR UPDATE` 和上面基本类似，不过加的是`X型next-key锁`和`普通X锁`

- `UPDATE ...`的情况，比方说：
``` 
UPDATE hero SET country = '汉' WHERE name >= 'c曹操';
```
这里其实跟上面`SELECT .. for UPDATE`基本一样，只不过如果更新了其他的二级索引，需要对其他的二级索引对应加锁。

- `DELETE` 和 上面 update情况一样

##### (5) 使用普通二级索引进行等值查询

- `SELECT ... LOCK IN SHARE MODE` 语句，比如:
``` 
SELECT * FROM hero WHERE name = 'c曹操' LOCK IN SHARE MODE;
```
由于普通二级索引没有唯一性，要阻止其他事务插入name='c曹操'的记录，这里加锁方式是:
1. 对所有name值为'c曹操'的二级索引记录加S型next-key锁，它们对应的聚簇索引记录加普通S锁
2. 对最后一个name值为'c曹操'的二级索引记录的下一条二级索引记录加gap锁

- 其他三种情况分析都一样了

- 另外如果是普通二级索引进行范围查询，跟其他分析也是一样的

##### (6) 全表扫描的情况

这里需要说明一下，再`REPEATABLE READ`隔离级别下，如果是全表扫描的方式，表里面的所有记录都会被加上`next-key`锁，直到事务提交才释放。这样会极大的影响该表的并发事务处理能力，如果遇到这个情况，还是尽量对表建立合适的索引

### insert 语句

INSERT语句一般情况下不加锁，不过当前事务在插入一条记录前需要先定位到该记录在B+树中的位置，如果该位置的下一条记录已经被加了gap锁（next-key锁也包含gap锁），那么当前事务会在该记录上加上一种类型为插入意向锁的锁，并且事务进入等待状态。

这里有一些 insert 语句的特殊情况

#### 重复键(duplicate key)

在插入一条新记录时，首先要做的事情其实是定位到这条新记录应该插入到B+树的哪个位置。如果定位位置时发现了有已存在记录的主键或者唯一二级索引列与待插入记录的主键或者唯一二级索引列相同，那么此时此时是会报错.在生成报错信息前，其实还需要做一件非常重要的事情 —— 对聚簇索引中那条记录加S锁。不过具体的行锁类型在不同隔离级别下是不一样的：

- 在READ UNCOMMITTED/READ COMMITTED隔离级别下，加的是普通S锁
- 在REPEATABLE READ/SERIALIZABLE隔离级别下，加的是S型next-key锁

#### 外键检查

外键的情况也是特殊处理，再插入子表的时候，也要对相应关联的父表做一些加锁的操作

 ### 参考资料
 
- [掘金小册-从根上理解MySQL]
- [公众号:我们都是小青蛙 - MySQL加锁分析三部曲]