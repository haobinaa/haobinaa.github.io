---
title: kafka原理总结
date: 2022-11-07 21:08:25
tags: kafka
categories: 中间件
description: kafka 原理：broker/partition/consumer 选举、数据一致性(LEO与HW机制)、broker 中数据的存储
---

### 消费、生产和消息

#### producer 设计

##### producer 消费发送分区选择策略

分区策略决定 producer 将消息怎么分发到 partition 中， 分区策略不合适可能导致数据倾斜， 有些时候我们需要实现顺序消息， 也需要将同一业务的消息都发送到同一个 partition 上。生产端将消息发送给 broker 之前主要经过拦截、序列化、分区(Partitioner)几个步骤。分区器主要读取 partition 配置(生产端配置`partitioner.class`, 默认值是[ DefaultPartitioner](https://github.com/apache/kafka/blob/trunk/clients/src/main/java/org/apache/kafka/clients/producer/internals/DefaultPartitioner.java))

DefaultPartitioner 实现逻辑:
- 如指定了 key, 则按照 key 的 hash 值与 topic 的 partition mod 
- 如未指定 key， 则第一次调用时随机生成一个整数（后面每次调用在这个整数上自增），将这个值与 topic 可用的 partition 总数取余得到 partition 值，也就是常说的 `round-robin(轮询) 算法`。

如果指定了自定义分区类`partitoner.class`, 则按照自定义分区类的实现来获得 partition

##### 消息的发送方式

producer 发送流程如下:

![](/images/kafka/kafka-producer.png)

- producer 发送消息的时候默认是异步的， 通常有以下三种模式
  1. Fire-and-forget: 异步发送的一种， 不关心是否失败:
``` 
producer.send(record);
```
  2. 同步发送： send 方法返回的是一个 future 对象， 可以调用 Future 的 get 等待返回:
``` 
producer.send(record).get();
```
  3. 异步发送： 通过回调(callback)的方式处理， 可以感知到消息是否发送成功， 并做相应的业务处理。如果对消息的顺序不敏感， 但是需要保证消息的成功可以使用这种方式
``` 
producer.send(myRecord,
             new Callback() {
                  public void onCompletion(RecordMetadata metadata, Exception e) {
                      if(e != null) {
                         // do something
                      } else {
                         System.out.println("The offset of the record we just sent is: " + metadata.offset());
                      }
                 }
             });   
```

##### 消息发送流程和相关参数配置

在前面说过kafka默认是异步发送， 在 producer 端实际上存在 2 个线程:
- 一个是 producer 主线程，用户端调用send消息时，是在主线程执行的，数据被缓存到 `RecordAccumulator`(RecordAccumulator可以理解是个集合，集合的元素是个队列，每个队列对应要发送至服务上的分区) 中，send方法即刻返回，也就是说此时并不能确定消息是否真正的发送到 broker
- 另外一个是 sender IO线程，其不断轮询 `RecordAccumulator`，满足一定条件后，就进行真正的网络IO发送，使用的是异步非阻塞的NIO。主线程的send方法提供了一个用于回调的参数，当sender线程发送完后，回调函数将被调用，可以用来处理成功，失败或异常的逻辑


producer 的关键参数:
- `buffer.memory`: 设置生产者可用于缓冲等待发送给brokers消息的总内存字节数，默认为33554432(32MB)。如果消息发送到缓存区的速度比发送到broker的速度快，那么生产者会被阻塞（根据`max.block.ms`配置的时间，默认为60000ms=1分钟，在0.9.0.0版本之前使用`block.on.buffer.full`配置），之后会抛出异常。
- `compression.type`: 设置生产者的压缩算法， 默认是 none.
- `retries`：发送失败后的最大重试次数
- `max.in.flight.requests.per.connection`:  producer 单个 IO 线程收到 broker ack 之前可以发送多少消息， 默认值是 5。是为了解决设置了retries参数大于0后，可能会带来新的问题。假如我们需要相同Key的Message进入特定的Partition，并且是要严格按照Producer生产Message的顺序排序。那么此时如果第一条Message发送失败，第二条Message发送成功了，第一条通过重试发送成功了，那Message的顺序就发生了变化。如果想在设置了retries还要严格控制Message顺序，可以把`max.in.flight.requests.per.connection`设置为1。让Broker处永远只有一条Message在排队，就可以严格控制顺序了。但是这样做会严重影响性能（接收Message的吞吐量）。
- `batch.size`: 一个 batch 的大小, 默认 16KB
- `linger.ms`： 两次发送的最大间隔时间。 batch.size 满了或达到 linger.ms 就会把消息发送出去
- `max.block.ms`： 当发送缓冲区已满或者元数据不可用时，生产者调用send()和partitionsFor()方法会被阻塞，默认阻塞时间为60000ms=1分钟。由于使用用户自定义的序列化器和分区器造成的阻塞将不会计入此时间。
- `max.request.size`： 设置生产者在单个请求中能够发送的最大字节数，默认为1048576(1MB)。注意，broker也有接收消息的大小限制，使用的配置是`message.max.bytes`(默认也是1MB)
- `request.require.acks`: 持久化参数配置, broker 对发送的请求的确认模式。 有三种取值:
  - 0：请求发出就算成功，不需要 broker 响应。 该配置下发送性能最佳， 但数据可能丢失
  - 1： leader partition 确认持久化， 就返回成功。 该配置下如果 broker 没有反馈, producer 会进行重试, 但如果 leader 所在的 broker 宕机 replica 又没持久化时, 还是会丢数据
  - all: 需要 leader+replica 都持久化才返回响应。 配合 broker 参数 `min.insync.replicas` ， 标志至少有多少 replica 持久化才返回 ack


  
#### consumer 设计

##### consumer group 

- 多个 consumer 可组成一个 consumer group
- kafka 中 topic 下的一个 partition 同一时刻只能被 consumer group 中的一个 consumer 线程消费

##### consumer group 消费进度 offset 

- consumer 顺序消费 partition 上的 message， offset 在老版本(0.10以前)由zk来保存， 由于zk的性能不好， 在之后的版本是专门放在一个`__consumer_offsets`的 topic 中管理 。
写进消息的key由`<groupid、topic、partition>`组成，value 是偏移量 offset
- consumer 提交 offset 分为自动提交和手动提交， 通过`enable.auto.commit`来控制， 默认是 true， 自动提交间隔通过 `auto.commit.interval.ms` 配置， 默认 5s
- 手动提交位移提供了两种模式`commitSync`和`commitAsync`
  - `commitSync` 同步提交再 broker 返回提交结果之前都处于阻塞状态， 会因为提交 offset 而影响整个应用的 TPS
  - `commitAsync` 异步提交采取了 callback 的方式来处理提交后的逻辑，如记录日志和处理异常， 但是并不会自动重试， 如果不处理好 callback 逻辑， 可能会丢失消息
- kafka 还提供了更精确的提交 api， 可以实现处理完一批消息后， 提交最后一个 offset 值。`commitSync(Map<TopicPartition, OffsetAndMetadata>)`和`commitAsync(Map<TopicPartition, OffsetAndMetadata>)`。 使用示例:
``` 
// 实现每处理 100 条消息提交一次 offset
ConsumerRecords<String, String> records = consumer.poll(Duration.ofSeconds(1));
for (ConsumerRecord<String, String> record: records) {
     process(record);  // 处理消息
     offsets.put(new TopicPartition(record.topic(), record.partition()), new OffsetAndMetadata(record.offset() + 1)；
        if（count % 100 == 0）
            consumer.commitAsync(offsets, null); // 回调处理逻辑是null
         count++;
} 
```
- kafka 通过 compact 策略来清理过期消息(对于同一个key的两条消息M1和M2，如果M1的发送时间早于M2，那么M1就是过期消息)。类似 JVM 的 compact， 扫描日志中的所有消息， 剔除过期的消息， 将剩下的消息整理在一起

![](/images/kafka/offset-compact.png)

- kafka 支持重新设置位移进度来控制重新消费、跳过消费。目前支持 7 种策略(支持通过 api 和 `kafka-consumer-groups.sh` 两种方式设置):
  - Earliest: 将 offset 调整到主题当前最早处(不一定是 0 这个位置， 由于 broker 的消息保留策略有些消息可能被自动删除)
  - Latest：把 offset 重设成最新末端(也就是跳过历史消息， 从最新的位置开始消费)
  - Current: 将 offset 调整成消费者当前提交的最新处, 比如修改了消费者程序代码，并重启了消费者，结果发现代码有问题，你需要回滚之前的代码变更，同时也要把位移重设到消费者重启时的位置，那么，Current 策略就可以帮你实现这个功能
  - Specified-Offset: 设置到指定 offset 位置
  - Shift-By-N ： 设置成当前 offset 的相对位置(可以相对于当前位移前多少条或后多少条， 比如设置消费位置为当前offset的前100条， N就是 -100)
  - DateTime：指定一个时间，然后将 offset 重置到该时间之后的最早位移处。如设置到昨天0点后开始消费
  - Duration：指定到当前时间的间隔处， duration 与 java 的 duration 格式相同
``` 
# 重新设置 consumer group offset 示例
# 如把 test-group 设置成最早(从头开始消费)
kafka-consumer-groups.sh --bootstrap-server kafka-host:port --group test-group --reset-offsets --all-topics --to-earliest –execute
Latest
```

- kafka 消费进度可以通过自带运维脚本`kafka-consumer-groups`来获取， 使用格式如下:
``` 
# broker 地址为 ip+端口
# group 信息是需要查看的 consumer group 的名称(消费者中设置的 group.id)
kafka-consumer-groups.sh --bootstrap-server <broker 地址> --describe --group <group信息>

# 输出列主要关注几个点:
- PARTITION: 分区
- LOG-END-OFFSET: 分区当前最新生产的消息的 offset
- CURRENT-OFFSET: 分区当前 group 消费的最新 offset
- LAG: 生产offset和消费offset的差值， 即消息堆积数
```

##### consumer group rebalance

- rebalance 就是一个 consumer group 在 `consumer group coordinate` 的协调下， 完成 consumer 和 partition 的分配
- rebalance 的触发条件主要是两种:
  1. consumer group 成员发生变更(加入、退出、崩溃踢出)
  2. 订阅的 topic 下 partition 发生变更(增加、减少 partition)
  3. 还有一种情况比较少见， 即订阅的 topic 是正则表达式的形式， 当符合条件的 topic 被创建的时候也会触发 rebalance
- rebalance 对系统的影响（需要尽量避免 rebalance 的发生）:
  1. 影响 consumer 消费速度(rebalance 期间 consumer 是停止消费的状态)
  2. rebalance 非常慢， 并且 consumer group 下成员越多， 这个过程就越漫长， 如果一个 consumer group 下几百个成员， 可能发生一次 rebalance 需要数小时
  3. rebalance 需要所有的 consumer 参加， 重新分配 partition 后， consumer 分配的 partition 在其他的 broker 又需要重新建立 TCP 连接
- 尽可能的避免 rebalance。 从 rebalance 的触发条件来分析， 主要是 partition 发生变化, 和 consumer group 成员发生变化两种， 其中为了增加消费能力而增加 partition、增加 consumer 数量， 这两点是无法避免的并且属于计划之中的。我们只能从防止 consumer 崩溃被意外踢出 consumer group 这个方向来考虑。首先需要明白 kafka 如何判断 consumer 失效而踢出 group。 group 中的 consumer 会定期向 coordinator 发送心跳， 如果 coordinator 在一定时间内没有收到心跳请求就会认为该 consumer 已经"挂了"。
  1. kafka 通过`session.timeout.ms`来配置心跳超时， 默认是 10s, 也就是说10s内没有收到 consumer 的心跳就会踢出。 另外通过`heartbeat.interval.ms` 来配置心跳发送的频率， 发送的频率越高对带宽资源以及broker的压力就越大， 但是发送的频率过低就会降低容错， 可能一次心跳网络丢失就被踢出 group 从而引发 rebalance。推荐配置:
``` 
# 要保证Consumer实例在被判定为“dead”之前，能够发送至少3轮的心跳请求，即session.timeout.ms >= 3 * heartbeat.interval.ms
session.timeout.ms = 6s
heartbeat.interval.ms = 2s
```
  2. 另外 kafka 还可能因为消费时间过长(IO时间长、频繁 fgc导致消费慢等)而发生 rebalance， `max.poll.interval.ms` 控制了 Consumer 两次调用 poll方法 的最大时间间隔。它的默认值是5分钟，表示Consumer 如果在5分钟之内无法消费完 poll 返回的消息，那么 Consumer 会主动发起 leave group 的请求，Coordinator 也会开启新一轮 Rebalance。
  
- 另外还需要注意的一点是， Kafka 在 `0.10.1.0` 之前的版本， 心跳请求(`Heartbeat Request`) 是在消费者主线程(也就是 KafkaConsumer.poll 的线程)中完成的， 所以一旦消费时间过长就可能错误的让 coordinator 认为 consumer 挂了。 在`0.10.1.0`之后就引入了一个单独的线程来完成 `Heartbeat Request`。其次 coordinator 会将 rebalance 通知封装到 `Heartbeat Request` 中响应给 consumer， 因此 consumer 端配置的参数 `heartbeat.interval.ms` 间隔越小， 就能越快的感知到 rebalance 通知 

### 服务端、副本和一致性

#### broker 中的角色

##### Coordinator

- 在 consumer 的 rebalance 中经常提及到 coordinator ， 它专门为 Consumer Group 服务， 主要有两个作用:
  1. 管理 Partition 的 Offset 信息
  2. 管理 Consumer Client 与 Partition 的分配
- 所有 Broker 在启动时，都会创建和开启相应的 Coordinator 组件。也就是说，所有 Broker 都有各自的 Coordinator 组件
- 每个 group 都会选择一个 Coordinator 来完成自己组内各 Partition 的 Offset 信息，选择的规则如下：
  1. 计算 Group 对应在 `__consumer_offsets` topic 上的 Partition 位置(即由 __consumer_offsets 哪个 partition 来保存当前 group 的数据)， 计算规则: `partitionId=Math.abs(groupId.hashCode() % offsetsTopicPartitionCount)`
  2. 找出该 Partition Leader 所在的 Broker，该 Broker 即为对应的 Coordinator

##### Controller

Controller(控制器)是管理 broker 集群的重要单元， 依赖 zookeeper， 任何 broker 都可以充当 Controller 的角色， 但运行时只有一个 Broker 成为 Controller。
当 Broker 启动的时候都会尝试去 ZK 中创建 `/controller` 节点, 第一个成功创建的节点就是 Controller。

Controller 承担以下功能:
- Topic 的管理: 创建、删除、增加 partition
- partition 重分配（`kafka-reassign-partitions` 脚本）
- Preferred Leader 选举(用来均衡 broker 上 leader 的数量， 避免 leader partition 不均衡的分布在某几个 broker 上)
- Broker 集群成员管理: 通过 ZK 可以检测到 Broker 的新增、下线(宕机或主动下线)， 原理是 watch ZK 中 `/brokers/ids` 目录下临时节点的变化情况
- Broker 元数据管理(包括向其他 Broker 下发元数据)


#### 容灾和一致性

##### 副本机制

Kafka 容灾主要依靠 replication 机制， 一般来说在 kafka 集群中 broker 的数量是要大于等于 replicas 的数量的。

- Kafka 是中 topic 被分为多个 partition, 每个 partition 可以称为一个 replica, 同一个 partition 的所有 replica 保存有相同的数据， 分散在不同的 broker上， 从而能够容错部分 broker 宕机带来的不可用
- 同一个 partition 中的 replica 分为 leader 和 follower 两种角色， 只有一个 leader 其他都是 follower
- follower 不对外提供服务， 所有的读写请求都发往 leader。 follower 唯一做的事情就是从 leader 拉取消息， 并写入自己的 commit log,  实现与 leader replica 的数据同步
- leader 副本不可用(所在的 broker 宕机)， kafka 开启选举从 follower 中选出一个符合条件的作为新的 leader。 原来的 leader 重新加入后， 作为 follower 加入集群

Kafka 这样设计 Replication 机制的优点:
- 实现了 `Read-your-writes`:  producer 写入消息成功后, consumer 马上就可以读到刚才的消息。如果允许 follower 提供读服务(读写分离机制), 那么可能会产生一段时间的数据不一致。
- 实现了单调读(`Monotonic Reads`): 对于一个消费者用户来说， 多次消费消息不会看到某条消息一会儿存在一会儿不存在。 如果 follower 提供读服务, 有可能发生 consumer 首先从 follower1 拉取消息, 然后从 follower2 拉取消息， 可能会看到第一次消费的消息在第二次消费时不见了(同步延迟)。 

##### 副本同步机制 ISR(In-Sync Replicas)与同步方式

- follower replica 不提供服务， 只是定期异步的拉取 leader replica 中的数据， 因为网络的不一致, 那么就存在着数据不一致的情况， Kafka 引入了 ISR 机制来判断副本是否和 leader 保持同步。ISR 里面存放的是 `in-sync replicas(已同步的副本)`， 存在 ISR 里面的 follower 是会变化的， 如果一个follower宕机，或者落后leader太多，leader将把它从ISR中踢出。当它活过来/再次跟上时会再拉进来。 对于 ISR 中的副本通常需要满足:与 leader 的消息相差的时间最大不能超过 `replica.lag.time.max.ms(默认 10s)`。

- 这里需要说明的是 Leader replica 天然就在 ISR 中， 也就是说 ISR 必然包含 Leader replica， 甚至在极端情况下 ISR 只有 leader replica

- follower 与 leader 不同步可能的情况:
  1. 慢副本: 由于 follower 的网络或磁盘 I/O 瓶颈导致 follower 的复制速度慢于 leader 的写入速度
  2. 卡主副本: follower 由于 GC 暂停或失效停止从 leader 拉取数据
  3. 新加入副本: 当给 topic 增加 replicas 数目， 新的 follower 不在 ISR 列表中， 直到赶上 leader 的日志 

- 副本复制的过程:
  1. follower 根据自身拥有多少个需要同步的 topicPartition 来创建相对应的 partitionFetchState，记录了从leader的哪个offset开始获取数据
  2. follower 根据 leader 的 brokeId 和 topicPartition 经过 hash 计算的 partitionId 来创建复制线程 ReplicationFetchThread
  3. ReplicaFetchThread 会根据 partitionFetchState 提供的信息不停地从 leader 获取数据，每次成功复制后，都会更新 partitionFetchState 的 fetchOffset
  4. 如果 fetchOffset 越界，则会对 followerPartitionLog 进行 truncate，然后重新拉取 offset
  5. 每次log的增加，都可能会触发一个新的 logSegment 的产生，原因可能是 log index 或 time index 容量满了

##### 副本的选举

绝大多数分布式系统采用了多数投票法则选择新的 leader， Kafka 并不采取这种方式。Kafka 是从 ISR 列表中选择一个 follower 成为 leader。

如果ISR节点为空， 就代表没有副本处于 ISR 列表中(leader 也挂了)， 这种情况下有两种策略:
1. 等待 ISR 中任何一个节点恢复， 并成为 leader
2. 从所有节点中选择一个恢复的作为leader(不只是 ISR)。这种选举也称为 `Unclean Leader Election`, 通过 broker 参数 `unclean.leader.election.enable` 来开启。 虽然这种方式可以让分区的可用性提高， 但是会丢失一些数据， 是否开启这个配置也是等于在  C(Consistency) 和 A(Availability) 之间做一个抉择。


##### 数据一致性与高水位机制

在kafka中，数据一致性的含义是若某条消息对Consumer可见,那么即使Leader宕机了，在新Leader上数据依然可以被读到。 Kafka 通过高水位(HighWaterMark)机制来定义消息的可见性。

先简单描述几个高水位相关的概念:
- LEO(Log End Offset): 当前日志末端 offset， 指向的是下一条消息的 offset。
- HW(HighWaterMark): 高水位，消费者最多只能消费到 HW 的位置(不包含HW)。 leader 新写入的消息需要等到被所有ISR的 replica 同步后， 更新 HW 才能被 consumer 消费， 这样也保证了 leader broker 宕机后， 该消息仍然能从新选举的 leader 中获取
- Remote Replica: 每个 replica 都保存一组 HW 和 LEO 值， 在 Leader 上还保存了其他 follower 的 LEO 值(主要是为了确定整个分区的 HW， 即 leader 的 HW 值)。在Leader 副本所在 broker 上保存的其他 follower 副本称为远程副本(Remote Replica)。如下图 Broker0 上的 Follower 副本
- 日志截断: 当副本宕机重启的时候， 为了避免数据不一致， 会将日志截断到 HW 的位置。

![](/images/kafka/remote-replica.png)

HW 和 LEO 的更新:
- leader 的 LEO 更新: 收到消息写入就会更新
- follower 更新 LEO: follower 发送 fetch 请求后， 拉取到 leader 返回的数据写入 log 就会自动更新 LEO
- leader 上 follower 远程副本更新 LEO:  follower fetch 的时候带上 leo， leader 使用这个值更新远程 LEO、

- follower 更新 HW: `follower HW = min(currentLEO, leaderHW)`。在更新 LEO 之后，follower 向 log 写完数据时会尝试更新它自己的 HW 值， 具体做法就是比较当前 LEO 值与 FETCH 响应中 leader 的 HW 值，取两者的小者作为新的HW值。这里就会明白一点，follower HW永远不可能超过leader，因为leader的HW是整个分区的HW，所以leader的HW一定是最高的
- leader 更新 HW: leader 的 HW 值决定了 consumer 可见的消费位置。常见的两种更新 HW 的情况(不包含leader重新选举):
  1. leader 处理 follower 的 fetch 请求， 更新完远程 LEO 后， 会取所有远程 follower 的 leo 中的最小值来更新自己的 HW。 即 `leader HW = max{leader HW, min(LEO1,....,LEOn)}`
  2. leader 处理 producer 的消息后， 也会拉取所有远程副本 LEO 值然后与当前 HW对比, 整体更新值与上一种相同。即`leader HW = max{leader HW, min(LEO1,....,LEOn)}` 
- kafka 运行过程中不会更新远程副本上的 HW 

现在完整的看一下写请求过程中 HW/LEO 的更新流程:

1. 初始状态下， leader 的 HW 和 LEO 都是 0， follower 与 leader 建立连接， follower 所有的 HW 和 LEO 都是 0

![](/images/kafka/hw-0.png) 

2. Producer 发来一条消息到 leader， 此时 leader LEO 为 1. follower 第一次 FETCH ：
   1. follower 带着自己的 HW 和 LEO(都为 0 ) 开始 fetch
   2. leader 的 HW = max{leaderHW, min(all follower LEO)} = 0, leader 记录远程副本的 LEO 为 0
   3. follower 拉取到一条消息， 带着 leader 的 hw=0,leo=1 返回， 并更新自身的 LEO=1， 更新自身的 hw = min(followerHW, leaderHW) = 0

![](/images/kafka/hw-1.png)

3. follower 第二次 FETCH
   1. Follower带着自己的 HW(0)&LEO(1) 去请求 leader， 此时 leader HW 更新为 max{leaderHW, min(all follower LEO)} = 1, leader 远程副本 LEO 更新为 1
   2. follower 带着 Leader 的 HW(1)&LEO(1) 返回， 更新自己的 LEO 和 HW(1)

从上面的流程可以看出: **即 follower 的 HW 更新需要 follower 的2轮 fetch leader 返回才能更新，而 Leader 的 HW 已更新。** 

HW 机制定义了消息的可见性， 但是在某些情况下会出现数据丢失/数据不一致的问题。

如在设置`min.insync.replica=1` 的情况， 以下流程就会导致已经 ack 过的数据丢失:
1. leader 更新完 HW 后， follower 的 HW 还未更新， 此时 follower 重启
2. follower 重启后， 发生消息截断， LEO 设置为之前的 follower HW 值 0
3. follower 重新同步 leader ， 此时 leader 宕机， 触发选举
4. follower 被选为 leader 节点， 此时 msg 2 永久丢失

![](/images/kafka/hw-lost.png)

在上述流程下， 假如老 leader 还未恢复， 新 leader 又收到生产者的消息。当老 leader 恢复时变成 follower 节点，发生自己的HW和LEO相等，就不用日志截断了。这样就发生了同一个offset位置的数据不一致情况。
![](/images/kafka/hw-inconsistency.png)


##### Leader Epoch 来解决 HW 日志截断的问题

上面描述的数据丢失/不一致的情况核心问题在于依据HW截断做日志截断的依据，而且HW的同步是异步的，任何异常崩溃都可能导致HW是一个过期的值。

kafka0.11.x版本引入了leader epoch的概念来规避此问题。leader epoch由一对二元组组成（epoch,startOffset）。Kafka Broker 会在内存中为每个分区都缓存 Leader Epoch 数据，同时它还会定期地将这些信息持久化到一个 checkpoint 文件中。当 Leader 副本写入消息到磁盘时，Broker 会尝试更新这部分缓存。如果该 Leader 是首次写入消息，那么 Broker 会向缓存中增加一个 Leader Epoch 条目，否则就不做更新。

- epoch区别leader的朝代，当leader更换时 epoch 会+1
- startOffset 代表当前代的 leader 是从哪个 offset 位置开始的

follower 重启后并不会直接进行日志截断，先向现任 leader 发起 OffsetsForLeaderEpochRequest 请求携带 follower 副本当前的 epoch。有如下几种情况：
- leader收到了请求 
  - 如果follower的epoch与leader相等，leader返回当前LEO，follower leo不会大于leader leo所以不会发生截断，继续后续的fetch数据同步流程。
  - 如果follower的epoch与leader不等，leader根据follower的epoch+1去本地epoch文件找到对应的startOffset返回给follower，follower会根据leader返回的startOffset来判断，如果自己当前的LEO大于则截断，小于不会发生截断，继续后续的fetch数据同步流程。
- leader挂了收不到请求
  - 那么follower会成为leader更新epoch+startOffset，并不会发生截断。老leader复活后与新leader会走上面epoch不一致时的流程。

上面说的场景对应就是如下流程:
![](/images/kafka/hw-epoch.png)
