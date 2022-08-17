---
title: pulsar总览
date: 2022-08-16 09:09:24
tags: 
categories: 中间件
description: apache pulsar 总览介绍， 与其他MQ中间件设计对比
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

### pulsar 与其他 MQ 设计上的区别

#### 云原生租户设计

##### 分级命名

Pulsar原生支持多租户设计，非常适合作为云产品进行管理。 Pulsar的topic名称如下:
``` 
persistent://tenant/namespaces/topic
```
分为四个部分:
- 第一部分：Domain，表示存储方式，分为nonpersistent 和persistent，对应非持久化和持久化存储；
- 第二部分：tenant，表示租户名称，公司或团队内部使用时，也可以作为部门名称、业务分类等；
- 第三部分：namespace，表示命名空间，作为租户内部的一个层级划分。
- 第四部分：topic名称，具体的topic。Pulsar支持分区和非分区topic。但是，在业务侧视角，很难看出是否是分区topic，需要查看元数据或者日志信息。

##### 多级流控

Pulsar支持Broker级别、Namespace级别、Topic级别的流控，包括生产、消费的出入流控，客户端的连接数，存储配额等。
Kafka/Rocketmq 等的流控措施和策略相对来说要少很多

#### 计算与存储

##### broker 状态

1. Pulsar 的broker 是无状态的，这和它的计算、存储分离的架构设计有关，broker端不需要保存任何的元数据和消息信息。可以根据系统的需求，进行动态的扩/缩容处理。
2. Rocketmq broker具备主备的概念，且broker 侧本地需要存储消息。单个broker 使用一个逻辑的commitlog文件，以wal的方式写入消息。（目前，高版本已经引入自动主备选主能力和Dledger进行计算与存储分离处理，有需要的也可以关注下），所以默认方式下，算是一个有状态的broker。
另外，Rocketmq的备，仅在主挂掉或者主负载过高的时候才会提供读取服务，算是冷备份。这在目前逐步强调机器利用率的环境下，算是一个待优化的设计点。
3. Kafka 中也有主、备的概念区分，但是主备是partition维度的。Kafka broker端也需要存储消息，它的每个分区会使用wal方式存储消息，相对Rocketmq而言会多用很多写FD（即会同时对应到多个以wal方式写入的文件句柄），这块也是Kafka 在broker端分区总数过多的时候，性能下降的一个原因。

##### 集群扩展能力

1. Puslar 的服务器端，分为broker 和 bookie两个部署，broker 负责接入、计算、拉取、分发消息等，bookie负责消息存储存储。broker、bookie均可以按需动态的进行扩缩容处理。
其中，bookie存储过程中的多副本、数据条带化分布处理等均在bookkeeper的客户端sdk中实现，是一个胖客户端的逻辑。broker作为bookie的客户端存在，消息数据会总体均匀的分布在bookie集群中。不会出现因为某些topic或着某些topic的部分分区，在数据大规模倾斜时，导致部分存储机器磁盘使用率过高的问题。当然，如果系统需要保存的消息量比较大，扩容时可能需要同时扩容多台bookie机器（写入的副本个数的整数倍）。
此外，bookie集群扩容后，系统在写入新消息的时候会优先选用新加入的、负载低的节点作为候选节点，在存量节点不受影响的情况下，将新增消息写入到新扩容的节点上。
2. Rocketmq的broker端，扩展能力也比较强，只要新增主备对到集群中即可。但是需要在扩容完毕后，在新增的broker对上面创建对应的topic 和订阅组信息。
此外，Rocketmq比较强大的一点是，broker端具备读、写权限控制的能力，可以针对单个topic的单个Queue和broker进行读写控制，非常便于运维操作。
3. Kafka的broker端，在扩所容的时候要略显麻烦些，使用的时候需要提前评估好容量，如果在运营的过程中进行扩容，需要做部分数据的迁移操作。

#### 分区与消息存储

##### 分区与消息存储

1. Pulsar 中Topic的分区是Topic内针对整个集群范围的，每个分区topic的分区数编号在集群内递增。而每个分区在内部生产、消费处理的时候均被作为最小单位的topic进行处理，sdk内部会针对每个分区单独的创建一个producer/consumer进行处理。

Pulsar中的每个topic的每个分区与broker的关联关系是通过Namespace的bundle机制进行关联的，可以通过loadbalance机制自动进行load/unload的操作的，也可以通过命令进行unload操作，如图所示：

![](/images/pulsar/broker-bundles.png)

- namespace下的每个bundle区间会关联一个broker（这个关联关系会被 loadbalance 逻辑修改，同时也可以通过运维命令进行unload处理），每个topic的每个分区通过hash运算落到相应的bundle区间，进而找到当前区间关联的broker。在broker与bundle的关系发生变化时，客户端会有重连操作，会有相应的链接断开和重建建立链接的日志，这个现象是正常的。
- 当集群内broker节点的个数比较多的时候，可以通过增加topic的分区数，同时调整namespace的bundle数，将topic的分区更加均匀的分布到所有或者大多数的broker 节点上，来提升集群针对这个topic的生产/消费性能。
- Pulsar中的每个Topic下的每个分区会对应一系列的ledger（ledger id是全局唯一的），逻辑的将消息组织起来，存储到bookie中。Puslar 的分区是个物理上面的划分，每个分区单独的处理消息的生产、消费和存储。

2. Rocketmq中的分区（实际上是Queue的概念，逻辑划分）是针对单个broker主/备关系对的（Rocketmq 的broker 有主/备的区分），在单个主/备关系下的broker 内递增。如果需要在集群内的多个主/备关系对的broker间使用相同的topic，需要针对每个主/备关系对下的broker单独创建相同的topic。每个主/备对关系下的broker上面，相同名称的topic 的分区数可以不同。
Rocketmq的消息数据是通过索引方式，被逻辑的划分到每个Queue的，消费者需要通过索引文件从pagcache或者wal方式写入的commitlog文件中获取消息。

3. Kafka中的分区，是针对一组broker的，因为Kafka中也具有主/备的概念。但是，Kafka的主备关系是分区级别的，相同topic的不同分区的主可能是不同的broker。这样集群下的每个broker 均可交叉的对外提供读写服务。

##### 分区与消费者

![](/images/pulsar/partition-consumer.png)

1. Kafka/Rocketmq 每个分区会负载到一个 comsumer 上，多出partition个数的consumer将不会起作用（即多出的消费者不能消费任何的消息）。
2. Pulsar这面，每个分区会与订阅下的所有消费者客户端进行关联，broker端会根据每个消费者客户端的能力，将消息推送给客户端进行消费。Pulsar的这种设计，在很大程度上提高了系统可承载的消费能力。业务方可以根据自己的消费需求，并行的部署多于分区个数的消费者。

##### 分区与顺序消息

Kafka/Rocketmq 等实现顺序消息的大致方法是将顺序消息，按照顺序分组关键字（或对应的key），在生产的时候，将顺序消息分发到同一个partition中。消费时，因为partition 与consumer是一对一的关系，通过简单的处理即可保证消费的顺序性。
这种设计的问题就是负载到同一个partition中的消息在不同分组之间实际是可以并行消费的，顺序性仅需要保证在同一个分组内即可。如果，消费者与partition是一对一的对应关系，顺序消费，效率会比较低。

![](/images/pulsar/sequential-message.png)

如上图， 在Pulsar中，每个分区与多个消费者做关联。在顺序消息的场景，生产的时候也是根据key，将消息负载到相同的 parititon 内。而消费的时候，则是根据key，按照key的维度，每个key关联到固定的consumer，同一个 parititon 内的不同key的消息，使用不同（如果consumer足够多）的但唯一的一个consumer进行推送和消费处理，在很大的程度上提高了顺序消息场景下的消费性能。

##### 消息分发机制

1. Puslar 采用的是推模式，broker端给消费者客户端推送消息。客户端在创建consumer的时候，会配置当前consumer 可以接受的消息的最大能力（`receiveQueueSize，默认1000`）。broker端会根据这个参数，在服务端给每个consumer初始化对应的permit参数，通过对permit的控制，批量给consumer推送消息。
同时,broker端会统计 unack 状态的消息个数并进行流控处理，当推送给单个consumer或整个订阅组下的unack状态的消息达到一定阈值后，broker端将不再推送任何消息到当前消费者或整个订阅下的所有消费者（订阅组维度时，即使有部分的消费者有接收能力，broker端也不会在推送消息）。
Consumer端会在处理的消息个数达到 `receiveQueueSize/2` 时，向broker端重新发送一条Flow命令，变更broker端对应当前consumer的分发permit值。
分发消息时的交互流程，如下图所示：

![](/images/pulsar/message-model.png)

2. 而Kafka/Rocketmq，消费者均采用拉模式获取消息（Rocketmq是客户端用long pull的方式实现的push）

##### 消息确认保存机制

1. Kafka/Rocketmq/InLong-TubeMQ在消费确认的时候，每次上报的是当前已经消费的最小的offset值，broker端针对每个topic的每个分区下的每个订阅，保存这个分区下当前订阅的最小的offset。 
这种实现方式比较简单，但是在运营过程中，会发现存在比较严重的缺陷。因为消息是被批量拉取到客户端的，消费端有可能已经消费了后面的大量的消息，只是因为较小的offset的这条消息例如图中5这个位置，消费过程出错或者消费时间比较长，每次消费确认信息的时候只能上报到5这个位置。表面上看，有大量的消息堆积，其实可能后面的消息已经被消费很多了。当消费者重启的时候会重新从5这个位置重新拉取一遍消息，这时消费者可能要处理大量的重复消息，如果业务侧幂等措施做的不够健壮，可能会对业务造成很大的困扰。

2. Pulsar中，每个topic的每个分区是与订阅组下的所有消费者关联的，broker端可以将这个分区下的消息按批次分发给每个对应的消费者，每个消费者对接受到的消息进行消费和确认。
每个分区下的订阅通过markDeletePosition保存当前完全消费的最有一个位点（即这个位置之前的所有消息均已经消费和确认了），使用individualDeletedMessages表示当前正在消费的消息的确认情况，这里不是仅仅的保存一个点，而是保存多个范围，表示markDeletePosition这个位置之后哪些消息范围内的消息已经被确认了。避免了重启之后消息被重复消费的问题。

![](/images/pulsar/message-ack.png)


但是，这里也有一个风险点。如果，`individualDeletedMessages`中保存的区间信息比较多的时候，需要占用大量的内存空间，会对broker和bookie存储造成压力。因此，我们在使用的时候，需要尽量的将位点连续的消息，连续的消费和确认，避免出现大量的确认空洞。

### 参考资料

- [Tencent iWiki MQ Oteam pulsar 系列文章]

