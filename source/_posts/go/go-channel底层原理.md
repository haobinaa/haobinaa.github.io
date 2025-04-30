---
title: go-channel底层原理
date: 2025-04-30 14:51:38
tags: go-channel
categories: go
---

### 前言

go channel 是 go 并发最核心的组件， 也体现 go 的并发思想:
> Do not communicate by sharing memory; instead, share memory by communicating.


chanel 分为两类:
1. 无缓冲channel，可以看作“同步模式”，发送方和接收方要同步就绪，只有在两者都 ready 的情况下，数据才能在两者间传输（后面会看到，实际上就是内存拷贝）。否则，任意一方先行进行发送或接收操作，都会被挂起，等待另一方的出现才能被唤醒。

2. 有缓冲channel称为“异步模式”，在缓冲槽可用的情况下（有剩余容量），发送和接收操作都可以顺利进行。否则，操作的一方（如写入）同样会被挂起，直到出现相反操作 （如接收）才会被唤醒。

基本操作:
1. 读取 `<- chan`
2. 写入 `chan <-`
3. 关闭 `close(chan)`
4. 获取channel长度 `len(chan)`
5. 获取channel容量 `cap(chan)`


在介绍 channel 的底层原理之前， 先回忆一下进程/线程之间交换数据的方式， 无非就是:
1. 共享内存或者加互斥锁
2. 先进先出(FIFO)将资源分配给等待时间最长的线程。

go 采用的是第二种方案， go 内存模型对 happens-before 原则实现:
1. 修改由多个goroutines同时访问的数据的程序必须串行化这些访问
2. 为了实现串行访问，需要使用 channel 操作或其他同步原语(如sync和sync/atomic包中的原语)来保护数据
3. go语句创建一个 goroutine，一定发生在 goroutine 执行之前
4. 往一个 channel 中发送数据，一定发生在从这个 channel 读取这个数据完成之前
5. 一个channel的关闭，一定发生在从这个 channel 读取到零值数据（这里指因为close而返回的零值数据）之前
6. 从一个无缓冲 channel 的读取数据，一定发生在往这个 channel 发送数据完成之前

如果违反了上述规则， go 就会抛出 panic


### channel 底层原理




#### 数据结构
``` 
type hchan struct {
	qcount   uint                 // 队列中所有数据总数
	dataqsiz uint                 // 循环队列大小
	buf      unsafe.Pointer       // 指向循环队列的指针
	elemsize uint16               // 循环队列中元素的大小
	closed   uint32               // chan是否关闭的标识
	elemtype *_type               // 循环队列中元素的类型
	sendx    uint                 // 已发送元素在循环队列中的位置
	recvx    uint                 // 已接收元素在循环队列中的位置
	recvq    waitq                // 等待接收的goroutine的等待队列
	sendq    waitq                // 等待发送的goroutine的等待队列
	lock mutex                    // 控制chan并发访问的互斥锁
}
```

![](/images/go/hchan.png)



sendq 和 recvq 存储了当前 Channel 由于缓冲区空间不足而阻塞的 Goroutine 列表，这些等待队列使用双向链表 waitq 表示，链表中所有的元素都是 `sudog` 结构：
``` 
type waitq struct {
	first *sudog
	last  *sudog
}
```

`sudog` 代表着等待队列中的一个 goroutine（或者理解为是一个挂起的 goroutine）。
一个 G 可以出现在许多等待队列上，因此一个 G 可能有多个sudog。并且多个 G 可能正在等待同一个同步对象，因此一个对象可能有许多 sudog。sudog 是从特殊池中分配出来的。使用 `acquireSudog` 和 `releaseSudog` 分配和释放它们。



#### 创建 chan


chan 使用 make 创建: `make(chan int, 10)`,  最终编译器会转为 : `runtime.makechan()`
``` 
func makechan(t *chantype, size int) *hchan {
	elem := t.elem

	// 检查数据项大小不能超过 64KB
	if elem.size >= 1<<16 {
		throw("makechan: invalid channel element type")
	}
        // 检查内存对齐是否正确
	if hchanSize%maxAlign != 0 || elem.align > maxAlign {
		throw("makechan: bad alignment")
	}
        // 缓冲区大小检查，判断是否溢出
	mem, overflow := math.MulUintptr(elem.size, uintptr(size))
	if overflow || mem > maxAlloc-hchanSize || size < 0 {
		panic(plainError("makechan: size out of range"))
	}

	var c *hchan
	switch {
	case mem == 0:
		// 队列或者元素大小为 zero 时，无须创建buf环形队列.
		c = (*hchan)(mallocgc(hchanSize, nil, true))
		// 竞态检查，利用这个地址进行同步操作.
		c.buf = c.raceaddr()
	case elem.ptrdata == 0:
		// 元素不是指针，分配一块连续的内存给hchan数据结构和缓冲区buf
		c = (*hchan)(mallocgc(hchanSize+mem, nil, true))
                // 表示hchan后面在内存里紧跟着就是buf环形队列
		c.buf = add(unsafe.Pointer(c), hchanSize)
	default:
		// 元素包含指针，单独分配环形队列buf
		c = new(hchan)
		c.buf = mallocgc(mem, elem, true)
	}
        
        // 设置元素个数、元素类型给创建的chan
	c.elemsize = uint16(elem.size)
	c.elemtype = elem
	c.dataqsiz = uint(size)
	lockInit(&c.lock, lockRankHchan)

	if debugChan {
		print("makechan: chan=", c, "; elemsize=", elem.size, "; dataqsiz=", size, "\n")
	}
	return c
}
```



#### 发送数据

针对发送数据(`-> chan`), 主要是调用的 `chansend()` 函数
``` 
func chansend1(c *hchan, elem unsafe.Pointer) {
	chansend(c, elem, true, getcallerpc())
}
```

chansend()函数的主要逻辑是：

1）在chan为 nil 未初始化的情况下，对于 select 这种非阻塞的发送，直接返回 false，对于阻塞的发送，将 goroutine 挂起，并且永远不会返回：
``` 
func chansend(c *hchan, ep unsafe.Pointer, block bool, callerpc uintptr) bool {
        // 如果chan为nil
	if c == nil {
                // 对于select这种非阻塞的发送,直接返回
		if !block {
			return false
		}
                // 对于阻塞的通道，将 goroutine 挂起
		gopark(nil, nil, waitReasonChanSendNilChan, traceEvGoStop, 2)
		throw("unreachable")
	}
        ......
}
```

2）非阻塞发送的情况下，当 channel 不为 nil，并且 channel 没有关闭时，如果没有缓冲区且没有接收者receiver，或者缓冲区已经满了，返回 false：
``` 
if !block && c.closed == 0 && full(c) {
    return false
}

.......
func full(c *hchan) bool {
	// 如果循环队列大小为0
	if c.dataqsiz == 0 {
		// 假设指针读取是近似原子性的，这里用来判断没有接收者
		return c.recvq.first == nil
	}
	// 队列满了
	return c.qcount == c.dataqsiz
}
```
`full()` 作用是判断在 channel 上发送是否会阻塞，用来判断的参数是`qcount，c.recvq.first，dataqsiz`前两个变量都是单字长的，所以对它们单个值的读操作是原子性的。
dataqsiz字段，它在创建完 channel 以后是不可变的，因此它可以安全的在任意时刻读取。


3）接下来，对chan加锁，判断chan不是关闭状态，再从recvq队列中取出一个接收者，如果接收者存在，则直接向它发送消息，绕过循环队列buf，此时，由于有接收者存在，则循环队列buf一定是空的
``` 
    ......
    // 对chan加锁
    lock(&c.lock)

    // 检查chan是否关闭
if c.closed != 0 {
    unlock(&c.lock)
    panic(plainError("send on closed channel"))
}

    // 从 recvq 中取出一个接收者
if sg := c.recvq.dequeue(); sg != nil {
    // 如果接收者存在，直接向该接收者发送数据，绕过循环队列buf
    send(c, sg, ep, func() { unlock(&c.lock) }, 3)
    return true
}
    ......
```
send() 函数主要完成了 2 件事：调用 `sendDirect()` 函数将数据拷贝到了接收者的内存地址上；调用 `goready()` 将等待接收的阻塞 goroutine 的状态从 Gwaiting 或者 Gscanwaiting 改变成 Grunnable。
``` 
func send(c *hchan, sg *sudog, ep unsafe.Pointer, unlockf func(), skip int) {
	......
	if sg.elem != nil {
                // 直接把要发送的数据拷贝到receiver的内存地址
		sendDirect(c.elemtype, sg, ep)
		sg.elem = nil
	}
	gp := sg.g
	unlockf()
	gp.param = unsafe.Pointer(sg)
	sg.success = true
	if sg.releasetime != 0 {
		sg.releasetime = cputicks()
	}
        // 唤醒等待的接收者goroutine
	goready(gp, skip+1)
}
```

4）继续往下执行，接下来是有缓冲区的异步发送的逻辑： 
如果缓冲区buf还没有满，调用 chanbuf() 获取 sendx 索引的元素指针值。调用 typedmemmove() 方法将发送的值拷贝到缓冲区 buf 中。拷贝完成，增加 sendx 索引下标值和 qcount 个数
``` 
// 如果缓冲区没有满，直接将要发送的数据复制到缓冲区
    if c.qcount < c.dataqsiz {
    // 找到要发送数据到循环队列buf的索引位置
    qp := chanbuf(c, c.sendx)
    ......
            // 数据拷贝到循环队列中
    typedmemmove(c.elemtype, qp, ep)
            // 将待发送数据索引加1，由于是循环队列，如果到了末尾，从0开始
    c.sendx++
    if c.sendx == c.dataqsiz {
        c.sendx = 0
    }
            // chan中元素个数加1，释放锁返回true
    c.qcount++
    unlock(&c.lock)
    return true
}
```

5）如果执行前面的步骤还没有成功发送，就表示缓冲区没有空间了，而且也没有任何接收者在等待。后面需要将 goroutine 挂起然后等待新的接收者了。
``` 
// 缓冲区没有空间，对于select这种非阻塞调用直接返回false
        if !block {
		unlock(&c.lock)
		return false
	}

	// 下面的逻辑是将当前goroutine挂起
        // 调用 getg()方法获取当前goroutine的指针，用于绑定给一个 sudog
	gp := getg()
        // 调用 acquireSudog()方法获取一个 sudog，可能是新建的 sudog，也有可能是从缓存中获取的。设置好sudog要发送的数据和状态。比如发送的 Channel、是否在 select 中和待发送数据的内存地址等等。
	mysg := acquireSudog()
	mysg.releasetime = 0
	if t0 != 0 {
		mysg.releasetime = -1
	}
	
	mysg.elem = ep
	mysg.waitlink = nil
	mysg.g = gp
	mysg.isSelect = false
	mysg.c = c
	gp.waiting = mysg
	gp.param = nil
        // 调用 c.sendq.enqueue 方法将配置好的 sudog 加入待发送的等待队列
	c.sendq.enqueue(mysg)
	atomic.Store8(&gp.parkingOnChan, 1)
        // 调用gopark方法挂起当前goroutine，状态为waitReasonChanSend，阻塞等待channel接收者的激活
	gopark(chanparkcommit, unsafe.Pointer(&c.lock), waitReasonChanSend, traceEvGoBlockSend, 2)
	// 最后，KeepAlive() 确保发送的值保持活动状态，直到接收者将其复制出来
	KeepAlive(ep)
```

6）chansend()方法最后的代码是当goroutine唤醒以后，解除阻塞的状态
``` 
func chansend(c *hchan, ep unsafe.Pointer, block bool, callerpc uintptr) bool {
        ......
	if mysg != gp.waiting {
		throw("G waiting list is corrupted")
	}
	gp.waiting = nil
	gp.activeStackChans = false
	closed := !mysg.success
	gp.param = nil
	if mysg.releasetime > 0 {
		blockevent(mysg.releasetime-t0, 2)
	}
	mysg.c = nil
	releaseSudog(mysg)
	if closed {
		if c.closed == 0 {
			throw("chansend: spurious wakeup")
		}
		panic(plainError("send on closed channel"))
	}
	return true
}
```


总结下来整体逻辑是:
1. 首先select这种非阻塞的发送，判断两种情况；
2. 然后是正常的阻塞调用，先判断recvq等待接收队列是否为空，不为空说明缓冲区中没有内容或者是一个无缓冲channel；
3. 如果recvq有接收者，则缓冲区一定为空，直接从recvq中取出一个goroutine，然后写入数据，接着唤醒 goroutine，结束发送过程；
4. 如果缓冲区有空余的位置，写入数据到缓冲区，完成发送；
5. 如果缓冲区满了，那么就把发送数据的goroutine放到sendq中，进入睡眠，等待该goroutine被唤醒。 


#### 接收数据

使用 chan 接收数据有如下操作:
``` 
i <- ch
i, ok <- ch
```

跳过编译流程， 本质上是走到 `chanrecv()`:
```
func chanrecv(c *hchan, ep unsafe.Pointer, block bool) (selected, received bool) {
         ......
} 
```

chanrecv()方法有两个返回值，selected, received bool，前者表示是否接收到值，后者表示接收的值是否关闭后发送的。
有三种情况：
1. 如果是非阻塞的情况，没有数据可以接收，则返回 (false,flase)；
2. 如果 chan 已经关闭了，将 ep 指向的值置为 0值，并且返回 (true, false)；
3. 其它情况返回值为 (true,true)，表示成功从 chan 中获取到了数据，且是chan未关闭发送

进入具体的逻辑 
1) 首先判断如果chan为空，且是select这种非阻塞调用，那么直接返回 (false,false)，否则阻塞当前的goroutine；
``` 
func chanrecv(c *hchan, ep unsafe.Pointer, block bool) (selected, received bool) {
	......
        // 如果c为空
	if c == nil {
                // 如果c为空且是非阻塞调用，那么直接返回 (false,false)
		if !block {
			return
		}
                //阻塞当前的goroutine
		gopark(nil, nil, waitReasonChanReceiveNilChan, traceEvGoStop, 2)
		throw("unreachable")
	}
        ......
} 
```


2）如果是非阻塞调用，通过empty()方法原子判断是无缓冲chan或者是chan中没有数据且chan没有关闭，则返回（false,false），
如果chan关闭，为了防止检查期间的状态变化，二次调用empty()进行原子检查，如果是无缓冲chan或者是chan中没有数据，返回 (true, false)，这里的第一个true表示chan关闭后读取的 0 值；
``` 
 //非阻塞调用，通过empty()判断是无缓冲chan或者是chan中没有数据
	if !block && empty(c) {
		// 如果chan没有关闭，则直接返回 (false, false)
		if atomic.Load(&c.closed) == 0 {
			return
		}
		
                // 如果chan关闭, 为了防止检查期间的状态变化，二次调用empty()进行原子检查，如果是无缓冲chan或者是chan中没有数据，返回 (true, false)
		if empty(c) {
			if raceenabled {
				raceacquire(c.raceaddr())
			}
			if ep != nil {
				typedmemclr(c.elemtype, ep)
			}
			return true, false
		}
	}
func empty(c *hchan) bool {
	// c.dataqsiz 是不可变的
	if c.dataqsiz == 0 {
		return atomic.Loadp(unsafe.Pointer(&c.sendq.first)) == nil
	}
	return atomic.Loaduint(&c.qcount) == 0
}
```

3) 接下来阻塞调用的逻辑，chanrecv方法对chan加锁，判断chan如果已经关闭，并且chan中没有数据，返回 (true,false)，这里的第一个true表示chan关闭后读取的 0 值；
``` 
......
        // 对chan加锁
        lock(&c.lock)
        // 如果已经关闭，并且chan中没有数据，返回 (true,false)
	if c.closed != 0 && c.qcount == 0 {
		if raceenabled {
			raceacquire(c.raceaddr())
		}
		unlock(&c.lock)
		if ep != nil {
			typedmemclr(c.elemtype, ep)
		}
		return true, false
	}
        ......
```

4) 接下来，从发送队列中获取一个等待发送的 goroutine，即取出等待队列队头的 goroutine。如果缓冲区的大小为 0，则直接从发送方接收值。否则，对应缓冲区满的情况，从队列的头部接收数据，发送者的值添加到队列的末尾（此时队列已满，因此两者都映射到缓冲区中的同一个下标）。这里需要注意，由于有发送者在等待，所以如果有缓冲区，那么缓冲区一定是满的。

``` 
 ......
       // 从发送者队列获取等待发送的 goroutine	
       if sg := c.sendq.dequeue(); sg != nil {
		//在 channel 的发送队列中找到了等待发送的 goroutine，取出队头等待的 goroutine。如果缓冲区的大小为 0，则直接从发送方接收值。否则，对应缓冲区满的情况，从队列的头部接收数据，发送者的值添加到队列的末尾（此时队列已满，因此两者都映射到缓冲区中的同一个下标）
		recv(c, sg, ep, func() { unlock(&c.lock) }, 3)
		return true, true
	}
func recv(c *hchan, sg *sudog, ep unsafe.Pointer, unlockf func(), skip int) {
	if c.dataqsiz == 0 {
		if raceenabled {
			racesync(c, sg)
		}
		if ep != nil {
			// 从发送者sender里面拷贝数据
			recvDirect(c.elemtype, sg, ep)
		}
	} else {
		// 队列是满的
		qp := chanbuf(c, c.recvx)
		if raceenabled {
			racenotify(c, c.recvx, nil)
			racenotify(c, c.recvx, sg)
		}
		// 从缓冲区拷贝数据给接收者receiver
		if ep != nil {
			typedmemmove(c.elemtype, ep, qp)
		}
		// 从发送者sender拷贝数据到缓冲区
		typedmemmove(c.elemtype, qp, sg.elem)
		c.recvx++
		if c.recvx == c.dataqsiz {
			c.recvx = 0
		}
		c.sendx = c.recvx // c.sendx = (c.sendx+1) % c.dataqsiz
	}
	sg.elem = nil
	gp := sg.g
	unlockf()
	gp.param = unsafe.Pointer(sg)
	sg.success = true
	if sg.releasetime != 0 {
		sg.releasetime = cputicks()
	}
        // 唤醒发送者
	goready(gp, skip+1)
}
```


5) 接下来，是异步接收逻辑，如果缓冲区有数据，直接从缓冲区接收数据，即将缓冲区recvx指向的数据复制到ep接收地址，并且将recvx加1；

``` 
   // 如果缓冲区有数据
         if c.qcount > 0 {
		// 直接从缓冲区接收数据
		qp := chanbuf(c, c.recvx)
		if raceenabled {
			racenotify(c, c.recvx, nil)
		}
                // 接收数据地址ep不为空，直接从缓冲区复制数据到ep
		if ep != nil {
			typedmemmove(c.elemtype, ep, qp)
		}
		typedmemclr(c.elemtype, qp)
                // 待接收索引加1
		c.recvx++
                // 循环队列，如果到了末尾，从0开始
		if c.recvx == c.dataqsiz {
			c.recvx = 0
		}
                // 缓冲区数据减1
		c.qcount--
		unlock(&c.lock)
		return true, true
	}
```


6) 然后是缓冲区没有数据的情况；如果是select这种非阻塞读取的情况，直接返回(false, false)，表示获取不到数据；否则，会获取sudog绑定当前接收者goroutine，调用gopark()挂起当前接收者goroutine，等待chan的其他发送者唤醒

``` 
       // 如果是select非阻塞读取的情况，直接返回(false, false)
        if !block {
		unlock(&c.lock)
		return false, false
	}

	// 没有发送者，挂起当前goroutine
        // 获取当前 goroutine 的指针，用于绑定给一个 sudog
	gp := getg()
        // 调用 acquireSudog() 方法获取一个 sudog，可能是新建的 sudog，也有可能是从缓存中获取的。设置好 sudog 要发送的数据和状态
	mysg := acquireSudog()
	mysg.releasetime = 0
	if t0 != 0 {
		mysg.releasetime = -1
	}
	
	mysg.elem = ep
	mysg.waitlink = nil
	gp.waiting = mysg
	mysg.g = gp
	mysg.isSelect = false
	mysg.c = c
	gp.param = nil
        // 将配置好的 sudog 加入待发送的等待队列
	c.recvq.enqueue(mysg)
	atomic.Store8(&gp.parkingOnChan, 1)
        // 挂起当前 goroutine
	gopark(chanparkcommit, unsafe.Pointer(&c.lock), waitReasonChanReceive, traceEvGoBlockRecv, 2)
```

7) 最后，当前goroutine被唤醒，完成chan数据的接收，之后进行参数检查，解除chan绑定，并释放sudog。

``` 
func chanrecv(c *hchan, ep unsafe.Pointer, block bool) (selected, received bool) {
	......
        // 当前goroutine被唤醒，完成chan数据的接收，之后进行参数检查，解除chan绑定，并释放sudog
	if mysg != gp.waiting {
		throw("G waiting list is corrupted")
	}
	gp.waiting = nil
	gp.activeStackChans = false
	if mysg.releasetime > 0 {
		blockevent(mysg.releasetime-t0, 2)
	}
	success := mysg.success
	gp.param = nil
	mysg.c = nil
	releaseSudog(mysg)
	return true, success
}
```

总结:
1. 也是先判断select这种非阻塞接收的两种情况（block为false）；然后是加锁进行阻塞调用的逻辑；
2. 同步接收：如果发送者队列sendq不为空，且没有缓存区，直接从sendq中取出一个goroutine，读取当前goroutine中的消息，唤醒goroutine, 结束读取的过程；
3. 同步接收：如果发送者队列sendq不为空，说明缓冲区已经满了，移动recvx指针的位置，取出一个数据，同时在sendq中取出一个goroutine，拷贝里面的数据到buf中，结束当前读取；
4. 异步接收：如果发送者队列sendq为空，且缓冲区有数据，直接在缓冲区取出数据，完成本次读取；
5. 阻塞接收：如果发送者队列sendq为空，且缓冲区没有数据。将当前goroutine加入recvq，进入睡眠，等待被发送者goroutine唤醒。

#### 关闭 chan


``` 
func closechan(c *hchan) {
        // 如果chan为空，此时关闭它会panic
	if c == nil {
		panic(plainError("close of nil channel"))
	}
        
        // 加锁
	lock(&c.lock)
        // 如果chan已经关闭了，再次关闭它会panic
	if c.closed != 0 {
		unlock(&c.lock)
		panic(plainError("close of closed channel"))
	}

	if raceenabled {
		callerpc := getcallerpc()
		racewritepc(c.raceaddr(), callerpc, abi.FuncPCABIInternal(closechan))
		racerelease(c.raceaddr())
	}
        // 设置chan的closed状态为关闭
	c.closed = 1
        // 申明一个存放所有接收者和发送者goroutine的list
	var glist gList

	//获取recvq里的所有接收者
	for {
		sg := c.recvq.dequeue()
		if sg == nil {
			break
		}
		if sg.elem != nil {
			typedmemclr(c.elemtype, sg.elem)
			sg.elem = nil
		}
		if sg.releasetime != 0 {
			sg.releasetime = cputicks()
		}
		gp := sg.g
		gp.param = unsafe.Pointer(sg)
		sg.success = false
		if raceenabled {
			raceacquireg(gp, c.raceaddr())
		}
                // 放入队列glist中
		glist.push(gp)
	}

	// 获取所有发送者
	for {
		sg := c.sendq.dequeue()
		if sg == nil {
			break
		}
		sg.elem = nil
		if sg.releasetime != 0 {
			sg.releasetime = cputicks()
		}
		gp := sg.g
		gp.param = unsafe.Pointer(sg)
		sg.success = false
		if raceenabled {
			raceacquireg(gp, c.raceaddr())
		}
                // 放入队列glist中
		glist.push(gp)
	}
	unlock(&c.lock)

	// 唤醒所有的glist中的goroutine 
	for !glist.empty() {
		gp := glist.pop()
		gp.schedlink = 0
		goready(gp, 3)
	}
}
```

关闭chan的步骤是：

1. 先检查异常情况，当 Channel 是一个 nil 空指针或者关闭一个已经关闭的 channel 时，Go 语言运行时都会直接 panic；

2. 关闭的主要工作是释放所有的接收者和发送者：将所有的接收者 readers 的 sudog 等待队列（recvq）加入到待清除队列 glist 中。注意这里是先回收接收者，因为从一个关闭的 channel 中读数据，不会发生 panic，顶多读到一个默认零值。再回收发送者 senders，将发送者的等待队列 sendq 中的 sudog 放入待清除队列 glist 中。注意这里可能会产生 panic，因为往一个关闭的 channel 中发送数据，会产生 panic。

