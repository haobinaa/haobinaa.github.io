---
title: 从ES底层原理来看查询优化
date: 2024-06-20 20:23:57
tags: 
  - es
  - 算法
categories:
  - ES
  - 中间件
---

###  ES 底层设计概览

ES 底层(或者说内核)是基于 Lucene，本文从 ES 查询流程以及 Lucene 底层的一些存储结构设计设计， 来分析 ES 的一些查询优化方向

#### ES 查询模型

![](/images/es/es-query.png)

上图是 ES 的完整查询流程,  ES 的任意节点可作为写入请求的协调节点(Coordinating Node)，接收用户请求。协调节点将请求转发至对应一个或多个数据分片的主或者从分片进行查询，各个分片查询结果最后在协调节点汇聚，返回最终结果给客户端。 从查询流程可以看出 ES 的查询主要有2个阶段: Query 和 Fetch
- Query 阶段：协调节点将查询拆分成多个分片任务，发送到数据分片上通过调用 Lucene 执行查倒排索引，查询满足条件的文档 id 集合
- Fetch 阶段：归并生成最终的检索、聚合结果

当然如果 ES 只有一个分片， 那么整个流程将合并成 QueryAndFetch 一个阶段。


#### Lucene 索引设计

ES 底层是 Lucene, 说到索引设计， 大部分同学都知道 ES 是基于倒排索引来进行文档检索， 即一个分词(term)对应一个 docsList。
Lucene 的设计中， 倒排索引并非只是简单的一个 term-> docsList 的结构， 主要是采取了这几种数据结构:
1. 倒排索引：保存了每个 term 对应的 docId 的列表，采用 skipList 的结构保存，用于快速定位到 term 所在位置
2. FST（Finite State Transducer）：可以认为是前缀树的变种，用于保存 term 字典的二级索引，用于加速查询，可以在 FST 上实现单 Term、Term 范围、Term 前缀和通配符查询等。内部结构如下
![](/images/es/es-index.png)

3. BKD-Tree：BKD-Tree是一种保存多维空间点的数据结构，主要用于数值类型(包括空间点)的快速查找。在 ES 6.0 后引入， 取代了之前的 geohash 和 quatree

#### ES 的字段存储

除了索引外，ES 同时提供了行存（`stored`）、列存（`doc_value`）来进行业务字段的存储

##### Stored Field(行存储模式)

stored 是 ES 的行存储模式， 类似 innodb 的存储， 用于字段值的展示，特点如下:
1. ES内置元数据字段（_index,_id,_score等等）默认开启store。
2. 所有业务字段默认关闭store，但业务字段的store 都会被存到 _source。
3. 默认通过 index.codec 压缩算法进行压缩。查询时需要解压

存储结构如下:
![](/images/es/es-stored-field.png)


需要注意的是从上图可以看出 _source 是 stored field 的第一个字段， 会优先读取

##### doc_value Fields(列存储模式)

doc_value 是 ES 的列存储模式， 类似大数据的存储，用于聚合排序等分析场景， 特点如下:
1. 不同文档的相同字段的值一起连续存储在内存中，默认不通过压缩算法压缩。可以直接访问某个文档的某个字段。调用方式： `"docvalue_fields": ["tag1"]`
2. 数据被编码后，精度跟格式可能会发生变化。
3. 非 text 类型默认开启 doc_value。text 字段无法直接开启 doc_value。


存储结构如下:
![](/images/es/es-doc_value-field.png)

### ES 优化策略

了解了 ES/Lucene 索引的一些底层设计， 那来看看一些优化方法论

####  分片数，副本数，索引规模的合理评估

在 ES 6.6 或以上的版本， 官方提供了索引生命周期管理(ILM index-lifecycle-manager)功能, 可以通过 kibana 或 API 来配置索引生命周期。实现索引数据的自动滚动跟过期，并结合冷热分离架构进行数据的降冷跟删除。

为了让分片查询性能发挥到最优，需要对规模进行限制，通常有以下使用原则：

1. 集群总分片数建议控制在 5w 以内，单个索引的规模控制在 1TB 以内，单个分片大小控制在30 ~ 50GB ，docs 数控制在10亿内，如果超过建议滚动；
2. 分片的数量通常建议小于或等于 ES 的数据节点数量，最大不超过总节点数的 2倍，通过增加分片数可以提升并发，如果负载用上不去，可以适当的增加分片；
3. 每个业务查询都会拆分成多个分片小请求，分片数越多，查询聚合耗时越高，所以分片数并不是越多越好，在搜索场景合理控制分片数也可以提升性能。

#### Mapping 设计

ES 的 Mapping 类似于传统关系型数据库的表结构定义。
在ES 中，一旦一个字段被定义在了 mapping中，是无法被修改的（新增字段除外），所以一般我们需要修改索引的话，都会滚动或者重建索引，并采用 reindex 或 logstach 来迁移数据。 为了高效发挥 mapping 的性能并降低存储成本，介绍一些常见的使用技巧：

1. ES 对于一份数据会建立索引， 根据不同的需要会行存、列存。为了节约存储成本， 对于某些不重要的字段可以通过指定（index: false ， enabled: false ，doc_values: false）来关闭， 减少存储成本
2. 段值太长会大幅增加 ES的序列化跟 Highlight 开销，且Lucene 限制单个 term 长度不能超过 65536，对于超长的值可以配置 [ignore_above](https://www.elastic.co/guide/en/elasticsearch/reference/current/ignore-above.html) 忽略超长的数据，以避免性能的严重衰减。
3. 字段可以设置子字段，比如对于 text 字段有 sort 和聚合查询需求的场景，可以添加一个keyword子字段以支持这两种功能
4. 字段数量如果太多会降低ES 的性能，用户需要合理设计字段。同时为了避免字段爆炸，ES 有如下优化使用方式：
   1. 用户可以在某个父层级字段设置 `enabled: false` 来防止其下面创建子字段 mapping ，但是能被行存查询出来。
   2. mapping 层级可以设置 `dynamic=runtime`，虽然加入新字段也会更新 mapping，但是新加入的字段不会被索引，也就是不会使得索引变大，不过虽然不被索引，但是新加入的字段依然可以被查询，只是查询的代价会更大（运行时构建）。所以这种类型一般不建议用在经常查询的条件字段上，而更适合用在一些不确定数据结构的日志类索引中。
   3. mapping 层级也可以设置 `dynamic=strict`（不允许新增一个不在 mapping中的字段，一旦新增的字段不在 mapping 定义中，则直接报错）或者`dynamic=false`（新字段不会被索引，不能作为查询条件，但是能被行存查询出来）


#### Index Sorting

ES 在查询的时候会将请求下发到所有分片, 特殊情况下会造成很多分片空转(并不命中数据), 这里引申一个概念 **查询裁剪**, 通常有这几种:
1. 索引裁剪：如果已经滚动产生了很多索引，这个时候每次通过别名查询全量索引时，一样会有大量空转查询，可以通过索引名特征或时间范围，指定具体的索引名进行查询(譬如日志场景， 如果使用索引别名查询， 就会命中所有已经滚动的索引， 造成大量索引空转)
2. 分片裁剪(例如用户可以在查询URL 指定 `preference=_shards:0` 或者 `routing` 来指定查某一个分片进行查询)
3. Segment裁剪： Segment 是分片内部的数据单元（需要修改 Lucene 内核来支持 segment 级别裁剪）

需要注意的是， 1，2两种都可以在用户程序级做到(通过查询 API)， segment 级别的裁剪需要对 Lucene 内核进行修改适配



ES 在 6.0 以上版本提供 [Index Sorting 功能](https://www.elastic.co/guide/en/elasticsearch/reference/current/index-modules-index-sorting.html)

通过数据排序(类似 mysql 的二级索引能力， Elasticsearch会结合索引排序和查询条件对结果进行排序。如果查询条件与索引排序顺序一致，查询性能将得到显著提升)，通过牺牲少量的写入性能，在写入时将文档归类放置存储，非常有利于查询裁剪


#### Merge 优化

##### Forcemerge 优化

ES 的写入模型采用的是类似 LSM-Tree 的存储结构。ES 实时写入的数据都在 lucene 内存 buffer 中，同时依赖写入 translog 保证数据的可靠性。当积攒到一定程度后，将他们批量写入一个新的 Segment。 这样，数据写入都是 Batch 和 Append(顺序追加)，能达到很高的吞吐量。
但是这种方式，也会产生大量的小Segment，查询时会产生非常多的随机IO，导致查询效率低下。

ES后台会进行 `segment merge（段合并）` 操作，但是默认段合并非常缓慢。这是因为 merge 操作比较吃IO，为了避免跟写入争抢IO，所以默认 merge 得非常慢。所以我们可以通过强制的 forcemerge (使用 `_forcemerge` API)来大幅降低Segment 数量，减少函数空转跟随机IO，极限压测通常大约能提升20%~30%的查询性能。
> 特别是业务刚迁移到新集群的热数据，一开始写入时产生的segment较多，导致查询性能相对于老集群反而变弱，需要等待一段时间让ES做merge 后性能才会变好。这种情况下，如果能做强制一把 forcemerge 就最好

Force Merge 是非常占用系统资源的， 尽量避免在线上业务期间使用

##### 减少Merge

上面也提到了 Merge 是非常吃IO的操作。
通常在搜索场景下，merge 可以很好的提升查询性能，但是在日志场景下，写多读少，merge 并非十分必要，甚至可以放到深夜低峰期去做也是可以的。所以通过限制白天 merge 的线程数跟size限制， 可以有效降低集群负载
> 减少 Merge 可以通过调整集群配置中索引刷新间隔 `index.refresh_interval` 来实现， 不过会影响数据的实时性



#### 缓存设计优化

### 参考资料
- [关于Lucene词典FST深入剖析](https://www.shenyanchao.cn/blog/2018/12/04/lucene-fst/)
- [KM文章-腾讯云ES让你的查询性能飞起来]
- [腾讯云ES：PB日志查询大提速，自治索引查询裁剪详解](https://cloud.tencent.com/developer/article/2171412)