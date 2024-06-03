---
title: ES工作原理
date: 2022-02-13 09:33:53
tags: es
categories: 中间件
description: 基本概念、读/写原理、优化技巧、部署架构、集群诊断
---

### 概述

elasticsearch设计的理念就是分布式搜索引擎，底层实现还是基于Lucene的，核心思想是在多态机器上启动多个es进程实例，组成一个es集群。

#### es的基本概念

1.集群（cluster）
一个集群有多个节点（服务器）组成，通过所有的节点一起保存你的全部数据并且通过联合索引和搜索功能的节点的集合，每一个集群有一个唯一的名称标识

2.节点（node）
一个节点就是一个单一的服务器，是你的集群的一部分，存储数据，并且参与集群和搜索功能，一个节点可以通过配置特定的名称来加入特定的集群，在一个集群中，你想启动多少个节点就可以启动多少个节点

3.索引（index）
一个索引就是还有某些共有特性的文档的集合，一个索引被一个名称唯一标识，并且这个名称被用于索引通过文档去执行搜索，更新和删除操作

4.类型（type）
6.0以上的版本已经不建议使用type了，默认为`_doc`

5.文档（document）
一个文档是一个基本的搜索单元

总结:es 中存储数据的基本单位是索引，比如说你现在要在 es 中存储一些订单数据，你就应该在 es 中创建一个索引 order_idx，所有的订单数据就都写到这个索引里面去，一个索引差不多就是相当于是 mysql 里的一张表。

> index -> type -> mapping -> document -> field。

index 相当于 mysql 里的一张表。在高版本的es里已经不建议使用type了(es7.x 已经完全移除了`mapping type`)， 可以认为你可以认为 index 是一个类别的表，具体的每个 type 代表了 mysql中的一个表。而 mapping 就是这个 type 的表结构定义，定义了这个表的字段和类型。你往 index 里的一个 type 里面写的一条数据，叫做一条 document，一条 document 就代表了 mysql 中某个表里的一行，每个 document 有多个 field，每个 field 就代表了这个 document 中的一个字段的值。
   
 #### 扩展和高可用概念
 
 ES默认为一个索引创建5个主分片, 并分别为其创建一个副本分片. 也就是说每个索引都由5个主分片成本, 而每个主分片都相应的有一个copy
 
 1.分片（shards）
 
 在一个搜索里存储的数据，潜在的情况下可能会超过单个节点的硬件的存储限制，为了解决这个问题，elasticsearch便提供了分片的功能，它可以将索引划分为多个分片，当你创建一个索引的时候，你就可以简单的定义你想要的分片的数量，每一个分片本身是一个全功能的完全独立的索引，可以部署到集群中的任何一个节点。
 
 2.复制（replica）
 
 在一个网络情况下，故障可能会随时发生，有一个故障恢复机制是必须的，为了达到这个目的，ES允许你制作一个或多个拷贝放入一个叫做复制分片或短暂的复制品中。replica 主要解决以下两个问题:
 
 (1)高可用:它提供了高可用的以来防止分片或者节点宕机，为此，一个非常重要的注意点就是绝对不要讲一个分片的拷贝放在跟这个分片相同的机器上
 
 (2)高并发:它允许你的分片可以提供超出自身吞吐量的搜索服务，搜索行为可以在分片所有的拷贝中并行执行。
    总之，一个完整的流程就是，ES客户端将一份数据写入primary shard,它会将分成成对的shard分片，并将数据进行复制，ES客户端取数据的时候就会在replica或primary 的shard中去读。ES集群有多个节点，会自动选举一个节点为master节点，这个master节点其实就是干一些管理类的操作，比如维护元数据，负责切换primary shard 和replica shard的身份之类的，要是master节点宕机了，那么就会重新选举下一个节点为master为节点。如果时非master宕机了，那么就会有master节点，让那个宕机的节点上的primary shard的身份转移到replica shard上，如果修复了宕机的那台机器，重启之后，master节点就会控制将缺失的replica shard 分配过去，同步后续的修改工作，让集群恢复正常。
 
 
 ### es读写过程和原理

 #### es写入数据过程
 
 ![](/images/es/es-write.png)
  
 1. 客户端选择一个node发送请求过去，这个node就是coordinating node (协调节点)
 2. coordinating node，对document进行路由，将请求转发给对应的node
 3. 实际上的node上的primary shard处理请求，然后将数据同步到replica node
 4. coordinating node，如果发现primary node和所有的replica node都搞定之后，就会返回请求到客户端
 

 
 ##### es写入数据底层原理
 
 ![](/images/es/es-write-detail.png)
 
 1. 数据先写入到buffer里面，在buffer里面的数据时搜索不到的，同时将数据写入到 `translog` 日志文件之中
 
 2. 如果 buffer 快满了，或者到一定时间，就会将内存 buffer 数据 `refresh` 到一个新的 `segment file` 中，但是此时数据不是直接进入 `segment file` 磁盘文件，而是先进入 `os cache`
  。这个过程就是 `refresh`。(操作系统里面，磁盘文件其实都有一个东西，叫做 `os cache`，即操作系统缓存，就是说数据写入磁盘文件之前，会先进入 os cache，先进入操作系统级别的一个内存缓存中去。只要 buffer 中的数据被 refresh 操作刷入 os cache中，这个数据就可以被搜索到了。)
 
 3. 每隔 1 秒钟，es 将 buffer 中的数据写入一个新的 `segment file`，每秒钟会产生一个新的磁盘文件 segment file，这个 segment file 中就存储最近 1 秒内 buffer 
 中写入的数据。但是如果 buffer 里面此时没有数据，那当然不会执行 refresh 操作，如果buffer里面有数据，默认 1 秒钟执行一次 refresh 操作，刷入一个新的 segment file 中。(为什么叫 es 是准实时的？ `NRT`，全称 `near real-time`。默认是每隔 1 秒 refresh 一次的，所以 es 是准实时的，因为写入的数据 1 秒之后才能被看到。可以通过 es 的 restful api 或者 java api，手动执行一次 refresh 操作，就是手动将 buffer 中的数据刷入 os cache中，让数据立马就可以被搜索到。只要数据被输入 os cache 中，buffer 就会被清空了，因为不需要保留 buffer 了，数据在 translog 里面已经持久化到磁盘去一份了。)
 
 4. 重复上面的步骤，新的数据不断进入 buffer 和 translog，不断将 buffer 数据写入一个又一个新的 segment file 中去，每次 refresh 完 buffer 清空，translog保留。随着这个过程推进，translog 会变得越来越大。当 translog 达到一定长度的时候，就会触发 `commit` 操作。commit 操作发生第一步，就是将 `buffer` 中现有数据 `refresh` 到 `os cache` 中去，清空 buffer。然后，将一个 `commit point` 写入磁盘文件，里面标识着这个 commit point 对应的所有 `segment file`，同时强行将 os cache 中目前所有的数据都 fsync 到磁盘文件中去。最后清空 现有 translog 日志文件，重启一个 translog，此时 commit 操作完成。这个 commit 操作叫做 flush。默认 30 分钟自动执行一次 flush，但如果 translog 过大，也会触发 `flush`。flush 操作就对应着 commit 的全过程，我们可以通过 es api，手动执行 flush 操作，手动将 os cache 中的数据 fsync 强刷到磁盘上去。
 
 5. translog 日志文件的作用是什么？你执行 commit 操作之前，数据要么是停留在 buffer 中，要么是停留在 os cache 中，无论是 buffer 还是 os cache 都是内存，一旦这台机器死了，内存中的数据就全丢了。所以需要将数据对应的操作写入一个专门的日志文件 translog 中，一旦此时机器宕机，再次重启的时候，es 会自动读取 translog 日志文件中的数据，恢复到内存 buffer 和 os cache 中去。translog 其实也是先写入 os cache 的，默认每隔 5 秒刷一次到磁盘中去，所以默认情况下，可能有 5 秒的数据会仅仅停留在 buffer 或者 translog 文件的 os cache中，如果此时机器挂了，会丢失 5 秒钟的数据。但是这样性能比较好，最多丢 5 秒的数据。也可以将 translog 设置成每次写操作必须是直接 fsync 到磁盘，但是性能会差很多。（这里说明一个情况:es 是准实时的，数据写入 1 秒后可以搜索到；可能会丢失数据的。有 5 秒的数据，停留在 buffer、translog os cache、segment file os cache 中，而不在磁盘上，此时如果宕机，会导致 5 秒的数据丢失）
 
 >数据写入 segment file 之后，同时就建立好了倒排索引。
 
 ##### 删除/更新数据底层原理
 
 - 如果是删除操作，commit 的时候会生成一个 `.del` 文件，里面将某个 doc 标识为 `deleted` 状态，那么搜索的时候根据 .del 文件就知道这个 doc 是否被删除了
 
 - 如果是更新操作，就是将原来的 doc 标识为 `deleted` 状态，然后新写入一条数据。
 
 buffer 每次 refresh 一次，就会产生一个 `segment file`，所以默认情况下是 1 秒钟一个 segment file，这样下来 segment file 会越来越多，此时会定期执行 merge。每次 merge 的时候，会将多个 segment file 合并成一个，同时这里会将标识为 deleted 的 doc 给物理删除掉，然后将新的 segment file 写入磁盘，这里会写一个 commit point，标识所有新的 segment file，然后打开 segment file 供搜索使用，同时删除旧的 segment file。
 
 #### 读数据过程
 
 可以通过 `doc id` 来查询，会根据 doc id 进行 hash，判断出来当时把 doc id 分配到了哪个 shard 上面去，从那个 shard 去查询。
 
 1. 客户端发送请求到任意一个 node，成为 `coordinate node`
 2. `coordinate node` 对 `doc id` 进行哈希路由，将请求转发到对应的 node，此时会使用 `round-robin` 随机轮询算法，在 `primary shard` 以及其所有 replica 中随机选择一个，让读请求负载均衡
 3. 接收请求的 node 返回 document 给 coordinate node。
 4. coordinate node 返回 document 给客户端
 
 ##### 搜索数据的过程
 
 1. 客户端发送请求到一个 coordinate node
 2. 协调节点将搜索请求转发到所有的 shard 对应的 primary shard 或 replica shard，都可以
 3. query phase：每个 shard 将自己的搜索结果（其实就是一些 doc id）返回给协调节点，由协调节点进行数据的合并、排序、分页等操作，产出最终结果
 4. fetch phase：接着由协调节点根据 doc id 去各个节点上拉取实际的 document 数据，最终返回给客户端
 
 ##### 倒排索引
 
 在搜索引擎中，每个文档都有一个对应的文档 ID，文档内容被表示为一系列关键词的集合。例如，文档 1 经过分词，提取了 20 个关键词，每个关键词都会记录它在文档中出现的次数和出现位置。
 
 那么，倒排索引就是关键词(分词)到文档 ID 的映射，每个关键词都对应着一系列的文件，这些文件中都出现了关键词
 
 假如文档如下
 
 | DocId |  Doc|
 | ---- | -----|
 | 1    | 谷歌地图之父跳槽 Facebook |
 | 2 | 谷歌地图之父加盟 Facebook |
 | 3 | 谷歌地图创始人拉斯离开谷歌加盟 Facebook |
 | 4	| 谷歌地图之父跳槽 Facebook 与 Wave 项目取消有关 |
 | 5 | 谷歌地图之父拉斯加盟社交网站 Facebook |
 
 
 对文档进行分词之后，得到以下倒排索引。
 
 | WordId | Word | DocIds |
 | ------| ------| -------|
 | 1	| 谷歌 | 	1,2,3,4,5 |
 | 2	| 地图	 |  1,2,3,4,5 |
 | 3	| 之父	 | 1,2,4,5   |
 | 4	| 跳槽	  | 1,4      |
 | 5	| Facebook |	1,2,3,4,5 |
 | 6	| 加盟	 | 2,3,5 |
 | 7	| 创始人 | 	3 |
 | 8	| 拉斯	 | 3,5 |
 | 9	| 离开	 | 3  |
 | 10 | 	与	 | 4  |
 
 
### 写入和查询优化

#### 写入优化

##### 客户端

- 通过压测确定每次写入的文档数量。一般情况：
单个`bulk`(批量写)请求数据两不要太大，官方建议`5-15mb`
写入请求超时时间建议60s以上
写入尽量不要一直写入同一节点，轮询达到不同节点。

- 进行多线程写入，最好的情况时动态调整，如果http429，此时可以少写入点，不是可以多写点

- 写入数据不指定_id，让ES自动产生
当用户显示指定id写入数据时，ES会先发起查询来确定index中是否已经有相同id的doc存在，若有则先删除原有doc再写入新doc。
这样每次写入时，ES都会耗费一定的资源做查询。
如果用户写入数据时不指定doc，ES则通过内部算法产生一个随机的id，并且保证id的唯一性，这样就可以跳过前面查询id的步骤，提高写入效率。

##### server 端

总体目标尽可能压榨服务器资源，提高吞吐量

- 使用好的硬件，观察cpu、ioblock、内存是否有瓶颈。

- 观察jvm堆栈，垃圾回收情况是否存在耗时较长的gc。

- 观察写入的分配和节点是否负载均衡。

- 调整bulk线程池和队列的大小，一般不用调整，它是根据现有核数和内存自动算出来的，酌情调整。一般线程数配置为CPU核心数+1，队列也不要太大，否则gc比较频繁。

- 可靠性要求不高，可以副本数设置为0。

- 磁盘io肯定没有内存快，可以在允许的情况refresh调整间隔大一点。

- flush阈值适当调大、落盘异步化、flush频率调高。这些都能减少写入资源的占用，提升写入吞吐能力。但是对容灾能力有损害。

- 索引设置优化。

- 减少不必要的分词，从而降低cpu和磁盘的开销。

- 只需要聚合不需要搜索，index设置成false。不需要算分，可以将norms设置成false

- 不要对字符串使用默认的dynmic mapping。会自动分词产生不必要的开销。

- index_options控制在创建倒排索引时，哪些内容会被条件到倒排索引中，只添加有用的，这样能很大减少cpu的开销。

- 关闭_source，减少io操作。但是source字段用来存储文档的原始信息，如果我们以后可能reindex，那就必须要有这个字段。

- 设置30s refresh，降低lucene生成频次，资源占用降低提升写入性能，但是损耗实时性。

- total_shards_per_node控制分片集中到某一节点，避免热点问题。

- translong落盘异步化，提升性能，损耗灾备能力。

- dynamic设置false，避免生成多余的分词字段，需要自行确定映射。

- merge并发控制。
ES的一个index由多个shard组成，而一个shard其实就是一个Lucene的index，它又由多个segment组成，且Lucene会不断地把一些小的segment合并成一个大的segment，这个过程被称为merge。
可以通过调整并发度（`index.merge.scheduler.max_thread_count`）来减少这一步占用的资源操作。

例如创建一个 test 索引优化示例:
``` 

PUT test {
    "settings": {
        "index" :{
            "refresh_interval" : "30s","number_of_shards" :"2"
        },
        "routing": {
            "allocation": {
                "total_shards_per_node" :"3"
            }
        },
        "translog" :{
            "sync_interval" : "30s",
            "durability" : "async"
        },
        number_of_replicas" : 0
    }
    "mappings": {
        "dynamic" : false,
        "properties" :{}
    }
}

```

#### 查询优化

- ElasticSearch不是关系型数据库，即使ElasticSearch支持嵌套、父子查询，但是会严重损耗ElasticSearch的性能，速度也很慢。
- 尽量先将数据计算出来放到索引字段中，不要查询的时候再通过es的脚本来进行计算。
- 尽量利用filter的缓存来查询
- 设计上不要深度分页查询，否则可能会使得jvm内存爆满。

- 可以通过profile、explain工具来分析慢查询的原因。

- 严禁*号通配符为开头的关键字查询，我们可以利用不同的分词器进行模糊查询。

- 分片数优化，避免每次查询访问每一个分片，可以借助路由字段进行查询。

- 需要控制单个分片的大小
查询类：20GB以内；日志类：50G以内。

- 读但是不写入文档的索引进行lucene段进行强制合并。

- 优化数据模型、数据规模、查询语句。

### ES架构优化

#### filesystem cache
 
 ![](/images/es/es-search-process.png)
 
 往 es 里写的数据，实际上都写到磁盘文件里去了，查询的时候，操作系统会将磁盘文件里的数据自动缓存到 `filesystem cache` 里面去
 
 es 的搜索引擎严重依赖于底层的 filesystem cache，你如果给 filesystem cache 更多的内存，尽量让内存可以容纳所有的 `idx segment file` 索引数据文件，那么你搜索的时候就基本都是走内存的，性能会非常高。如果走磁盘一般肯定上秒，搜索性能绝对是秒级别的，1秒、5秒、10秒。但如果是走 filesystem cache，是走纯内存的，那么一般来说性能比走磁盘要高一个数量级，基本上就是毫秒级的，从几毫秒到几百毫秒不等。
 
 如果要利用好`filesystem cache`的空间，就需要只存储常用来检索的几个字段就好了， 其他不常用的字段存储在mysql或hbase中， 常用的是采用 `es + hbase` 这种架构
 
 写入 es 的数据最好小于等于，或者是略微大于 es 的 filesystem cache 的内存容量。然后你从 es 检索可能就花费 20ms，然后再根据 es 返回的 id 去 hbase 里查询在花个 30ms，查 20 条数据，可能也就耗费个 30ms。如果1T数据全部存es会每次查询都是 5~10s。
 
 #### 数据预热
 
 如果数据实在太大，远超`filesystem cache`， 就可以采用数据预热
 
 举个例子，拿微博来说，你可以把一些大V，平时看的人很多的数据，你自己提前后台搞个系统，每隔一会儿，自己的后台系统去搜索一下热数据，刷到 filesystem cache 里去，后面用户实际上来看这个热数据的时候，他们就是直接从内存里搜索了，很快。
 
 或者是电商，你可以将平时查看最多的一些商品，比如说 iphone 8，热数据提前后台搞个程序，每隔 1 分钟自己主动访问一次，刷到 filesystem cache 里去。
 
 对于那些你觉得比较热的，经常会有人访问的数据，最好做一个专门的缓存预热子系统，就是对热数据每隔一段时间，就提前访问一下，让数据进入 filesystem cache 里面去。这样下次别人访问的时候，一定性能会好一些。
 
 #### 冷热分离
 
 es 可以做类似于 mysql 的水平拆分，就是说将大量的访问很少、频率很低的数据，单独写一个索引，然后将访问很频繁的热数据单独写一个索引。最好是将冷数据写入一个索引中，然后热数据写入另外一个索引中，这样可以确保热数据在被预热之后，尽量都让他们留在 filesystem os cache 里，别让冷数据给冲刷掉。
 
 #### document 模型设计
 
 对于 MySQL，我们经常有一些复杂的关联查询。在 es 里该怎么玩儿，es 里面的复杂的关联查询尽量别用，一旦用了性能一般都不太好。
 
 最好是先在 Java 系统里就完成关联，将关联好的数据直接写入 es 中。搜索的时候，就不需要利用 es 的搜索语法来完成 join 之类的关联搜索了。
 
 document 模型设计是非常重要的，很多操作，不要在搜索的时候才想去执行各种复杂的乱七八糟的操作。es 能支持的操作就是那么多，不要考虑用 es 做一些它不好操作的事情。如果真的有那种操作，尽量在 document 模型设计的时候，写入的时候就完成。另外对于一些太复杂的操作，比如 join/nested/parent-child 搜索都要尽量避免，性能都很差的。
 
 #### 分页性能优化
 
 es 的分页是较坑的，为啥呢？举个例子吧，假如你每页是 10 条数据，你现在要查询第 100 页，实际上是会把每个 shard 上存储的前 1000 条数据都查到一个协调节点上，如果你有个 5 个 shard，那么就有 5000 条数据，接着协调节点对这 5000 条数据进行一些合并、处理，再获取到最终第 100 页的 10 条数据。
 
 分布式的，你要查第 100 页的 10 条数据，不可能说从 5 个 shard，每个 shard 就查 2 条数据？最后到协调节点合并成 10 条数据？你必须得从每个 shard 都查 1000 条数据过来，然后根据你的需求进行排序、筛选等等操作，最后再次分页，拿到里面第 100 页的数据。你翻页的时候，翻的越深，每个 shard 返回的数据就越多，而且协调节点处理的时间越长，非常坑爹。所以用 es 做分页的时候，你会发现越翻到后面，就越是慢。
 
 对此的解决方案是:
 - 不允许深度分页(深度分页性能很低)
 - 类似于 app 里的推荐商品不断下拉出来一页一页的
 
### 部署架构

#### 节点类型

- Master eligible:主节点及其候选节点，负责集群状态(cluster state)的管理
配置项：`node.master`，默认为true

- data:数据节点，负责数据存储及处理客户端请求
配置项：`node.data`，默认为true

- Ingest:ingest节点，负责数据处理，脚本执行
配置项：`node.ingest`，默认为true

- Coordinating:协调节点
配置项：设置上面三个参数全部为false，那么它就是一个纯协调节点

#### 生产节点部署推荐

- Master
资源要求：中高CPU；中高内存；中低磁盘
一般在生产环境中配置3台
一个集群只有1台活跃的主节点，负责分片管理，索引创建，集群管理等操作

- data
资源要求：CPU、内存、磁盘要求都高

- ingest
资源要求：高配置CPU;中等配置的内存;低配置的磁盘

- Coordinating
资源要求：一般中高CPU；中高内存；低磁盘

协调节点扮演者负载均衡、结果的聚合，在大型的es集群中条件允许可以使用高配的cpu和内存。因为如果客户端发起了深度分页等请求可能会导致oom，
 
### 问题诊断

#### 监控状态

- 绿色代表集群的索引的所有分片（主分片和副本分片）正常分配了。
- 红色代表至少一个主分片没有分配。
- 黄色代表至少一个副本没有分配。

可以通过health相关的api进行查看：
``` 

//集群的状态（检查节点数量）
GET _cluster/health
//所有索引的健康状态 （查看有问题的索引）
GET _cluster/health?level=indices
//单个索引的健康状态（查看具体的索引）
GET _cluster/health/my_index
//分片级的索引
GET_cluster/health?level=shards
//返回第一个未分配Shard 的原因
GET _cluster/allocation/explain
```

#### 常见原因

##### 集群变红

- 创建索引失败，我们可以通过Allocation Explain API查看，会返回解释信息。

##### 集群重启阶段，短暂变红

- 打开一个之前关闭的索引。

- 有节点离线。通常只需要重启离线的节点使其回来即可。

- 一个节点离开集群，有索引被删除，离开的节点又回来了。会导致出现红色，产生了dangling索引。

- 磁盘空间限制，分片规则（Shard Filtering）引发的，需要调整规则或者增加节点。官方文档给出了详细的未分配分片的可能原因：
https://www.elastic.co/guide/en/elasticsearch/reference/7.1/cat-shards.html

##### 集群变黄

- 无法创建副本，因为副本能和它的主分配在一个节点上，可能副本数过大或者节点数过少导致



 ### 参考资料
 - [es分布式架构和底层原理](https://segmentfault.com/a/1190000015256970)
 - [es写入工作原理](https://github.com/doocs/advanced-java/blob/master/docs/high-concurrency/es-write-query-search.md)
 - [es查询优化](https://github.com/doocs/advanced-java/blob/master/docs/high-concurrency/es-optimizing-query-performance.md)
 - [优化es之合理分配索引分片](https://segmentfault.com/a/1190000008868585)