---
title: go map 原理与并发安全map
date: 2024-10-09 11:28:02
tags:
categories: go
---

### map 原理

go map 整体和 java hashmap 差不多， 只是源码阅读的位置不太方便

map 的相关文件位于 GOROOT 的 runtime 包中的 map.go

#### map 结构 

##### hmap

``` 
// A header for a Go map.
type hmap struct {
    // map中的键值对的数量
	count     int 		
    // 状态标志
	flags     uint8		
    // 记录桶个数的对数 即 buckets = 2^B，一个 map 中最多容纳 6.5 * 2 ^ B 个 key-value，6.5为装载因子
    // 将桶个数设置为 2 的幂的原因跟 Java 的 HashMap 一样，都是为了在查找的时候使用按位与操作来代替取余操作，加快速度
	B         uint8  	
    // 已经创建的 overflow 的个数，noverflow 可以理解为 num overflow，它用来判断 overflow 是否创建过多
	noverflow uint16 	
    // hash seed 哈希种子
	hash0     uint32 	

    // buckets 桶数组的指针，当count == 0时，可能为nil，一个 bmap 就是一个 bucket
	buckets    unsafe.Pointer 
    // 旧的 buckets 桶数组的指针，旧的 buckets 数组大小是新的 buckets 容量的 1/2
    // 非扩容状态下, 它为 nil. 它是判断是否处于扩容状态的标识
	oldbuckets unsafe.Pointer 
    // 扩容进度，也是 buckets 的迁移进度，小于 nevacuate 的 bucket 已经迁移完成
	nevacuate  uintptr        

    // 可选参数
	extra *mapextra 	
}
```

##### mapextra 

``` 
type mapextra struct {
    // 当 key 和 value 都不包含指针时，才可以使用 overflow
    // 溢出桶的指针地址
    // 存储桶数组溢出的元素，每个 bucket 最多存储 8 个 key-value，超出的元素会存储在 overflow 中
    // 如果 overflow 也溢出，那么新建一个 bucket bmap，串在 overflow 后面
    // （Java 的 HashMap 超过 8 个并且 len > 64 转换为红黑树）
	overflow    *[]*bmap
    // 旧溢出桶的指针地址
	oldoverflow *[]*bmap

    // 指向 overflow 中第一个可用（未满）的 bucket 的指针
	nextOverflow *bmap
}
```

##### bmap

在 map.go 中 bmap 结构比较简单:
``` 
// A bucket for a Go map.
type bmap struct {
	tophash [bucketCnt]uint8
}
```

不过在编译期间会动态的新建一个结构:
``` 
type bmap struct {
    // 记录 8 个位置中每个位置的状态
    tophash [8]uint8
    // 存储 8 个 key，这里限制了最多只能存储 8 个 key-value，key 落在哪个 bucket 是根据 key hash 值的高 8 位来决定的
    keys     [8]keytype
    // 存储 8 个 value，这里可以看出 key 和 value 是分开存储的，
    values   [8]valuetype
    // 指向链接该 bucket 的 mapextra 中的某个溢出桶的指针
    // 如果当前 bucket 的 keys 存储满 8 个后，那么会创建一个 overflow 来存储新插入的 key-value
    // 而 overflow 实际上也是一个 bmap，它的容量也为 8，内部也存在 overflow 指针，如果 overflow 满 8 个后，那么也会为该 overflow 创建 overflow
    overflow uintptr
    // padding 末尾内存填充，这里个人理解为指向的是开始填充的地址
    pad      uintptr
}
```

![](/images/go/bmap.png)

这里为什么 key 和 value 要分开存储， 主要是为了满足 go 的内存对齐规则(感兴趣的可以自行查阅)， key 和 key 之间， value 和 value 之间内存都是对齐的， 不需要单独的填充


##### bmap 中 tophash

tophash 是用来标识当前 bucket 中每个位置的状态的，其取值如下：
``` 
emptyRest      = 0 // this cell is empty, and there are no more non-empty cells at higher indexes or overflows.
emptyOne       = 1 // this cell is empty
evacuatedX     = 2 // key/elem is valid.  Entry has been evacuated to first half of larger table.
evacuatedY     = 3 // same as above, but evacuated to second half of larger table.
evacuatedEmpty = 4 // cell is empty, bucket is evacuated.
minTopHash     = 5 // minimum tophash for a normal filled cell. minTopHash 的意思就是最小的 hash 值，即要求所有的 hash 值不小于该值
```

当 `tophash[i] < minTopHash` 表示存储的是状态
当 `tophash[i] >= minTopHash` 表示存储的是当前 key 的 hash 值

- emptyRest: 表示当前位置以及后面的位置都是可用的，这里的后面包括后面链接的所有的 overflow 都是可用的
1. 判断 bmap 是否为空的时候，直接判断 tophash[0] 是否为 emptyRest
2. 2、查找的时候可以快速判断是否还需要遍历下去：当扫描到某个位置，如果 tophash[i] == emptyRest，那么就不需要再遍历下去

- emptyOne: 表示当前位置可用，后面位置是否可用处于未知状态
1. 当删除某个 key 时，会将该位置的 tophash 设置为 emptyOne，然后再往后扫描判断是否需要将状态修改为 emptyRest

- evacuatedX && evacuatedY: 这两个状态用于扩容
这两个状态用于扩容
map 的扩容有两种情况：等位迁移（size 不变）和 扩容迁移（size 翻倍）
1. 如果是等位迁移，那么原本在 X 位置的 key 迁移后仍然是在 X 位置，那么它的 tophash 为 evacuatedX
2. 如果是扩容迁移，那么一个 bucket 上 X 位置的 key 有可能被迁移到 X 位置，也可能被迁移到 Y 位置（Y = oldcap + X），如果迁移到 X 位置，那么 tophash = evacuatedX，如果迁移到 Y 位置，那么 tophash = evacuatedY

- evacuatedEmpty: 如果某个 bucket 迁移完成，那么 tophash[0] 置为 evacuatedEmpty


#### map 的查找

map 的 bucket 等结构都是存储内存地址指针，如何查找指定位置的 bucket？

需要知道的是在编译期间，编译器会进行一些操作，它会计算出 bucket、key、value 对应类型的占用内存大小，存储到变量 bucketSize、keySize、elemSize 中

##### bucket 的查找

假设我们要查找第 i 个 bucket，一般情况下我们是 `buckets[i]`，但是这里存储的是指针 `unsafe.Pointer`
它指向的是 buckets 的基地址，那么我们只需要计算第 i 个 bucket 的偏移量，然后加上这个基地址即可得到第 i 个 bucket 的内存地址指针:

`b := (*bmap)(unsafe.Pointer(uintptr(h.buckets) +  i*uintptr(t.bucketsize)))`

这里先将 bucketSize 转换成 uintptr 类型（uintptr 可以和任何整型类型相互转换），再将 unsafe.Pointer 类型的 buckets 转换为 uintptr
两者相加即可得到第 i 个 bucket 的 uinptr 内存地址，然后再转换为 unsafe.Pointer，再转换为 *bmap 即可得到第 i 个 bucket


##### key 的查找

原理同 bucket 的查找，不过 key 存储在 bmap 上，key-value 是分开存储的，因此 key 在内存中的结构为 `key1/key2/key3/...`
同样只需要计算出 tophash 的内存占用 + keys 基地址 即可，根据 bmap 的内存结构，keys 前面还存在 tophash[8]，因此 keys 的基地址是在 tophash 之后的，因此我们需要计算出 tophash 占用的内存大小，然后这之间可能由于内存对齐规则需要 padding
在 map 中使用了一个 dataOffset 字段来表示 tophash 的内存占用 + padding
因此 keys 的地址偏移量为 dataOffset，因此 第 i 个 key 的内存地址为 `uintptr(b) + dataOffset + i*(uintptr(t.keySize))`

###### value 的查找

value 查找跟 key 的查找类似，不过 value 前面需要先计算 tophash 和 keys 占用的内存大小，以此来得到 values 的基地址
tophash 占用内存大小为 dataOffset，一个 bucket 的 keys 数量 bucketCnt = 8，那么整个 keys 占用内存大小为 `bucketCnt*(uintptr(t.keySize))`

那么第 i 个 value 的内存地址为:`uintptr(b) + dataOffset + bucketCnt*(uintptr(t.keySize)) + i*(uintptr(t.elemSize))`


##### 整个 map 的查找过程

map 的查找函数为 mapaccess1() 和 mapaccess2()，两者的逻辑基本一致，只不过在返回值方面 mapaccess2 比 mapaccess1 多了一个 bool 类型，当找到 key 那么返回 true，没有找到返回 false

以 mapaccess1 的逻辑为例:

``` 
func mapaccess1(t *maptype, h *hmap, key unsafe.Pointer) unsafe.Pointer {
	// 省略一些条件检查代码
    
    // 计算 key 对应的 hash 值，计算过程中加入 hashseed，增加随机性，减少冲突以及避免外界根据 key 的 hash 值规律进行 hash 攻击
	hash := t.hasher(key, uintptr(h.hash0))
	
    // B 是桶个数的对数，那么桶的个数为 2 ^ B 个，这里是计算 hash 掩码，那么就是桶的个数-1
    // 比如 B = 5，那么 2 ^ B = 32，hash 掩码就是 32 - 1 = 31，这里是为了跟 hash 值进行按位与操作直接定位 bucket 位置，跟 HashMap 设计一致
	m := bucketMask(h.B)
    // 计算桶的索引位置， hash 值 和 m 进行按位与操作，这里的 add() 是计算得到 bucket 的内存地址，b 即为目标 bucket
	b := (*bmap)(add(h.buckets, (hash&m)*uintptr(t.bucketsize)))
    
    // 如果 oldbuckets != nil，那么表示 map 正在扩容
	if c := h.oldbuckets; c != nil {
        // 当前扩容不是同 size 的扩容（同 size 扩容即当前次扩容没有将桶数量翻倍，具体是什么操作看扩容代码）
		if !h.sameSizeGrow() {
            // 新 buckets 是 老 buckets 容量的两倍
            // 上面求的 m 是新 bucket 的 hash 掩码，这里是得到 old buckets 的 hash 掩码，因此右移 1 位，相当于除以 2
			m >>= 1
		}
        // 得到当前 key 在 old buckets 中的 bucket
		oldb := (*bmap)(add(c, (hash&m)*uintptr(t.bucketsize)))
        // 根据 tophash[0] 来判断是否已经迁移完成，如果还没有进行迁移，那么将 b 设置为 old bucket，从 old bucket 中查找
        // 具体代码看后面
		if !evacuated(oldb) {
			b = oldb
		}
	}
    // 得到 hash 高 8 位的值
	top := tophash(hash)
bucketloop:
    // 这里第一次扫描的 bucket 是正常的 bucket，当 bucket 8 个位置都没有找到对应的 key 时
    // 那么可能 key 存储在 overflow 中，那么从 overflow 中查找，直到 overflow 为空
	for ; b != nil; b = b.overflow(t) {
        // 扫描 b 的 8 个位置
		for i := uintptr(0); i < bucketCnt; i++ {
			if b.tophash[i] != top {
                // 当前位置的 tophash[i] 等于 emptyRest，表示当前位置以及后面的位置都可用，那么就不需要再往后扫描了
				if b.tophash[i] == emptyRest {
                    // 退出 bucketloop 标签下的循环，因为当前 bucket 未满，那么 key 就不可能存储在后面的 overflow
					break bucketloop
				}
                // hash 值不相同，找下一个
				continue
			}
            // hash 值相同，得到 i 对应的 key 的内存地址 k
			k := add(unsafe.Pointer(b), dataOffset+i*uintptr(t.keysize))
            // key 是以指针的形式保存的，那么解引用，得到真正的 key
			if t.indirectkey() {
				k = *((*unsafe.Pointer)(k))
			}
            // 判断 key 和 k 是否相同
			if t.key.equal(key, k) {
                // 得到 k 对应的 value 的内存地址
				e := add(unsafe.Pointer(b), dataOffset+bucketCnt*uintptr(t.keysize)+i*uintptr(t.elemsize))
                // value 是以指针的形式保存的，那么解引用，得到真正的 value
				if t.indirectelem() {
					e = *((*unsafe.Pointer)(e))
				}
                // 返回 value
				return e
			}
		}
	}
    // 没有找到对应的 key，返回 value 类型的零值（有人说是 key 类型的零值，但是该方法是获取 value 的，所以个人认为这里应该是返回 value 类型的零值）
	return unsafe.Pointer(&zeroVal[0])
}
```


#### hash 冲突与 loadfactor(装载因子)

常用的哈希冲突的解决方法：链地址法和开放地址法

golang 的 map 和 Java 的 HashMap 使用的都是链地址法(拉链法): 假设第一个 key 定位到 buckets[0]，此时存储在 buckets[0] 的第一个位置，此时内部第二个 key 也定位到 buckets[0]，那么由于 buckets[0] 的第一个位置已经存储了 key 了，那么它需要往后扫描直到找到一个不被占用的位置，然后存储进去，往后的 key 类推

不过 Java 的 HashMap 使用的是 `数组 + 链表 + 红黑树` 的解决方法， golang map 使用的是 `数组 + 数组`的解决方法（overflow 这个设计不知道算不算链表）

上面在讲 map 结构的时候说了：一个 map 中最多容纳 6.5 * 2 ^ B 个 key-value， **6.5 为装载因子**

Java HashMap 的装载因子为 0.75

装载因子越大，那么 map 能存储的 key-value 就越多，也就是说每个 bucket 能够存储的元素就越多，空间利用率就越大，不过发生哈希冲突的概率就越大，并且如果所有 key 都存储在一个 bucket 里，那么就退化成了链表，查询效率 O(n)

装载因子越小，那么 map 能存储的 key-value 就越少，也就是说每个 bucket 能够存储的元素就越少，发生哈希冲突的概率就越小，最优情况是每个 bucket 都只存储一个 key，这样查询就是 O(1)，但空间也会浪费很多，同时由于能够添加的 key-value 个数少，那么容易导致频繁扩容

因此，装载因子是用来平衡空间利用率和查找效率的


#### 插入逻辑

``` 
func mapassign(t *maptype, h *hmap, key unsafe.Pointer) unsafe.Pointer {
	// 省略一些检查条件 
    
    
    // 计算 hash 值
	hash := t.hasher(key, uintptr(h.hash0))

    // 设置写入标志位， 这样调用 t.haser 就会panic， 阻止并发写入
	h.flags ^= hashWriting

    // 如果 buckets 为空，那么创建包含一个 bucket 的 buckets
	if h.buckets == nil {
		h.buckets = newobject(t.bucket) // newarray(t.bucket, 1)
	}

    
// again 标签(配合 goto 语法使用)
again:
    // 计算得到 key 对应的 bucket 索引位置，可以理解为 bucketIdx，相当于上面"查找"代码中的 h&m
	bucket := hash & bucketMask(h.B)
    // 根据 oldbuckets 判断是否正在扩容
	if h.growing() {
        // 协助扩容（类似 Java 的 ConcurrentHashMap）
		growWork(t, h, bucket)
	}
    // 根据 bucketIdx 得到 bucket
    // bucketsize 是在编译时器就计算好了的，keySize、elemSize 同理
	b := (*bmap)(unsafe.Pointer(uintptr(h.buckets) + bucket*uintptr(t.bucketsize)))
    // 得到 hash 值的高 8 位值
	top := tophash(hash)

    // 作为标识，
	var inserti *uint8
    // key 将要插入的 bucket 中的 keys 的位置的内存地址，这里存储扫描 bucket 的时候遇到的第一个空位置，因为插入的时候要尽量往前空位插
	var insertk unsafe.Pointer
    // value 将要插入或者更新后的 bucket 中的 values 的位置的内存地址
    // 这里不一定是第一个空位，因为如果 key 存在的话，那么就是更新 key，那么此时的 value 存储的位置就不是第一个空位了
	var elem unsafe.Pointer
bucketloop:
	for {
		for i := uintptr(0); i < bucketCnt; i++ {
            // 1、插入的 key 跟当前位置的 key 的 hash 值不同
			if b.tophash[i] != top {
                // 如果当前位置 tophash[i] == emptyRest || tophash[i] == emptyOne，并且前面没有
				if isEmpty(b.tophash[i]) && inserti == nil {
                    // 得到 key 和 value 将要插入的位置的内存地址
                    // key = 1, e = empty
                    // bucket 元素分布可能存在以下情况：
                    // [2, 3, e, e, 1, 5, 6, e]
                    // 扫描到 2 和 3 都与 key = 1 不相等，跳过，遇到 e，那么按常理 key 插入的话应该是在这里插入，因为插入尽量靠前
                    // 所以当第一次遇到 e 的时候，这里使用 inserti、insertk、elem 来记录 tophash、e 的内存地址、e 对应插入 value 的内存地址
                    // 记录完成后不会直接退出，会继续往后扫描，因为后面可能存在 key = 1 的情况，比如上面这种情况就是存在的，那么表示 key = 1 在之前已经插入过了，那么这里就不再需要重新插入了，那么
					inserti = &b.tophash[i]
                    // 根据 bmap 的变量分布，从前往后的排序位 tophash -> keys -> values，所以要拿到 keys 的基地址需要先跳过 tophash
                    // 这里的 dataOffset 就是 tophash[8] 占用的内存 + padding，也就是 keys 的基地址
					insertk = add(unsafe.Pointer(b), dataOffset+i*uintptr(t.keysize))
					elem = add(unsafe.Pointer(b), dataOffset+bucketCnt*uintptr(t.keysize)+i*uintptr(t.elemsize))
				}
                // 当前 bucket 存在可用位置，那么相当于找到一个可用的 bucket，那么退出 bucketloop 下的循环
				if b.tophash[i] == emptyRest {
					break bucketloop
				}
                // 单纯 hash 值不同，继续找下一个位置
				continue
			}
            // 2、插入的 key 跟当前位置的 key 的 hash 值相同，那么计算 当前位置 key 的内存地址
			k := add(unsafe.Pointer(b), dataOffset+i*uintptr(t.keysize))
            // 如果 key 是使用指针封装，那么解引用
			if t.indirectkey() {
				k = *((*unsafe.Pointer)(k))
			}
            // 判断 key 和 k 是否相同，如果不同那么单纯只是 hash 冲突，那么查找下一个
			if !t.key.equal(key, k) {
				continue
			}
            // k.hash == key.hash && key.equals(k)，表示 map 已经存在 key 的映射了，那么更新 key 对应的 value
			if t.needkeyupdate() {
				typedmemmove(t.key, k, key)
			}
            // 获取要插入/更新 key 对应 value 的内存地址（用于后续 return）
			elem = add(unsafe.Pointer(b), dataOffset+bucketCnt*uintptr(t.keysize)+i*uintptr(t.elemsize))
            // 顺利完成插入/更新，跳转到 done 标签
			goto done
		}
        // 当前 bucket 没有找到对应的 key，那么到 overflow 中找
		ovf := b.overflow(t)
        // 如果 overflow == nil，那么退出循环
		if ovf == nil {
			break
		}
        // 将 b 设置为 overflow
		b = ovf
	}
    
    // 在已有的 bucket 和 overflow 中没有找到对应的 key 并且所有的桶都已经满了，那么会触发以下两种情况：

    // 情况一：
	// 当前没有在扩容并且 key-value 个数超过了装载因子*桶个数，或者 存在太多的 overflow，那么进行扩容条件设置（注意并不执行扩容逻辑）
    // 扩容设置完成后会重新进行查找
	if !h.growing() && (overLoadFactor(h.count+1, h.B) || tooManyOverflowBuckets(h.noverflow, h.B)) {
		hashGrow(t, h)
        // 重新进行查找
		goto again // Growing the table invalidates everything, so try again
	}

    // 情况二：
    // 不需要扩容，并且 inserti == nil，表示 bucket 和 overflow 都已经满了，那么这里创建一个新的 overflow 来存放 key
	if inserti == nil {
        // 创建一个新的 overflow
		newb := h.newoverflow(t, b)
		inserti = &newb.tophash[0]
        // 插入的 key 位置为索引位置为 0 的 key
		insertk = add(unsafe.Pointer(newb), dataOffset)
		// value 同理
        elem = add(insertk, bucketCnt*uintptr(t.keysize))
	}
	
    // 下面都是插入逻辑了
	if t.indirectkey() {
		kmem := newobject(t.key)
		*(*unsafe.Pointer)(insertk) = kmem
		insertk = kmem
	}
	if t.indirectelem() {
		vmem := newobject(t.elem)
		*(*unsafe.Pointer)(elem) = vmem
	}
	typedmemmove(t.key, insertk, key)
	*inserti = top
    // 元素个数+1
	h.count++

done:
    // 到这里是已经插入/更新完成了，elem 是 value 插入/更新的内存地址，这里判断 value 是否是指针封装，如果是那么引用，然后 return
	if t.indirectelem() {
		elem = *((*unsafe.Pointer)(elem))
	}
	return elem
}
```

看一些细的方法

overLoadFactor() 判断元素个数是否超过负载:
``` 
// 
func overLoadFactor(count int, B uint8) bool {
    // bucketCnt = 8，表示一个 bucket 能够存储的元素个数
    // loadFactorNum = 13, loadFactorDen = 2，loadFactorNum / loadFactorDen = 13 / 2 = 6.5，即装载因子
    // bucketShift(B) 返回的是 1 << B，即最大的桶的个数，6.5 * (1 << B) 是能够存储的最大的元素个数，超过这个数那么会进行扩容（跟 HashMap 一致）
    // count 为 map 存储的元素个数
    // 这里返回 true 的情况为 count > 8 并且 count > 6.5 * (1 << B)
	return count > bucketCnt && uintptr(count) > loadFactorNum*(bucketShift(B)/loadFactorDen)
}
```

tooManyOverflowBuckets() 判断是否存在太多的 overflow:
``` 
func tooManyOverflowBuckets(noverflow uint16, B uint8) bool {
	if B > 15 {
		B = 15
	}
    // noverflow 是 overflow 的个数
    // 由于上面已经限制了 B ∈ [1, 15]，那么这里 B&15 = B，那么 uint16(1)<<(B&15) = 1 << B，实际上就是桶的最大个数
    // B&15 既然永远等于 B，那么为什么还要这么写呢？ 个人认为它是为了处理 B < 0 的情况，当 B == -1 时，B&15 = 15, B == -2 时，B&15 = 14
    // 这里返回 true 的情况为 noverflow 超过了 桶的最大个数（可以理解为 overflow 最大个数与 bucket 是相同的，超过了那么就认为太多了）
	return noverflow >= uint16(1)<<(B&15)
}
```

在 buckets 和 overflow 都没有找到， 会进行扩容的判断， hashGrow() 并不会真正执行扩容逻辑，而是单纯把扩容所需的一些条件给设置好：
1. 将 buckets 赋值为 oldbuckets，创建一个新的 buckets，将新的 buckets 赋值给 buckets
2. 将 overflow 赋值给 oldoverflow，然后 overflow 置 nil，oldoverflow 里面的元素在扩容迁移的时候会迁移到新的 buckets 里，所以无需担心

hashGrow() 设置完扩容条件后就直接返回了，当 **插入、删除或查询** 的时候发现 `oldbuckets != nil`，那么就会进行协助扩容

`hashGrow` 设置扩容条件:
``` 
func hashGrow(t *maptype, h *hmap) {
	// If we've hit the load factor, get bigger.
	// Otherwise, there are too many overflow buckets,
	// so keep the same number of buckets and "grow" laterally.
    
    // 判断是等量扩容还是增量扩容
    // 首先 bigger = 1，如果是增量扩容，那么 B + bigger = B + 1，相当于容量翻倍
    // !overLoadFactor() 成立，那么表示进入到该方法不是因为 count 过多超过了装载因子的界限，而是因为 overflow 太多，那么设置为等量扩容，bigger = 0
	bigger := uint8(1)
	if !overLoadFactor(h.count+1, h.B) {
		bigger = 0
        // 标识当前扩容为等量扩容
		h.flags |= sameSizeGrow
	}
    // 将当前 buckets 赋值给 oldbuckets（oldbuckets != nil 表示当前正在扩容）
	oldbuckets := h.buckets
    // 重新创建一个新的 buckets 作为 newbuckets
	newbuckets, nextOverflow := makeBucketArray(t, h.B+bigger, nil)

	flags := h.flags &^ (iterator | oldIterator)
	if h.flags&iterator != 0 {
		flags |= oldIterator
	}
	// commit the grow (atomic wrt gc)
    // 更新 B
	h.B += bigger
	h.flags = flags
    // 设置 oldbuckets
	h.oldbuckets = oldbuckets
    // 更新 buckets 为新的 buckets
	h.buckets = newbuckets
    // 设置下一个待迁移的 bucket 索引（索引位置小于该值的 bucket 都已经迁移完成）
	h.nevacuate = 0
    // 设置 overflow 数量为 0
	h.noverflow = 0

	if h.extra != nil && h.extra.overflow != nil {
		// Promote current overflow buckets to the old generation.
		if h.extra.oldoverflow != nil {
			throw("oldoverflow is not nil")
		}
        // 将当前 map 的 overflow 列表赋值给 oldoverflow，在扩容的时候会将 oldoverflow 中的元素迁移到新 buckets
        // 这里也可以看出将 overflow 单独提出来作为一个集合是为了这里方便统一处理
		h.extra.oldoverflow = h.extra.overflow
        // 将 overflow 设置为 nil，在后续的时候再重新创建
		h.extra.overflow = nil
	}
	if nextOverflow != nil {
		if h.extra == nil {
			h.extra = new(mapextra)
		}
		h.extra.nextOverflow = nextOverflow
	}

	// the actual copying of the hash table data is done incrementally
	// by growWork() and evacuate().
}
```

#### map 的遍历

map 的遍历是无序的，这是 golang 开发者故意为之

由于 map 扩容的时候会可能会改变元素的存储位置，因此如果按照正常顺序遍历的话可能会发生第一次遍历跟第二次遍历得到的结果顺序不一致的情况

因此为了避免产生用户的代码逻辑依赖某一次遍历的结果顺序，又因为扩容改变了结果顺序而导致代码错误的问题，golang 开发者直接在遍历的时候加入随机性，使得每次遍历得到的结果都是无序的

map 遍历初始函数 `mapiterinit()`

它会先生成一个随机数，该随机数决定了从哪个 bucket 以及 从 bucket 的哪个位置开始遍历，达到一个随机性的效果

当某个 bucket 遍历完成后，会继续遍历它的 overflow:
``` 
func mapiterinit(t *maptype, h *hmap, it *hiter) {

    // 删除部分条件判断代码
    
	it.t = t
	it.h = h

	it.B = h.B
	it.buckets = h.buckets

    // 生成随机数 r
	r := uintptr(fastrand())
	if h.B > 31-bucketCntBits {
		r += uintptr(fastrand()) << 31
	}
    // 决定从哪个 bucket 开始遍历
	it.startBucket = r & bucketMask(h.B)
    // 决定从 bucket 哪个位置开始遍历（比如 offset = 5，那么往后所有的 bucket 都会从第 5 个位置开始遍历）
	it.offset = uint8(r >> h.B & (bucketCnt - 1))

	it.bucket = it.startBucket

	if old := h.flags; old&(iterator|oldIterator) != iterator|oldIterator {
		atomic.Or8(&h.flags, iterator|oldIterator)
	}

	mapiternext(it)
}
```

### 并发安全 sync.map

map 本身是不支持并发写的， map 写的时候就会置一个 `hashWriting`  标志位， 并且会进行判断， 如果已经是在写的状态就会 panic:
``` 
// 写的时候置标志位
// Set hashWriting after calling t.hasher, since t.hasher may panic,
// in which case we have not actually done a write.
h.flags ^= hashWriting


// 读写都会判断标志位
if h.flags&hashWriting != 0 {
    fatal("concurrent map read and map write")
}
```

官方还提供了并发安全的 `sync.map` 来应对并发场景

#### 数据结构

``` 
type Map struct {
    // 加锁作用，保护 dirty 字段
    mu Mutex
    // 只读的数据，实际数据类型为 readOnly
    read atomic.Pointer[readOnly]
    // 最新写入的数据
    dirty map[interface{}]*entry
    // 计数器，每次需要读 dirty 则 +1
    misses int
}


// readonly 结构
type readOnly struct {
    // 内建 map
    m  map[interface{}]*entry
    // 表示 dirty 里存在 read 里没有的 key，通过该字段决定是否加锁读 dirty
    amended bool
}

// 存储值的 entry 
type entry struct {
    // 就是包装了一下 unsafe.Pointer
	p atomic.Pointer[any]
}
```

这里 entry 的 p 有三种状态:
1. `p == nil`: 键值已经被删除，且 `m.dirty == nil`
2. `p == expunged`: 键值已经被删除，但 `m.dirty!=nil` 且 m.dirty 不存在该键值（expunged 实际是空接口指针）
3. 除以上情况，则键值对存在，存在于 m.read.m 中，如果 m.dirty!=nil 则也存在于 m.dirty


#### 操作源码

load 过程:
``` 

func (m *Map) Load(key interface{}) (value interface{}, ok bool) {
    // 首先尝试从 read 中读取 readOnly 对象
    read, _ := m.read.Load().(readOnly)
    e, ok := read.m[key]

    // 如果不存在则尝试从 dirty 中获取
    if !ok && read.amended {
        m.mu.Lock()
        // 由于上面 read 获取没有加锁，为了安全再检查一次
        read, _ = m.read.Load().(readOnly)
        e, ok = read.m[key]

        // 确实不存在则从 dirty 获取
        if !ok && read.amended {
            e, ok = m.dirty[key]
            // 调用 miss 的逻辑
            m.missLocked()
        }
        m.mu.Unlock()
    }

    if !ok {
        return nil, false
    }
    // 从 entry.p 读取值
    return e.load()
}

func (m *Map) missLocked() {
    m.misses++
    // 如果小于 dirty 的数量直接返回
    if m.misses < len(m.dirty) {
        return
    }
    // 当 miss 积累过多，会将 dirty 存入 read，然后 将 amended = false，且 m.dirty = nil
    m.read.Store(readOnly{m: m.dirty})
    m.dirty = nil
    m.misses = 0
}
```


store 过程:
``` 
func (m *Map) Store(key, value any) {
	_, _ = m.Swap(key, value)
}

func (m *Map) Swap(key, value any) (previous any, loaded bool) {
	read := m.loadReadOnly()
	// 如果 read 里面存在， 则尝试更新 entry
	if e, ok := read.m[key]; ok {
		if v, ok := e.trySwap(&value); ok {
			if v == nil {
				return nil, false
			}
			return *v, true
		}
	}
    
    // 如果上一步更新 entry 没成功
	m.mu.Lock()
	read = m.loadReadOnly()
	// 从 read 读取一遍
	if e, ok := read.m[key]; ok {
	    // case 1: 如果 read 存在
		if e.unexpungeLocked() {
			// The entry was previously expunged, which implies that there is a
			// non-nil dirty map and this entry is not in it.
			// 如果 p 是 expunged, 则需要先将 entry 赋值给 dirty（因为 expunged 数据不会留在 dirty）
			m.dirty[key] = e
		}
		// 更新 entry
		if v := e.swapLocked(&value); v != nil {
			loaded = true
			previous = *v
		}
	} else if e, ok := m.dirty[key]; ok {
	    // case 2: read 里面不存在， 但是 dirty 存在， 则用值更新 entry
		if v := e.swapLocked(&value); v != nil {
			loaded = true
			previous = *v
		}
	} else {
	    // 如果 read 和 dirty 都不存在
		if !read.amended {
			// We're adding the first new key to the dirty map.
			// Make sure it is allocated and mark the read-only map as incomplete.
			// 如果 amended 为 false ， 则调用 dirtyLocked 将 read 拷贝到 dirty（除了被标记删除的数据）
			m.dirtyLocked()
			// 然后将 amended 改为 true
			m.read.Store(&readOnly{m: read.m, amended: true})
		}
		// 将新的值写入 dirty
		m.dirty[key] = newEntry(value)
	}
	m.mu.Unlock()
	return previous, loaded
}

```