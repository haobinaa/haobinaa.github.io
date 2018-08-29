---
title: mysql事务
date: 2017-12-02 11:25:21
tags: mysql
categories: mysql
---
### 事务（Transaction）及其ACID属性
1. 原子性(Atomicity)：事务是一个原子操作单元，其对数据的修改，要么全都执行，要么全都不执行
2. 一致性(Consistent):在事务开始和完成时，数据都必须保持一致状态。这意味着所有相关的数据规则都必须应用于事务的修改，以保持数据的完整性；事务结束时，所有的内部数据结构（如B树索引或双向链表）也都必须是正确的
3. 隔离性(Isolation):数据库系统提供一定的隔离机制，保证事务在不受外部并发操作影响的“独立”环境执行。这意味着事务处理过程中的中间状态对外部是不可见的，反之亦然
4. 持久性(Durable): 事务完成之后，它对于数据的修改是永久性的，即使出现系统故障也能够保持

### 并发事务带来的问题
#### 更新丢失(lost update)
当两个或多个事务选择同一行，然后基于最初选定的值更新该行时，由于每个事务都不知道其他事务的存在，就会发生丢失更新问题－－最后的更新覆盖了由其他事务所做的更新。例如，两个编辑人员制作了同一文档的电子副本。每个编辑人员独立地更改其副本，然后保存更改后的副本，这样就覆盖了原始文档。最后保存其更改副本的编辑人员覆盖另一个编辑人员所做的更改。如果在一个编辑人员完成并提交事务之前，另一个编辑人员不能访问同一文件，则可避免此问题

#### 脏读(dirty read)
事务A正在对一条记录做修改，但未提交。这时，事务B也来读取同一条记录，如果不加控制，第二个事务读取了这些“脏”数据，并据此做进一步的处理，就会产生未提交的数据依赖关系。这种现象被形象地叫做"脏读"

#### 不可重复读(Non-Repeatable Read)
是指在一个事务内，多次读同一数据。在这个事务还没有结束时，另外一个事务也访问该同一数据。那么，在第一个事务中的两次读数据之间，由于第二个事务的修改，那么第一个事务两次读到的的数据可能是不一样的

#### 幻读(Phantom Read)
第一个事务对一个表中的数据进行了修改，这种修改涉及到表中的全部数据行。同时，第二个事务也修改这个表中的数据，这种修改是向表中插入一行新数据。那么，以后就会发生操作第一个事务的用户发现表中还有没有修改的数据行，就好象发生了幻觉一样

### 事务隔离级别

在上面讲到的并发事务处理带来的问题中，“更新丢失”通常是应该完全避免的。但防止更新丢失，并不能单靠数据库事务控制器来解决，需要应用程序对要更新的数据加必要的锁来解决，因此，防止更新丢失应该是应用的责任。

“脏读”、“不可重复读”和“幻读”，其实都是数据库读一致性问题，必须由数据库提供一定的事务隔离机制来解决。数据库实现事务隔离的方式，基本上可分为以下两种：

1.在读取数据前，对其加锁，阻止其他事务对数据进行修改

2.不用加任何锁，通过一定机制生成一个数据请求时间点的一致性数据快照（Snapshot)，并用这个快照来提供一定级别（语句级或事务级）的一致性读取。从用户的角度来看，好像是数据库可以提供同一数据的多个版本，因此，这种技术叫做数据多版本并发控制（MultiVersion Concurrency Control，简称MVCC或MCC），也经常称为多版本数据库


数据库的事务隔离越严格，并发副作用越小，但付出的代价也就越大，因为事务隔离实质上就是使事务在一定程度上 “串行化”进行，这显然与“并发”是矛盾的。同时，不同的应用对读一致性和事务隔离程度的要求也是不同的，比如许多应用对“不可重复读”和“幻读”并不敏感，可能更关心数据并发访问的能力

#### mysql四个隔离级别
| 隔离级别  |   数据一致性   | 脏读    | 不可重复读 |   幻读 |
|----------|:--------------|:--------|:--------|:--------|
|未提交读(Read uncommited)| 最低级别，只能保证不读取物理上损坏的数据| Y | Y | Y |
| 已提交读(Read commited) | 语句级别 | N | Y | Y |
| 可重复读(Repeatable Read) | 事务级 | N | N | Y |
| 可序列化(Serializable) | 最高级别，事务级 | N | N | N |



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

#### 脏读
``` 
##############  session1 #####################
select @@session.tx_isolation;
+------------------------+
| @@session.tx_isolation |
+------------------------+
| REPEATABLE-READ        |
+------------------------+

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

######### session2 ###############
 select @@session.tx_isolation;
+------------------------+
| @@session.tx_isolation |
+------------------------+
| REPEATABLE-READ        |
+------------------------+

-- 在默认隔离级别(repeatable-read)下不会出现脏读
 select * from book_table;
Empty set (0.00 sec)

set session transaction isolation level read uncommitted;
Query OK, 0 rows affected (0.00 sec)

-- 改成read-uncommitted出现了脏读
 select @@session.tx_isolation;
+------------------------+
| @@session.tx_isolation |
+------------------------+
| READ-UNCOMMITTED       |
+------------------------+

 select * from book_table;
+----------+--------+
| bookname | bookid |
+----------+--------+
| math     |      1 |
+----------+--------+
```

#### 不可重复读
``` 
########## session1 ##############
select @@session.tx_isolation;
+------------------------+
| @@session.tx_isolation |
+------------------------+
| READ-COMMITTED         |
+------------------------+

 select * from book_table;
+----------+--------+
| bookname | bookid |
+----------+--------+
| math     |      1 |
+----------+--------+


######## session2 #################
 select @@session.tx_isolation;
+------------------------+
| @@session.tx_isolation |
+------------------------+
| REPEATABLE-READ        |
+------------------------+
1 row in set (0.00 sec)

start transaction;
Query OK, 0 rows affected (0.00 sec)

insert into book_table(bookname) values('english');
Query OK, 1 row affected (0.00 sec)

commit;
Query OK, 0 rows affected (0.07 sec)

############# session1 ############
-- 在read-committed下出现了不可重复读
select * from book_table;
+----------+--------+
| bookname | bookid |
+----------+--------+
| math     |      1 |
| english  |      2 |
+----------+--------+
2 rows in set (0.00 sec)
```

#### 可重复读
``` 
########## session1 ##########
 select @@session.tx_isolation;
+------------------------+
| @@session.tx_isolation |
+------------------------+
| REPEATABLE-READ        |
+------------------------+

start transaction;

 select * from book_table;
+----------+--------+
| bookname | bookid |
+----------+--------+
| math     |      1 |
| english  |      2 |
+----------+--------+


########## session2 #########
select @@session.tx_isolation;
+------------------------+
| @@session.tx_isolation |
+------------------------+
| REPEATABLE-READ        |
+------------------------+

start transaction;

insert into book_table(bookname) values('art');

commit;

######### session1 ###########
-- 可以看到在repeatable-read下没有出现不可重复读
select * from book_table;
+----------+--------+
| bookname | bookid |
+----------+--------+
| math     |      1 |
| english  |      2 |
+----------+--------+

-- 提交当前事务，就可以看到session2修改的结果
commit;
Query OK, 0 rows affected (0.00 sec)

select * from book_table;
+----------+--------+
| bookname | bookid |
+----------+--------+
| math     |      1 |
| english  |      2 |
| art      |      3 |
+----------+--------+
```

#### 幻读
``` 
desc t_bitfly;
+-------+-------------+------+-----+---------+-------+
| Field | Type        | Null | Key | Default | Extra |
+-------+-------------+------+-----+---------+-------+
| id    | bigint(20)  | NO   | PRI | 0       |       |
| value | varchar(32) | YES  |     | NULL    |       |
+-------+-------------+------+-----+---------+-------+

select @@global.tx_isolation, @@tx_isolation;
+-----------------------+-----------------+
| @@global.tx_isolation | @@tx_isolation  |
+-----------------------+-----------------+
| REPEATABLE-READ       | REPEATABLE-READ |
+-----------------------+-----------------+

实验一
t Session A                   Session B
|
| START TRANSACTION;          START TRANSACTION;
|
| SELECT * FROM t_bitfly;
| empty set
|                             INSERT INTO t_bitfly
|                             VALUES (1, 'a');
|
| SELECT * FROM t_bitfly;
| empty set
|                             COMMIT;
|
| SELECT * FROM t_bitfly;
| empty set
|
| INSERT INTO t_bitfly VALUES (1, 'a');
| ERROR 1062 (23000):
| Duplicate entry '1' for key 1
如此就出现了幻读，以为表里没有数据，其实数据已经存在了，傻乎乎的提交后，才发现数据冲突了


实验二
t Session A                  Session B
|
| START TRANSACTION;         START TRANSACTION;
|
| SELECT * FROM t_bitfly;
| +------+-------+
| | id   | value |
| +------+-------+
| |    1 | a     |
| +------+-------+
|                            INSERT INTO t_bitfly
|                            VALUES (2, 'b');
|
| SELECT * FROM t_bitfly;
| +------+-------+
| | id   | value |
| +------+-------+
| |    1 | a     |
| +------+-------+
|                            COMMIT;
|
| SELECT * FROM t_bitfly;
| +------+-------+
| | id   | value |
| +------+-------+
| |    1 | a     |
| +------+-------+
|
| UPDATE t_bitfly SET value='z';
| Rows matched: 2  Changed: 2  Warnings: 0
| (多出来一行)
|
| SELECT * FROM t_bitfly;
| +------+-------+
| | id   | value |
| +------+-------+
| |    1 | z     |
| |    2 | z     |
| +------+-------+

本事务中第一次读取出一行，做了一次更新后，另一个事务里提交的数据就出现了。也可以看做是一种幻读。
当隔离级别是可重复读，且禁用innodb_locks_unsafe_for_binlog的情况下，在搜索和扫描index的时候使用的next-key locks可以避免幻读。

实验三
t Session A                 Session B
|
| START TRANSACTION;        START TRANSACTION;
|
| SELECT * FROM t_bitfly
| WHERE id<=1
| FOR UPDATE;
| +------+-------+
| | id   | value |
| +------+-------+
| |    1 | a     |
| +------+-------+
|                           INSERT INTO t_bitfly
|                           VALUES (2, 'b');
|                           Query OK, 1 row affected
|
| SELECT * FROM t_bitfly;
| +------+-------+
| | id   | value |
| +------+-------+
| |    1 | a     |
| +------+-------+
|                           INSERT INTO t_bitfly
|                           VALUES (0, '0');
|                           (waiting for lock ...then timeout)
|                           ERROR 1205 (HY000):
|                           Lock wait timeout exceeded;
|                           try restarting transaction
|
| SELECT * FROM t_bitfly;
| +------+-------+
| | id   | value |
| +------+-------+
| |    1 | a     |
| +------+-------+
|                           COMMIT;
|
| SELECT * FROM t_bitfly;

| +------+-------+
| | id   | value |
| +------+-------+
| |    1 | a     |
| +------+-------+
可以看到，用id<=1加的锁，只锁住了id<=1的范围，可以成功添加id为2的记录，添加id为0的记录时就会等待锁的释放

实验四
实验四：一致性读和提交读
t Session A                      Session B
|
| START TRANSACTION;             START TRANSACTION;
|
| SELECT * FROM t_bitfly;
| +----+-------+
| | id | value |
| +----+-------+
| |  1 | a     |
| +----+-------+
|                                INSERT INTO t_bitfly
|                                VALUES (2, 'b');
|                                COMMIT;
|
| SELECT * FROM t_bitfly;
| +----+-------+
| | id | value |
| +----+-------+
| |  1 | a     |
| +----+-------+
|
| SELECT * FROM t_bitfly LOCK IN SHARE MODE;
| +----+-------+
| | id | value |
| +----+-------+
| |  1 | a     |
| |  2 | b     |
| +----+-------+
|
| SELECT * FROM t_bitfly FOR UPDATE;
| +----+-------+
| | id | value |
| +----+-------+
| |  1 | a     |
| |  2 | b     |
| +----+-------+
|
| SELECT * FROM t_bitfly;
| +----+-------+
| | id | value |
| +----+-------+
| |  1 | a     |
| +----+-------+
```
### 参考资料
- [mysql事务](http://www.cnblogs.com/luyucheng/p/6297480.html)
- [mysql的四种隔离级别](http://www.cnblogs.com/zhoujinyi/p/3437475.html)
- [五分钟搞懂mysql事务隔离级别](http://www.jianshu.com/p/4e3edbedb9a8)