---
title: pulsar总览
date: 2022-08-16 09:09:24
tags: 
categories: 中间件
description: apache pulsar 总览介绍， 与其他MQ中间件对比
---

### pulsar 架构

pulsar 是 Apache 的顶级项目， 定位为下一代云原生分布式消息流平台，集消息、存储、轻量化函数式计算为一体，采用计算与存储分离架构设计，支持多租户、持久化存储、多机房跨区域数据复制，具有强一致性、高吞吐、低延时及高可扩展性等流数据存储特性，被看作是云原生时代实时消息流传输、存储和计算最佳解决方案。Pulsar 是一个 pub-sub (发布-订阅)模型的消息队列系统。

现有中间件存在的问题(如Kafka):
1. 分区模型紧密耦合(存储和计算)， 非云原生设计
2. 存储模型过于简单， 强依赖文件系统
3. I/O 不隔离： 消费者在清楚 backlog 的时候会影响其他生产者和消费者
4. 运维难题: 替换机器、服务扩容需要 rebalance 导致服务对外不可用
5. 有可能出现消息丢失的情况


#### 存储分离计算

![](/images/pulsar/store-compute.png)

Apache Pulsar 主要包括 Broker, Apache BookKeeper, Producer, Consumer等组件。

- Broker：无状态服务层，负责接收和传递消息，集群负载均衡等工作，Broker 不会持久化保存元数据，因此可以快速的上、下线
- Apache BookKeeper：有状态持久层，由一组名为 Bookie 的存储节点组成，持久化地存储消息
- Producer ： 数据生产者，负责发布数据到 Topic
- Consumer：数据消费者，负责从 Topic 订阅数据
- 
除了上述的组件之外，Apache Pulsar 还依赖 Zookeeper 作为元数据存储。与传统的消息系统相比，Apache Pulsar 在架构设计上采用了计算与存储分离的模式，Pub/Sub 相关的计算逻辑在 Broker 上完成，数据存储在 Apache BookKeeper 的 Bookie 节点上。

#### 分片存储

除了存储、计算解耦分离的设计之外，Apache Pulsar 在存储设计上也不同于传统 MQ 的分区数据本地存储的模式，采用的是分片存储的模式。Apache Pulsar 中的每个 Topic 分区本质上都是存储在 Apache BookKeeper 中的分布式日志。

Topic 可以有多个分区，分区数据持久化时，分区是逻辑上的概念，实际存储的单位是分片（Segment）的，如下图，一个分区 `Topic1-Part2` 的数据由多个 Segment 组成， 每个 Segment 作为 Apache BookKeeper 中的一个 `Ledger`，均匀分布并存储在 Apache BookKeeper 群集中的多个 Bookie 节点中， 每个 Segment 具有 3 个副本。

![](/images/pulsar/segment-store.png)


分区和分片存储的区别:

![](/images/pulsar/partition-vs-segment.png)

#### 架构优势

Apache Pulsar 计算与存储分离的架构，以及分片存储的设计为 Apache Pulsar 带来了相比于传统基于分区存储 MQ 的一些优势:
- Broker 和 Bookie 相互独立，方便实现独立的扩展以及独立的容错
- Broker 无状态，便于快速上、下线，更加适合于云原生场景
- 分区存储不受限于单个节点存储容量
- 分区数据分布均匀


### 架构扩展

由于消息服务层和持久存储层是分开的，因此 Apache Pulsar 可以独立地扩展存储层和服务层。

#### broker 扩展

在 Pulsar 中 Broker 是无状态的，可以通过增加节点的方式实现快速扩容。当需要支持更多的消费者或生产者时，可以简单地添加更多的 Broker 节点来满足业务需求。Pulsar 支持自动的分区负载均衡，在 Broker 节点的资源使用率达到阈值时，会将负载迁移到负载较低的 Broker 节点，这个过程中分区也将在多个 Broker 节点中做平衡迁移，一些分区的所有权会转移到新的Broker节点。

#### bookie 扩展

存储层的扩容，通过增加 Bookie 节点来实现。通过资源感知和数据放置策略，流量将自动切换到新的 Bookie 节点中，整个过程不会涉及到不必要的数据搬迁，即不需要将旧数据从现有存储节点重新复制到新存储节点。

![](/images/pulsar/bookie-expansion.png)

如上图所示，起始状态有四个存储节点，Bookie1, Bookie2, Bookie3, Bookie4，以 Topic1-Part2为例，当这个分区的最新的存储分片是 SegmentX 时，对存储层扩容，添加了新的 Bookie 节点，BookieX,BookieY，那么在存储分片滚动之后，新生成的存储分片， SegmentX+1,SegmentX+2，会优先选择新的 Bookie 节点（BookieX,BookieY）来保存数据

### 容错

基于计算存储分离架构， pulsar 具有非常灵活的容错

#### Broker 容错

![](/images/pulsar/broker-failover.png)

当 Broker 节点失败时， 以上图为例，当存储分片滚动到 SegmentX 时，Broker2 节点失败，此时生产者和消费者向其他的Broker发起请求，这个过程会触发分区的所有权转移，即将 Broker2 拥有的分区 Topic1-Part2 的所有权转移到其他的 Broker(Broker3)。在 Apache Pulsar 中数据存储和数据服务分离，所以新 Broker 接管分区的所有权时，它不需要复制 Partiton 的数据。新的分区 Owner（Broker3）会产生一个新的分片 SegmentX+1, 如果有新数据到来，会存储在新的分片Segment x+1上，不会影响分区的可用性。

#### bookie 容错

![](/images/pulsar/bookie-failover.png)

当 Bookie 节点失败时，如上图所示， 假设 Bookie 2 上的 Segment 4 损坏。`Apache BookKeeper Auditor` 会检测到这个错误并进行复制修复。 Apache BookKeeper 中的副本修复是 Segment 级别的多对多快速修复，BookKeeper 可以从 Bookie 3 和 Bookie 4 读取 Segment 4 中的消息，并在 Bookie 1 处修复 Segment 4。如果是 Bookie 节点故障，这个 Bookie 节点上所有的 Segment 会按照上述方式复制到其他的Bookie节点。所有的副本修复都在后台进行，对Broker和应用透明，Broker 会产生新的Segment 来处理写入请求，不会影响分区的可用性。


### pulsar 特性

#### 读写分离

pulsar 的 BookKeeper 提供读写分离的功能, 读写分离保证了在有大量滞后消费（磁盘IO会增加）时，不会影响服务的正常运行，尤其是不会影响到数据的写入。

先介绍设计到 Bookie 存储的几个概念:
- Journals：Journal 文件包含了 BookKeeper事务日志，在 Ledger 更新之前，Journal 保证描述更新的事务写入到 Non-volatile 的存储介质上
- Entry logs：Entry 日志文件管理写入的 Entry，来自不同 ledger 的 entry 会被聚合然后顺序写入
- Index files：每个 Ledger都有一个对应的索引文件，记录数据在 Entry 日志文件中的 Offset 信息

![](/images/pulsar/bookie-read-write.png)

Entry 读写流程如上图所示

##### 数据写入流程

1. 数据首先会写入 Journal，写入 Journal 的数据会实时落到磁盘

2. 然后，数据写入到 Memtable ，Memtable 是读写缓存

3. 写入 Memtable 之后，对写入请求进行响应

4. Memtable 写满之后，会 Flush 到 Entry Logger 和 Index cache，Entry Logger 中保存了数据，Index cache 保存了数据的索引信息，然后由后台线程将 Entry Logger 和 Index cache 数据落到磁盘。

##### 数据读取流程

- 如果是 Tailing read 请求，直接从 Memtable 中读取 Entry
- 如果是 Catch-up read（滞后消费）请求，先读取 Index信息，然后索引从 Entry Logger 文件读取 Entry

##### 总结

一般在进行 Bookie 的配置时，会将 Journal 和Ledger 存储磁盘进行隔离，减少 Ledger 对于 Journal写入的影响，并且推荐 Journal 使用性能较好的 SSD 磁盘，读写分离主要体现在：
- 写入 Entry 时，Journal 中的数据需要实时写到磁盘，Ledger的数据不需要实时落盘，通过后台线程批量落盘，因此写入的性能主要受到 Journal 磁盘的影响
- 读取 Entry 时，首先从 Memtable 读取，命中则返回；如果不命中，再从 Ledger 磁盘中读取，所以对于 Catch-up read 的场景，读取数据会影响 Ledger 磁盘的 IO，对 Journal 磁盘没有影响，也就不会影响到数据的写入。
  

所以，数据写入是主要是受 Journal 磁盘的负载影响，不会受Ledger 磁盘的影响。另外，Segment 存储的多个副本都可以提供读取服务，相比于主从副本的设计，Apache Pulsar 可以提供更好的数据读取能力。 通过以上分析，Apache Pulsar 使用 Apache BookKeeper 作为数据存储，可以带来下列的收益：
- 支持将多个 Ledger 的数据写入到同一个 Entry logger 文件，可以避免分区膨胀带来的性能下降问题
- 支持读写分离，可以在滞后消费场景导致磁盘IO上升时，保证数据写入的不受影响
- 支持全副本读取，可以充分利用存储副本的数据读取能力

#### 多种消费模型

Apache Pulsar 提供了多种订阅方式来消费消息，分为三种类型： 独占（Exclusive），故障切换（Failover）或共享（Share）

![](/images/pulsar/consumer-model.png)

- Exclusive 独占订阅 ：在任何时间，一个消费者组（订阅）中有且只有一个消费者来消费 Topic 中的消息。
- Failover 故障切换 ：多个消费者（Consumer）可以附加到同一订阅。 但是，一个订阅中的所有消费者，只会有一个消费者被选为该订阅的主消费者。 其他消费者将被指定为故障转移消费者。 当主消费者断开连接时，分区将被重新分配给其中一个故障转移消费者，而新分配的消费者将成为新的主消费者。 发生这种情况时，所有未确认（ack）的消息都将传递给新的主消费者。
- Share 共享订阅 ：使用共享订阅，在同一个订阅背后，用户按照应用的需求挂载任意多的消费者。 订阅中的所有消息以循环分发形式发送给订阅背后的多个消费者，并且一个消息仅传递给一个消费者。 当消费者断开连接时，所有传递给它但是未被确认（ack）的消息将被重新分配和组织，以便发送给该订阅上剩余的剩余消费者。

#### 多种 ack 模型

在 Pulsar 中，每个订阅中都使用一个专门的数据结构 `游标（Cursor）` 来跟踪订阅中的每条消息的确认（ACK）状态。每当消费者在分区上确认消息时，游标都会更新。 Pulsar 提供两种消息确认方法：

- 单条确认（Individual Ack），单独确认一条消息。 被确认后的消息将不会被重新传递
- 累积确认（Cumulative Ack），通过累积确认，消费者只需要确认它收到的最后一条消息

![](/images/pulsar/ack-model.png)

上图说明了单条确认和累积确认的差异（灰色框中的消息被确认并且不会被重新传递）。对于累计确认，M12 之前的消息被标记为 Acked。对于单独进行 ACK，仅确认消息 M7 和 M12， 在消费者失败的情况下，除了 M7 和 M12 之外，其他所有消息将被重新传送

#### 跨地域复制

![](/images/pulsar/geo-replication.png)

如上图所示，有三个 Apache Pulsar 集群，分布于北京、上海和广州，用户创建的一个 Topic T1 设置了跨越三个数据中心做互备。在三个数据中心中，分别有三个生产者：P1、P2、P3，它们往主题 T1 中发布消息；有两个消费者：C1、C2，订阅了这个主题，接收主题中的消息。 当消息由本数据中心的生产者发布成功后，会立即复制到其他两个数据中心。消息复制完成后，消费者不仅可以收到本数据中心产生的消息，也可以收到从其他数据中心复制过来
