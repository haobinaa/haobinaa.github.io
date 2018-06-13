---
title: RabbitMQ之AMQP
date: 2017-10-19 19:15:41
tags: rabbitMQ
categories: RabbitMQ
---

### AMQP关键性概念和流程
- broker： 消息队列服务器实体
- Exchange： 消息交换机，指定消息按照什么规则到哪个队列
- Queue： 消息队列载体， 每个消息会被投放到一个或多个队列
- Binding： 绑定，将Exchange和Queue按某种规则绑定起来
- Routing Key： 路由关键字，Exchange按照这个关键字进行消息投递
- vhost： 虚拟主机，一个broker可以开多个vhost，用作不同用户的权限分离
- producer：生产者，消息的投递程序
- consumer： 消费者， 消息的接受程序
- channel： 消息通道， 在客户端的每个连接都可以建立多个channel，每个channel代表一个会话任务



AMQP消息模型如图所示：
![AMQP消息模型](http://www.huangxiaobai.com/wp-content/uploads/2017/01/3178521620-57fba2b850ccc_articlex.png)
我们可以知道，消息的发送步骤：  
1. 消息生产者将消息发布（publish）到exchange中
2. exchange根据队列的绑定关系（routes）将消息发布到不同的queue总
3. AMQP根据订阅规则将消息发送给消费者或消费者自行根据需要从消息队列中获取消息

消息队列的完整使用流程如下：  
1. 客户端连接到消息队列服务器，打开一个channel
2. 客户端声明一个queue，并设置相关属性
3. 客户端使用routing key， 并设置相关属性
4. 客户端使用routing key，在exchange和queue之间建立绑定关系
5. 客户端投递消息到exchange

以上步骤exchange、queue、routingkey三个决定了从exchange到queue的唯一线路  
6.当exchange接受到消息后，就根据消息的key和已经设置好的binding，进行消息路由，把消息投递到队列里面。

### Exchange
Exchange的任务主要是接受消息并将消息路由到0个或多个queue中，而路由的算法受到exchange类型和绑定（binding）的关系影响，AMQP提供了以下Exchange类型：

|类型        | 默认预定义的名字   |
|------------|---------------- |
| Direct Exchange     |  空字符串和 amq.direct |
| Fanout Exchange     |  amq.fanout           |
| Topic Exchange      |  amp.topic            |
| Headers Exchange    |  amq.match(RabbitMQ中还有amq.headers) |

每个Exchange有以下属性：
- Name和Exchange的name
- Durability，是否为持久的Exchange，当为真时，broker重启后也会保留此Exchange
- Auto-delete， 当为真时，如果所有绑定的queue都不在使用时，此exchange会自动删除

默认的exchange是由broker预创建的匿名（即名字是空字符）的direct exchange，对于简单的程序，默认的exchange有一个实用的属性：如果没有显式地绑定 Exchnge, 那么创建的每个 queue 都会自动绑定到这个默认的 exchagne 中, 并且此时这个 queue 的 route key 就是这个queue 的名字.


### direct Exchange
![](http://www.huangxiaobai.com/wp-content/uploads/2017/01/2741285098-57fba2ca6e2da_articlex.png)
direct Exchange根据routing key把消息发送到不同的queue. direct exchange 适合用于消息的单播发送. direct exchange 的工作流程如下:
- 一个 queue 使用 K 作为 route key 绑定到 direct exchange 中
- 当direct exchange 收到一个 route key 为 R 的消息时, 如果 R == K, 则此 exchange 会将此消息路由到此 queue 中


### fanout Exchange
一个 fanout exchange 会将消息分发给所有绑定到此 exchange 的 queue 中, 而不会考虑 queue 的 route key. 即如果有 N 个 Queue 绑定到一个 fanout exchange 时, 那么当此 exchange 收到消息时, 会将此消息分发到这 N 个 queue 中. 由于此性质, fanout exchange 也常用消息的广播
![](http://www.huangxiaobai.com/wp-content/uploads/2017/01/4144211224-57fba2d656e45_articlex.png)

### topic Exchange
topic exchange 会根据 route key 将消息分发到与此消息的 route key 相匹配的并且绑定到此 exchagne 中的 queue 中(如果有多个 queue 使用了相同的 route key 绑定到此 exchange, 那么这些 queue 都会收到消息). 根据此性质, topic exchange 经常用于实现 publish/subscribe 模型, 即消息的多播模型.

### header exchange
header exchange 不使用 route key 作为路由的依据, 而是使用消息头属性来路由消息.

### queue 队列
AMQP 中的 队列 的概念和其他消息队列中 队列 的概念类似, 它有如下几个重要的概念:
- Name, 名字
- Durable, 是否是持久的. 当为真时, 即使 broker 重启时, 此 queue 也不会被删除.
- Exclusive, 是否是独占的, 当为真时, 表示此 queue 只能有一个消费者, 并且当此消费者的连接断开时, 此 queue 会被删除.
- Auto-delete, 当为真时, 此 队列 会在最后一个消费者取消订阅时被删除.  
在使用一个队列时, 需要先进行声明. 如果我们声明的队列不存在, 那么 broker 就会自动创建它. 不过如果此队列已经存在时, 我们就需要注意了, 若我们声明的队列的属性和已存在的队列的属性一致, 则不会有任何的问题, 但是如果先后两次声明的队列的属性不一致, 则会有 PRECONDITION_FAILED 错误(错误码为406).

队列名：AMQP 的队列名不能以 “amq.” 开头, 因为这样的队列名是 AMQP broker 内部所使用的. 当我们使用了这样的队列名时, 那么会有一个 ACCESS_REFUSED 错误(错误码为 403)

持久队列：持久队列会被持久化到磁盘中, 因此即使 broker 重启了, 持久队列也依然存在.不过需要注意的是, 不要将持久队列和消息的持久化混淆. 当 broker 重启时, 持久队列会自动重新声明, 然而只有队列中的持久化消息(persistent message)才会被恢复.

队列绑定：队列的绑定关系是 exchagne 用于消息路由的规则, 即一个 exchange 能够将消息路由到某个队列的前提是此队列已经绑定到这个 exchange 中了. 当队列绑定到一个 exchange 中时, 我们还可以设置一个额外的参数, 即 route key, 这个 key 会被 direct exchange 和 topic exchange 作为额外的路由信息而使用, 换句话说, route key 扮演着过滤器的角色.当一个消息没有被路由到任意的队列时(例如此 exchange 没有任何的 queue 绑定着), 那么此时会根据消息的属性来决定是将此消息丢弃还是返回给生产者.

### 消费者
消费者支持两种消费分发模式：
- push 模式, 即 broker 主动推送消息给消费者
- pull 模式, 即消费者主动从 broker 中拉取消息

在 push 模式时, 应用程序需要告知 broker 它对哪些消息感兴趣, 即也就是我们所说的订阅一个消息主题. 每个消费者都有一个惟一的标识符, 即consumer tag, 我们可以用这个 tag 来取消一个消费者对某个主题的订阅(unsubscribe).

### 消息ACK
AMQP有两种ACK模式：
- 手动ACK
- 自动ACK

在自动 ACK 模式下, 当 broker 发送消息成功后, 会立即将此消息从消息队列中删除, 而不会等待消费者的 ACK 回复. 而在手动 ACK 模式下, 当 broker 发送消息给消费者时, 不会立即将此消息删除, 而是需要等待消费者的 ACK 回复后才会删除消息. 因此在手动 ACK 模式下, 当消费者收到消息并处理完成后, 需要向 broker 显示地发送 ACK 指令.在手动 ACK 模式下, 如果消费者因为意外的 crash 而没有发送 ACK 给 broker, 那么此时 broker 会将此消息转发给其他的消费者(如果此时没有消费者了, 那么 broker 会缓存此消息, 直到有新的消费者注册).

### 拒绝消息
当一个消费者处理消息失败或此时不能处理消息时, 那么可以给 broker 发送一个拒绝消息的指令, 并且可以要求 broker 丢弃或重新分发此消息.不过需要注意的是, 如果此时只有一个消费者, 那么当此消费者拒收消息并要求 broker 重新分发此消息时, 那么就会造成了此消息不断地分发和拒收, 形成了死循环.

### 预取消息
通过预取消息机制, 消费者可以一次性批量取出消息, 然后在处理后对这些批量消息进行统一的 ACK 回复, 这样可以提高消息的吞吐量.不过, 需要注意的时, RabbitMQ 仅支持 channel 级别的预取消息的数量配置, 不支持基于连接的预取消息数量配置

### 通道(Channel)
AMQP 不推荐一个应用程序发起多个对 broker 的连接, 因为这样会消耗系统资源并且也不利于防火墙的配置. 但是如果应用程序确实需要有多个不互相干扰的连接来进行不同的操作时该怎么办呢? 为了解决这个问题, AMQP 引入了 Channel 的 概念. 在 AMQP 0-9-1 中, 一个与 broker 的连接是被多个 Channel 复用的, 因此我们可以将 channel 理解为: 一个共享同一个 TCP 连接的轻量级的连接.

基于同一个 TCP 连接的两个不同的 channel 直接是不会有任何的干扰的(在逻辑上可以等效地理解为两个独立的连接), 因此客户端和 broker 之间交互时, 需要附带上 channel id.通常来说, 在一个多线程消费消息的模型中, 每个线程单独打开一个 channel 是一个推荐的做法, 而最好不要在各个线程中共享一个 channel.


