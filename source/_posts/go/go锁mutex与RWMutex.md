---
title: go锁mutex与RWMutex
date: 2024-12-12 19:06:13
tags:
categories: go
---

### sync.Mutex

`sync.Mutex` 是 go 最基本的同步原语， 也是最常用的锁之一


#### 基本结构

``` 
// sync/mutex.go 25行
type Mutex struct {
	state int32
	sema  uint32
}
```
- `state`: 当前互斥锁的状态
- `sema`: 控制锁状态信号量

**state** 一共32位， 最低三位分别表示 `mutexLocked`、`mutexWoken` 和 `mutexStarving`，剩下的位置用来表示当前有多少个 Goroutine 在等待互斥锁的释放:

![](/images/go/mutex/mutex.png)

- `mutexLocked`: 第 0 位， 是否上锁
- `mutexWoken`: 第 1 位， 是否有协程抢占锁
- `mutexStarving`: 第 2 位， 是否处于饥饿模式
- 后续的高 29 位表示阻塞队列中等待的协程数量


#### 加锁/解锁方案

最简单的思路去实现 mutex 互斥锁:
- 加锁：把锁状态 0 改为 1， 假若已经是 1，则上锁失败，需要等他人解锁
- 解锁：把 1 置为 0.

针对 goroutine 加锁时发现锁已被抢占的这种情形，此时摆在面前的策略有如下两种：
- 阻塞/唤醒：将当前 goroutine 阻塞挂起，直到锁被释放后，以回调的方式将阻塞 goroutine 重新唤醒，进行锁争夺；
- 自旋 + CAS：基于自旋结合 CAS 的方式，反复尝试试图获取锁

| 方案 | 优势               | 劣势 | 使用场景 |
|----|------------------|----|------|
| 阻塞/唤醒   | 精准分配，不浪费 CPU 时间片 | 需要挂起协程，进行上下文切换，操作较重   | 并发竞争激烈的场景     |
| 自旋+CAS   | 无需阻塞协程，短期来看操作较轻                 | 长时间争而不得，会浪费 CPU 时间片   | 并发竞争强度低的场景     |

可以看到上面两种方式各有优劣， 基本上其他语言的锁也是基于这两个模式 ，如 java 的 `synchronize` 也是从偏向锁升级到轻量级锁->重量级锁

类似， Mutex 也有一个锁升级的过程:
1. 首先保持乐观，goroutine 采用自旋 + CAS 的策略争夺锁；
2. 尝试持续受挫达到一定条件后，判定当前过于激烈，则由自旋转为 阻塞/挂起模式.

从文档来看， 这里的升级条件是:
1. 自旋累计达到 4 次仍未取得锁；
2. CPU 单核或仅有单个 P 调度器；（此时自旋，其他 goroutine 根本没机会释放锁，自旋纯属空转）；
3. 当前 P 的执行队列中仍有待执行的 G. （避免因自旋影响到 GMP 调度效率)

#### 正常模式和饥饿模式

Mutex 有两种模式：

- 正常模式: 在正常模式下，锁的等待者会按照先进先出的顺序获取锁。但是刚被唤起的 Goroutine 与新创建的 Goroutine 竞争时，大概率会获取不到锁(新的 goroutine 已经在 cpu 上运行了， 大概率会获取到时间片)，为了减少这种情况的出现，一旦 Goroutine 超过 1ms 没有获取到锁，它就会将当前互斥锁切换饥饿模式，防止部分 Goroutine 被饿死。 
- 饥饿模式: 互斥锁会直接交给等待队列最前面的 Goroutine。新的 Goroutine 在该状态下不能获取锁、也不会进入自旋状态，它们只会在队列的末尾等待。如果一个 Goroutine 获得了互斥锁并且它在队列的末尾或者它等待的时间少于 1ms，那么当前的互斥锁就会切换回正常模式

#### 加锁/解锁源码

首先看加锁过程:
``` 
// sync/mutex.go 72 行
func (m *Mutex) Lock() {
	// Fast path: grab unlocked mutex.
	if atomic.CompareAndSwapInt32(&m.state, 0, mutexLocked) {
		return
	}
	// Slow path (outlined so that the fast path can be inlined)
	m.lockSlow()
}

// slow path
func (m *Mutex) lockSlow() {
	var waitStartTime int64
	starving := false
	awoke := false
	iter := 0
	old := m.state
	for {
	    
		// 是否允许自旋
		// 如果当前锁处于已被锁定（mutexLocked）&& 未处于饥饿（mutexStarving）状态 && 当前允许自旋
		if old&(mutexLocked|mutexStarving) == mutexLocked && runtime_canSpin(iter) {
		    // 在自旋过程中，如果当前 goroutine 还没被唤醒（awoke == false）
		    // 并且互斥锁的唤醒标记位没被设置（old&mutexWoken == 0）且存在等待者（old>>mutexWaiterShift!= 0，通过位移操作判断等待者数量）
		    // 尝试将唤醒标记位 mutexWoken 设置上（避免其他 goroutine 被唤醒来和当前 goroutine 抢占锁）
			// 如果设置成功，就将 awoke 标记为 true
			if !awoke && old&mutexWoken == 0 && old>>mutexWaiterShift != 0 &&
				atomic.CompareAndSwapInt32(&m.state, old, old|mutexWoken) {
				awoke = true
			}
			// 调用 runtime_doSpin 函数进行实际的自旋操作
			runtime_doSpin()
			// 更新自旋次数， 重新获取锁的当前状态old，继续下一轮循环尝试自旋获取锁
			iter++
			old = m.state
			continue
		}
		
		// 先记录原来的 state 值 old， 看下面的情况来进行更新
		new := old
		
		// 如果当前不处于 mutexStarving(饥饿)， 给 state 加上 mutexLocked 锁定标记
		// 表示当前 goroutines 想获取锁(如果下面更新 state 成功就代表获取锁成功)
		if old&mutexStarving == 0 {
			new |= mutexLocked
		}
		
		// 如果当前已经处于锁定或饥饿状态(已经有 goroutine 持有锁或处于竞争激烈的饥饿态)
		// 则将 waiter(等待数量) +1(左移操作)
		if old&(mutexLocked|mutexStarving) != 0 {
			new += 1 << mutexWaiterShift
		}
        
        // 如果当前 goroutine 处于饥饿模式， 并且当前状态是锁定
        // 则更新状态加上饥饿标识
		if starving && old&mutexLocked != 0 {
			new |= mutexStarving
		}
		
		// 如果是当前 goroutine 设置了唤醒标志位
		// 首先对 state 进行状态校验， 没有设置唤醒标志位就抛出异常
		// 然后清除 mutexWoken 标志位(当前 goroutine 继续执行的话要么抢占锁要么被挂起， 所以需要 woken 抢占标识重置)
		if awoke {
			if new&mutexWoken == 0 {
				throw("sync: inconsistent mutex state")
			}
			new &^= mutexWoken
		}
		
		
		// 更新 state 标志位
		if atomic.CompareAndSwapInt32(&m.state, old, new) {
		    // 如果原来的状态是锁定并且非饥饿状态， 
		    // 代表当前 goroutine 拿到了锁(加锁标志位是当前的 goroutine 更新的， 也就是获取到了锁)， 直接 break 跳出循环
			if old&(mutexLocked|mutexStarving) == 0 {
				break // locked the mutex with CAS
			}
			
			// 否则不是当前 goroutine 加锁成功， 则进入阻塞流程
			
			// queueLifo 标识当前 goroutine 是从阻塞队列唤醒的还是新加入竞争的
			// 根据 waitStartTime 是否为 0 来确定，如果之前已经开始等待了，waitStartTime不为 0，就按 LIFO 排队；
			// 如果是刚开始等待，就记录当前时间作为 waitStartTime
			queueLifo := waitStartTime != 0
			if waitStartTime == 0 {
				waitStartTime = runtime_nanotime()
			}
			// runtime_SemacquireMutex 阻塞等待获取锁
			// 加入阻塞，如果是 lifo(是被唤醒的 goroutine )就插入表头。 等待被信号量唤醒
			runtime_SemacquireMutex(&m.sema, queueLifo, 1)
			
			
			// 走到这里代表 goroutine 从阻塞队列被唤醒了
			
			// 判断是否进入饥饿状态，
			// 通过比较当前时间（runtime_nanotime）减去开始等待时间（waitStartTime）是否超过了设定的饥饿阈值（starvationThresholdNs），
			// 如果超过了，就将 starving 标记为 true
			// 这里的 || 表达式用的比较巧妙， 如果 starving 已经是 true 了就不会去比较表达式了
			starving = starving || runtime_nanotime()-waitStartTime > starvationThresholdNs
			
			// 再次把当前的状态赋值给 old
			old = m.state
			// 如果锁处于饥饿状态，需要做一些状态修正操作
			if old&mutexStarving != 0 {
			    // 先检查状态是否一致
				if old&(mutexLocked|mutexWoken) != 0 || old>>mutexWaiterShift == 0 {
					throw("sync: inconsistent mutex state")
				}
				// 然后计算一个状态差值delta，在满足一定条件（比如不是持续饥饿或者只有一个等待者等）时，
				// 会调整锁的状态来退出饥饿模式，然后 break 跳出循环
				delta := int32(mutexLocked - 1<<mutexWaiterShift)
				if !starving || old>>mutexWaiterShift == 1 {
					delta -= mutexStarving
				}
				atomic.AddInt32(&m.state, delta)
				break
			}
			awoke = true
			iter = 0
		} else {
			old = m.state
		}
	}

	if race.Enabled {
		race.Acquire(unsafe.Pointer(m))
	}
}
```



解锁流程:
``` 
func (m *Mutex) Unlock() {
    // 解锁
    new := atomic.AddInt32(&m.state, -mutexLocked)
    // 解锁完成如果有其他阻塞 goroutine， 进入 unlockSlow， 没有就直接返回
    if new != 0 {
        m.unlockSlow(new)
    }
}

func (m *Mutex) unlockSlow(new int32) {
    // 状态检查
    // new+mutexLocked 如果原来锁定标志位是0， 然后与 mutexLocked 与操作就进位了
    // 所以这里是检测锁标志
	if (new+mutexLocked)&mutexLocked == 0 {
		fatal("sync: unlock of unlocked mutex")
	}
	
	// 如果没有处于饥饿模式
	if new&mutexStarving == 0 {
		old := new
		for {
		    // 如果阻塞队列内无 goroutine 
		    // 或者 mutexLocked、mutexStarving、mutexWoken 标识位任一不为零(三个状态均说明此时有其他活跃协程已介入)
		    // 上述两种情况直接 return 自身无需关心后续流程
			if old>>mutexWaiterShift == 0 || old&(mutexLocked|mutexWoken|mutexStarving) != 0 {
				return
			}
			
			
			// 将 state 中阻塞协程状态减一， 然后唤醒队列头的 goroutine
			new = (old - 1<<mutexWaiterShift) | mutexWoken
			if atomic.CompareAndSwapInt32(&m.state, old, new) {
				runtime_Semrelease(&m.sema, false, 1)
				return
			}
			old = m.state
		}
	} else {
	    // 如果处于饥饿模式。 直接唤醒阻塞队列头部的 goroutine
		runtime_Semrelease(&m.sema, true, 1)
	}
}
```


### sync.RWMutex

可以把 RWMutex 理解为一把读锁加一把写锁；
- 写锁具有严格的排他性，当其被占用，其他试图取写锁或者读锁的 goroutine 均阻塞；
- 读锁具有有限的共享性，当其被占用，试图取写锁的 goroutine 会阻塞，试图取读锁的 goroutine 可与当前 goroutine 共享读锁；

综上，RWMutex 适用于读多写少的场景，最理想化的情况，当所有操作均使用读锁，则可实现去无化；最悲观的情况，倘若所有操作均使用写锁，则 RWMutex 退化为普通的 Mutex.


#### 数据结构
``` 
type RWMutex struct {
	w           Mutex        // 互斥锁
	writerSem   uint32       // 关联写锁阻塞队列的信号量
	readerSem   uint32       // 关联读锁阻塞队列的信号量
	readerCount atomic.Int32 // 正常情况下等于介入读锁流程的 goroutine 数量；当 goroutine 接入写锁流程时，该值为实际介入读锁流程的 goroutine 数量减 rwmutexMaxReader
	readerWait  atomic.Int32 // 记录在当前 goroutine 获取写锁前，还需要等待多少个 goroutine 释放读锁
}
```
- `rwmutexMaxReaders`：共享读锁的 goroutine 数量上限，值为 2^29；
- `w`： 内置的一把普通互斥锁 sync.Mutex；
- `writerSem`：关联写锁阻塞队列的信号量；
- `readerSem`：关联读锁阻塞队列的信号量；
- `readerCount`：正常情况下等于介入读锁流程的 goroutine 数量；当 goroutine 接入写锁流程时，该值为**实际介入读锁流程的 goroutine 数量减 `rwmutexMaxReaders`(显然这个是一个负数)**.
- `readerWait`：记录在当前 goroutine 获取写锁前，还需要等待多少个 goroutine 释放读锁

#### 读锁流程

加锁:
``` 
func (rw *RWMutex) RLock() {
    // 将持有或等待写锁的 goroutine +1
    // readerCount +1 后仍然是负数， 就代表此刻有写锁在等待或持有锁
    // 将当前 goroutine 挂起放入读锁阻塞队列
    if atomic.AddInt32(&rw.readerCount, 1) < 0 {
        runtime_SemacquireMutex(&rw.readerSem, false, 0)
    }
}
```
这里需要注意的是， 当 `readerCount` +1 后的值仍然小于0，说明有 goroutine 未释放写锁，因此将当前 goroutine 添加到读锁的阻塞队列中并阻塞挂起(读饥饿策略)


解锁流程:
``` 
func (rw *RWMutex) RUnlock() {
    // 先将读锁等待数量 -1
    if r := atomic.AddInt32(&rw.readerCount, -1); r < 0 {
        // 如果 -1 后的值仍然小于 0， 说明有写锁未释放
        rw.rUnlockSlow(r)
    }
}

func (rw *RWMutex) rUnlockSlow(r int32) {
    // 对 readerCount 的值进行校验
    // 如果未抢占过读锁(r+1 == 0)
    // 或者介入读锁流程的 goroutine 数量达到上限
	if r+1 == 0 || r+1 == -rwmutexMaxReaders {
		fatal("sync: RUnlock of unlocked RWMutex")
	}
	
	// 对 readerWait 减一， 如果为0， 就代表当前 goroutine 是最后一个持有读锁的协程
	// 所以唤醒一个等待写锁的 goroutine
	if rw.readerWait.Add(-1) == 0 {
		// The last reader unblocks the writer.
		runtime_Semrelease(&rw.writerSem, false, 1)
	}
}
```

#### 写锁流程

加锁流程:
``` 
func (rw *RWMutex) Lock() {
    // 用内置互斥锁加锁
    rw.w.Lock()
    // 先对 readerCount 进行减少 -rwmutexMaxReaders 的原子操作， 让 readerCount 变为负数(表示有写锁持有或等待)
    // 然后加上 rwmutexMaxReaders 给 r 加回去
    r := atomic.AddInt32(&rw.readerCount, -rwmutexMaxReaders) + rwmutexMaxReaders
    // 如果存在未释放读锁的 goroutine， 给 readerWait 加上读锁的数量， 并将当前 goroutine 挂起
    if r != 0 && atomic.AddInt32(&rw.readerWait, r) != 0 {
        runtime_SemacquireMutex(&rw.writerSem, false, 0)
    }
}
```
之前说如果有写锁介入，等待读锁的 readerCount 应该是实际介入读锁流程的 goroutine 数量减 `rwmutexMaxReader`， 在这里也体现了



解锁流程:
``` 
func (rw *RWMutex) Unlock() {
    // 先给 readerCount 加上 rwmutexMaxReaders
    r := atomic.AddInt32(&rw.readerCount, rwmutexMaxReaders)
    if r >= rwmutexMaxReaders {
        fatal("sync: Unlock of unlocked RWMutex")
    }
    // 唤醒读锁阻塞队列的所有 goroutine
    for i := 0; i < int(r); i++ {
        runtime_Semrelease(&rw.readerSem, false, 0)
    }
    rw.w.Unlock()
}
```

#### 读写锁获取锁的优先级

基于对读和写操作的优先级，读写锁的设计和实现也分成三类:

1. `Read-preferring`： 读优先策略，可实现最大并发性，但如果读操作密集，会导致写锁饥饿。因为只要一个读取线程持有锁，写入线程就无法获取锁。如果有源源不断的读操作，写锁只能等待所有读锁释放后才能获取到(写锁饥饿)。
2. `Writer-preferring`：写优先的策略，可以保证即便在读密集的场景下，写锁也不会饥饿；只要有一个写锁申请加锁，那么就会阻塞后续的所有读锁加锁行为（已经获取到读锁的reader不受影响，写锁仍然要等待这些读锁释放之后才能加锁）
3. `Unspecified(不指定)`：不区分 reader 和 writer 优先级，中庸之道，读写性能不是最优，但是可以避免饥饿问题

RWMutex 采取的就是写锁优先策略

