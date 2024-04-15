---
title: zookeeper分布式协调详解
date: 2019-01-03 21:45:01
tags: zk
categories: 分布式
---
### zookeeper概述

>ZooKeeper是一种为分布式应用所设计的高可用、高性能且一致的开源协调服务，它提供了一项基本服务：分布式锁服务。由于ZooKeeper的开源特性，后来在分布式锁的基础上，摸索了出了其他的使用方法：配置维护、组服务、分布式消息队列、分布式通知/协调等

### ZK基本概念

#### Znode结构

ZooKeeper的数据模型，在结构上和标准文件系统的非常相似，都是采用这种树形层次结构，ZooKeeper树中的每个节点被称为:Znode。和文件系统的目录树一样，ZooKeeper树中的每个节点可以拥有子节点:

![](/images/zookeeper/znode.png)

(1) Znode结构

ZooKeeper命名空间中的Znode，兼具文件和目录两种特点。既像文件一样维护着数据、元信息、ACL、时间戳等数据结构，又像目录一样可以作为路径标识的一部分。图中的每个节点称为一个Znode。 每个Znode由3部分组成:
1. stat：此为状态信息, 描述该Znode的版本, 权限等信息
2. data：与该Znode关联的数据
3. children：该Znode下的子节点

(2) 数据访问

ZooKeeper中的每个节点存储的数据要被原子性的操作。也就是说读操作将获取与节点相关的所有数据，写操作也将替换掉节点的所有数据。另外，每一个节点都拥有自己的ACL(访问控制列表)，这个列表规定了用户的权限，即限定了特定用户对目标节点可以执行的操作。

(3) 节点类型

ZooKeeper中的节点有两种，分别为临时节点和永久节点。节点的类型在创建时即被确定，并且不能改变。
- 临时节点：该节点的生命周期依赖于创建它们的会话。一旦会话(Session)结束，临时节点将被自动删除，当然可以也可以手动删除。虽然每个临时的Znode都会绑定到一个客户端会话，但他们对所有的客户端还是可见的。另外，ZooKeeper的临时节点不允许拥有子节点
- 永久节点：该节点的生命周期不依赖于会话，并且只有在客户端显示执行删除操作的时候，他们才能被删除

创建Znode的时候，还可以选择在zookeeper的路径结尾添加一个递增的计数，这个计数对父节点来说是唯一的，称为**顺序节点**

(4) 节点观察(watch)

客户端可以在节点上设置watch，我们称之为监视器。当节点状态发生改变时(Znode的增、删、改)将会触发watch所对应的操作。当watch被触发时，ZooKeeper将会向客户端发送且仅发送一条通知，因为watch只能被触发一次，这样可以减少网络流量。

#### Znode Stat

Znode Stat存储的Znode的属性信息，主要包括:
1. cZxid / mZxid：ZNode 创建 / 最后更新的 Zxid
2. ctime / mtime：ZNode 创建 / 最后更新的时间（Unix 时间，毫秒）
3. dataVersion ：ZNode 数据版本
4. dataLength ：ZNode 存储的数据长度
5. numChildren ：子级 ZNode 的数量
6. 其他关于 ACL、子级 ZNode 的信息

 Zxid：所有提交到 ZooKeeper 的事务，都会被标记唯一的 ZooKeeper Transaction Id
 
 #### zookeeper session
 
 ZooKeeper 客户端对象创建时，Session 即进入 CONNECTING 状态，当客户端与服务端（集群的任意节点）完成连接，即进入 CONNECTED 状态。
 
 客户端主动关闭 Session 前，通过“心跳”维护 Session 有效性，若连接中断，ZooKeeper 客户端将尝试重新连接（再次进入 CONNECTING ）：
 1. 若在“Session 超时时间”内，连接重新建立，Session 继续有效，再次进入 CONNECTED
 2. 否则，服务端将标记 Session 过期（即使连接最终重新建立），进行清理（例如：临时 ZNode 删除），Session 最终进入 CLOSE 状态
 
 Session 是否过期，完全由 ZooKeeper 服务端维护。对于 ZooKeeper 客户端，仅当 Session 过期，才应当重新创建客户端对象
 
 #### zookeeper watch
 
 对于全部的“读”操作，ZooKeeper 允许客户端于 ZNode 设置 Watch，当 ZNode 变更时，Watch 将被触发并且通知到客户端（即 Watcher）。Watch 是 “一次性” 的，Watch 被触发时即被清除。
 
 Watch“异步地”通知到客户端，“通知内容”不包含 ZNode 变更后的数据，需要由客户端读取。
 
 ##### zookeeper watch 事件类型

ZNode 是否存在、获取 ZNode 数据、获取 ZNode 子级 ZNode 的方法分别为 exists()、getData()、getChildren()

1. exists操作上的watch，在被监视的Znode创建、删除或数据更新时被触发
2. getData操作上的watch，在被监视的Znode删除或数据更新时被触发。在被创建时不能被触发，因为只有Znode一定存在，getData操作才会成功
3.  getChildren操作上的watch，在被监视的Znode的子节点创建或删除，或是这个Znode自身被删除时被触发。可以通过查看watch事件类型来区分是Znode，还是他的子节点被删除：NodeDelete表示Znode被删除，NodeDeletedChanged表示子节点被删除

对于单一的 Watch 对象（例如，回调函数），由单一变更引起的事件，Watch 对象将被调用仅仅被调用一次，即使由多个“读”进行了 Watch 设置

#### zookeeper ACL

ZooKeeper 通过 ACL 控制 ZNode 的访问权限（默认情况，ZNode 无访问权限控制），权限维度包括：

- CREATE：创建 ZNode
- READ：获取 ZNode 数据及其子级 ZNode
- WRITE：ZNode 数据写入
- DELETE：删除 ZNode
- ADMIN：权限设置


### zookeeper原理

zk通过集群对外提供高可用， 在2f+1数目集群中，zk允许有f个失败

#### ZK集群对外提供服务

![](/images/zookeeper/zk_cluster.png)

ZK集群中每个Server，都保存一份数据副本。所有的读请求由Zk Server 本地响应，所有的更新请求将转发给Leader，由Leader实施。

#### ZK同步机制

Zookeeper的核心是原子广播机制，这个机制保证了各个server之间的同步。实现这个机制的协议叫做`Zab协议`。Zab协议有两种模式，它们分别是恢复模式和广播模式。

##### 恢复模式

当服务启动或者在领导者崩溃后，Zab就进入了恢复模式，当领导者被选举出来，且大多数server完成了和leader的状态同步以后，恢复模式就结束了。状态同步保证了leader和server具有相同的系统状态。

##### 广播模式

一旦Leader已经和多数的Follower进行了状态同步后，他就可以开始广播消息了，即进入广播状态。这时候当一个Server加入ZooKeeper服务中，它会在恢复模式下启动，发现Leader，并和Leader进行状态同步。待到同步结束，它也参与消息广播。ZooKeeper服务一直维持在Broadcast状态，直到Leader崩溃了或者Leader失去了大部分的Followers支持

Broadcast模式极其类似于分布式事务中的2pc（two-phrase commit 两阶段提交）：即Leader提起一个决议，由Followers进行投票，Leader对投票结果进行计算决定是否通过该决议，如果通过执行该决议（事务），否则什么也不做

![](/images/zookeeper/2pc.png)

在广播模式ZooKeeper Server会接受Client请求，所有的写请求都被转发给领导者，再由领导者将更新广播给跟随者。当半数以上的跟随者已经将修改持久化之后，领导者才会提交这个更新，然后客户端才会收到一个更新成功的响应。这个用来达成共识的协议被设计成具有原子性，因此每个修改要么成功要么失败。

### Zab协议

#### 广播模式

ZAB协议的消息广播过程使用的是一个原子广播协议，类似于一个2PC提交过程，针对每个客户端的事务请求，leader服务器会为其生成对应的事务Proposal，并将其发送给集群中其余所有的机器，然后再分别收集各自的选票，最后进行事务提交：
1. Leader 接收到消息请求后，将消息赋予一个全局唯一的 64 位自增 id，叫做：zxid，通过 zxid 的大小比较即可实现因果有序这一特性
2. Leader 通过先进先出队列（会给每个follower都创建一个队列，保证发送的顺序性）（通过 TCP 协议来实现，以此实现了全局有序这一特性）将带有 zxid 的消息作为一个提案（proposal）分发给所有 follower
3. 当 follower 接收到 proposal，先将 proposal 写到本地事务日志，写事务成功后再向 leader 回一个 ACK
4. 当 leader 接收到过半的 ACKs 后，leader 就向所有 follower 发送 COMMIT 命令，同意会在本地执行该消息
5. 当 follower 收到消息的 COMMIT 命令时，就会执行该消息



#### 恢复模式(Leader 选举)

ZAB协议会让ZK集群进入崩溃恢复模式的情况如下：
1. 当服务框架在启动过程中
2. 当Leader服务器出现网络中断，崩溃退出与重启等异常情况
3. 当集群中已经不存在过半的服务器与Leader服务器保持正常通信

当leader挂掉后，集群无法进行工作，所以需要一个高效且可靠的leader选举算法。zk的实现是FastLeaderElection(快速选举)算法

Leader选举需要达到的再次使用的条件，需要解决以下两个问题：
1. 已经被leader提交的事务需要最终被所有的机器提交（已经发出commit了）
2. 保证丢弃那些只在leader上提出的事务。（只在leader上提出了proposal，还没有收到回应，还没有进行提交）

##### 已经被处理的消息不能丢（commit的）

这一情况会出现在以下场景：当 leader 收到合法数量 follower 的 ACKs 后，就向各个 follower 广播 COMMIT 命令，同时也会在本地执行 COMMIT 并向连接的客户端返回「成功」。但是如果在各个 follower 在收到 COMMIT 命令前 leader 就挂了，导致剩下的服务器并没有执行都这条消息

为了实现已经被处理的消息不能丢这个目的，Zab 的恢复模式使用了以下的策略：
- 选举拥有 proposal 最大值（即 zxid 最大） 的节点作为新的 leader：由于所有提案被 COMMIT 之前必须有合法数量的 follower ACK，即必须有合法数量的服务器的事务日志上有该提案的 proposal，因此，只要有合法数量的节点正常工作，就必然有一个节点保存了所有被 COMMIT 消息的 proposal 状态
- 新的 leader 将自己事务日志中 proposal 但未 COMMIT 的消息处理
- 新的 leader 与 follower 建立先进先出的队列， 先将自身有而 follower 没有的 proposal 发送给 follower，再将这些 proposal 的 COMMIT 命令发送给 follower，以保证所有的 follower 都保存了所有的 proposal、所有的 follower 都处理了所有的消息。通过以上策略，能保证已经被处理的消息不会丢
 
 ##### 被丢弃的消息不能再次出现
 
 这一情况会出现在以下场景：当 leader 接收到消息请求生成 proposal 后就挂了，其他 follower 并没有收到此 proposal，因此经过恢复模式重新选了 leader 后，这条消息是被跳过的。 此时，之前挂了的 leader 重新启动并注册成了 follower，他保留了被跳过消息的 proposal 状态，与整个系统的状态是不一致的，需要将其删除。
 
 Zab 通过巧妙的设计 zxid 来实现这一目的。一个 zxid 是64位，高 32 是纪元（epoch）编号，每经过一次 leader 选举产生一个新的 leader，新 leader 会将 epoch 号 +1。低 32 位是消息计数器，每接收到一条消息这个值 +1，新 leader 选举后这个值重置为 0。这样设计的好处是旧的 leader 挂了后重启，它不会被选举为 leader，因为此时它的 zxid 肯定小于当前的新 leader。当旧的 leader 作为 follower 接入新的 leader 后，新的 leader 会让它将所有的拥有旧的 epoch 号的未被 COMMIT 的 proposal 清除
 
 #### Leader选举过程（FastLeaderElection算法）
 
 Leader选举是保证分布式数据一致性的关键所在。当Zookeeper集群中的一台服务器出现以下两种情况之一时，需要进入Leader选举
 
 ##### 服务器启动时期的Leader选举
 
 若进行Leader选举，则至少需要两台机器，这里选取3台机器组成的服务器集群为例。在集群初始化阶段，当有一台服务器Server1启动时，其单独无法进行和完成Leader选举，当第二台服务器Server2启动时，此时两台机器可以相互通信，每台机器都试图找到Leader，于是进入Leader选举过程。选举过程如下
 
1. 每个Server发出一个投票。由于是初始情况，Server1和Server2都会将自己作为Leader服务器来进行投票，每次投票会包含所推举的服务器的myid和ZXID，使用(myid, ZXID)来表示，此时Server1的投票为(1, 0)，Server2的投票为(2, 0)，然后各自将这个投票发给集群中其他机器
2.  接受来自各个服务器的投票。集群的每个服务器收到投票后，首先判断该投票的有效性，如检查是否是本轮投票、是否来自LOOKING状态的服务器。
3. 处理投票。针对每一个投票，服务器都需要将别人的投票和自己的投票进行PK，PK规则如下：
    - 优先检查ZXID。ZXID比较大的服务器优先作为Leader
    - 如果ZXID相同，那么就比较myid。myid较大的服务器作为Leader服务
4. 统计投票。每次投票后，服务器都会统计投票信息，判断是否已经有过半机器接受到相同的投票信息，对于Server1、Server2而言，都统计出集群中已经有两台机器接受了(2, 0)的投票信息，此时便认为已经选出了Leader
5. 改变服务器状态。一旦确定了Leader，每个服务器就会更新自己的状态，如果是Follower，那么就变更为FOLLOWING，如果是Leader，就变更为LEADING

##### 服务器运行时期的Leader选举

在Zookeeper运行期间，Leader与非Leader服务器各司其职，即便当有非Leader服务器宕机或新加入，此时也不会影响Leader，但是一旦Leader服务器挂了，那么整个集群将暂停对外服务，进入新一轮Leader
选举，其过程和启动时期的Leader选举过程基本一致。假设正在运行的有Server1、Server2、Server3三台服务器，当前Leader是Server2，若某一时刻Leader挂了，此时便开始Leader选举。选举过程如下：

1. 变更状态。Leader挂后，余下的非Observer服务器都会将自己的服务器状态变更为LOOKING，然后开始进入Leader选举过程
2. 每个Server会发出一个投票。在运行期间，每个服务器上的ZXID可能不同，此时假定Server1的ZXID为123，Server3的ZXID为122；在第一轮投票中，Server1和Server3都会投自己，产生投票(1, 123)，(3, 122)，然后各自将投票发送给集群中所有机器
3. 接收来自各个服务器的投票。与启动时过程相同
4. 处理投票。与启动时过程相同，此时，Server1将会成为Leader
5. 统计投票。与启动时过程相同
6. 改变服务器的状态。与启动时过程相同

