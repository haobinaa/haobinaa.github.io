---
title: 使用redis作为延迟队列方案对比
date: 2024-11-12 15:52:47
tags: redis
categories: 中间件
---

### 背景

项目中经常需要做某个操作， 然后一定时间之后看这个操作的执行结果。 要么使用定时任务扫描， 要么使用延时队列(任务)来实现。
在主流的 MQ 中支持延时消息的有 `RabbitMQ` 和 `RocketMQ`， 如果没有使用这个两个 MQ， 譬如使用了 Kafka， 又想使用延时消息的功能可以使用 Redis来实现。


Redis 实现延时队列有三种方案:
1. 基于 `Zset（Sorted Set）` 来实现
2. 基于 Redis 的 **KEYSPACE NOTIFICATIONS** 来监听 list 的 expire 事件
3. 基于 Redis 的 Stream(需要 redis 5.0 及以上版本) 消费组来实现



### 基于 ZSet 实现延时队列

redis 可以基于 list 来实现队列， 通过 LPop 和 RPush 保证先入先出。
在延时队列场景可以使用 `zset`,  实现原理:

![](/images/redis/delay_queue.png)

1. score 存储到期时间的时间戳
2. 定时轮询 zset， 使用到期时间作为 score， 使用 `ZRANGEBYSCORE` 获取到期的消息， 将到期的消息迁移到 List 即可(或不要这一步， 直接消费)



#### 消息迁移原子性

将到期消息的往 list 的迁移需要三个动作：
1. 查询到期消息
2. 从 sortedset 取出到期消息
3. 将到期消息 push 到 list 队列中

这三个动作需要保证原子性(要么都成功，要么都失败), 可以使用 lua 脚本来实现。

备注: 虽然 redis 本身支持事务， 但是 redis 的事务机制不是那么合理， 当运行出错的时候会跳过出错的命令继续执行(只有语法错误才会失败)， 并不能完全保证原子性， 所以大部分框架还是会选择用 lua 脚本


#### List 和 Zset 的性能

本章节摘取于其他文章的测试结果， 出处在参考资料

压测环境:
- 目标服务器为 8C16G
- redis 版本为 6.0
- 压测工具是 `memtier_benchmark`

1. `Lpop` 和 `Rpush` 的时间复杂度是O(1):

![](/images/redis/benchmark_rpush.png)


2. zset 的 `zadd` 复杂度是 O(M*log(N))， N是有序集的基数，M为成功添加的新成员的数量

zadd benchmark 结果:
![](/images/redis/benchmark_zadd.png)

3. zset 的 `zrangebyscore` 复杂度是  O(log(N)+M)， N 为有序集的基数， M 为被结果集的基数。
![](/images/redis/benchmark_zrange.png)

### List + 监听 expire 事件

1. 将消息放入 list 里面， 通过 lpop，rpush 操作任务的进出
2. 开启 `KEYSPACE NOTIFICATIONS` 监听过期事件: `CONFIG SET notify-keyspace-events Ex`
3. 消费者监听 list 对应 key 的 expire 事件后做出相应处理


#### KEYSPACE NOTIFICATIONS 

Keyspace Notifications，可以用于监控 Redis 内的 Key 和 Value的变化，包括 Key 过期事件。像监听过期 Key 的功能就是通过 Keyspace Notifications 实现的。
基本原理是：Pub/Sub。客户端通过订阅 Pub/Sub 频道，来感知事件的发生。

开启 `KEYSPACE NOTIFICATIONS`:
``` 
# config set 或者 redis.conf 配置
notify-keyspace-events [参数](KEA)
# 禁用该功能 参数设置为空即


### 参数说明
至少需要 K E 中的一个
- K: 以 __keyspace@<db>__ 为前缀的 Keyspace events
- E: 以 __keyevent@<db>__ 为前缀的 Keyevent events
- m: 访问了不存在的 key
- n: 产生了新 key
- A: A是特殊的，代表下面所有的参数的总和，是"g$lshztxed"的别名（除去mnKE的全部)
- x： key 过期事件
- e： Redis内存满了,被内存淘汰的事件
- g： 通用命令
- $： String commands
- s： Set commands
- h: Hash commands
- z: Sorted set commands
- t: Stream commands
- d: Module key type events
```


#### redis Pub/Sub 机制


#### 该方案缺陷

1. 开启 keyspace notifications 会带来额外的 CPU  开销。 如果事件通知非常频繁， redis Server 可能会积累大量的未通知事件， 占据大量内存
2. 基于 pub/sub 模式消息传递是不可靠的， 如果客户端断开的过程中发送了消息， 此刻消息就丢失了(没有 MQ 的 ack 和 commit offset 机制)
3. 过期事件的通知会有延迟， 因为 redis 发现 key 过期并非是 ttl 到 0， 而是 redis 发现过期才会通知(get 的时候或者线程扫描)， 因此如果 key 非常多的时候， 可能会有分钟级的延迟







### 参考资料
- [Redis延迟队列golang高效实现](https://cloud.tencent.com/developer/article/2015144)
