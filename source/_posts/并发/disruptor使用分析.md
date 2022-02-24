---
title: disruptor使用分析
date: 2022-02-14 11:32:41
tags: queue
categories: 并发
description: 高性能并发队列 disruptor 源码分析， 场景示例
---

### disruptor 介绍

disruptor 是一个开源的并发框架， 提供了类似有界队列的功能， 相较于java原生并发队列， disruptor 能够达到很高的tps和很低的延时。 


#### disruptor 设计

disruptor 的关键优化设计:
1. 使用环形队列(Ring Buffer)作为底层存储
2. 环形队列中对象都是预先建立好的， 减少了频繁创建/回收对象带来的开销
3. 生产者使用两阶段提交的方式来发布事件(第一阶段是先在环形队列中预占一个空位，第二阶段是向这个空位中写入数据，竞争只发生在第一阶段), 并使用CAS无锁化操作来解决冲突
4. 使用缓存填充来解决伪共享的问题

#### 核心组件

- RingBuffer: 环形缓冲区，本质是一个定长Object数组（后续称里面的格子为slot），为了避免伪共享，在这个数组的两端额外填充了若干空位

- Sequence: 类似于AtomicLong，用于标记事件id。所有生产者共用一个Sequence，用于不冲突的将事件放到RingBuffer上。每个消费者自己维护一个Sequence，用于标记自己当前正在处理的事件的id

- Sequencer: 生产者访问RingBuffer时的控制器，主要实现有两种：`SingleProducerSequencer` 与 `MultiProducerSequencer` 分别用于单生产者和多生产者的场景

- SequenceBarrier: 只有一个实现类为`ProcessingSequenceBarrier` 用于协调生产者与消费者（如果某个slot中的事件还没有被所有消费者消费完毕，那么这个slot是不能被复用的，需要等待）

- WaitStrategy: 消费者等待下一个可用事件的策略，Disruptor自带了多种WaitStrategy的实现，可以根据场景自行选择。

#### 使用示例

disruptor 简单使用如下:
``` 
Disruptor<Element> disruptor = new Disruptor<>(Element::new, 1024,
        DaemonThreadFactory.INSTANCE);

disruptor.handleEventsWith(
        (EventHandler<Element>) (event, sequence, endOfBatch) -> System.out.println(event.get()));
disruptor.start();
disruptor.publishEvent((event, sequence) -> event.set(1));
// sleep一下 让消费者可以执行到 因为消费线程是守护线程
Thread.sleep(1000);
```

#### 工作流程

![](/images/thread/disruptor.png)

### 源码分析

#### disruptor 构造函数

disruptor 一个参数完整的构造函数如下
``` 
public Disruptor(
        final EventFactory<T> eventFactory,
        final int ringBufferSize,
        final ThreadFactory threadFactory,
        final ProducerType producerType,
        final WaitStrategy waitStrategy)
{
    this(
        RingBuffer.create(producerType, eventFactory, ringBufferSize, waitStrategy),
        new BasicExecutor(threadFactory));
}



private Disruptor(final RingBuffer<T> ringBuffer, final Executor executor)
{
    this.ringBuffer = ringBuffer;
    this.executor = executor;
}
```
- eventFactory: 事件构造器
- ringBufferSize: RingBuffer的长度
- threadFactory: 消费线程的创建工厂
- producerType: 单生产者模式还是多生产者模式（默认是MULTI）
- waitStrategy: 当RingBuffer中没有可消费的Event时消费者的等待策略（默认是BlockingWaitStrategy）

上面通过5个参数构造出了一个`RingBuffer`和一个`Executor`，而这两个组件构成了一个Disruptor。
这里的RingBuffer除了存储事件的职能（DataProvider）还承担着申请sequence和publish event的职能。
Executor作为消费者线程池，主要是运行消费逻辑的。
因此可以说，Disruptor串联起了生产者、消费者以及RingBuffer


#### RingBuffer

RingBuffer 的创建:
``` 
public static <E> RingBuffer<E> create(
    ProducerType producerType,
    EventFactory<E> factory,
    int bufferSize,
    WaitStrategy waitStrategy)
{
    switch (producerType)
    {
        // 单生产者
        case SINGLE:
            return createSingleProducer(factory, bufferSize, waitStrategy);
        // 多生产者
        case MULTI:
            return createMultiProducer(factory, bufferSize, waitStrategy);
        default:
            throw new IllegalStateException(producerType.toString());
    }
}


// 以 singleProducer 为例
public static <E> RingBuffer<E> createSingleProducer(
    EventFactory<E> factory,
    int bufferSize,
    WaitStrategy waitStrategy)
{
    SingleProducerSequencer sequencer = new SingleProducerSequencer(bufferSize, waitStrategy);
    // 创建一个 RingBuffer 需要 EventFactory 和 Sequencer
    // Sequencer 主要来维护 sequence，发布事件等 
    return new RingBuffer<E>(factory, sequencer);
}



RingBuffer(
    EventFactory<E> eventFactory,
    Sequencer sequencer)
{
    // 父类 RingBufferFields 的构造函数
    super(eventFactory, sequencer);
}


RingBufferFields(
    EventFactory<E> eventFactory,
    Sequencer sequencer)
{
    this.sequencer = sequencer;
    this.bufferSize = sequencer.getBufferSize();

    if (bufferSize < 1)
    {
        throw new IllegalArgumentException("bufferSize must not be less than 1");
    }
    if (Integer.bitCount(bufferSize) != 1)
    {
        throw new IllegalArgumentException("bufferSize must be a power of 2");
    }
    // 用来定位数组下标
    this.indexMask = bufferSize - 1;
    // RingBuffer 底层存储， 除了存储元素还有 padding 填充， 用来解决伪共享
    this.entries = new Object[sequencer.getBufferSize() + 2 * BUFFER_PAD];
    // 预填充数组元素
    fill(eventFactory);
}

private void fill(EventFactory<E> eventFactory)
{
    for (int i = 0; i < bufferSize; i++)
    {
        entries[BUFFER_PAD + i] = eventFactory.newInstance();
    }
}
```

整体的逻辑还是比较清晰， 需要注意的是两点:
- RingBuffer 的实际 size 是: bufferSize + 2*BUFFER_PAD, 用来解决伪共享
- ring 的原因在于 sequence 是不断增加的 long 类型， 而实际访问下标需要通过 sequence & mask 计算出来


#### EventFactor


EventFactory 是一次性使用的类，在最开始的时候用来给RingBuffer预填充数据。

为了避免JAVA GC带来的性能影响，Disruptor采用的设计是在数组上预填充好对象，每次publish event的时候，只是通过RingBuffer.get(seq)拿到对象，更新对象的值，然后就发布出去了。整个生产消费过程中再也不会有event对象的创建和销毁。


#### Sequence

sequence 是用来表达event序例号的对象。为了高并发下的可见性，肯定不能直接用long的，至少也是volatile long。但Disruptor觉得volatile long还是不够用，所以创造了Sequence类。
内部还是持有了 `volatile long`, 除此之外还支持:
- CAS更新
- order writes (Store/Store barrier，改动不保证立即可见) vs volatile writes (Store/Load barrier，改动保证立即可见)
- 在 volatile 字段 附近添加 padding 解决伪共享问题

在整个框架中可以看到在不同的类里，不同场景下对sequence的表达，有时用long，有时用的Sequence类，这其实是背后对于效率和高并发可见性的考量。

比如在对EventProcessor.sequence的更新中都是用的order writes，不保证立即可见，但速度快很多。在这个场景里，造成的结果是显示的消费进度可能比实际上慢，导致生产者有可能在可以生产的情况下没有去生产。但生产者看的是多个消费者中最慢的那个消费进度，所以影响可能没有那么大。

#### Sequencer

Sequencer是Disruptor框架的核心类。

生产者发布event的时候首先需要预定一个sequence，Sequencer就是计算和发布sequence的。它主要有2个实现类： `SingleProducerSequencer` 和 `MultiProducerSequencer`


##### SingleProducerSequencer

生产者 publishEvent 步骤: 
1. 通过Sequencer.next(n) 来预定下面n个可以写入的数据位，然后修改数据
2. Sequencer.publish 发布event

但因为RingBuffer是环形的，一个 size 16 的RingBuffer当你拿到Sequence为16时相当于又要去写 `RingBuffer[0]` 的位置了，假如之前的数据还没被消费过就会被覆盖了。Sequencer是这样解决这个问题的，它在内部维护了一个:
``` 
volatile Sequence[] gatingSequences = new Sequence[0];
```
每个消费者会维护一个自己的Sequence对象，来记录自己已经消费到的序例位置。 每添加一个消费者，都会把消费者的Sequence引用添加到gatingSequences中。 通过访问gatingSequences，Sequencer可以得知消费的最慢的消费者消费到了哪个位置。
``` 
gatingSequences=[7, 8, 9, 10, 3, 4, 5, 6, 11]

8个消费者的例子，最慢的消费完了3，此时可以写seq 19的数据，但不能写seq 20(会覆盖 seq 4 的位置， 还没消费)
```

在next(n)方法里，如果计算出的下一个event的Sequence值减去bufferSize.得出来的wrapPoint > min(gatingSequences)，说明即将写入的位置上，之前的event还有消费者没有消费，这时SingleProducerSequencer会等待并自旋。

``` 
public long next(int n)
{
    if (n < 1)
    {
        throw new IllegalArgumentException("n must be > 0");
    }
    // 计算 wrapPoint 来检查消费进度
    long nextValue = this.nextValue;
    long nextSequence = nextValue + n;
    long wrapPoint = nextSequence - bufferSize;
    
    long cachedGatingSequence = this.cachedValue;
    // wrapPoint>cachedGatingSequence 将发生绕环， 生产者覆盖未消费
    if (wrapPoint > cachedGatingSequence || cachedGatingSequence > nextValue)
    {
        cursor.setVolatile(nextValue);  // StoreLoad fence

        long minSequence;
        // 如果 warpPoint>最小消费位置, 那么自旋等待
        while (wrapPoint > (minSequence = Util.getMinimumSequence(gatingSequences, nextValue)))
        {
            LockSupport.parkNanos(1L); // TODO: Use waitStrategy to spin?
        }
        // 缓存最慢的消费者进度
        this.cachedValue = minSequence;
    }

    this.nextValue = nextSequence;

    return nextSequence;
}
```

举个例子，gatingSequences=[7, 8, 9, 10, 3, 4, 5, 6, 11]， RingBuffer size 16的情况下，如果算出来的nextSequence是20，wrapPoint是20-16=4， 这时gatingSequences里最小的是3。

说明下一个打算写入的位置是wrapPoint 4，但最慢的消费者才消费到3，你不能去覆盖之前4上的数据，这时只能等待，等消费者把之前的4消费掉。

为什么wrapPoint = nextSequence - bufferSize，而不是bufferSize的n倍呢，因为消费者只能落后生产者一圈，不然就已经存在数据覆盖了。

等到SingleProducerSequencer自旋到下一个位置所有人都消费过的时候，它就可以从next方法中返回，生产者拿着sequence就可以继续去发布。

##### MultiProducerSequencer

MultiProducerSequencer 是在多个生产者的场合使用的，多个生产者的情况下存在竞争，导致它的实现更加复杂。

相较于单生产者， 主要多出来的数据结构是 availableBuffer, 来记录RingBuffer上哪些位置有数据可以读：
``` 
int[] availableBuffer;
int indexMask;
int indexShift;

public MultiProducerSequencer(int bufferSize, final WaitStrategy waitStrategy)
{
    super(bufferSize, waitStrategy);
    availableBuffer = new int[bufferSize];
    indexMask = bufferSize - 1;
    indexShift = Util.log2(bufferSize);
    initialiseAvailableBuffer();
}
```

Sequencer.next(n)说起，计算下一个数据位Sequence的逻辑是一样的，包括消费者落后导致Sequencer自旋等待的逻辑。不同的是因为有多个publisher同时访问Sequencer.next(n)方法，所以在确定最终位置的时候用了一个CAS操作，如果失败了就自旋再来一次。

``` 
public long next(int n)
{
    if (n < 1)
    {
        throw new IllegalArgumentException("n must be > 0");
    }

    long current;
    long next;

    do
    {
        // 获取当前游标值， 初始值是-1
        current = cursor.get();
        next = current + n;

        long wrapPoint = next - bufferSize;
        long cachedGatingSequence = gatingSequenceCache.get();
        // 这里逻辑与 singleProducer 一样， 主要处理消费落后的自旋等待
        if (wrapPoint > cachedGatingSequence || cachedGatingSequence > current)
        {
            long gatingSequence = Util.getMinimumSequence(gatingSequences, current);

            if (wrapPoint > gatingSequence)
            {
                LockSupport.parkNanos(1); // TODO, should we spin based on the wait strategy?
                continue;
            }

            gatingSequenceCache.set(gatingSequence);
        }
        // 多个publisher同时访问Sequencer.next(n)方法，在确定最终位置的时候用了一个CAS操作，如果失败了就自旋再来一次。
        else if (cursor.compareAndSet(current, next))
        {
            break;
        }
    }
    while (true);

    return next;
}
```

另一个不同的地方是 publish(final long sequence) 方法，SingleProducer的版本很简单，就是移动了一下cursor:
``` 
public void publish(long sequence)
{
    cursor.set(sequence);
    waitStrategy.signalAllWhenBlocking();
}
```

MultiProducer的版本则去设置availableBuffer的状态位了。给定一个sequence，先计算出对应的数组下标 index，然后计算出在那个index上要写的数据 availabilityFlag。
index 即是槽位， availabilityFlag 则是当前槽位的圈数
``` 
public void publish(final long sequence)
{
    setAvailable(sequence);
    waitStrategy.signalAllWhenBlocking();
}

private void setAvailable(final long sequence)
{
    // 计算 index 和 flag
    setAvailableBufferValue(calculateIndex(sequence), calculateAvailabilityFlag(sequence));
}

// 计算当前 sequence 的 index
private int calculateIndex(final long sequence)
{
    return ((int) sequence) & indexMask;
}

// 计算当前 sequence 经过的圈数
private int calculateAvailabilityFlag(final long sequence)
{
    return (int) (sequence >>> indexShift);
}

private void setAvailableBufferValue(int index, int flag)
{
    // 使用 unsafe 更新需要先计算出内存位置对应的地址
    long bufferAddress = (index * SCALE) + BASE;
    UNSAFE.putOrderedInt(availableBuffer, bufferAddress, flag);
}
```

availableBuffer 主要用于判断一个 sequence 下的数据是否可用, MultiProducerSequencer 的 isAvailable:
``` 
public boolean isAvailable(long sequence)
{
    int index = calculateIndex(sequence);
    int flag = calculateAvailabilityFlag(sequence);
    long bufferAddress = (index * SCALE) + BASE;
    return UNSAFE.getIntVolatile(availableBuffer, bufferAddress) == flag;
}
```

SingleProducerSequencer 的方法如下:
``` 
public boolean isAvailable(long sequence)
{
    return sequence <= cursor.get();
}
```
在单个生产者的场景下，publishEvent的时候才会推进 cursor，所以只要 sequence<=cursor，就说明数据是可消费的。

多个生产者的场景下，在next(n)方法中，就已经通过 cursor.compareAndSet(current, next) 移动cursor了，此时event还没有publish，所以cursor所在的位置不能保证event一定可用。

在publish方法中是去setAvailable(sequence)了，所以 availableBuffer 是数据是否可用的标志。那为什么值要写成圈数呢，应该是避免把上一轮的数据当成这一轮的数据，错误判断sequence是否可用。

#### EventProcessor 

`EventProcessor extends Runnable` 可以理解为是一个消费者线程的接口

主要实现类是 `BatchEventProcessor`, 主要属性是
``` 
DataProvider<T> dataProvider;   // 就是RingBuffer， event容器
SequenceBarrier sequenceBarrier; // 用来获取可用event的sequence
EventHandler<? super T> eventHandler;  // 真正消费event的业务代码
Sequence sequence = new Sequence(-1);      // 该消费线程消费完的sequence位置
```

run 方法中是主要的逻辑


##### SequenceBarrier

ProcessingSequenceBarrier 内部持有Sequencer的cursor引用，知道生产者生产到哪个位置了。BatchEventProcessor.sequence 是当前消费线程消费到的位置。sequence + 1 就是下一个打算消费的位置 nextSequence，sequenceBarrier.waitFor(nextSequence) 会去获取下一个可以消费的availableSequence。

拿到的availableSequence可能比要求的nextSequence大，意味着生产者生产出了很多可以消费的event。这时就会一个个去消费，并且更新BatchEventProcessor的sequence至availableSequence。此时Sequencer上的gatingSequences因为是引用的关系也会被更新。

##### WaitStrategy

调用 sequenceBarrier.waitFor(nextSequence) 时可能不会立即有新的event，这时的行为由 waitStrategy 决定，有多种实现，比如 BlockingWaitStrategy。

Sequencer在构造的时候就会传入一个 waitStrategy，sequenceBarrier 是由 Sequencer 创建的，创建的时候把 Sequencer 的 waitStrategy 传递给 sequenceBarrier。Sequencer和SequenceBarrier持有同样的waitStrategy，相当于在两者间起到了 传递信息和回调 的作用。

消费者在没有可消费的event时会调用waitStrategy.waitFor陷入等待，生产者会在生产出新event后调用waitStrategy.signalAllWhenBlocking来唤醒消费者。



不同的 WaitStrategy 的实现会有不同的效率和性能。

- BlockingWaitStrategy: 该实现依赖Lock来设置等待和唤醒。 系统吞吐量和低延迟的表现比较差，好处是对CPU的消耗比较少。
``` 
Lock lock = new ReentrantLock();
Condition processorNotifyCondition = lock.newCondition();

// 等待
processorNotifyCondition.await();

// 唤醒
processorNotifyCondition.signalAll();
```

- SleepingWaitStrategy: 该实现是在性能和CPU占用之间的一种折中。该实现对负责调用唤醒方法的生产者比较友好，因为啥都不用做。相当于完全依赖消费者端的自旋retry。
``` 
inal int DEFAULT_RETRIES = 200;
long DEFAULT_SLEEP = 100;

int retries;
long sleepTimeNs;

// 等待的实现, counter 即 retries
if (counter > 100)
{
    --counter;
}
else if (counter > 0)
{
    --counter;
    Thread.yield();
}
else
{
    LockSupport.parkNanos(sleepTimeNs);
}
```

- YieldingWaitStrategy: 该实现和SleepingWaitStrategy很类似，只是它在等待的时候会吃掉100%的CPU。
```
// 等待的实现， 只有 counter==0 的时候才让出CPU，其他时候都在自旋。  
if (0 == counter)
{
    Thread.yield();
}
else
{
    --counter;
}
```

- BusySpinWaitStrategy: 该实现的唤醒也是啥都不做。性能最好的实现，但对部署环境的要求也最高。消费者线程数应该要少于CPU的实际物理核心数。
``` 
// 等待的实现
ThreadHints.onSpinWait();
```

#### WorkerPool

``` 
Sequence workSequence = new Sequence(-1);
WorkProcessor<?>[] workProcessors
```

WorkerPool 内部维护了一个workSequence，代表着整个pool分配出去的event位置。
<=workSequence的event已经被分配给某个workProcessors了，但是不是一定已经被消费完。
这个设计和多生产者的情况下，先分配sequence到具体的某个生产者，然后再去填充，提交是一样的道理。

##### WorkProcessor

WorkProcessor 是基本的消费者线程，它保有workSequence的引用。

在它的run loop中，它会首先尝试CAS去抢workSequence的下一个位置，抢到了就会去消费。

如果没有可消费的event了，它就会调用 sequenceBarrier.waitFor(nextSequence) 陷入等待。但即使有了新的event被唤醒，它还是要靠CAS去抢下一个event的消费权。

``` 
while (true)
{
    try
    {
        // if previous sequence was processed - fetch the next sequence and set
        // that we have successfully processed the previous sequence
        // typically, this will be true
        // this prevents the sequence getting too far forward if an exception
        // is thrown from the WorkHandler
        if (processedSequence)   // 这个if里面的代码都是为了CAS拿event
        {
            processedSequence = false;
            do
            {
                nextSequence = workSequence.get() + 1L; // 拿到下一个sequence
                sequence.set(nextSequence - 1L); 
                // 更新这个WorkProcessor的消费位置，这个位置主要是反映到Sequencer的gatingSequence从而影响生产者是否继续生产。
                // 但实际上（nextSequence - 1L）这个位置很有可能不是这个WorkProcessor消费掉的
            }
            while (!workSequence.compareAndSet(nextSequence - 1L, nextSequence));
        }

        if (cachedAvailableSequence >= nextSequence) // 如果该nextSequence已经被生产出来
        {
            event = ringBuffer.get(nextSequence);
            workHandler.onEvent(event);
            processedSequence = true;
        }
        else
        {
            cachedAvailableSequence = sequenceBarrier.waitFor(nextSequence);  // 没有被生产出来就在这等待
        }
    }
    // exception handler
}
```