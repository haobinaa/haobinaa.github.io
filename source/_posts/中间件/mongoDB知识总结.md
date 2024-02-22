---
title: mongoDB知识总结
date: 2024-01-12 15:38:34
tags: mongo
categories: 中间件
---
### MongoDB 简介

MongoDB 是基于文档的 NoSql 存储引擎。MongoDB 的数据库管理由数据库、Collection（集合,类似MySql的表）、Document（文档，类似MySQL的行）组成，每个Document都是一个类JSON结构BSON结构数据。 MongoDB 的核心特性是：No Schema、高可用、分布式（可平行扩展），另外MongoDB自带数据压缩功能，使得同样的数据存储所需的资源更少。

#### MongoDB 特点
- 面向集合存储：MongoDB 是面向集合的，数据以 collection 分组存储。每个 collection 在数据库中都有唯一的名称。
- 模式自由：集合的概念类似 MySQL 里的表，但它不需要定义任何模式。
- 结构松散：对于存储在数据库中的文档，不需要设置相同的字段，并且相同的字段不需要相同的数据类型，不同结构的文档可以存在同一个 collection 里。
- 高效的二进制存储：存储在集合中的文档，是以键值对的形式存在的。键用于唯一标识一个文档，一般是 ObjectId 类型，值是以 BSON 形式存在的。BSON = Binary JSON， 是在 JSON 基础上加了一些类型及元数据描述的格式。
- 支持索引：可以在任意属性上建立索引，包含内部对象。MongoDB 的索引和 MySQL 的索引基本一样，可以在指定属性上创建索引以提高查询的速度。除此之外，MongoDB 还提供创建基于地理空间的索引的能力。
- 支持 mapreduce：通过分治的方式完成复杂的聚合任务。
- 支持 failover：通过主从复制机制，可以实现数据备份、故障恢复、读扩展等功能。基于复制集的复制机制提供了自动故障恢复的功能，确保了集群数据不会丢失。
- 支持分片：MongoDB 支持集群自动切分数据，可以使集群存储更多的数据，实现更大的负载，在数据插入和更新时，能够自动路由和存储。
- 支持存储大文件：MongoDB 中 BSON 对象最大不能超过 16 MB。对于大文件的存储，BSON 格式无法满足。GridFS 机制提供了一个存储大文件的机制，可以将一个大文件分割成为多个较小的文档进行存储。

### 关键概念

#### database  数据库

一个 MongoDB 实例可以创建多个 database。连接时如果没开启免认证模式的话，需要连接到 admin 库进行认证。如果开启免认证模式，若不指定 database 进行连接，默认连接一个叫 db 的数据库。

MongoDB 预置了几个特殊的 database:
- admin: admin 数据库主要是保存 root 用户和角色。例如，system.users 表存储用户，system.roles 表存储角色。一般不建议用户直接操作这个数据库。将一个用户添加到这个数据库，且使它拥有 admin 库上的名为 dbAdminAnyDatabase 的角色权限，这个用户自动继承所有数据库的权限。一些特定的服务器端命令也只能从这个数据库运行，比如关闭服务器。
- local: local 数据库是不会被复制到其他分片的，因此可以用来存储本地单台服务器的任意 collection。一般不建议用户直接使用 local 库存储任何数据，也不建议进行 CRUD 操作，因为数据无法被正常备份与恢复。
- config: 当 MongoDB 使用分片设置时，config 数据库可用来保存分片的相关信息


#### collection 数据集合

collection 相当于 MySQL 的 table。

MongoDB 集合存在于数据库中，没有固定的结构，可以往集合插入不同格式和类型的数据。集合不需要事先创建。当第一个文档插入，或者第一个索引创建时，集合就会被创建。



#### document 数据记录行

document 相当于 MySQL 的 row

MongoDB 称为文档型数据库， document 组织结构是 BSON(Binary Serialized Document Format) 是类JSON的二进制存储格式，数据组织和访问方式完全和JSON一样。
该结构支持动态的添加字段、支持内嵌对象和数组对象，同时它也对JSON做了一些扩充，如支持 Date 和 BinData 数据类型。正是BSON这种字段灵活管理能力赋予了Mongo 的 No Schema 或者 Schema Free的特性。

MongoDB 在提供 No Schema 特性基础上，提供了部分可选的 Schema 特性：Validation。其主要功能有包括：
- 规定 Document 对象必须包含某些字段
- 规定 Document 某个字段的数据类型$type（MongoDB 中 $ 开头的都是关键字）
- 规定 Document 某个字段的取值范围：可以是枚举 $in，或者正则 $regex


更多信息参考官方文档: [MongoDB Schema Validation](https://www.mongodb.com/docs/manual/core/schema-validation/)

#### 索引

MongoDB 支持丰富的索引方式:

- 单字段索引：有三种方式，（1）在单个字段上创建索引；（2）在嵌入式字段上创建索引；（3）在内嵌文档上创建索引
- 复合索引：支持在多个字段上匹配的查询。对任何复合索引施加 32 个字段的限制。对于复合索引，MongoDB 可以使用索引来支持对索引前缀的查询
- 多键索引：为了索引包含数组值的字段，MongoDB 为数组中的每个元素创建一个索引键。这些多键索引支持对数组字段的高效查询
- 文本索引：支持对字符串内容的文本搜索查询。文本索引可以包含任何值为字符串或字符串元素数组的字段。一个集合最多可以有一个文本索引
- 通配符索引：支持针对未知或任意字段的查询。如：`db.collection.createIndex( {"a.$**" : 1 } )` 可支持诸如 `db.collection.find({ "a.b" : 1 })、db.collection.find({ "a.c" : { $lt : 2 } })` 等查询，提高查询效率。不能使用通配符索引来分片集合。不能为通配符创建复合索引
- 通配符文本索引：通配符文本索引不同于通配符索引。通配符索引不支持使用`$text`操作符的查询。通配符文本索引为集合中每个文档中包含字符串数据的每个字段建立索引。索引的创建方式示例：`db.collection.createIndex( { "$**": "text" } )`
- hashed 索引：支持使用哈希的分片键进行分片。基于哈希的分片使用字段的散列索引作为分片键，以便跨分片集群对数据进行分区。MongoDB 支持任何单个字段的哈希索引，但不支持创建具有多个哈希字段的复合索引，也不能在索引上指定唯一哈希索引
- 唯一索引：确保索引字段不会存储重复值。如果集合已经存在了违反索引的唯一约束的文档，则后台创建唯一索引会失败
- 部分索引：只索引集合中满足指定筛选器表达式的文档。例如：db.collection.createIndex({ a:1 },{ partialFilterExpression: { b: { $lt: 100 } } }) 表示只对集合中 b 字段小于 100 的文进行索引，大于等于 100 的文档不会被索引。这可以有效提高存储效率
- 稀疏索引：只包含有索引字段的文档的条目，即使索引字段包含空值。索引会跳过任何缺少索引字段的文档。非稀疏索引包含集合中的所有文档，为那些不包含索引字段的文档存储空值



#### 视图

视图基于已有的集合进行创建，是只读的，不实际存储硬盘，通过视图进行写操作会报错。视图使用其上游集合的索引。
由于索引是基于集合的，所以不能基于视图创建、删除或重建索引，也不能获取视图的索引列表。如果视图依赖的集合是分片的, 那么视图也视为分片的。视图是实时计算并读取的


#### 主键 ObjectId

在 MongoDB 中，存储在集合中的每个文档都需要一个唯一的 _id 字段作为主键。如果插入的文档省略了 _id 字段，则自动为文档生成一个 _id

ObjectId 可以快速生成并排序，长度为 12 个字节，包括：
- 一个 4 字节的时间戳，表示 unix 时间戳
- 5 字节随机值
- 3 字节递增计数器，初始化为随机值


### 高可用与扩展


#### 复制集(副本集)

复制集群又称为副本集（Replica Set），是一组维护相同数据集合的 mongod 进程。复制集群是 MongoDB 高可用的基础， 典型副本集群架构如下:

![](/images/mongodb/replica_set.png)

如上图， 一个副本集至少有3个节点组成：
- 有且仅有一个主节点（Primary）：负责整个集群的写操作入口，主节点挂掉之后会自动选出新的主节点。
- 一个或多个从节点（Secondary）：一般是2个或以上，从主节点同步数据，在主节点挂掉之后可被选举成新的主节点。
- 零个或1个仲裁节点（Arbiter）：这个是为了节约资源或者多机房容灾用，只负责主节点选举时投票不存数据，保证能有节点获得多数赞成票。


复制集群确保数据一致性的核心设计是：
1. Journal日志：Journal日志是 MongoDB 的预写日志 WAL，类似 MySQL 的 redo log，然后 100ms 一次将 Journal 日志刷盘。当然触发机制还有其它场景，这里仅仅是讨论异常场景下可能丢失多长时间的数据。
2. Oplog：Oplog 是用来做主从复制的，类似 MySql 里的 binlog。MongoDB 的写操作都由 Primary 节点负责，Primary 节点会在写数据时会将操作记录在 Oplog 中，Secondary 节点通过拉取 oplog 信息，回放操作实现数据同步。 关于 Journal 日志和 Oplog 的更多区别可以参考: [MongoDB的两种日志Journal与Oplog](https://www.jianshu.com/p/1b8631fb4c25)
3. Checkpoint：上面提到了 MongoDB 的写只写了内存和 Journal 日志（Journal 日志是WAL日志），并没有做数据持久化到数据文件中，Checkpoint 就是将内存变更刷新到磁盘持久化的过程。MongoDB 会每60s一次将内存中的变更刷盘，并记录当前持久化点（checkpoint），以便数据库在重启后能快速恢复数据
4. 节点选举：MongoDB 的节点选举规则能够保证在Primary挂掉之后选取的新节点一定是集群中数据最全的一个

#### MongoDB 读写策略

MongoDB 提供了一整套的机制让用户根据自己业务场景选择不同的策略来做到不同的高可用效果。这里要说的就是 MongoDB 的读写策略，根据用户选取不同的读写策略，将会得到不同程度的数据可靠性和一致性保障。

##### Write Concern（写策略）

控制服务端一次写操作在什么情况下才返回客户端成功，由两个参数控制：
- `w参数`：控制数据同步到多少个节点才算成功，取值范围0～节点个数/majority。0表示服务端收到请求就返回成功，majority表示同步到大多数（大于等于N/2）节点才返回成功。其它值表示具体的同步节点个数。默认为1，表示 Primary 写成功就返回成功。
- `j参数`：控制单个节点是否完成 Journal 持久化到磁盘才返回成功，取值范围 true/false。默认 false，因此可能最多丢100ms数据。

##### Read Preference（读策略）

控制客户端从什么节点读取数据，默认为 primary，具体参数及含义：
- `primary`：读主节点
- `primaryPreferred`：优先读主节点，不存在时读从节点
- `secondary`：读从节点
- `secondaryPreferred`：优先读从节点，不存在时读主节点
- `nearest`：就近读，不区分主节点还是从节点，只考虑节点延时

##### Read Concern Level（读级别）

这个参数主要控制的是读到的数据是不是最新的、是不是持久的，最新的和持久的是一对矛盾，最新的数据可能会被回滚，持久的数据可能不是最新的，这需要业务根据自己场景的容忍度做决策。

具体可选参数:
- `local`：直接从查询节点返回，不关心这些数据被同步到了多少个节点。存在被回滚的风险。
- `available`：适用于分片集群，和local差不多，也存在被回滚的风险。
- `majority`：返回被大多数节点确认过的数据，不会被回滚，前提是WriteConcern=majority
- `linearizable`：适用于事务，读操作会等待在它开始前已经在执行的事务提交了才返回
- `snapshot`：适用于事务，快照隔离，直接从快照去。

#### 分片集群

分片集群让 MongoDB 支持水平扩展， 是 MongoDB 支持海量数据存储的基础。一个典型的分片集群架构如下:

![](/images/mongodb/shard_set.png)

分片集群组成部分:
- shard: 每个分片都保存着一个集合的子集，所有分片上的子集的数据互不相交，构成完整的集合。每个分片可以被部署为复制集架构。
- mongos: 路由服务，不存具体数据，从 Config 获取集群配置讲请求转发到特定的分片，并且整合分片结果返回给客户端。
- config server：存储集群的各种元数据和配置，如分片地址、chunks 等

MongoDB的分片架构和其他支持海量存储的设计很类似， 本质上都是对存储进行分片，然后前面挂一个 Proxy 进行路由管理， MongoDB 的分片设计有一个很多数据库没有的特性就是: 数据均衡。
数据分片一个绕不开的话题就是数据分布不均匀导致不同分片负载差异巨大，不能最大化利用集群资源，MongoDB 的数据均衡的实现方式是：
1. 分片集群上数据管理单元叫 chunk，一个chunk默认64M，可选范围1～1024M。
2. 集群有多少个chunk，每个chunk的范围，每个chunk是存在哪个分片上的，这些数据都是存储在 Config Server 的。
3. chunk 会在其内部包含的数据超过阈值时分裂成两个。
4. MongoDB 在运行时会自定检测不同分片上的chunk数，当发现最多和最少的差异超过阈值就会启动chunk迁移，使得每个分片上的chunk数差不多。
5. chunk 迁移过程叫 rebalance，会比较耗资源，因此一般要把它的执行时间设置到业务低峰期。

##### 分配算法

MongoDB 支持两种分片算法来满足不同的查询需求：
- 区间分片：可以按 shardkey 做区间查询的分片算法，直接按照 shardkey 的值来分片。
- hash分片：用的最多的分片算法，按shardkey 的 hash 值来分片。hash 分片可以看作一种特殊的区间分片。


### Wired Tiger 存储引擎

MongoDB 3.2 默认使用 WiredTiger 存储引擎， MongoDB 的所有功能都是依靠存储引擎层实现的。


#### 底层数据存储

Wired Tiger 在内存和磁盘上的数据结构都 B+ Tree(还支持LSM, 默认 B+ Tree)。
Wired Tiger 管理数据结构的基本单元是 Page:

![](/images/mongodb/storage_structure.png)

Page 上有3个重要的 list WT_ROW、WT_UPDATE、WT_INSERT:
- WT_ROW：是从磁盘加载进来的数据数组
- WT_UPDATE：是记录数据加载之后到下个checkpoint之间被修改的数据
- WT_INSERT：是记录数据加载之后到下个checkpoint之间新增的数据

#### Cache

MongoDB 不是内存数据库， 在设计上为了效的读写操作存储引擎会最大化的利用内存缓存。当内存频繁和磁盘进行数据页交换的时候， MongoDB的性能会急剧下降。

Wired Tiger 是这样设计利用内存cache， 首先 Wired Tiger 会将整个内存划分为3块：
- 存储引擎内部cache：用于缓存数据，默认大小 `Max((RAM - 1G)/2,256M )`，服务器16G的话，就是(16-1)/2 = 7.5G 。这个内存不够可能会导致数据库宕机
- 索引cache：缓存索引信息，默认500M
- 文件系统cache：这个实际上不是存储引擎管理，是利用的操作系统的文件系统缓存(也就是 Page Cache)，目的是减少内存和磁盘交互,剩下的内存都会用来做这个

引擎cache和文件系统cache在数据结构上是不一样的，文件系统cache是直接加载的内存文件，是经过压缩的数据，可以占用更少的内存空间，相对的就是数据不能直接用，需要解压；而引擎中的数据就是前面提到的B+ Tree，是解压后的，可以直接使用的数据，占有的内存会大一些。

当内存不够用的时候， 就会触发 Evict(内存淘汰)。内存淘汰时机由 `eviction_target（内存使用量）` 和 `eviction_dirty_target（内存脏数据量）` 来控制，而内存淘汰默认是有后台的 evict 线程控制的。但是如果超过一定阈值就会把用户线程也用来淘汰，会严重影响性能，应该避免这种情况。用户线程参与evict的原因，一般是大量的写入导致磁盘IO抗不住了，需要控制写入或者更换磁盘。

| 参数名称 |  默认值  | 含义         |
|:--------|:--------|:-----------|
| eviction_target  |  80%  |  当Cache的使用量达到80%时触发evict thread淘汰page  |
| eviction_trigger  |  90%  |  当Cache的使用量达到90%时触发application thread和evict thread淘汰page  |
|  eviction_dirty_target  |  5%  |  当“脏数据”所占Cache比例达到5%时触发evict thread淘汰page  |
|  eviction_dirty_trigger  |  20%  | 当“脏数据”所占Cache比例达到20%时触发application thread和evict thread淘汰page  |


#### CheckPoint

MongoDB 的读写都是操作的内存，因此必须要有一定的机制将内存数据持久化到磁盘，这个功能就是 checkpoint 实现的。 checkpoint 主要有两个目的:
- 将内存里面发生修改的数据写到数据文件进行持久化保存，确保数据一致性
- 实现数据库在某个时刻意外发生故障，再次启动时，缩短数据库的恢复时间

在 WT引擎里 Checkpoint 本质上相当于一个日志，记录了上次Checkpoint后相关数据文件的变化，每个checkpoint包含一个root page、三个指向磁盘具体位置上pages的列表以及磁盘上文件的大小:

![](/images/mongodb/checkpoint.png)

- root page：指向 B+ Tree 的根节点
- allocated list pages：上个 checkpoint 结束之后到本checkpoint结束前新分配的 page 列表
- available list pages：Wired Tiger 分配了但是没有使用的 page，新建page时直接从这里取。
- discarded list pages：上个 checkpoint 结束之后到本checkpoint结束前被删掉的 page 列表


checkpoint 的执行流程如下:
1. 询集合数据(或系统启动)时，会打开集合对应的数据文件并读取其最新 checkpoint数据
2. 根据 checkpoint 的 file size truncate 文件。因为只有checkpoint 确认的数据才是真正持久化的数据，它后面的数据可能是最新 checkpoint 之后到宕机之间的数据，不能直接用，需要通过 Journal 日志来回放。
3. 根据 checkpoint 构建内存的 B+ Tree(live tree), 表示这是当前可以修改的checkpoint结构，用来跟踪后面写操作引起的文件变化；其它历史的checkpoint信息只能读，可以被删除
4. 数据库 run 起来之后，各种修改操作都是操作 checkpoint 的 B+ Tree，并且会 checkpoint 会有专门的list来记录这些修改和新增的page(available列表中选取可用的page供其使用。随后，这个新的page被加入到checkpoint的allocated列表中)
5. 在60s一次的checkpoint执行时，会创建新的checkpoint，并且将旧的checkpoint数据合并过来。然后执行 reconcile 将修改的数据刷新到磁盘，并删除旧的checkpoint。这时候会清空allocated，discarded 里面的page，并且将空闲的 page 加到 available里面

![](/images/mongodb/checkpoint_process.png)

#### 事务


### chunk 与 rebalance

#### chunk 分裂

chunk 是分片集群的核心概念， chunk 本质上就是由一组 Document 组成的逻辑数据单元。它是分片集群用来管理数据存储和路由的基本单元。

分片集群不会记录每条数据在哪个分片上，它只会记录哪一批（一个chunk）数据存储在哪个分片上，以及这个 chunk 包含哪些范围的数据。而数据与 chunk 之间的关联是有数据的 shard key 的分片算法 f(x) 的值是否在 chunk 的起始范围来确定的。

片集群的 chunk 信息是存在 Config 里面的，而 Config 本质上是一个复制集群。如果你创建一个分片集群，那么你默认会得到两个库，admin和config，其中config库对应的就是分片集群架构里面的Config。其中的包含一个 Collection chunks 里面记录的就是分片集群的全部chunk信息，具体结构如下图：
- _id：chunk 的唯一标识
- ns：命名空间，就是 DB.COLLECTION 的结构
- min：chunk包含数据的 shard key 的 f(x) 最小值
- max：chunk包含数据的 shard key 的 f(x) 最大值
- shard：chunk 当前所在分片ID

chunk 是分片集群管理数据的基本单元，本身有一个大小（默认大小是 64M），那么随着 chunk 内的数据不断新增，最终大小会超过限制，这个时候就需要把 chunk 拆分成2个，这个就 chunk 的分裂

导致 chunk 分裂有两个条件，达到任何一个都会触发：
- 容量达到阈值：就是 chunk 中的数据大小加起来超过阈值，默认是 64M
- 数据量到达阈值：前面提到了，如果单条数据太小，不加限制的话，一个chunk内数据量可能几十上百万条，这也会影响读写性能，因此 MongoDB 内置了一个阈值，chunk 内数据量超过 25W 条也会分裂。

#### chunk rebalance

chunk 分裂是 MongoDB 保证数据均衡的基础：数据的不断增加，chunk 不断分裂，如果数据不均匀就会导致不同分片上的 chunk 数目出现差异，这就解决了分片集群的数据不均匀问题发现。然后就可以通过将 chunk 从数据多的分片迁移到数据少的分片来实现数据均衡，这个过程就是 rebalance。

执行 rebalance 是有几个前置条件的：
- 数据库和集合开启了 rebalance 开关，默认是开启的。
- 当前时间在设置的 rebalance 时间窗，默认没有配置，就是只要检测到了就会执行 rebalance。
- 集群中分片 chunk 数最大和最小之差超过阈值


rebalance 为了尽快完成数据迁移，其设计是尽最大努力迁移，因此是非常消耗系统资源的，在系统配置不高的时候会影响系统正常业务。因此，为了减少其影响需要：
- 预分片：减少大量数据插入时频繁的分裂和迁移 chunk
- 设置 rebalance 时间窗
- 对于可能会影响业务的大规模数据迁移，如扩容分片，可以采取手段迁移的方式来控制迁移速度。

### 一致性&高可用

#### MongoDB 的高可用(Raft)

MongoDB 是基于 Raft 来做 Primary 节点的选举， 与其他主从架构类似， 选举的时间点有两个: 快速启动和 Primary 节点异常。




### 参考资料
- [理解 checkpoint](https://pdai.tech/md/db/nosql-mongo/mongo-y-checkpoint.html)









