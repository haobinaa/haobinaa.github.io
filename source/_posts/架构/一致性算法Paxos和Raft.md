---
title: 一致性算法(Paxos、Raft、ZAB)
date: 2019-04-01 09:44:31
tags:
categories: 分布式
---

## Paxos算法

在常见的 分布式系统 中，总会发生 节点宕机 或 网络异常 (包括消息的 重复、丢失、延迟、乱序、网络分区) 等情况。

Paxos 算法主要就是解决如何在一个 发生如上故障 的分布式系统中，快速正确的在集群内 对某个值达成一致，并且保证 整个系统的一致性。


### 角色与规则

提案：提案=编号+Value。 暂定提案=P, Value=V


在整个系统中，一共有三种角色：

- Proposer: Proposer 可以 提出提案
- Acceptor: Acceptor 可以 接受提案
- Learner: Acceptor 告诉 Learner 哪个提案被选定了，那么 Learner 就学习这个被选择的 value


在具体的实现中，一个进程即可能是Proposer,也可能是Acceptor，也可能是Learner

`Paxos`一致性算法有些规则约束:
1. 提出的P中， 只有一个V被选中
2. 如果没有 P 被提出，就没有 V 被选中
3. 在 P 被选定后，进程都可以学习被选中的 P


### 算法推导过程

多个Proposer和多个Acceptor的情况，选定一个值, 氛围两个阶段： 约定P1 和 约定P2

#### 约定P1

> P1:一个 Acceptor 必须接受一个它收到的第一个 P

这个约定会导致的情况是，不同的 Acceptor 会收到不同的 P ，导致不同的V被选定:

![](/images/arch/paxos-1.png)

对于这个情况，需要一个额外的约定:
> 一个提案 P 被选定，需要被半数以上 Acceptor 接受

这样就需要一个一个Acceptor必须接受不止一个提案， 也就是提案是 `[提案P=提案编号+Value]`(也记作[M, V])

#### 约定P2

> P2 : 如果提案 P[M0,V0] 被选定了，那么所有比 M0 编号更高的，且被选定的 P，其 value 的值也是 V0


![](/images/arch/paxos-2.png)

假设有 5 个 Acceptor。Proposer2 提出 [M1,V1]的提案，Acceptor2~5（半数以上）均接受了该提案，于是对于 Acceptor2~5 和 Proposer2 来讲，它们都认为 V1 被选定。Acceptor1 刚刚从 宕机状态 恢复过来（之前 Acceptor1 没有收到过任何提案），此时 Proposer1 向 Acceptor1 发送了 [M2,V2] 的提案 （V2≠V1且M2>M1）。对于 Acceptor1 来讲，这是它收到的 第一个提案。根据 P1（一个 Acceptor 必须接受它收到的 第一个提案），Acceptor1 必须接受该提案。同时 Acceptor1 认为 V2 被选定

这样就导致了不一致的和违反P2约定的情况出现:
1. Acceptor1 认为 V2 被选定，Acceptor2~5 和Proposer2 认为 V1 被选定。出现了不一致
2. V1 被选定了，但是 编号更高 的被 Acceptor1 接受的提案 [M2,V2] 的 value 为 V2，且 V2≠V1。这就跟 P2a（如果某个 value 为 v的提案被选定了，那么每个 编号更高 的被 Acceptor 接受的提案的 value 必须也是 v）矛盾了
   
基于上述问题，就有了P2的补充:
> P2b : 如果 P[M0,V0] 被选定后，任何 Proposer 产生的 P，其值也是 V0

如果要满足P2b， 保证任何Proposer产生的P，其值也是V0， 需要满足P2c:
> 对于任意的 M、V，如果 [M,V] 被提出，那么存在一个半数以上的 Acceptor 组成的组合 S，满足以下两个条件中的任何一个：
    1. S 中没有一个接受过编号小于 M 的提案。
    2. S 中的 Acceptor 接受过的最大编号的提案的 value 为 V。


### 算法流程

![](/images/arch/paxos.png)

#### Proposer 提出提案

(1). 学习阶段：Prepare请求

Proposer 选择一个新的提案 P[MN,?] 向 Acceptor 集合 S（数目在半数以上）发送请求，要求 S 中的每一个 Acceptor 做出如下响应：
1. 如果 Acceptor 没有接受过提案，则向 Proposer 保证 不再接受编号小于N的提案
2. 如果 Acceptor 接受过请求，则向 Proposer 返回 已经接受过的编号小于N的编号最大的提案


(2). 接受阶段：Acceptor请求
1. 如果 Proposer 收到 半数以上 的 Acceptor 响应，则 生成编号为 N，value 为 V 的提案 [MN,V]，V 为所有响应中 编号最大 的提案的 value
2. 如果 Proposer 收到的响应中 没有提案，那么 value 由 Proposer 自己生成，生成后将此提案发给 S，并期望 Acceptor 能接受此提案


#### Acceptor接受提案

一个 Acceptor 需要遵守, 并记住:
1. 已接受的编号最大的提案
2. 已响应的请求的最大编号


## Raft算法

Raft也是一种一致性算法，但比paxos更易于理解。Raft的选举过程与paxos有一些区别

### Raft角色与规则

Raft有三种角色：Leader，Candidate，Follower。一个 Server 进程在某一时刻，只能是其中 一种类型，但这不是固定的。不同的时刻，它可能拥有不同的类型。

1. Leader(主节点)
2. Follower(从节点)
3. Candidate(参与投票竞争的节点)

### Leader选举流程

一个最小的 Raft 民主集群需要 三个参与者， 这样才能投出多数票。

(1). 在最初，还没有一个主节点的时候，所有节点的身份都是Follower。每一个节点都有自己的计时器，当计时达到了超时时间（Election Timeout），该节点会转变为Candidate

![](/images/arch/raft-node.png)

(2). 成为Candidate的节点，会首先给自己投票，然后向集群中其他所有的节点发起请求，要求大家都给自己投票

![](/images/arch/raft-vote.png)

(3). 其他收到投票请求且还未投票的Follower节点会向发起者投票，发起者收到反馈通知后，票数增加。

![](/images/arch/raft-follower-vote.png)

(4).当得票数超过了集群节点数量的一半，该节点晋升为Leader节点。Leader节点会立刻向其他节点发出通知，告诉大家自己才是老大。收到通知的节点全部变为Follower，并且各自的计时器清零

![](/images/arch/raft-become-leader.png)

这里需要说明一点，如果每个节点得票一样，没有任何一方获得多数票，则本轮投票无效。每个参与方随机休息一阵(Election Timeout), 然后重新发起投票。每个节点的超时时间都是不一样的。比如A节点的超时时间是3秒，B节点的超时时间是5秒，C节点的超时时间是4。这样一来，A节点将会最先发起投票请求，而不是所有节点同时发起。很快就会达成一致

Leader节点需要每隔一段时间向集群其他节点发送心跳通知，表明存活。一旦Leader节点挂掉，发不出通知，那么计时达到了超时时间的Follower节点会转变为Candidate节点，发起选主投票，周而复始......

### Leader对数据一致性的影响

Raft 协议 强依赖 Leader 节点的 可用性，以确保集群 数据的一致性。数据的流向 只能从 Leader 节点向 Follower 节点转移。具体过程如下：

![](/images/arch/raft-leader-dataflow.png)

1. 当 Client 向集群 Leader 节点提交数据后，Leader 节点接收到的数据处于未提交状态(这个过程是写入leader的log)
2. 接着 Leader 节点会并发地向所有 Follower 节点复制数据并等待接收响应(follower读入leader的log)
3. 集群中至少超过半数的节点已接收到数据后， Leader 再向 Client 确认数据已接收(leader提交log，并通知follower)
4. 一旦向 Client 发出数据接收 Ack 响应后，表明此时数据状态进入已提交（Committed），Leader 节点再向 Follower 节点发通知告知该数据状态已提交(follower提交log)


在这个过程中，leader可能随时挂掉， Raft针对不同阶段保障数据一致性

#### 数据到达Leader前，Leader挂掉

这个阶段对一致性无影响

#### 数据到达 Leader 节点，但未复制到 Follower 节点

这个阶段 Leader 挂掉，数据属于 未提交状态，Client 不会收到 Ack 会认为超时失败可安全发起重试。

Follower 节点上没有该数据，重新选主后 Client 重试重新提交可成功。原来的 Leader 节点恢复后作为 Follower 加入集群，重新从当前任期的新 Leader 处同步数据，强制保持和 Leader 数据一致。

#### 数据到达 Leader 节点，成功复制到 Follower 所有节点，但 Follower 还未向 Leader 响应接收

这个阶段 Leader 挂掉，虽然数据在 Follower 节点处于未提交状态，但是还是保持一致的。重新选出 Leader 后可完成数据提交。

此时 Client 由于不知到底提交成功没有，可重试提交。针对这种情况 Raft 要求 RPC 请求实现 幂等性，也就是要实现内部去重机制

#### 网络分区导致的脑裂情况，出现双 Leader 的现象

原先的 Leader 独自在一个区，向它提交数据不可能复制到多数节点所以永远提交不成功。向新的 Leader 提交数据可以提交成功。
网络恢复 后，旧的 Leader 发现集群中有 更新任期（Term）的新 Leader ，则 自动降级 为 Follower 并从新 Leader 处 同步数据 达成集群 数据一致

## ZAB协议

ZAB(原子广播)是zookeeper用来保证数据一致性的协议， 基于该协议，zookeeper实现了主从模式的系统架构中各个副本之间的数据一致性。

根据ZAB协议，所有的写操作都必须通过Leader完成，Leader写入本地日志后再复制到所有的Follower节点。

具体ZAB协议的流程(广播模式、恢复模式)在我另一篇博客里面有详细的描述:[zookeeper分布式协调详解](https://haobinaa.github.io/2019/01/03/%E4%B8%AD%E9%97%B4%E4%BB%B6/zookeeper%E5%88%86%E5%B8%83%E5%BC%8F%E5%8D%8F%E8%B0%83%E8%AF%A6%E8%A7%A3/)

### 参考资料
- [一致性算法Paxos](https://juejin.im/post/5b2664bd51882574874d8a76)
- [一致性算法Raft](https://juejin.im/post/5b2664e2f265da59584d8c90)
- [比较raft、basic paxos、multi paxos区别](https://zhuanlan.zhihu.com/p/25664121)