---
title: hbase基本使用
date: 2019-03-11 08:45:04
tags:
categories: bigdata
---
### 简介

Hbase是一种分布式存储的数据库，技术上来讲，它更像是分布式存储而不是分布式数据库，它缺少很多RDBMS系统的特性，比如列类型，辅助索引，触发器，和高级查询语言等待。

Hbase有如下特性:
- 强读写一致，但是不是“最终一致性”的数据存储，这使得它非常适合高速的计算聚合
- 自动分片，通过Region分散在集群中，当行数增长的时候，Region也会自动的切分和再分配
- 自动的故障转移
- Hadoop/HDFS集成，和HDFS开箱即用
- 丰富的“简洁，高效”API，Thrift/REST API，Java API
- 块缓存，布隆过滤器，可以高效的列查询优化
- 操作管理，Hbase提供了内置的web界面来操作，还可以监控JMX指标

#### Hbase的使用场景

- 首先数据库量要足够多，如果有十亿及百亿行数据，那么Hbase是一个很好的选项，如果只有几百万行甚至不到的数据量，RDBMS是一个很好的选择。因为数据量小的话，真正能工作的机器量少，剩余的机器都处于空闲的状态
- 不需要辅助索引，静态类型的列，事务等特性
- 保证硬件资源足够，每个HDFS集群在少于5个节点的时候，都不能表现的很好。因为HDFS默认的复制数量是3，再加上一个NameNode


### Hbase架构

![](/images/bigdata/hbase-arch.jpg)

- Zookeeper，作为分布式的协调。RegionServer也会把自己的信息写到ZooKeeper中
- HDFS是Hbase运行的底层文件系统
- RegionServer，理解为数据节点，存储数据的
- Master RegionServer要实时的向Master报告信息。Master知道全局的RegionServer运行情况，可以控制RegionServer的故障转移和Region的切分


细化后架构:
![](/images/bigdata/hbase-arch-detail.jpg)


#### 存储结构

在Hbase中，表被分割成多个更小的块然后分散的存储在不同的服务器上，这些小块叫做Regions，存放Regions的地方叫做RegionServer。Master进程负责处理不同的RegionServer之间的Region的分发。

HRegionServer除了包含一些HRegions之外，还处理两种类型的文件用于数据存储：
- HLog， 预写日志文件，也叫做WAL(write-ahead log)
- HFile 真实的数据存储文件

##### Hlog

- MasterProcWAL：HMaster记录管理操作，比如解决冲突的服务器，表创建和其它DDLs等操作到它的WAL文件中，这个WALs存储在MasterProcWALs目录下，它不像RegionServer的WALs，HMaster的WAL也支持弹性操作，就是如果Master服务器挂了，其它的Master接管的时候继续操作这个文件

- WAL记录所有的Hbase数据改变，如果一个RegionServer在MemStore进行FLush的时候挂掉了，WAL可以保证数据的改变被应用到。如果写WAL失败了，那么修改数据的完整操作就是失败的
  - 通常情况，每个RegionServer只有一个WAL实例。
  - WAL位于`/hbase/WALs/`目录下
  - MultiWAL: 如果每个RegionServer只有一个WAL，由于HDFS必须是连续的，导致必须写WAL连续的，然后出现性能问题。MultiWAL可以让RegionServer同时写多个WAL并行的，通过HDFS底层的多管道，最终提升总的吞吐量，但是不会提升单个Region的吞吐量


##### HFile

HFile是Hbase在HDFS中存储数据的格式，它包含多层的索引，这样在Hbase检索数据的时候就不用完全的加载整个文件。索引的大小(keys的大小，数据量的大小)影响block的大小，在大数据集的情况下，block的大小设置为每个RegionServer 1GB也是常见的。


### 参考资料
- [入门Hbase](https://juejin.im/post/5c666cc4f265da2da53eb714)
- [Apache Hbase入门教程](http://www.importnew.com/21958.html)
