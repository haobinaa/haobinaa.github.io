---
title: 深入理解 go interface
date: 2023-07-11 19:22:17
tags: interface
categories: go
---


### interface 是什么

在 go 里面通过 interface 实现了泛型、多态等面相对象特性， 那么在 go 的 interface 到底是什么


省略掉繁琐的编译过程(暂时对go tool 生成的汇编代码看的不是很懂)， 拿出结论:
1. 空接口 `interface{}` 底层结构是 `eface`
2. 具体的 interface 类型底层结构是 `iface`


#### iface 和 eface

上面得到的结论在强调一下:
iface 和 eface 都是 Go 中描述接口的底层结构体，区别在于 iface 描述的接口包含方法，而 eface 则是不包含任何方法的空接口：interface{}。

先看看 iface 的源码:
``` 
type iface struct {
    tab  *itab
    data unsafe.Pointer
}

type itab struct {
    inter  *interfacetype
    _type  *_type
    link   *itab
    hash   uint32 // copy of _type.hash. Used for type switches.
    bad    bool   // type does not implement interface
    inhash bool   // has this itab been added to hash?
    unused [2]byte
    fun    [1]uintptr // variable sized
}

type interfacetype struct {
    typ     _type
    pkgpath name
    mhdr    []imethod
}

type _type struct {
    // 类型大小
    size       uintptr
    ptrdata    uintptr
    // 类型的 hash 值
    hash       uint32
    // 类型的 flag，和反射相关
    tflag      tflag
    // 内存对齐相关
    align      uint8
    fieldalign uint8
    // 类型的编号，有bool, slice, struct 等等等等
    kind       uint8
    alg        *typeAlg
    // gc 相关
    gcdata    *byte
    str       nameOff
    ptrToThis typeOff
}
```

iface 内部维护了两指针：
- `tab` 指向了 `itab` 指针， 代表接口的类型以及赋给这个接口的实体类型
  - `itab` 内部 `_type` 是一个 `_type` 类型的指针， 描述了实体类型， 包括内存对齐方式，大小等
  - `inter` 为 `interfacetype`类型指针，它包装了 _type 类型，_type 实际上是描述 Go 语言中各种数据类型的结构体。我们注意到，这里还包含一个 mhdr 字段，表示接口所定义的函数列表， pkgpath 记录定义了接口的包名。 描述了接口的类型.
  - `fun` 字段放置和接口方法对应的具体数据类型的方法地址，实现接口调用方法的动态分派，一般在每次给接口赋值发生转换时会更新此表，或者直接拿缓存的 itab。 这里需要注意的是 `fun` 是一个长度为1的数组， 可能会疑惑接口定义了多个方法可怎么办？实际上，这里存储的是第一个方法的函数指针，如果有更多的方法，在它之后的内存空间里继续存储。从汇编角度来看，通过增加地址就能获取到这些函数指针
- `data` 则指向接口具体的值，一般而言是一个指向堆内存的指针。


接着对比一下 `eface` 源码:

``` 
type eface struct {
    _type *_type
    data  unsafe.Pointer
}
```

可以看出 `eface`  相较之下就比较简单了。只维护了一个 `_type` 字段，表示空接口所承载的具体的实体类型（`iface` 的 itab 不仅存储了接口的实体类型， 还通过 `inter` 和 `fun` 两个字段存储了接口的类型以及接口对应方法的地址), data 描述了具体的值。




### interface 实战

#### 值接收者和指针接收者区别

方法可以为用户自定义 struct 增加新的行为， 与函数的区别在于方法有一个接收者， 接收者可以是值接收者，也可以是指针接收者。

在调用方法的时候，值类型既可以调用值接收者的方法，也可以调用指针接收者的方法；指针类型既可以调用指针接收者的方法，也可以调用值接收者的方法。 
也就是说，不管方法的接收者是什么类型，该类型的值和指针都可以调用，不必严格符合接收者的类型。
eg:
``` 
type person interface {
	get() string
	set(value string)
}

type Man struct {
	name string
}

func (m Man) get() string {
	return m.name
}

func (m *Man) set(value string) {
	m.name = value
}

func ValueAndPointers() {
	// 值类型
	vMan := Man{name: "zhangsan"}
	// 值类型 调用接收者也是值类型的方法
	fmt.Println(vMan.get())
	// 值类型 调用接收者是指针类型的方法
	vMan.set("docker")

	// 指针类型
	pMan := &Man{name: "lisi"}
	// 指针类型 调用接收者是值类型的方法
	fmt.Println(pMan.get())
	// 指针类型 调用接收者也是指针类型的方法
	pMan.set("worker")
}
```

我们可以看到无论接收者和结构体类型是值类型还是指针类型， 都可以互相调用。
**在结构体嗲用中, 当调用者类型和方法的接收者类型不同时**, 这里其实是编译器在背后做了一些工作，实现了语法糖的效果, 用一个表格来呈现：

| | 值接收者 | 指针接收者 |
| :-- | :------ | :----------- |
| 值类型调用者 | 方法会使用调用者的一个副本，类似于“传值” | 使用值的引用来调用方法，上例中，`vMan.set("docker")` 实际上是 `&vMan.set("docker")` |
| 指针类型调用者 |  指针被解引用为值，上例中，`pMan.get()` 实际上是 `(*pMan).get()` |  实际上也是“传值”，方法里的操作会影响到调用者，类似于指针传参，拷贝了一份指针 |


那么值类型接收者和指针类型的接收者区别是什么呢? 结论: 
> 实现了接收者是值类型的方法，相当于自动实现了接收者是指针类型的方法；而实现了接收者是指针类型的方法，不会自动生成对应接收者是值类型的方法.

接着上面代码做一个例子:
``` 
func ValueAndPointersDiff() {
	var docker person = &Man{name: "zhangsan"}
	docker.get()
	docker.set("docker")
	fmt.Println(docker.get())
}
```

`get() 方法` 是值类型接收者， `set() 方法` 是指针类型接收者, 通过 **接口变量** `person`  可以成功调用 `get` 和 `set`， 如果将第一行定义改一下呢?

``` 
func ValueAndPointersDiff() {
	//var docker person = &Man{name: "zhangsan"}
	var docker person = Man{name: "zhangsan"}
	docker.get()
	docker.set("docker")
	fmt.Println(docker.get())
}

===== 报错如下:
cannot use Man{…} (value of type Man) as person value in variable declaration: Man does not implement person (method set has pointer receiver)
```

报错 Man 没有实现 person。 而两者的区别则是第一次将 `&Man` 赋给了 `docker`， 第二次将 `Man` 赋给了 `docker`。 这也能验证我们上面说的那个结论: 虽然 `*Man` 没有实现 `get` 方法， 但是
`Man` 实现了 `get`， 就让 `*Man` 自动拥有了 `get 方法`

这种设计有一个简单的解释:
> 接收者是指针类型的方法，很可能在方法中会对接收者的属性进行更改操作，从而影响接收者；而对于接收者是值类型的方法，在方法中不会对接收者本身产生影响。

 所以，当实现了一个接收者是值类型的方法，就可以自动生成一个接收者是对应指针类型的方法，因为两者都不会影响接收者。但是，当实现了一个接收者是指针类型的方法，如果此时自动生成一个接收者是值类型的方法，原本期望对接收者的改变（通过指针实现），现在无法实现，因为值类型会产生一个拷贝，不会真正影响调用者。

再次申明一下结论:
> 如果实现了接收者是值类型的方法，会隐含地也实现了接收者是指针类型的方法。

####  接口的动态类型和动态值

从源码里可以看到：`iface` 包含两个字段：`tab` 是接口表指针，指向类型信息；`data` 是数据指针，则指向具体的数据。
它们分别被称为动态类型和动态值。而接口值包括动态类型和动态值。


##### 接口类型和 nil 作比较

> 接口值的零值是指动态类型和动态值都为 nil。当仅且当这两部分的值都为 nil 的情况下，这个接口值就才会被认为 接口值 == nil。

看两个例子:

``` 
pacage main

type Coder interface {
	code()
}

type Gopher struct {
	name string
}

func (g Gopher) code() {
	fmt.Printf("%s is coding\n", g.name)
}

func main() {
	var c Coder
	fmt.Println(c == nil)
	fmt.Printf("c: %T, %v\n", c, c)

	var g *Gopher
	fmt.Println(g == nil)

	c = g
	fmt.Println(c == nil)
	fmt.Printf("c: %T, %v\n", c, c)
}
========= 输出
true
c: <nil>, <nil>
true
false
c: *main.Gopher, <nil>
```
一开始，c 的 动态类型和动态值都为 `nil`，g 也为 `nil`
当把 g 赋值给 c 后，c 的动态类型变成了 `*main.Gopher`，尽管 c 的动态值仍为 nil，但是当 c 和 nil 作比较的时候，结果就是 false 了。



``` 
type MyError struct{}

func (i MyError) Error() string {
	return "MyError"
}

func Process() error {
	var err *MyError = nil
	// 隐式将 *MyError 转为 error 接口， 所以动态值是 *MyError
	return err
}

func main() {
	err := Process()
	fmt.Println(err)
	fmt.Println(err == nil)
}

====== 输出
<nil>
false
```

这里先定义了一个 `MyError` 结构体，实现了 `Error` 函数，也就实现了 `error` 接口。
Process 函数返回了一个 error 接口，这块隐含了类型转换。所以，虽然它的值是 nil，其实它的类型是 `*MyError`，最后和 nil 比较的时候，结果为 false

##### 如何打印出接口的动态类型和值？

``` 
type iface struct {
	itab, data uintptr
}

func main() {
    // a 的动态类型和动态值都是 nil
	var a interface{} = nil

    // b 的动态类型是 *int 动态值是 nil
	var b interface{} = (*int)(nil)

	x := 5
	// c 的动态类型是 *int 动态值是 5
	var c interface{} = (*int)(&x)
	
	ia := *(*iface)(unsafe.Pointer(&a))
	ib := *(*iface)(unsafe.Pointer(&b))
	ic := *(*iface)(unsafe.Pointer(&c))

	fmt.Println(ia, ib, ic)

	fmt.Println(*(*int)(unsafe.Pointer(ic.data)))
}

========== 输出
{0 0} {18537184 0} {18537184 824634814120}
5
```

这里先介绍两个知识点:
- `unsafe.Pointer`: 可以用来将任何类型的指针转换为其他类型的指针，或将其他类型的指针转换回原类型的指针。
如以下例子:
``` 
var f float64 = 3.14159
  // 将 float64 类型的指针 (&f) 转换为 unsafe.Pointer 类型，然后再转换为 int64 类型的指针。
  // 间接引用 int64 类型指针，访问对应的 int64 值。
  i := *(*int64)(unsafe.Pointer(&f))
  fmt.Println("int64 value of float64:", i) 
```
- `uintptr`: 是能存储指针的整型， 一个`unsafe.Pointer`指针也可以被转化为`uintptr`类型，然后保存到指针型数值变量中（注：这只是和当前指针相同的一个数字值，并不是一个指针），然后用以做必要的指针数值运算。


然后理解上面的代码: 代码里直接定义了一个 iface 结构体，用两个指针来描述 `itab`和 `data`(a 的类型是 eface， 实际上结构体也是两个变量所以完全可以用自己定义的 iface 结构体来接收)
然后将 a, b, c 在内存中的内容强制解释成我们自定义的 iface。最后就可以打印出动态类型和动态值的地址：
- a 的动态类型和动态值都是 nil
- b 的动态类型是 *int 动态值是 nil
- c 的动态类型是 *int 动态值是 5


#### 编译器自动检测是否实现接口

go 提供了类型断言语法， 将接口转为具体的类型:
``` 
// 类型断言， 如果无法转换将产生 panic
t := i.(T)
// 安全断言， 如果转换失败 ok 为 false
t, ok := i.(T)
```


我们可以使用下面语法来检测类型是否实现了接口:
``` 
// 检查 *myWriter 类型是否实现了 io.Writer 接口
var _ io.Writer = (*myWriter)(nil)
 // 检查 myWriter 类型是否实现了 io.Writer 接口
var _ io.Writer = myWriter{}
```

#### 类型转换和断言的区别

Go 语言中不允许隐式类型转换，也就是说 `=` 两边，不允许出现类型不相同的变量。

对于类型转换的场景， 转换前后的两个类型要相互兼容才行。类型转换的语法为：
> <结果类型> := <目标类型> ( <表达式> )

如 int 和 float 是互相兼容的， 就可以如下转换:
``` 
var i int = 9

var f float64
// 将 int 转为 float
f = float64(i)
```

在上一小节介绍了类型断言的使用， 这里强调一下类型断言最好使用安全断言的语法(否则类型断言失败会产生 panic)， 即:
> s, ok := x.(T); 

类型断言还有一种形式， 即 switch 判断接口类型， case 会顺序的执行， 当命中一个 case 时，就会执行 case 中的语句，因此 case 语句的顺序是很重要的，因为很有可能会有多个 case 匹配的情况
``` 
func classifier(items ...interface{}) {
    for i, x := range items {
        switch x.(type) {
        case bool:
            fmt.Printf("Param #%d is a bool\n", i)
        case float64:
            fmt.Printf("Param #%d is a float64\n", i)
        case int, int64:
            fmt.Printf("Param #%d is a int\n", i)
        case nil:
            fmt.Printf("Param #%d is a nil\n", i)
        case string:
            fmt.Printf("Param #%d is a string\n", i)
        default:
            fmt.Printf("Param #%d is unknown\n", i)
        }
    }
}
```

#### 接口转换原理

先看一段示例代码:
``` 
type coder interface {
	code()
	run()
}

type runner interface {
	run()
}

type Gopher struct {
	language string
}

func (g Gopher) code() {
	return
}

func (g Gopher) run() {
	return
}

func main() {
	var c coder = Gopher{}

	var r runner
	r = c
	fmt.Println(c, r)
}
```

上面定义了两个 interface: `coder` 和 `runner`。定义了一个实体类型 `Gopher`，类型 `Gopher` 实现了 run() 和 code() 两个方法。
main 函数里定义了一个接口变量 c，绑定了一个 Gopher 对象，之后将 c 赋值给另外一个接口变量 r 。
赋值成功的原因是 c 中包含 run() 方法。这样，两个接口变量完成了转换

从  `iface` 的源码可以看到，实际上它包含接口的类型 `interfacetype` 和 实体类型的类型 `_type`，这两者都是 `iface` 的字段 `itab` 的成员。
也就是说生成一个 `itab` 同时需要接口的类型和实体的类型。
> <interface 类型， 实体类型> ->itable

[//]: # ()

当判定一种类型是否满足某个接口时，Go 使用类型的方法集和接口所需要的方法集进行匹配，如果类型的方法集完全包含接口的方法集，则可认为该类型实现了该接口。

通过汇编查看接口转换实际上是调用了 `runtime.convI2I(SB)` (可以通过 go tool compile -S 编译， 汇编代码有些晦涩， 可以简单猜一下)， `convI2I` 从名称上来看就是将一个 interface 转换成另一个interface， 看下源码:
``` 
//  inter 表示接口类型，i 表示绑定了实体类型的接口，r 则表示接口转换了之后的新的 iface。
func convI2I(inter *interfacetype, i iface) (r iface) {
	tab := i.tab
	if tab == nil {
		return
	}
	// 两个类型相等， 返回的 r 直接取 i 的 tab 信息
	if tab.inter == inter {
		r.tab = tab
		r.data = i.data
		return
	}
	r.tab = getitab(inter, tab._type, false)
	r.data = i.data
	return
}


unc getitab(inter *interfacetype, typ *_type, canfail bool) *itab {
	// ……

    // 根据 inter, typ 计算出 hash 值
	h := itabhash(inter, typ)

	// look twice - once without lock, once with.
	// common case will be no lock contention.
	var m *itab
	var locked int
	for locked = 0; locked < 2; locked++ {
		if locked != 0 {
			lock(&ifaceLock)
        }
        
        // 遍历哈希表的一个 slot
		for m = (*itab)(atomic.Loadp(unsafe.Pointer(&hash[h]))); m != nil; m = m.link {

            // 如果在 hash 表中已经找到了 itab（inter 和 typ 指针都相同）
			if m.inter == inter && m._type == typ {
                // ……
                
				if locked != 0 {
					unlock(&ifaceLock)
				}
				return m
			}
		}
	}

    // 在 hash 表中没有找到 itab，那么新生成一个 itab
	m = (*itab)(persistentalloc(unsafe.Sizeof(itab{})+uintptr(len(inter.mhdr)-1)*sys.PtrSize, 0, &memstats.other_sys))
	m.inter = inter
    m._type = typ
    
    // 添加到全局的 hash 表中
	additab(m, true, canfail)
	unlock(&ifaceLock)
	if m.bad {
		return nil
	}
	return m
}
```

`convI2I` 将一个绑定了实体类的接口转为另一个接口， 核心主要在 `getitab`：
1. 根据`interfacetype`(接口类型) 和 `_type`(实体类型)计算出的 hash 去全局的 itab 哈希表中查找，如果能找到，则直接返回
2. 没找到则会根据给定的 interfacetype 和 _type 新生成一个 itab，并插入到 itab 哈希表，这样下一次就可以直接拿到 itab
3. 这里查找了两次，并且第二次上锁了，这是因为如果第一次没找到，在第二次仍然没有找到相应的 itab 的情况下，需要新生成一个，并且写入哈希表，因此需要加锁。这样，其他协程在查找相同的 itab 并且也没有找到时，第二次查找时，会被挂住，之后，就会查到第一个协程写入哈希表的 itab。

添加到全局 hash 表的函数`additab`:
``` 
// 检查 _type 是否符合 interface_type 并且创建对应的 itab 结构体 将其放到 hash 表中
func additab(m *itab, locked, canfail bool) {
	inter := m.inter
	typ := m._type
	x := typ.uncommon()

	// both inter and typ have method sorted by name,
	// and interface names are unique,
	// so can iterate over both in lock step;
    // the loop is O(ni+nt) not O(ni*nt).
    // 
    // inter 和 typ 的方法都按方法名称进行了排序
    // 并且方法名都是唯一的。所以循环的次数是固定的
    // 只用循环 O(ni+nt)，而非 O(ni*nt)
	ni := len(inter.mhdr)
	nt := int(x.mcount)
	xmhdr := (*[1 << 16]method)(add(unsafe.Pointer(x), uintptr(x.moff)))[:nt:nt]
	j := 0
	for k := 0; k < ni; k++ {
		i := &inter.mhdr[k]
		itype := inter.typ.typeOff(i.ityp)
		name := inter.typ.nameOff(i.name)
		iname := name.name()
		ipkg := name.pkgPath()
		if ipkg == "" {
			ipkg = inter.pkgpath.name()
		}
		for ; j < nt; j++ {
			t := &xmhdr[j]
            tname := typ.nameOff(t.name)
            // 检查方法名字是否一致
			if typ.typeOff(t.mtyp) == itype && tname.name() == iname {
				pkgPath := tname.pkgPath()
				if pkgPath == "" {
					pkgPath = typ.nameOff(x.pkgpath).name()
				}
				if tname.isExported() || pkgPath == ipkg {
					if m != nil {
                        // 获取函数地址，并加入到itab.fun数组中
						ifn := typ.textOff(t.ifn)
						*(*unsafe.Pointer)(add(unsafe.Pointer(&m.fun[0]), uintptr(k)*sys.PtrSize)) = ifn
					}
					goto nextimethod
				}
			}
		}
        // ……
        
		m.bad = true
		break
	nextimethod:
	}
	if !locked {
		throw("invalid itab locking")
    }

    // 计算 hash 值
    h := itabhash(inter, typ)
    // 加到Hash Slot链表中
	m.link = hash[h]
	m.inhash = true
	atomicstorep(unsafe.Pointer(&hash[h]), unsafe.Pointer(m))
}
```

additab 会检查 itab 持有的 interfacetype 和 _type 是否符合，就是看 _type 是否完全实现了 interfacetype 的方法，也就是看两者的方法列表重叠的部分就是 interfacetype 所持有的方法列表。


当把实体类型赋值给接口的时候，会调用 conv 系列函数，例如空接口调用 convT2E 系列、非空接口调用 convT2I 系列。这些函数比较相似：
1. 具体类型转空接口时，_type 字段直接复制源类型的 _type；调用 mallocgc 获得一块新内存，把值复制进去，data 再指向这块新内存。
2. 具体类型转非空接口时，入参 tab 是编译器在编译阶段预先生成好的，新接口 tab 字段直接指向入参 tab 指向的 itab；调用 mallocgc 获得一块新内存，把值复制进去，data 再指向这块新内存。
3. 而对于接口转接口，itab 调用 getitab 函数获取。只用生成一次，之后直接从 hash 表中获取。


### 参考资料
- [深度解密 Go 语言之关于 interface 的 10 个问题](https://qcrao.com/post/dive-into-go-interface/)
- [go官网-interfaceSlice](https://github.com/golang/go/wiki/InterfaceSlice)
- [iface 和 eface 的区别是什么](https://www.bookstack.cn/read/qcrao-Go-Questions/interface-iface%20%E5%92%8C%20eface%20%E7%9A%84%E5%8C%BA%E5%88%AB%E6%98%AF%E4%BB%80%E4%B9%88.md)
- [Should I define methods on values or pointers?](https://go.dev/doc/faq#methods_on_values_or_pointers)