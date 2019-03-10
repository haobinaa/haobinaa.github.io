---
title: hdfs介绍
date: 2019-03-01 18:32:13
tags: 
categories: bigdata
---

### HDFS

在了解大数据的组件之前，首先需要了解HDFS架构。

HDFS(Hadoop Distributed File System)是 Apache Hadoop的一个子项目， 是分布式计算中数据存储管理的基础，是基于流数据模式访问和处理超大文件的需求而开发的。

1. HDFS 与其他分布式文件系统有许多相似点，但也有几个不同点。一个明显的区别是 HDFS 的 “一次写入、多次读取（write-once-read-many）” 模型，该模型降低了并发性控制要求，简化了数据聚合性，支持高吞吐量访问。

2. HDFS 的另一个独特的特性是下面这个观点：将处理逻辑放置到数据附近通常比将数据移向应用程序空间更好。

3. HDFS 将数据写入严格限制为一次一个写入程序。字节总是被附加到一个流的末尾，字节流总是以写入顺序存储。

HDFS设计构想和目标如下:
- 通过检测故障和应用快速、自动的恢复实现容错性
- 通过 MapReduce 流进行数据访问
- 简单可靠的聚合模型
- 处理逻辑接近数据，而不是数据接近处理逻辑
- 跨异构普通硬件和操作系统的可移植性
- 可靠存储和处理大量数据的可伸缩性
- 通过跨多个普通个人计算机集群分布数据和处理来节约成本
- 通过分布数据和逻辑到数据所在的多个节点上进行平行处理来提高效率
- 通过自动维护多个数据副本和在故障发生时自动重新部署处理逻辑来实现可靠性

### HDFS架构

HDFS是主从（master/slave）架构。一个HDFS集群包含一个NameNode，作为管理文件系统名称空间（file system namespace）和管理客户端访问HDFS的主服务器。此外，还有一组DataNode节点，通常群集中的每个节点都是一个DataNode，用于管理自己节点上的存储。HDFS开放文件系统名称空间，并允许用户把数据存储在文件中。

![](/images/bigdata/hdfs-architecture.jpg)



### HDFS概念

#### NameNode

 Namenode 上保存着 HDFS 的名字空间。对于任何对文件系统元数据产生修改的操作， Namenode 都会使用一种称为 EditLog 的事务日志记录下来。例如，在 HDFS 中创建一个文件， Namenode 就会在 Editlog 中插入一条记录来表示；同样地，修改文件的副本系数也将往 Editlog 插入一条记录。 Namenode 在本地操作系统的文件系统中存储这个 Editlog 。整个文件系统的名 字空间，包括数据块到文件的映射、文件的属性等，都存储在一个称为 FsImage 的文件中，这 个文件也是放在 Namenode 所在的本地文件系统上。 
 
  Namenode 在内存中保存着整个文件系统的名字空间和文件数据块映射 (Blockmap) 的映像 。这个关键的元数据结构设计得很紧凑，因而一个有 4G 内存的 Namenode 足够支撑大量的文件 和目录。当 Namenode 启动时，它从硬盘中读取 Editlog 和 FsImage ，将所有 Editlog 中的事务作 用在内存中的 FsImage 上，并将这个新版本的 FsImage 从内存中保存到本地磁盘上，然后删除 旧的 Editlog ，因为这个旧的 Editlog 的事务都已经作用在 FsImage 上了。这个过程称为一个检查 点 (checkpoint) 。在当前实现中，检查点只发生在 Namenode 启动时，在不久的将来将实现支持 周期性的检查点
  
  #### DataNode
  
  Datanode 将 HDFS 数据以文件的形式存储在本地的文件系统中，它并不知道有 关 HDFS 文件的信息。它把每个 HDFS 数据块存储在本地文件系统的一个单独的文件 中。 Datanode 并不在同一个目录创建所有的文件，实际上，它用试探的方法来确定 每个目录的最佳文件数目，并且在适当的时候创建子目录。在同一个目录中创建所 有的本地文件并不是最优的选择，这是因为本地文件系统可能无法高效地在单个目 录中支持大量的文件。 

当一个 Datanode 启动时，它会扫描本地文件系统，产生一个这些本地文件对应 的所有 HDFS 数据块的列表，然后作为报告发送到 Namenode ，这个报告就是块状态 报告。 


#### 文件系统Namespace

HDFS支持传统的分层文件组织。用户或应用程序可以在这些目录内创建目录并存储文件。文件系统名称空间层次与大多数其他现有文件系统类似;可以创建和删除文件，将文件从一个目录移动到另一个目录，或者重命名文件。HDFS支持用户配额（user quotas）和访问权限（access permissions）。

#### 数据副本

HDFS设计宗旨是可靠的存储着超大型文件，运行在大规模的集群机器上。它将每个文件存储为一系列的块（a sequence of blocks）。文件的块被复制，是用来实现容错。块大小（block size ）和复制因子（replication factor）可以针对每个文件进行配置

一个文件中，除了最后一个数据块（blocks）之外，其他所有的数据块都具有相同的大小。当用户可以在将可变长度块的配置加到append和hsync后，可以在不填写最后一个块的情况下，写入到新的数据块中。

应用程序可以在文件创建时指定文件的副本数量，也可以在后面进行修改。HDFS中的文件是一次性写入的（追加和截断除外），并且在任何时候都严格的限定一个文件只能有一个写入线程。

NameNode决定着数据块的复制。它定期从集群中的每个DataNode接收心跳（Heartbeat）和数据块报告（Blockreport）。能接收到Heartbeat意味着DataNode运行正常。 而Blockreport包含DataNode上所有块的列表信息。使用这种策略的短期目标是在生产系统上对其进行验证，更多地了解其行为，并为测试和研究更复杂的策略奠定基础。

![](/images/bigdata/hdfs-datablock.jpg)


### 读写流程

#### HDFS文件读取

![](/images/bigdata/hdfs-read.jpg)

1. 使用HDFS提供的客户端开发库Client，向远程的Namenode发起RPC请求
2. Namenode会视情况返回文件的部分或者全部block列表，对于每个block，Namenode都会返回有该block拷贝的DataNode地址； 
3. 客户端开发库Client会选取离客户端最接近的DataNode来读取block；如果客户端本身就是DataNode,那么将从本地直接获取数据.
4. 读取完当前block的数据后，关闭与当前的DataNode连接，并为读取下一个block寻找最佳的DataNode； 
5. 当读完列表的block后，且文件读取还没有结束，客户端开发库会继续向Namenode获取下一批的block列表。
6. 读取完一个block都会进行checksum验证，如果读取datanode时出现错误，客户端会通知Namenode，然后再从下一个拥有该block拷贝的datanode继续读。 


#### HDFS文件写入

![](/images/bigdata/hdfs-write.jpg)

1. 使用HDFS提供的客户端开发库Client，向远程的Namenode发起RPC请求
2. Namenode会检查要创建的文件是否已经存在，创建者是否有权限进行操作，成功则会为文件 创建一个记录，否则会让客户端抛出异常
3. 当客户端开始写入文件的时候，会将文件切分成多个packets，并在内部以数据队列"data queue"的形式管理这些packets，并向Namenode申请新的blocks，获取用来存储replicas的合适的datanodes列表，列表的大小根据在Namenode中对replication的设置而定
4. 开始以pipeline（管道）的形式将packet写入所有的replicas中。把packet以流的方式写入第一个datanode，该datanode把该packet存储之后，再将其传递给在此pipeline中的下一个datanode，直到最后一个datanode，这种写数据的方式呈流水线的形式。最后一个datanode成功存储之后会返回一个ack packet，在pipeline里传递至客户端，在客户端的开发库内部维护着"ack queue"，成功收到datanode返回的ack packet后会从"ack queue"移除相应的packet
5. 如果传输过程中，有某个datanode出现了故障，那么当前的pipeline会被关闭，出现故障的datanode会从当前的pipeline中移除，剩余的block会继续剩下的datanode中继续以pipeline的形式传输，同时Namenode会分配一个新的datanode，保持replicas设定的数量


### 备份和安全

### 参考资料
- [hdfs官方文档](https://hadoop.apache.org/docs/r1.2.1/hdfs_design.html#Introduction)
- [hdfs架构原理](https://my.oschina.net/leejun2005/blog/151872)