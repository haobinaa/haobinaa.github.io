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
另外 copy 是在 Server 层处理的， INPLACE 是在 innodb 引擎层处理的

整体流程:
1. 「记录DML操作」：在DDL操作执行期间，如果有DML操作（如INSERT、UPDATE、DELETE）尝试修改表，这些操作会被记录下来。
「应用DML更改」：DDL操作完成后，之前记录的DML更改会被应用到表上，确保数据的完整性和一致性。





### 参考
- [aliyun RDS onlineDDL 使用](https://help.aliyun.com/zh/rds/support/how-do-i-perform-ddl-operations-online-on-apsaradb-rds-for-mysql)