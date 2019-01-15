---
title: kafka使用以及原理
date: 2018-12-10 12:39:13
tags: mq
categories: 中间件
---

### 简介

>Kafka是最初由Linkedin公司开发，是一个分布式、分区的、多副本的、多订阅者，基于zookeeper协调的分布式日志系统(也可以当做MQ系统)，常见可以用于web/nginx日志、访问日志，消息服务等等，Linkedin于2010年贡献给了Apache基金会并成为顶级开源项目。


现在Kafka多用于分布式的， 基于发布/订阅的消息系统。主要设计目的如下:
- 以时间复杂度为O(1)的方式提供消息持久化能力，即使对TB级以上数据也能保证常数时间的访问性能
- 高吞吐率。即使在非常廉价的商用机器上也能做到单机支持每秒100K条消息的传输
- 支持Kafka Server间的消息分区，及分布式消费，同时保证每个partition内的消息顺序传输
- 同时支持离线数据处理和实时数据处理

#### 消息队列的使用场景(用途)
- 解耦：在项目启动之初来预测将来项目会碰到什么需求，是极其困难的。消息队列在处理过程中间插入了一个隐含的、基于数据的接口层，两边的处理过程都要实现这一接口。这允许你独立的扩展或修改两边的处理过程，只要确保它们遵守同样的接口约束

- 冗余：有些情况下，处理数据的过程会失败。除非数据被持久化，否则将造成丢失。消息队列把数据进行持久化直到它们已经被完全处理，通过这一方式规避了数据丢失风险。在被许多消息队列所采用的”插入-获取-删除”范式中，在把一个消息从队列中删除之前，需要你的处理过程明确的指出该消息已经被处理完毕，确保你的数据被安全的保存直到你使用完毕。

- 扩展性: 因为消息队列解耦了你的处理过程，所以增大消息入队和处理的频率是很容易的；只要另外增加处理过程即可。不需要改变代码、不需要调节参数。扩展就像调大电力按钮一样简单。

- 灵活性&峰值处理能力: 在访问量剧增的情况下，应用仍然需要继续发挥作用，但是这样的突发流量并不常见；如果为以能处理这类峰值访问为标准来投入资源随时待命无疑是巨大的浪费。使用消息队列能够使关键组件顶住突发的访问压力，而不会因为突发的超负荷的请求而完全崩溃。

- 可恢复性：当体系的一部分组件失效，不会影响到整个系统。消息队列降低了进程间的耦合度，所以即使一个处理消息的进程挂掉，加入队列中的消息仍然可以在系统恢复后被处理。而这种允许重试或者延后处理请求的能力通常是造就一个略感不便的用户和一个沮丧透顶的用户之间的区别。

#### Kafka概念


![](/images/kafka/kafka_architech.jpg)
- Broker

Kafka集群包含一个或多个服务器，这种服务器被称为broker

- Topic

每条发布到Kafka集群的消息都有一个类别，这个类别被称为topic。（物理上不同topic的消息分开存储，逻辑上一个topic的消息虽然保存于一个或多个broker上但用户只需指定消息的topic即可生产或消费数据而不必关心数据存于何处）

- Partition

parition是物理上的概念，每个topic包含一个或多个partition，创建topic时可指定parition数量。每个partition对应于一个文件夹，该文件夹下存储该partition的数据和索引文件

- Producer

负责发布消息到Kafka broker

- Consumer

消费消息。每个consumer属于一个特定的consumer group（可为每个consumer指定group name，若不指定group name则属于默认的group）。使用consumer high level API时，同一topic的一条消息只能被同一个consumer group内的一个consumer消费，但多个consumer group可同时消费这一消息。


### Kafka原理

一个kafka集群中包含若干producer， 若干kafka broker, 若干consumer group, 以及一个Zookeeper集群。Kafka通过Zookeeper管理集群配置，选举leader，以及在consumer group发生变化时进行rebalance。producer使用push模式将消息发布到broker，consumer使用pull模式从broker订阅并消费消息。 　　

#### Topic & Partition

Topic在逻辑上可以被认为是一个queue。每条消费都必须指定它的topic，可以简单理解为必须指明把这条消息放进哪个queue里。为了使得Kafka的吞吐率可以水平扩展，物理上把topic分成一个或多个partition，每个partition在物理上对应一个文件夹，该文件夹下存储这个partition的所有消息和索引文件。

![](/images/kafka/topic-partition.png)

因为每条消息都被append到该partition中，是顺序写磁盘，因此效率非常高（经验证，顺序写磁盘效率比随机写内存还要高，这是Kafka高吞吐率的一个很重要的保证）

![](/images/kafka/partition.png)

每一条消息被发送到broker时，会根据paritition规则选择被存储到哪一个partition。在创建topic时可以在$KAFKA_HOME/config/server.properties中指定这个partition的数量(如下所示)，当然也可以在topic创建之后去修改parition数量。
``` 
num.partitions=3
```

在发送一条消息时，可以指定这条消息的key，producer根据这个key和partition机制来判断将这条消息发送到哪个parition。paritition机制可以通过指定producer的paritition.class这一参数来指定，该class必须实现`kafka.producer.Partitioner`接口。本例中如果key可以被解析为整数则将对应的整数与partition总数取余，该消息会被发送到该数对应的partition。(每个parition都会有个序号)
``` 
import kafka.producer.Partitioner;
import kafka.utils.VerifiableProperties;
public class JasonPartitioner<T> implements Partitioner {
    public JasonPartitioner(VerifiableProperties verifiableProperties) {}
    
    @Override
    public int partition(Object key, int numPartitions) {
        try {
            int partitionNum = Integer.parseInt((String) key);
            return Math.abs(Integer.parseInt((String) key) % numPartitions);
        } catch (Exception e) {
            return Math.abs(key.hashCode() % numPartitions);
        }
    }
}
```
如果将上例中的class作为partitioner.class，并通过如下代码发送20条消息（key分别为0，1，2，3）至topic2（包含4个partition）
``` 
public void sendMessage() throws InterruptedException{
　　for(int i = 1; i <= 5; i++){
　　      List messageList = new ArrayList<KeyedMessage<String, String>>();
　　      for(int j = 0; j < 4; j++）{
　　          messageList.add(new KeyedMessage<String, String>("topic2", j+"", "The " + i + " message for key " + j));
　　      }
　　      producer.send(messageList);
    }
　　producer.close();
}
```
则key相同的消息会被发送并存储到同一个partition里，而且key的序号正好和partition序号相同。（partition序号从0开始，本例中的key也正好从0开始）。如下图所示:

![](/images/kafka/partition_key.png)


对于传统的message queue而言，一般会删除已经被消费的消息，而Kafka集群会保留所有的消息，无论其被消费与否。当然，因为磁盘限制，不可能永久保留所有数据（实际上也没必要），因此Kafka
提供两种策略去删除旧数据。一是基于时间，二是基于partition文件大小。例如可以通过配置`$KAFKA_HOME/config/server
.properties`，让Kafka删除一周前的数据，也可通过配置让Kafka在partition文件超过1GB时删除旧数据，如下所示：
``` 
# 符合删除条件的日志，存在的最短期限
log.retention.hours=168

# 日志段文件的最大大小。当达到此大小时，将创建一个新的日志段
log.segment.bytes=1073741824

# 根据保留策略检查日志是否删除的间隔时间
log.retention.check.interval.ms=300000

log.cleaner.enable=false
```

这里要注意，因为Kafka读取特定消息的时间复杂度为O(1)，即与文件大小无关，所以这里删除文件与Kafka性能无关，选择怎样的删除策略只与磁盘以及具体的需求有关。另外，Kafka会为每一个consumer group保留一些metadata信息–当前消费的消息的position，也即offset。这个offset由consumer控制。正常情况下consumer会在消费完一条消息后线性增加这个offset。当然，consumer也可将offset设成一个较小的值，重新消费一些消息。因为offet由consumer控制，所以Kafka broker是无状态的，它不需要标记哪些消息被哪些consumer过，不需要通过broker去保证同一个consumer group只有一个consumer能消费某一条消息，因此也就不需要锁机制，这也为Kafka的高吞吐率提供了有力保障。





#### Replication & Leader election

Kafka提供partition级别的replication，replication默认情况下为1，replication的数量可在`$KAFKA_HOME/config/server.properties`中配置:
``` 
default.replication.factor = 1
```

 Replication与leader election配合提供了自动的failover(故障转移)机制。
 
 每个partition都有一个唯一的leader，所有的读写操作都在leader上完成，follower批量从leader上pull数据。一般情况下partition的数量大于等于broker的数量，并且所有partition的leader均匀分布在broker上。follower上的日志和其leader上的完全一样。
 
 对于Kafka而言，Kafka存活包含两个条件，一是它必须维护与Zookeeper的session(这个通过Zookeeper的heartbeat机制来实现)
 。二是follower必须能够及时将leader的writing复制过来，不能"落后太多"。


leader会追踪"in sync"(同步状态)的node list。如果一个follower宕机，或者落后太多，leader将把它从”in sync” 
list中移除。这里所描述的“落后太多”指follower复制的消息落后于leader后的条数超过预定值，该值可在`$KAFKA_HOME/config/server.properties`中配置
``` 
#If a replica falls more than this many messages behind the leader, the leader will remove the follower from ISR and treat it as dead
replica.lag.max.messages=4000
#If a follower hasn't sent any fetch requests for this window of time, the leader will remove the follower from ISR (in-sync replicas) and treat it as dead
replica.lag.time.max.ms=10000
```
kafka的一致性问题，与拜占庭将军的解决思路不一样。一条消息只有被“in sync” list里的所有follower都从leader复制过去才会被认为已提交。这样就避免了部分数据被写进了leader，还没来得及被任何follower复制就宕机了，而造成数据丢失（consumer无法消费这些数据）。而对于producer而言，它可以选择是否等待消息commit，这可以通过`request.required.acks`来设置。这种机制确保了只要“in sync” list有一个或以上的flollower，一条被commit的消息就不会丢失。

这里的复制机制即不是同步复制，也不是单纯的异步复制。事实上，同步复制要求“活着的”follower都复制完，这条消息才会被认为commit，这种复制方式极大的影响了吞吐率（高吞吐率是Kafka非常重要的一个特性）。而异步复制方式下，follower异步的从leader复制数据，数据只要被leader写入log就被认为已经commit，这种情况下如果follwer都落后于leader，而leader突然宕机，则会丢失数据。而Kafka的这种使用“in sync” list的方式则很好的均衡了确保数据不丢失以及吞吐率。follower可以批量的从leader复制数据，这样极大的提高复制性能（批量写磁盘），极大减少了follower与leader的差距（前文有说到，只要follower落后leader不太远，则被认为在“in sync” list里）

##### leader election

当leader宕机了，怎样在follower中选举出新的leader。因为follower可能落后许多，所以必须确保选择“最新”的follower作为新的leader。一个基本的原则就是，如果leader不在了，新的leader必须拥有原来的leader commit的所有消息。这就需要作一个折衷，如果leader在标明一条消息被commit前等待更多的follower确认，那在它die之后就有更多的follower可以作为新的leader，但这也会造成吞吐率的下降。

kafka并不是zk的类似raft算法(majority vote 少数服从多数)，而是采用的另外的方式。Kafka在Zookeeper中动态维护了一个ISR（in-sync replicas） set，这个set里的所有replica都跟上了leader，只有ISR里的成员才有被选为leader的可能。在这种模式下，对于f+1个replica，一个Kafka topic能在保证不丢失已经commit的消息的前提下容忍f个replica的失败。在大多数使用场景中，这种模式是非常有利的。事实上，为了容忍f个replica的失败，majority vote和ISR在commit前需要等待的replica数量是一样的，但是ISR需要的总的replica的个数几乎是majority vote的一半。

在ISR中至少有一个follower时，Kafka可以确保已经commit的数据不丢失，但如果某一个partition的所有replica都挂了，就无法保证数据不丢失了。这种情况下有两种可行的方案：
- 等待ISR中的任一个replica“活”过来，并且选它作为leader
- 选择第一个“活”过来的replica（不一定是ISR中的）作为leader

这就需要在可用性和一致性当中作出一个简单的平衡。如果一定要等待ISR中的replica“活”过来，那不可用的时间就可能会相对较长。而且如果ISR中的所有replica都无法“活”过来了，或者数据都丢失了，这个partition将永远不可用。选择第一个“活”过来的replica作为leader，而这个replica不是ISR中的replica，那即使它并不保证已经包含了所有已commit的消息，它也会成为leader而作为consumer的数据源（前文有说明，所有读写都由leader完成）。Kafka0.8.*使用了第二种方式。根据Kafka的文档，在以后的版本中，Kafka支持用户通过配置选择这两种方式中的一种，从而根据不同的使用场景选择高可用性还是强一致性。


#### Consumer group

每一个consumer实例都属于一个consumer group，每一条消息只会被同一个consumer group里的一个consumer实例消费。（不同consumer group可以同时消费同一条消息）

Kafka保证保证同一个consumer group里只有一个consumer会消费一条消息,Kafka还允许不同consumer group同时消费同一条消息


#### 消息Deliver guarantee(消息传输保证)

Kafka确保消息在producer和consumer之间传输。有这么几种semantic(语义):
- At most once 消息可能会丢，但绝不会重复传输
- At least one 消息绝不会丢，但可能会重复传输
- Exactly once 每条消息肯定会被传输一次且仅传输一次(这也是用户最希望的一种语义)

##### producer to broker Deliver guarantee
kafka在 `0.11.0`版本实现了 `Exactly once`.如果producer发送数据给broker后，遇到的网络问题而造成通信中断，那producer就无法判断该条消息是否已经commit。虽然Kafka无法确定网络故障期间发生了什么，但是producer可以生成一种类似于primary key的东西，发生故障时幂等性的retry多次，这样就做到了`Exactly one`。 同时Kafka还支持`At least once`和`At most once`

##### broker to consumer Deliver guarantee

consumer在从broker读取消息后，可以选择commit，该操作会在Zookeeper中存下该consumer在该partition下读取的消息的offset。该consumer下一次再读该partition
时会从下一条开始读取。如未commit，下一次读取的开始位置会跟上一次commit之后的开始位置相同。当然可以将consumer设置为autocommit，即consumer一旦读到数据立即自动commit。如果只讨论这一读取消息的过程，那Kafka是确保了`Exactly once`。但实际上实际使用中consumer并非读取完数据就结束了，而是要进行进一步处理，而数据处理与commit的顺序在很大程度上决定了消息从broker和consumer的delivery guarantee semantic：
- 读完消息先commit再处理消息。这种模式下，如果consumer在commit后还没来得及处理消息就crash了，下次重新开始工作后就无法读到刚刚已提交而未处理的消息，这就对应于`At most once`(保证不重复传送)
- 读完消息先处理再commit。这种模式下，如果处理完了消息在commit之前consumer crash了，下次重新开始工作时还会处理刚刚未commit的消息，实际上该消息已经被处理过了。这就对应于`At least once`(保证消息不会丢失，这也是Kafka的默认处理方式)。
在很多情况使用场景下，消息都有一个primary key，所以消息的处理往往具有幂等性，即多次处理这一条消息跟只处理一次是等效的，那就可以认为是Exactly once(通过幂等性来保证)。


### Kafka 文件存储机制

#### partition的存储结构

Kafka 中消息是以 topic 进行分类的，生产者通过 topic 向 Kafka broker 发送消息，消费者通过 topic 读取数据。然而 topic 在物理层面又能以 partition 为分组，一个 topic 可以分成若干个 partition。事实上，partition 并不是最终的存储粒度，partition 还可以细分为 segment，一个 partition 物理上由多个 segment 组成。

在物理结构上，partition是目录，比如单个broker上，创建一个topic，会在配置的`log.dirs`下生成partion数目个目录。如 topic 为 test， partition设置为2， 则会生成 test-0 和 test-1 两个目录。

如果就以 partition 为最小存储单位，当 Kafka producer 不断发送消息，必然会引起 partition 文件的无限扩张，将对消息文件的维护以及已消费的消息的清理带来严重的影响，因此，需以 segment 为单位将 partition 进一步细分。每个 partition（目录）相当于一个巨型文件被平均分配到多个大小相等的 segment（段）数据文件中（每个 segment 文件中消息数量不一定相等）这种特性也方便 old segment 的删除，即方便已被消费的消息的清理，提高磁盘的利用率。

#### segment工作原理

segment 文件由两部分组成，分别为 “.index” 文件和 “.log” 文件，分别表示为 segment 索引文件和数据文件。这两个文件的命令规则为：partition 全局的第一个 segment 从 0 开始，后续每个 segment 文件名为上一个 segment 文件最后一条消息的 offset 值，数值大小为 64 位，20 位数字字符长度，没有数字用 0 填充，如下：
``` 
00000000000000000000.index
00000000000000000000.log
00000000000000170410.index
00000000000000170410.log
00000000000000239430.index
00000000000000239430.log
```

以上面的 segment 文件为例，展示出 segment：00000000000000170410 的 “.index” 文件和 “.log” 文件的对应的关系，如下图：

![](/images/kafka/segment.jpg)

.index” 索引文件存储大量的元数据，“.log” 数据文件存储大量的消息，索引文件中的元数据指向对应数据文件中 message 的物理偏移地址。其中以 “.index” 索引文件中的元数据 [3, 348] 为例，在 “.log” 数据文件表示第 3 个消息，即在全局 partition 中表示 170410+3=170413 个消息，该消息的物理偏移地址为 348


##### 从partition中通过offset查找message

以上图为例，读取 offset=170418 的消息，首先查找 segment 文件，其中 00000000000000000000.index 为最开始的文件，第二个文件为 00000000000000170410.index（起始偏移为 170410+1=170411），而第三个文件为 00000000000000239430.index（起始偏移为 239430+1=239431），所以这个 offset=170418 就落到了第二个文件之中。其它后续文件可以依次类推，以其偏移量命名并排列这些文件，然后根据二分查找法就可以快速定位到具体文件位置。其次根据 00000000000000170410.index 文件中的 [8,1325] 定位到 00000000000000170410.log 文件中的 1325 的位置进行读取。

### Kafka在ZK的存储形式

在基于 Kafka 的分布式消息队列中，ZooKeeper 的作用有：broker 注册、topic 注册、producer 和 consumer 负载均衡、维护 partition 与 consumer 的关系、记录消息消费的进度以及 consumer 注册等。

![](/images/kafka/kafka_zk.png)
#### broker 在 ZooKeeper 中的注册

- 为了记录 broker 的注册信息，在 ZooKeeper 上，专门创建了属于 Kafka 的一个节点，其路径为 /brokers
- Kafka 的每个 broker 启动时，都会到 ZooKeeper 中进行注册，告诉 ZooKeeper 其 broker.id，在整个集群中，broker.id 应该全局唯一，并在 ZooKeeper 上创建其属于自己的节点，其节点路径为`/brokers/ids/{broker.id}`
- 创建完节点后，Kafka 会将该 broker 的 broker.name 及端口号记录到该节点
- 另外，该 broker 节点属性为临时节点，当 broker 会话失效时，ZooKeeper 会删除该节点，这样，我们就可以很方便的监控到broker 节点的变化，及时调整负载均衡等

#### Topic 在 ZooKeeper 中的注册

在 Kafka 中，所有 topic 与 broker 的对应关系都由 ZooKeeper 进行维护，在 ZooKeeper 中，建立专门的节点来记录这些信息，其节点路径为`/brokers/topics/{topic_name}` 

为了保障数据的一致性，ZooKeeper 机制得以引入。基于 ZooKeeper，Kafka 为每一个 partition 找一个节点作为 leader，其余备份作为 follower, 两个topic 的 partition分布如下:
![](/images/kafka/partition_leader_follower.jpg)

基于上图的架构，当 producer push 的消息写入 partition（分区) 时，作为 leader 的 broker（Kafka 节点） 会将消息写入自己的分区，同时还会将此消息复制到各个 follower，实现同步。如果，某个follower 挂掉，leader 会再找一个替代并同步消息；如果 leader 挂了，follower 们会选举出一个新的 leader 替代，继续业务，这些都是由 ZooKeeper 完成的。

#### consumer 在 ZooKeeper 中的注册

当新的消费者组注册到 ZooKeeper 中时，ZooKeeper 会创建专用的节点来保存相关信息，其节点路径为`/consumers/{group_id}`，其节点下有三个子节点，分别为 `[ids, owners, offsets]`

##### 注册新的 consumer

当新的消费者注册到 Kafka 中时，会在`/consumers/{group_id}/ids`节点下创建临时子节点，并记录相关信息


#### 记录消费进度 Offset

在 consumer 对指定消息 partition 的消息进行消费的过程中，需要定时地将 partition 消息的消费进度 Offset 记录到 ZooKeeper上，以便在该 consumer 进行重启或者其它 consumer 重新接管该消息分区的消息消费权后，能够从之前的进度开始继续进行消息消费。Offset 在 ZooKeeper 中由一个专门节点进行记录，其节点路径为：
``` 
#节点内容就是Offset的值。
/consumers/[group_id]/offsets/[topic]/[broker_id-partition_id]
```

#### 记录 Partition 与 Consumer 的关系

在Kafka中，规定了每个 partition 只能被同组的一个消费者进行消费，因此，需要在 ZooKeeper 上记录下 partition 与 consumer 之间的关系，每个 consumer 一旦确定了对一个 partition 的消费权力，需要将其 consumer ID 写入到 ZooKeeper 对应消息分区的临时节点上，例如：
``` 
/consumers/[group_id]/owners/[topic]/[broker_id-partition_id]
```

其中，`[broker_id-partition_id]` 就是一个消息分区的标识，节点内容就是该消息分区 消费者的 consumer ID。

### Producer-broker-consumer 过程

#### 1.producer发布消息

producer 采用 push 模式将消息发布到 broker，每条消息都被 append 到 patition 中，属于顺序写磁盘（顺序写磁盘效率比随机写内存要高，保障 kafka 吞吐率）。producer 发送消息到broker 时，会根据分区算法选择将其存储到哪一个 partition。

##### 路由机制
1. 指定了 patition，则直接使用
2. 未指定 patition 但指定 key，通过对 key 进行 hash 选出一个 patition
3. patition 和 key 都未指定，使用轮询选出一个 patition

##### 写入流程
1. producer 先从 ZooKeeper 的 "/brokers/.../state" 节点找到该 partition 的leader；
2. producer 将消息发送给该 leader
3. leader 将消息写入本地 log
4. followers 从 leader pull 消息，写入本地 log 后 leader 发送 ACK
5. leader 收到所有 ISR 中的 replica 的 ACK 后，增加 HW（high watermark，最后 commit 的 offset） 并向 producer 发送 ACK

#### 2.Broker 存储消息

物理上把 topic 分成一个或多个 patition，每个 patition 物理上对应一个文件夹（该文件夹存储该 patition 的所有消息和索引文件）

#### 3. Consumer 消费消息

high-level consumer API 提供了 consumer group 的语义，一个消息只能被 group 内的一个 consumer 所消费，且 consumer 消费消息时不关注 offset，最后一个 offset 由 ZooKeeper 保存（下次消费时，该group 中的consumer将从offset记录的位置开始消费）

注意:
- 如果消费线程大于 patition 数量，则有些线程将收不到消息
- 如果 patition 数量大于消费线程数，则有些线程多收到多个 patition 的消息
- 如果一个线程消费多个 patition，则无法保证你收到的消息的顺序，而一个 patition 内的消息是有序的


### 参考资料
- [Kafka权威指南]
- [Kafka深度解析](http://www.jasongj.com/2015/01/02/Kafka%E6%B7%B1%E5%BA%A6%E8%A7%A3%E6%9E%90/)
- [Kafka文件存储机制](https://tech.meituan.com/kafka_fs_design_theory.html)
- [Kafka存储机制和读写流程](https://my.oschina.net/u/3049601/blog/1826985)
- [Kafka是如何实现 Exactly-once 语义的](https://www.jianshu.com/p/5d889a67dcd3)