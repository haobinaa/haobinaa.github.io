---
title: mysql事务隔离级别与MVCC
date: 2019-09-02 21:25:21
tags: mysql
categories: mysql
---

### 事务（Transaction）及其ACID属性

1. 原子性(Atomicity)：事务是一个原子操作单元，其对数据的修改，要么全都执行，要么全都不执行
2. 一致性(Consistent):在事务开始和完成时，数据都必须保持一致状态。这意味着所有相关的数据规则都必须应用于事务的修改，以保持数据的完整性；事务结束时，所有的内部数据结构（如B树索引或双向链表）也都必须是正确的
3. 隔离性(Isolation):数据库系统提供一定的隔离机制，保证事务在不受外部并发操作影响的“独立”环境执行。这意味着事务处理过程中的中间状态对外部是不可见的，反之亦然
4. 持久性(Durable): 事务完成之后，它对于数据的修改是永久性的，即使出现系统故障也能够保持

### 并发事务带来的问题

#### 更新丢失(lost update， 又叫脏写)

一个事务修改到了另一个未提交事务修改过的数据

事务A和事务B都读取了同一行数据， 比如原数据行的值是100，事务A是将数值读取出来+1并更新， 事务B是读取数值+2并更新。当事务A和事务B都读取到了100,事务A首先完成并更新为101，事务B随后完成更新成了102。这样事务B就把事务A的结果覆盖了。

#### 脏读(dirty read)

一个事务读取到了另一个未提交事务修改过的数据

事务A正在对一条记录做修改，但未提交。这时，事务B也来读取同一条记录，如果不加控制，第二个事务读取了这些“脏”数据，并据此做进一步的处理，就会产生未提交的数据依赖关系。这种现象被形象地叫做"脏读"

#### 不可重复读(Non-Repeatable Read)

一个事务只能读到另一个已经提交的事务修改过的数据，并且其他事务每对该数据进行一次修改并提交后，该事务都能查询得到最新值(注重的是update和delete操作)。

换句话说个事务从开始直到提交之前，所做的任何修改对其他事务都是不可见的。但是两次执行同样的查询，可能会得到不一样的结果(读到了其他事务的修改结果)。


#### 幻读(Phantom Read)

一个事务先根据某些条件查询出一些记录，之后另一个事务又向表中插入了符合这些条件的记录，原先的事务再次按照该条件查询时，能把另一个事务插入的记录也读出来，那就意味着发生了幻读(注重的是insert操作)


> 备注： 那对于先前已经读到的记录，之后又读取不到这种情况，算啥呢？其实这相当于对每一条记录都发生了不可重复读的现象。幻读只是重点强调了读取到了之前读取没有获取到的记录。如果按照相同的条件查询，读到的记录变少了(另一个事务删除了一些记录),这种情况不算幻读，幻读强调的是按照相同条件查询出了之前没有读到的记录 

### 事务隔离级别

在上面讲到的并发事务处理带来的问题中，“脏写”通常是应该完全避免的。在Mysql的隔离级别中，脏写是完全杜绝的

“脏读”、“不可重复读”和“幻读”，其实都是数据库读一致性问题，必须由数据库提供一定的事务隔离机制来解决。数据库实现事务隔离的方式，基本上可分为以下两种：

1.在读取数据前，对其加锁，阻止其他事务对数据进行修改

2.不用加任何锁，通过一定机制生成一个数据请求时间点的一致性数据快照（Snapshot)，并用这个快照来提供一定级别（语句级或事务级）的一致性读取。从用户的角度来看，好像是数据库可以提供同一数据的多个版本，因此，这种技术叫做数据多版本并发控制（MultiVersion Concurrency Control，简称MVCC）


#### mysql四个隔离级别

| 隔离级别              | 脏读    | 不可重复读 |   幻读 |
|---------- -----------|:--------|:--------|:--------|
|未提交读(Read uncommited)| N      | N      | N     |
| 已提交读(Read commited) | N       | Y     | Y      |
|可重复读(Repeatable Read)| N       | N     | Y      |
| 串行执行(Serializable)  | N       | N     | N       |

- `READ UNCOMMITTED`隔离级别下，可能发生脏读、不可重复读和幻读问题。

- `READ COMMITTED`隔离级别下，可能发生不可重复读和幻读问题，但是不可以发生脏读问题。

- `REPEATABLE READ`隔离级别下，可能发生幻读问题，但是不可以发生脏读和不可重复读的问题(这也是mysql的默认隔离级别)。

- `SERIALIZABLE`隔离级别下，各种问题都不可以发生。

注意: 脏写是很严重的情况，无论哪种隔离级别都不允许发生脏写

### 验证
- 默认隔离级别
innodb默认是可重复读(repeatable read)，在my.ini可配置：
``` 
transaction-isolation = {READ-UNCOMMITTED | READ-COMMITTED | REPEATABLE-READ | SERIALIZABLE}
```
- 设置隔离级别
```
SET [SESSION | GLOBAL] TRANSACTION ISOLATION LEVEL {READ UNCOMMITTED | READ COMMITTED | REPEATABLE READ | SERIALIZABLE} 
```
默认的行为（不带session和global）是为下一个（未开始）事务设置隔离级别。如果你使用GLOBAL关键字，语句在全局对从那点开始创建的所有新连接（除了不存在的连接）设置默认事务级别。你需要SUPER权限来做这个。使用SESSION 关键字为将来在当前连接上执行的事务设置默认事务级别。 任何客户端都能自由改变会话隔离级别（甚至在事务的中间），或者为下一个事务设置隔离级别


首先我建了一个测试表`book_table`,带有bookid和bookname两个字段

#### `read uncommitted`下将出现脏读

``` 
# 隔离级别改成 read uncommitted
set session transaction isolation level read uncommitted;
Query OK, 0 rows affected (0.00 sec)

select @@session.tx_isolation;
+------------------------+
| @@session.tx_isolation |
+------------------------+
| READ-UNCOMMITTED       |
+------------------------+

##############  session1 插入一条记录，并不提交
start transacton;
Query OK, 0 rows affected (0.00 sec)
insert into book_table(bookname) values('math');
Query OK, 1 row affected (0.00 sec)
select * from book_table;
+----------+--------+
| bookname | bookid |
+----------+--------+
| math     |      1 |
+----------+--------+
1 row in set (0.00 sec)

######### session2 读取到了 session1 未提交的记录

 select * from book_table;
+----------+--------+
| bookname | bookid |
+----------+--------+
| math     |      1 |
+----------+--------+
```


#### `read committed` 将出现不可重复读
``` 
# 隔离级别改成 read committed
set session transaction isolation level read uncommitted;
Query OK, 0 rows affected (0.00 sec)

select @@session.tx_isolation;
+------------------------+
| @@session.tx_isolation |
+------------------------+
| READ-COMMITTED       |
+------------------------+


########## session1  查询bookid=1的数据是 math,此时并未提交事务

 select * from book_table where bookid = 1;
+----------+--------+
| bookname | bookid |
+----------+--------+
| math     |      1 |
+----------+--------+


######## session2 将bookid=1的数据更新为 english 并提交

start transaction;
Query OK, 0 rows affected (0.00 sec)

update book_table set bookname = 'english' where id = 1;
Query OK, 1 row affected (0.00 sec)

commit;
Query OK, 0 rows affected (0.07 sec)

############# session1 再次查询同样的条件，确查出来不同的结果
select * from book_table where bookid = 1;
+----------+--------+
| bookname | bookid |
+----------+--------+
| english     |      1 |
+----------+--------+
1 rows in set (0.00 sec)
```

#### `REPEATABLE-READ` 将出现幻读
``` 
# 隔离级别默认是 repeatable read
select @@session.tx_isolation;
+------------------------+
| @@session.tx_isolation |
+------------------------+
| REPEATABLE READ      |
+------------------------+


########## session1  查询bookid>1的数据只有1条
   
select * from book_table where bookid = 1;
+----------+--------+
| bookname | bookid |
+----------+--------+
| math     |      1 |
+----------+--------+


########## session2  插入了一条数据

 insert into book_table values('english', 2);


########## session1  以同样的条件查询却查出了两条记录

+----------+--------+
| bookname | bookid |
+----------+--------+
| math     |      1 |
| english  |      2 |
+----------+--------+
```

#### 不可重复读和幻读的区别

不可重复读和幻读，确实这两者有些相似。但不可重复读重点在于update和delete，而幻读的重点在于insert。

如果使用锁机制来实现这两种隔离级别，在可重复读中，该sql第一次读取到数据后，就将这些数据加锁，其它事务无法修改这些数据，就可以实现可重复读了。但这种方法却无法锁住insert的数据，所以当事务A先前读取了数据，或者修改了全部数据，事务B还是可以insert数据提交，这时事务A就会发现莫名其妙多了一条之前没有的数据，这就是幻读，不能通过行锁来避免。需要Serializable隔离级别 ，读用读锁，写用写锁，读锁和写锁互斥，这么做可以有效的避免幻读、不可重复读、脏读等问题，但会极大的降低数据库的并发能力。

### InnoDB 中 MVCC 原理


#### 版本链

innodb记录都会包含两个隐藏列:
- `trx_id`：每次一个事务对某条记录进行改动时，都会把该事务的`事务id`赋值给`trx_id`隐藏列
- `roll_pointer`：每次对某条记录进行改动时，都会把旧的版本写入到undo日志中，然后这个隐藏列就相当于一个指针，可以通过它来找到该记录修改前的信息

当对一条记录多次更新后，所有的版本都会被roll_pointer属性连接成一个链表(insert操作对应的undo log没有该属性，因为该记录没有更早的版本)，我们把这个链表称之为版本链，版本链的头节点就是当前记录最新的值。版本链的头节点就是当前记录最新的值。另外，每个版本中还包含生成该版本时对应的事务id，类似:

![](/images/mysql/roll_pointer_undo.png)




#### ReadView

对于使用`READ UNCOMMITTED`隔离级别的事务来说，由于可以读到未提交事务修改过的记录，所以直接读取记录的最新版本就好了；
对于使用`SERIALIZABLE`隔离级别的事务来说，InnoDB使用加锁的方式来访问记录；
对于使用`READ COMMITTED`和`REPEATABLE READ`隔离级别的事务来说，都必须保证读到已经提交了的事务修改过的记录，也就是说假如另一个事务已经修改了记录但是尚未提交，是不能直接读取最新版本的记录的，核心问题就是：需要判断一下版本链中的哪个版本是当前事务可见的。为此，InnoDB提出了一个`ReadView`的概念，这个ReadView中主要包含4个比较重要的内容：

1. `m_ids`：表示在生成`ReadView`时当前系统中活跃的读写事务的事务id列表。

2. `min_trx_id`：表示在生成`ReadView`时当前系统中活跃的读写事务中最小的事务id，也就是m_ids中的最小值。

3. `max_trx_id`：表示生成`ReadView`时系统中应该分配给下一个事务的id值(max_trx_id并不是m_ids中的最大值。事务id是递增分配的，假如现在有id为1，2，3这三个事务，之后id为3的事务提交了。那么一个新的读事务在生成ReadView时，m_ids就包括1和2，min_trx_id的值就是1，max_trx_id的值就是4)。

4. `creator_trx_id`：表示生成该`ReadView`的事务的事务id

有了`ReadView`，这样在访问某条记录时，只需要按照下边的步骤判断记录的某个版本是否可见:

1. 如果被访问版本的`trx_id`与`ReadView中`的`creator_trx_id`值相同，意味着当前事务在访问它自己修改过的记录，所以该版本可以被当前事务访问。

2. 如果被访问版本的`trx_id`小于`ReadView`中的`min_trx_id`值，表明生成该版本的事务在当前事务生成`ReadView`前已经提交，所以该版本可以被当前事务访问

3. 如果被访问版本的`trx_id`大于`ReadView`中的`max_trx_id`值，表明生成该版本的事务在当前事务生成`ReadView`后才开启，所以该版本不可以被当前事务访问

4. 如果被访问版本的`trx_id`在`ReadView`的`min_trx_id`和`max_trx_id之`间，那就需要判断一下`trx_id`属性值是不是在`m_ids`列表中，如果在，说明创建`ReadView`时生成该版本的事务还是活跃的，该版本不可以被访问；如果不在，说明创建`ReadView`时生成该版本的事务已经被提交，该版本可以被访问

如果某个版本的数据对当前事务不可见的话，那就顺着版本链找到下一个版本的数据，继续按照上边的步骤判断可见性，依此类推，直到版本链中的最后一个版本。如果最后一个版本也不可见的话，那么就意味着该条记录对该事务完全不可见，查询结果就不包含该记录

#### READ COMMITTED和 REPEATABLE READ生成 RAED VIEW的时机

在MySQL中，READ COMMITTED和REPEATABLE READ隔离级别的的一个非常大的区别就是它们生成ReadView的时机不同。假设现在表hero中只有一条由事务id为80的事务插入的一条记录：
``` 
mysql> SELECT * FROM hero;
+--------+--------+---------+
| number | name   | country |
+--------+--------+---------+
|      1 | 刘备   | 蜀      |
+--------+--------+---------+
```

##### READ COMMITTED —— 每次读取数据前都生成一个ReadView

对于使用REPEATABLE READ隔离级别的事务来说，只会在第一次执行查询语句时生成一个`ReadView`，之后的查询就不会重复生成了

假如现在系统里有两个事务id分别为100、200的事务在执行：
``` 
########### Transaction 100
BEGIN;
UPDATE hero SET name = '关羽' WHERE number = 1;
UPDATE hero SET name = '张飞' WHERE number = 1;

########### Transaction 200
BEGIN;
# 更新了一些别的表的记录
...
```
备注: 事务执行过程中，只有在第一次真正修改记录时（INSERT、DELETE、UPDATE,SELECT默认生成的事务id是0），才会被分配一个单独的事务id，这个事务id是递增的。所以我们才在Transaction 200
 中更新一些别的表的记录，目的是让它分配事务id。

这个时候版本链如下:

![](/images/mysql/version-chain-1.png)

现在有一个`READ COMMITTED`级别的事务开始执行:
``` 

BEGIN;
# 此时Transaction 100、200未提交， 执行 SELECT1:
SELECT * FROM hero WHERE number = 1; # 得到的列name的值为'刘备
```
这个SELECT1的执行过程如下：
1. 在执行SELECT语句时会先生成一个`ReadView`，`ReadView`的m_ids列表的内容就是[100, 200]，`min_trx_id`为`100`，`max_trx_id`为`201`，creator_trx_id为0。
   
2. 然后从版本链中挑选可见的记录，从图中可以看出，最新版本的列name的内容是'张飞'，该版本的`trx_id`值为100，在m_ids列表内，所以不符合可见性要求，根据roll_pointer跳到下一个版本。
   
3. 下一个版本的列name的内容是'关羽'，该版本的`trx_id`值也为100，也在`m_ids`列表内，所以也不符合要求，继续跳到下一个版本。
   
4. 下一个版本的列name的内容是'刘备'，该版本的`trx_id`值为80，小于ReadView中的`min_trx_id`值100，所以这个版本是符合要求的，最后返回给用户的版本就是这条列name为'刘备'的记录。

然后提交一下事务id为100的事务:
``` 
# Transaction 100
BEGIN;
UPDATE hero SET name = '关羽' WHERE number = 1;
UPDATE hero SET name = '张飞' WHERE number = 1;
## 这个时候提交这个事务
COMMIT;
```

然后再到事务id为200的事务中更新一下表hero中number为1的记录：
``` 
# Transaction 200
BEGIN;

# 更新了一些别的表的记录
...

#### 更新 number 为 1 的记录， 前面的更新操作只是为了之前生成一个新的事务id
UPDATE hero SET name = '赵云' WHERE number = 1;
UPDATE hero SET name = '诸葛亮' WHERE number = 1;
```

这个时候版本链就是这样:
![](/images/mysql/version-chain-2.png)

然后再到刚才使用`READ COMMITTED`隔离级别的事务中继续查找这个number为1的记录，如下：
``` 
# 使用READ COMMITTED隔离级别的事务
BEGIN;

# SELECT1：Transaction 100、200均未提交
SELECT * FROM hero WHERE number = 1; # 得到的列name的值为'刘备'

# SELECT2：Transaction 100提交，Transaction 200未提交
SELECT * FROM hero WHERE number = 1; # 得到的列name的值为'张飞'
```

这个SELECT2的执行过程如下：

1. 在执行SELECT语句时会又会单独生成一个`ReadView`，该`ReadView`的`m_ids`列表的内容就是[200]（事务id为100的那个事务已经提交了，所以再次生成快照时就没有它了），`min_trx_id`为200，`max_trx_id为`201，`creator_trx_id`为0。

2. 然后从版本链中挑选可见的记录，从图中可以看出，最新版本的列name的内容是'诸葛亮'，该版本的`trx_id`值为200，在`m_ids`列表内，所以不符合可见性要求，根据roll_pointer跳到下一个版本。

3. 下一个版本的列name的内容是'赵云'，该版本的`trx_id`值为200，也在`m_ids`列表内，所以也不符合要求，继续跳到下一个版本。

4. 下一个版本的列name的内容是'张飞'，该版本的`trx_id`值为100，小于`ReadView`中的`min_trx_id`值200，所以这个版本是符合要求的，最后返回给用户的版本就是这条列name为'张飞'的记录。

##### REPEATABLE READ —— 在第一次读取数据时生成一个ReadView

对于使用`REPEATABLE READ`隔离级别的事务来说，只会在第一次执行查询语句时生成一个`ReadView`，之后的查询就不会重复生成了。

还是使用上个例子，对于`REPEATABLE READ`来说， 执行 SELECT1 的时候:

1. 在执行SELECT语句时会先生成一个`ReadView`，`ReadView`的`m_ids`列表的内容就是[100, 200]，`min_trx_id`为100，`max_trx_id`为201，`creator_trx_id`为0。

2. 然后从版本链中挑选可见的记录，从图中可以看出，最新版本的列name的内容是'张飞'，该版本的`trx_id`值为100，在`m_ids`列表内，所以不符合可见性要求，根据roll_pointer跳到下一个版本。

3. 下一个版本的列name的内容是'关羽'，该版本的`trx_id`值也为100，也在`m_ids`列表内，所以也不符合要求，继续跳到下一个版本。

4. 下一个版本的列name的内容是'刘备'，该版本的`trx_id`值为80，小于ReadView中的`min_trx_id`值100，所以这个版本是符合要求的，最后返回给用户的版本就是这条列name为'刘备'的记录。

对于这个`REPEATABLE READ`的事务，在执行 SELECT2 的时候:

1. 因为当前事务的隔离级别为`REPEATABLE READ`，而之前在执行SELECT1时已经生成过`ReadView`了，所以此时直接复用之前的`ReadView`，之前的`ReadView`的`m_ids`列表的内容就是[100, 200]，`min_trx_id`为100，`max_trx_id`为201，`creator_trx_id`为0。

2. 然后从版本链中挑选可见的记录，从图中可以看出，最新版本的列name的内容是'诸葛亮'，该版本的`trx_id`值为200，在`m_ids`列表内，所以不符合可见性要求，根据roll_pointer跳到下一个版本。

3. 下一个版本的列name的内容是'赵云'，该版本的`trx_id`值为200，也在`m_ids`列表内，所以也不符合要求，继续跳到下一个版本。

4. 下一个版本的列name的内容是'张飞'，该版本的`trx_id`值为100，而m_ids列表中是包含值为100的事务id的，所以该版本也不符合要求，同理下一个列name的内容是'关羽'的版本也不符合要求。继续跳到下一个版本。

5. 下一个版本的列name的内容是'刘备'，该版本的trx_id值为80，小于ReadView中的`min_trx_id`值100，所以这个版本是符合要求的，最后返回给用户的版本就是这条列c为'刘备'的记录

也就是说两次SELECT查询得到的结果是重复的，记录的列c值都是'刘备'，这就是可重复读的含义。如果我们之后再把事务id为200的记录提交了，然后再到刚才使用REPEATABLE READ隔离级别的事务中继续查找这个number为1的记录，得到的结果还是'刘备'

#### mvcc总结

所谓的`MVCC`（Multi-Version Concurrency Control ，多版本并发控制）指的就是在使用`READ COMMITTD`、`REPEATABLE READ`这两种隔离级别的事务在执行普通的SEELCT操作时访问记录的版本链的过程，这样子可以使不同事务的读-写、写-读操作并发执行，从而提升系统性能。`READ COMMITTD`、`REPEATABLE READ`这两个隔离级别的一个很大不同就是：生成`ReadView`的时机不同，`READ COMMITTD`在每一次进行普通SELECT操作前都会生成一个`ReadView`，而`REPEATABLE READ`只在第一次进行普通SELECT操作前生成一个`ReadView`，之后的查询操作都重复使用这个`ReadView`就好了。


### 参考资料
- [mysql事务](http://www.cnblogs.com/luyucheng/p/6297480.html)
- [mysql的四种隔离级别](http://www.cnblogs.com/zhoujinyi/p/3437475.html)
- [五分钟搞懂mysql事务隔离级别](http://www.jianshu.com/p/4e3edbedb9a8)
- [innodb中的事务隔离级别和锁](https://tech.meituan.com/2014/08/20/innodb-lock.html)