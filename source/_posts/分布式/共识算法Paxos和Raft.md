---
title: 分布式共识算法(Paxos、Raft)
date: 2021-04-01 09:44:31
tags:
categories: 分布式
---

## 分布式共识算法

多个参与者针对某一件事达成完全一致：一件事，一个结论。
已达成一致的结论，不可推翻。

### 主流分布式共识算法

- Paxos：被认为是分布式共识算法的根本，其他都是其变种，但是 paxos 论文中只给出了单个提案的过程，并没有给出复制状态机中需要的 multi-paxos 的相关细节的描述，实现 paxos 具有很高的工程复杂度（如多点可写，允许日志空洞等）。
- Raft：以容易理解著称，业界也涌现出很多 raft 实现，比如 etcd、braft、tikv 等。
- Zab：被应用在 zookeeper 中，业界使用广泛，但没用抽象成通用 library。


## Paxos

### 基本概念

#### 提议

Proposal: 提议， 记作 P
Proposal Value ： 提议的值，记作 V
Proposal Number: 提议编号

#### 角色

在整个系统中，一共有三种角色：
- Proposer: Proposer 提出提议
- Acceptor: Acceptor 接受提议
- Learner: 学习提议

Paxos 协议中 Proposer 有两个行为:
1. 一个是向 Acceptor 发 Prepare 请求
2. 另一个是向 Acceptor 发 Accept 请求

Acceptor则根据协议规则，对Proposer的请求作出承诺(Promised)和接受提议(Accepted)；

最后Learner可以根据Acceptor的状态，学习最终被确定的值


方便讨论，记:
1. `{n，v}`为提议编号为n，提议的值为v的提议
2. `(m，{n，v})` 为承诺了 Prepare（m）请求，并接受了提议`{n，v}`



### basic-paxos 协议流程

#### 第一阶段 A

Proposer选择一个提议编号n，向所有的Acceptor广播Prepare（n）请求。

![](/images/arch/paxos-one-a.png)


#### 第一阶段 B

Acceptor 接收到 Prepare（n）请求，若提议编号n比之前接受的 Prepare 请求都要大，则承诺(promised)将不会接受提议编号比 n 小的提议，并且带上之前 Accept 的提议中编号小于n的最大的提议，否则不予理会。

acceptor 之前没有 accept 过请求， 不用返回接受过的提议：
![](/images/arch/paxos-one-b.png)

如果接受过提议，要带上之前Accept的提议中编号小于n的最大的提议:
![](/images/arch/paxos-one-c.png)


#### 第二阶段 A

proposer 得到了多数 Acceptor 的承诺(promised)后，如果没有发现有一个 Acceptor 接受过(accepted) 一个值，那么向所有的Acceptor发起自己的值和提议编号n

![](/images/arch/paxos-two-a.png)

如果 Prepare 收到了应答， 应答中携带了 acceptor 之前接受过的提议如 {n1, v1}, {n2, v2}。
Proposer 则根据 n1,n2 的大小关系， 选择较大的哪个提议对应的值， 如 n1>n2, 则选择 v1 作为提议的值， 广播出自己的提议 {n, v1}

#### 第二阶段 B

Acceptor接收到提议后，如果该提议编号不违反自己做过的承诺，则接受该提议。

![](/images/arch/paxos-two-b.png)

#### paxos 协议流程解决的问题

当一个提议被多数派接受后，这个提议对应的值被Chosen(选定)，一旦有一个值被Chosen，那么只要按照协议的规则继续交互，后续被Chosen的值都是同一个值，也就是这个Chosen值的一致性问题。

### basic paxos 证明过程

#### paxos 原命题
paxos 原命题：
> 如果一个提议｛n0，v0｝被大多数 Acceptor 接受，那么不存在提议｛n1，v1｝被大多数 Acceptor 接受，其中n0 < n1，v0 != v1

paxos 原命题加强
> 如果一个提议｛n0，v0｝被大多数Acceptor接受，那么不存在 Acceptor 接受提议｛n1，v1｝，其中 n0 < n1，v0 != v1

paxos 进一步加强原命题
> 如果一个提议｛n0，v0｝被大多数 Acceptor 接受，那么不存在 Proposer 发出提议｛n1，v1｝，其中n0 < n1，v0 != v1

#### 归纳法证明原命题成立

如果证明"原命题进一步加强"成立， 那么"原命题"显然成立

1. 假设提议｛m，v｝（简称提议m）被多数派接受，那么提议 m 到 n（如果存在）对应的值都为 v，其中 n 不小于 m。

2. 这里对 n 进行归纳假设， 当 m=n 时， 结论显然成立

3. 设 n=k 时结论成立，即如果提议｛m，v｝被多数派接受， 那么提议 m 到 k 对应的值都为 v，其中 k 不小于 m。

4. 当 n=k+1 时，若提议 k+1 不存在，那么结论成立。

5. 若提议k+1存在，对应的值为v1

6. 因为提议m已经被多数派接受，又k+1的Prepare被多数派承诺并返回结果。

7. 基于两个多数派必有交集，易知提议k+1的第一阶段B有带提议回来。

8. 那么v1是从返回的提议中选出来的，不妨设这个值是选自提议｛t，v1｝。

9. 根据第二阶段A，因为t是返回的提议中编号最大，所以t >= m。

10. 又由第一阶段B，知道t < n。所以根据假设t对应的值为v。

11. 即有v1 = v。所以由n = k结论成立可以推出n = k+1成立。

12. 于是对于任意的提议编号不小于m的提议n，对应的值都为v。

所以命题成立。

#### 协议中的细节

1、为什么要被多数派接受？

因为两个多数派之间必有交集，所以Paxos协议一般是2F+1个Acceptor，然后允许最多F个Acceptor停机，而保证协议依然能够正常进行，最终得到一个确定的值。

2、为什么需要做一个承诺？

可以保证第二阶段A中Proposer的选择不会受到未来变化的干扰。另外，对于一个Acceptor而言，这个承诺决定了它回应提议编号较大的Prepare请求，和接受提议编号较小的Accept请求的先后顺序。

3、为什么第二阶段A要从返回的协议中选择一个编号最大的？

这样选出来的提议编号一定不小于已经被多数派接受的提议编号，进而可以根据假设得到该提议编号对应的值是Chosen的那个值。

### multi paxos

basic paxos 的价值在于开拓了分布式共识算法的思路， 一般不会用于实践

#### basic paxos 存在的问题

1. 只能对单个值形成决议
2. 活锁(两个 proposer 频繁提出 prepare 请求， 提案编号一直递增， 形成无限抢占)
3. 角色众多， 实现复杂
4. 两轮RPC， 效率低下（prepare-promise, accept-accepted）


#### multi paxos

Basic Paxos是为了确定一个不变量的取值, 保证一个值只要确定之后就不会在变化， 并且存在活锁、效率低下等问题。
multi paxos 是 paxos 的改进版，保证了节点"平等", 又在提议节点中实现了主从， 限制了每个节点都有不受控的提议权利。

multi paxos 的核心改进是增加了选主流程， 提议节点通过心跳发现当前网络中无主节点存在，节点会使用 basic paxos 中的prepare、accept 两轮请求发出选主广播， 得到多数派批准便宣布选主成功。
当选主成功后， 在任期内就只有主节点才能提出提议， 这样只需要一轮协商就能对某个值达成一致了


multi paxos 将`"分布式系统中如何对某个值达成一致"`这个问题划分成了三个子问题， 当三个子问题被解决时基本等同于达成共识:
1. 如何选主(leader election)
2. 日志同步(log replication)
3. 过程安全(safety)


## Raft算法

Raft 也是一种共识算法， 可以理解为 multi paxos 上发展的一种派生实现(multi paxos 没有给出实现细节)

Raft 解决了 multi paxos 的三个问题， 即 "leader election"、"log replication"、"safety"，一篇以"一种可以让人理解的共识算法"为题的论文提出了 Raft 算法， 成为了 etcd、consul 等重要分布式程序的实现基础

包括 Zookeeper 的 ZAB 算法与 Raft 思路也十分相似

### Raft 特点与概念

#### 特点: Strong Leader

- 系统中必须存在且同一时刻只能有一个 leader，只有 leader 可以接受 clients 发过来的请求。

- Leader 负责主动与所有 followers 通信，负责将“提案”发送给所有followers，同时收集多数派的 followers 应答
  
- Leader 还需向所有 followers 主动发送心跳维持领导地位（需要一直向 follower 发送心跳）

#### 复制状态机(Replicated State Machine)

对于一个无限增长的序列a[1, 2, 3…]，如果对于任意整数i， a[i]的值满足分布式一致性， 这个系统就满足一致性状态机的要求

基本上所有的真实系统都会有源源不断的操作，这时候单独对某个特定的值达成一致显然是不够的。
为了让真实系统保证所有的副本的一致性，通常会把操作转化为 `write-ahead-log(WAL)`。然后让系统中所有副本对 `WAL` 保持一致，这样每个副本按照顺序执行 WAL 里的操作，就能保证最终的状态是一致的。

所有一致性算法都会涉及到状态机，而状态机保证系统从一个一致的状态开始，以相同的顺序执行一些列指令最终会达到另一个一致的状态
![](/images/arch/wal.png)

1. Client 向 leader 发送写请求。
2. Leader 把“操作”转化为 WAL 写本地 log 的同时也将 log 复制到所有 followers。
3. Leader 收到多数派应答，将 log 对应的“操作”应用到状态机。
4. 回复 client 处理结果。


#### Raft 角色与 Message

![](/images/arch/raft-role.png)

Raft有三种角色：Leader，Candidate，Follower。一个 Server 进程在某一时刻，只能是其中 一种类型，但这不是固定的。不同的时刻，它可能拥有不同的类型。

- Follower：完全被动，不能发送任何请求, 只接受并响应来自 leader 和 candidate 的 message, node启动后的初始状态必须是 follower。

- Leader：处理所有来自客户端的请求，以及复制 log 到所有 followers。

- Candidate：用来竞选一个新 leader (candidate 由 follower 触发超时而来)。

Message 的 3 种类型:

- RequestVote RPC：Candidate 发出。

- AppendEntries (Heartbeat) RPC：Leader 发出。

- InstallSnapshot RPC：Leader 发出。


#### 任期时钟 term

![](/images/arch/paxos-term.png)

- Raft 将服务器的服务时间看作若干个 terms（任期），每个任期的时间是随机任意长的，每个任期开始前都会执行 Leader Election（过程中可能发生 split vote，那么该任期会立即结束）
- 每个任期最多一个 leader，可以没有 leader (spilt-vote 导致)
- 当多台服务器同时成为 candidate 时，就可能会发生 split vote 的情况，没人获取 majority 的选票，此时当前 term 就会终止并发起下一轮的 Leader Election

### raft 功能

#### Leader选举(Leader Election)

- 超时驱动选举：Heartbeat / Election timeout()

- 随机的超时时间：降低选举碰撞导致选票被瓜分的概率(split vote)
 
- 选举动作：
1. Current term++
2. 转成 candidate 状态
3. 选自己为主， 给其他节点发送 RequestVote RPC

- 选举 leader 情形
1. server本身被选为leader
    - server 得到 major 选票后, 成为 leader， 每个 server 只能选举一台 server， 从而使得大多数原则能确保只有一个candidate会被选成leader
    - 当candidate成为leader后，会发送心跳信息告诉其他server，从而防止新的选举。
2. 其他server选为leader 
   如果在等待选举期间，candidate接收到其他server要成为leader的RPC，分两种情况处理：
   - 如果leader的term大于或等于自身的term，那么改candidate会转成follower状态
   - 如果leader的term小于自身的term，那么会拒绝该leader，并继续保持candidate状态

3. 超时驱动选举
    - 选举超时(Election timeout): 很多follower同时变成candidate，导致没有candidate能获得大多数的选举，从而导致无法选出主。当这个情况发生时，每个candidate会超时，然后重新发增加term,发起新一轮选举RPC。 
      如果没有特别处理，可能出导致无限地重复选主的情况.Raft 采取用随机的超时时间来避免这个问题， 一般只有一个 server 进入 candidate 状态
      
    - 心跳超时(Heartbeat timeout): 当一个follower在election timeout时间内没有接收到通信，那么它会开始选主。
    
#### 日志复制

当选出 leader 后，它会开始接受客户端请求，每个请求会带有一个指令，可以被回放到状态机中。
leader 把指令追加成一个 `log entry`，然后通过 `AppendEntries RPC` 并行的发送给其他的 follower.
当改 log entry 被多数派 follower 复制后(leader 将这种日志视为安全的, committed entry)，leader 会把该 log entry 回放到状态机中，然后把结果返回给客户端。

![](/images/arch/paxos-log.png)

##### Raft 日志格式
- (TermId, LogIndex, LogValue) 其中 TermId+LogIndex 确定唯一一条日志

##### Log Replicate 关键点
- 连续性， 日志不允许出现空洞
- 有效性:
   - 不同节点，拥有相同 term 和 logIndex 的日志 value 一定相同(当发送 `AppendEntries RPC` leader 会将新 log entry termId和LogIndex紧接着上一条 entry。如果 Follower 没有在它的日志中找到相同(LogIndex,TermId)，它就会拒绝新的entry)
   - Leader 上的日志一定是有效的

##### leader崩溃保证日志一致性

![](/images/arch/paxos-leader-recover.png)
上图一个格子表示一个日志条目；格子中的数字是它的任期， 最上面当leader当选后，follower有可能丢失一些 entry(a,b)，也可能多一颗未提交的entry(c,d), 或两种情况都有(e,f)
例如场景f在如下情况下就会发生：如果一台服务器在任期2时是Leader并且向它的日志中添加了一些条目，然后在将它们提交之前就宕机了，之后它很快重启了，成为了任期3的 Leader，又向它的日志中添加了一些条目，然后在任期2和任期3中的条目提交之前它又宕机了，并且几个任期内都一直处于宕机状态

raft 通过follower强制复制leader节日的日志来解决 leader 崩溃后日志不一致的问题（Leader 崩溃后日志 AppendEntries 检查)：
1. leader为每个follower维护一个nextIndex，表明下一个将要发送给follower的log entry
2. 当leader刚上任时，会把所有的nextIndex设置成其最后一个log entry的index加1，如上图，则是11
3. 当follower的日志和leader不一致时，一致性检查会失败，那么会把nextIndex减1
4. 最终nextIndex会是leader和follower相同log entry的index加1，这时候，再发送AppendEntries会成功，并且会把follower的所有之后不一致的日志删除掉

优化:
上述一次回退一个log entry的方法效率较低，在发生冲突时，可以让follower把冲突的term的第一个日志的index发回给leader，这样leader就可以一次过滤掉该term的所有log entry。
raft 认为实践场景中这种优化不是必要的， 因为 `AppendEntries` 一致性检查很少失败并且也不太可能出现大量的日志条目不一致的情况。

#### safety 安全性

##### Election Safety 选举安全性：避免脑裂问题

选举安全性要求一个任期Term内只能有一个leader，即不能出现脑裂现象，否者raft的日志复制原则很可能出现数据覆盖丢失的问题。Raft算法通过规定若干投票原则来解决这个问题：
- 一个任期内，follower只会投票一次票，且先来先得；
- Candidate存储的日志至少要和follower一样新；
- 只有获得超过半数投票才有机会成为leader；


##### Leader Completeness 选举完备性：leader必须具备最新提交日志

Raft规定：只有拥有最新提交日志的follower节点才有资格成为leader节点。 具体做法：candidate竞选投票时会携带最新提交日志，follower会用自己的日志和candidate做比较。
- 如果follower的更新，那么拒绝这次投票；
- 否则根据前面的投票规则处理。这样就可以保证只有最新提交节点成为leader；

因为日志提交需要超过半数的节点同意，所以针对日志同步落后的follower（还未同步完全部日志，导致落后于其他节点）在竞选leader的时候，肯定拿不到超过半数的票，也只有那些完成同步的才有可能获取超过半数的票成为leader。

日志更新判断方式是比较日志项的term和index：
- 如果TermId不同，选择TermId最大的；
- 如果TermId相同，选择Index最大的；

##### State Machine Safety 状态机安全性：确保当前任期日志提交

考虑到当前的日志复制规则
- 当前follower节点强制复制leader节点；
- 假如以前Term日志复制超过半数节点，在面对当前任期日志的节点比较中，很明显当前任期节点更新，有资格成为leader；
上述两条就可能出现已有任期日志被覆盖的情况，这意味着已复制超过半数的以前任期日志被强制覆盖了，和前面提到的日志安全性矛盾。

所以，Raft对日志提交有额外安全机制：leader只能提交当前任期Term的日志，旧任期Term（以前的数据）只能通过当前任期Term的数据提交来间接完成提交。简单的说，日志提交有两个条件需要满足：
- 当前任期；
- 复制结点超过半数

### 参考资料
- [维基百科 Paxos]
- [维基百科 Raft]
- [比较raft、basic paxos、multi paxos区别](https://zhuanlan.zhihu.com/p/25664121)