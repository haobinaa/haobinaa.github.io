---
title: elastic-job失效转移和错过补偿
date: 2019-04-27 19:08:23
tags: elastic-job
categories: 中间件
---
## elastic 失效转移

如果一个任务节点宕机后，则一次任务调度期间，一部分数据将不会被处理，为了解决由于任务节点宕机引起任务一个调度周期的一次任务执行部分数据未处理，可以设置开启故障失效转移，将本次任务转移到其他正常的节点上执行。

失效转移也是通过监听器来处理的,在`failoverListenerManager`

### 失效转移监听器

`failoverListenerManager#start`:
```
public void start() {
    addDataListener(new JobCrashedJobListener());
    addDataListener(new FailoverSettingsChangedJobListener());
}
```
- JobCrashedJobListener: Job实例宕机事件监听器
- FailoverSettingsChangedJobListener： 失效转移配置变化事件监听器

### JobCrashedJobListener(作业实例监听)

```
protected void dataChanged(final String path, final Type eventType, final String data) {
    // 如果配置了失效转移
    // 并且event是namespace/jobname/instances下面的节点被删除
    if (isFailoverEnabled() && Type.NODE_REMOVED == eventType && instanceNode.isInstancePath(path)) {
        // 获取宕机节点的instanceId
        String jobInstanceId = path.substring(instanceNode.getInstanceFullPath().length() + 1); 
        // 如果被删除节点id与当前实例id相同则忽略
        if (jobInstanceId.equals(JobRegistry.getInstance().getJobInstance(jobName).getJobInstanceId())) {
            return;
        }
        // 获取宕机节点{jobname}/sharding/{item}/failover 集合
        List<Integer> failoverItems = failoverService.getFailoverItems(jobInstanceId);
        if (!failoverItems.isEmpty()) {
            for (int each : failoverItems) {
                failoverService.setCrashedFailoverFlag(each);
                failoverService.failoverIfNecessary();
            }
        } else {
        // 如果 failOver 集合为空
        // 则处理 {jobName}/sharding/{item}/instance 集合
            for (int each : shardingService.getShardingItems(jobInstanceId)) {
                failoverService.setCrashedFailoverFlag(each);
                failoverService.failoverIfNecessary();
            }
        }
    }
```


从上面可以看到优先处理关闭作业节点的 failover 集合再处理 instance 集合。处理流程都是:

1. failoverService.setCrashedFailoverFlag, 设置失效的分片项标记
```
public void setCrashedFailoverFlag(final int item) {
    if (!isFailoverAssigned(item)) {
        jobNodeStorage.createJobNodeIfNeeded(FailoverNode.getItemsNode(item));
    }
}
```
在 {jobName}/leader/failover/items/{item} 打上标记

#### failoverService.failoverIfNecessary
```
public void failoverIfNecessary() {
    if (needFailover()) {
        jobNodeStorage.executeInLeader(FailoverNode.LATCH, new FailoverLeaderExecutionCallback());
    }
}
```
如果需要失效转移(leader节点上failover有分片项，即上一步打的标记)，则执行失效转移。失效转移调用`executeInLeader`：
1. 先用`FailoverNode.LATCH( ${JOB_NAME}/leader/failover/latch)` 路径构成的分布式锁，保证 `FailoverLeaderExecutionCallback` 的回调方法同一时间，即使多个作业节点调用，有且仅有一个作业节点进行执行。
2. `FailoverLeaderExecutionCallback`回调逻辑如下:
```
class FailoverLeaderExecutionCallback implements LeaderExecutionCallback {
    @Override
    public void execute() {
        // 判断需要失效转移
        if (JobRegistry.getInstance().isShutdown(jobName) || !needFailover()) {
            return;
        }
        // 获得一个 `${JOB_NAME}/leader/failover/items/${ITEM_ID}` 作业分片项
        int crashedItem = Integer.parseInt(jobNodeStorage.getJobNodeChildrenKeys(FailoverNode.ITEMS_ROOT).get(0));
        log.debug("Failover job '{}' begin, crashed item '{}'", jobName, crashedItem);
         // 设置这个 `${JOB_NAME}/sharding/${ITEM_ID}/failover` 作业分片项 为 当前作业节点（把失效的作业拉过来自己做）
        jobNodeStorage.fillEphemeralJobNode(FailoverNode.getExecutionFailoverNode(crashedItem), JobRegistry.getInstance().getJobInstance(jobName).getJobInstanceId());
        // // 移除这个 `${JOB_NAME}/leader/failover/items/${ITEM_ID}` 作业分片项
        jobNodeStorage.removeJobNodeIfExisted(FailoverNode.getItemsNode(crashedItem));
        // TODO 不应使用triggerJob, 而是使用executor统一调度
        // // 触发作业执行(仅仅是触发，并不会立即执行)
        JobScheduleController jobScheduleController = JobRegistry.getInstance().getJobScheduleController(jobName);
        if (null != jobScheduleController) {
            jobScheduleController.triggerJob();
        }
    }
}
```

### 故障分片重新执行逻辑

监听器只是在作业节点失败后，其他存活的节点拉取失效的任务分片，但是这些任务分片并没有真正的执行，真正执行任务的逻辑是在获取分片信息上下文的时候，优先处理 failover 分片

任务调度入口执行入口,获取分片信息上下文(`AbstractElasticJobExecutor#execute->LiteJobFacade#getShardingContexts`):
```
public ShardingContexts getShardingContexts() {
    boolean isFailover = configService.load(true).isFailover();
    if (isFailover) {
        // 获取运行在本节点的失效分片信息
        List<Integer> failoverShardingItems = failoverService.getLocalFailoverItems();
        if (!failoverShardingItems.isEmpty()) {
            // 如果没有失效分片，构建当前分片任务的 shardingContext
            return executionContextService.getJobShardingContext(failoverShardingItems);
        }
    }
    // 如果需要分片(并且当前节点是主节点)
    shardingService.shardingIfNecessary();
    // 获取当前机器的作业分片项
    List<Integer> shardingItems = shardingService.getLocalShardingItems();
    // 移除分配在当前机器的失效转移分片项   
    if (isFailover) {
        shardingItems.removeAll(failoverService.getLocalTakeOffItems());
    }
    // 移除被禁用的作业分片项
    shardingItems.removeAll(executionService.getDisabledItems(shardingItems));
    // 构建当前机器的分片任务的 shardingContext
    return executionContextService.getJobShardingContext(shardingItems);
}
```

## elastic-job 任务错过机制


任务在调度执行中，由于某种原因未执行完毕，下一次调度任务触发后，在同一个Job实例中，会出现两个线程处理同一个分片上的数据，这样就会造成两个线程可能处理到相同的数据。为了避免同一条数据可能会被多次执行的问题，ElasticJob引入幂等机制，确保同一条数据不会再被多个Job同时处理，也避免同一条数据在同一个Job实例的多个线程处理。

Elastic-job 通过补偿执行(misfire)和幂等(monitorExecution)解决了两个问题：
1. 保证同一个job的多个实例不会处理到相同的数据
2. 确保数据不会被多个job实例处理


### misfire执行处理

还是在作业执行的入口`AbstractElasticJobExecutor#execute->misfireIfRunning`:
```
if (jobFacade.misfireIfRunning(shardingContexts.getShardingItemParameters().keySet())) {
    // 如果当前分片被标记为了misfire并开启了时间追踪，将事件追踪保存入库
    if (shardingContexts.isAllowSendJobEvent()) {
        jobFacade.postJobStatusTraceEvent(shardingContexts.getTaskId(), State.TASK_FINISHED, String.format(
                "Previous job '%s' - shardingItems '%s' is still running, misfired job will start after previous job completed.", jobName, 
                shardingContexts.getShardingItemParameters().keySet()));
    }
    return;
}
```

#### misfireIfRunning 流程

`jobFacade#misfireIfRunning->executionService#misfireIfHasRunningItems`:
```
public boolean misfireIfHasRunningItems(final Collection<Integer> items) {
    if (!hasRunningItems(items)) {
        return false;
    }
    setMisfire(items);
    return true;
}
```
elastic-job在开启了`monitorExecution(true)`(默认为true)的情况下，作为幂等机制的考虑，在分片任务开始的时候会创建`namespace/jobname/sharding/{item}/running`节点,任务结束时会自动删除该节点。 在判断是否有分片正在运行的时候，只需要判断是否存在该节点即可。

如果存在，则调用`setMisfire`,给当前实例的所有分片创建`namespace/jobname/shading/{item}/misfire`节点:
```
public void setMisfire(final Collection<Integer> items) {
    for (int each : items) {
        jobNodeStorage.createJobNodeIfNeeded(ShardingNode.getMisfireNode(each));
    }
}
```

在回到`execute`中:
```
......
execute(shardingContexts, JobExecutionEvent.ExecutionSource.NORMAL_TRIGGER);
while (jobFacade.isExecuteMisfired(shardingContexts.getShardingItemParameters().keySet())) {
    jobFacade.clearMisfire(shardingContexts.getShardingItemParameters().keySet());
    execute(shardingContexts, JobExecutionEvent.ExecutionSource.MISFIRE);
}
......
```
在任务执行完成后检查是否存在`namespace/jobname/sharding/{item}/misfire`节点，如果存在，则首先清除misfie相关的文件，然后执行任务（同一任务不管错过多少次，都只会补偿执行一次）。

