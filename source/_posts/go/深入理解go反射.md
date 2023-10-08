---
title: 深入理解 go 反射
date: 2023-07-31 19:42:56
tags:
categories: go
---

### 反射

反射是可以让我们在程序运行时（runtime）访问、检测和修改对象本身状态或行为的一种机制。

GO 反射的基础是`interface`和`类型系统`:

![](/images/go/reflection.png)

结合 interface 的结构， 可以看出 go 的 interface 是由 `type` 和 `data` 两部分组成的， `type` 承载类型信息， `data`承载类型的数据。详细请参考[深入理解 go interface](https://haobin.work/2023/07/11/go/%E6%B7%B1%E5%85%A5%E7%90%86%E8%A7%A3%20go%20interface/)

#### 反射对象 reflect.Type 和 reflect.Value

根据 interface 的结构， go 反射的核心是两个对象，分别是 `reflect.Type` 和 `reflect.Value`。 它们分别代表了 go 语言中的类型和值。我们可以通过 `reflect.TypeOf` 和 `reflect.ValueOf` 来获取到一个变量的类型和值。 


#### 反射定律

在 go 官方文档[The Laws of Reflection](https://go.dev/blog/laws-of-reflection)中提出了三条反射定律:
1. 反射可以将 interface 类型变量转换成反射对象
2. 反射可以将反射对象还原成 interface 对象
3. 如果要修改反射对象，那么反射对象必须是可设置的（CanSet）

- 反射可以将 interface 类型变量转换成反射对象
这也是上面讲述的`reflect.Type` 和 `reflect.Value` 两个反射对象的获取方式
``` 
var a = 1
typeOfA := reflect.TypeOf(a)
valueOfA := reflect.ValueOf(a)
```

- 反射可以将反射对象还原成 interface 对象
我们可以通过 `reflect.Value.Interface()` 来获取到反射对象的 interface 对象，也就是传递给 `reflect.ValueOf` 的那个变量本身。 不过返回值类型是 `interface{}`，所以我们需要进行类型断言：
``` 
i := valueOfA.Interface()
fmt.Println(i.(int))
```

- 如果要修改反射对象，那么反射对象必须是可设置的（CanSet）
  我们可以通过 `reflect.Value.CanSet` 来判断一个反射对象是否是可设置的。如果是可设置的，我们就可以通过 `reflect.Value.Set` 来修改反射对象的值。 这其实也是非常场景的使用反射的一个场景，通过反射来修改变量的值。
``` 
var b float64 = 22
v := reflect.ValueOf(&b)
fmt.Println("settability of v:", v.CanSet()) // false
fmt.Println("settability of v:", v.Elem().CanSet()) // true 
```
反射对象可设置是什么意思呢?前提是这个反射对象是一个指针，然后这个指针指向的是一个可设置的变量。
在我们传递一个值给 reflect.ValueOf 的时候，如果这个值只是一个普通的变量，那么 reflect.ValueOf 会返回一个不可设置的反射对象。
因为这个值实际上被拷贝了一份，我们如果通过反射修改这个值，那么实际上是修改的这个拷贝的值，而不是原来的值。
所以 go 语言在这里做了一个限制，如果我们传递进 reflect.ValueOf 的变量是一个普通的变量，那么在我们设置反射对象的值的时候，会报错。
所以在上面这个例子中，我们传递了 b 的指针变量作为参数。这样，运行时就可以找到 b 本身，而不是 b 的拷贝，所以就可以修改 b 的值了。
但同时我们也注意到了，在上面这个例子中，`v.CanSet()` 返回的是 false，而 `v.Elem().CanSet()` 返回的是 true。
这是因为，v 是一个指针，而 `v.Elem()` 是指针指向的值，对于这个指针本身，我们修改它是没有意义的，我们可以设想一下， 如果我们修改了指针变量（也就是修改了指针变量指向的地址），那会发生什么呢？那样我们的指针变量就不是指向 b 了， 而是指向了其他的变量，这样就不符合我们的预期了。所以 `v.CanSet()` 返回的是 false。
而 `v.Elem().CanSet()` 返回的是 true。这是因为 v.Elem() 才是 x 本身，通过 v.Elem() 修改 x 的值是没有问题的。

![](/images/go/reflect-canset.png)


#### Elem

reflect.Value 和 reflect.Type 这两个反射对象都有 Elem 方法， 他们的区别是什么

##### reflect.Value 的 Elem 方法

reflect.Value 的 Elem 方法的作用是获取**指针指向的值**，或者获取**接口的动态值**。也就是说，能调用 Elem 方法的反射对象，必须是一个指针或者一个接口。
在使用其他类型的 reflect.Value 来调用 Elem 方法的时候，会 panic:
``` 
var a = 1
// panic: reflect: call of reflect.Value.Elem on int Value
reflect.ValueOf(a).Elem()

var b = &a
// 正常
reflect.ValueOf(b).Elem()
```

对于指针类似解引用。而对于接口，还是要回到 interface 的结构本身，因为接口里包含了类型和数据本身，所以 Elem 方法就是获取接口的数据部分（也就是 iface 或 eface 中的 data 字段）

##### reflect.Type 的 Elem 方法

reflect.Type 的 Elem 方法的作用是获取`数组、chan、map、指针、切片`关联元素的类型信息，也就是说，对于 reflect.Type 来说，
能调用 Elem 方法的反射对象，必须是数组、chan、map、指针、切片中的一种，其他类型的 reflect.Type 调用 Elem 方法会 panic
``` 
t1 := reflect.TypeOf([3]int{1, 2, 3}) // 数组 [3]int
fmt.Println(t1.String()) // [3]int
fmt.Println(t1.Elem().String()) // int
```
需要特别注意的是，如果要获取 map 类型 key 的类型信息，需要使用 Key 方法，而不是 Elem 方法：
``` 
m := make(map[string]string)
t1 := reflect.TypeOf(m)
fmt.Println(t1.Key().String()) // string
```

### 反射的方法

#### interface

reflect.Value 的 Interface 方法的作用是获取反射对象的动态值。 也就是说，如果反射对象是一个指针，那么 Interface 方法会返回指针指向的值。

#### King
在 go 中， 所有变量的类型都是下面类型中的一个:
``` 
type Kind uint

const (
   Invalid Kind = iota
   Bool
   Int
   Int8
   Int16
   Int32
   Int64
   Uint
   Uint8
   Uint16
   Uint32
   Uint64
   Uintptr
   Float32
   Float64
   Complex64
   Complex128
   Array
   Chan
   Func
   Interface
   Map
   Pointer
   Slice
   String
   Struct
   UnsafePointer
)
```

可以通过有限的 reflect.Type 的 Kind 来进行类型判断:
``` 
func display(path string, v reflect.Value) {
   switch v.Kind() {
   case reflect.Invalid:
      fmt.Printf("%s = invalid\n", path)
   case reflect.Slice, reflect.Array:
      for i := 0; i < v.Len(); i++ {
         display(fmt.Sprintf("%s[%d]", path, i), v.Index(i))
      }
   case reflect.Struct:
      for i := 0; i < v.NumField(); i++ {
         fieldPath := fmt.Sprintf("%s.%s", path, v.Type().Field(i).Name)
         display(fieldPath, v.Field(i))
      }
   case reflect.Map:
      for _, key := range v.MapKeys() {
         display(fmt.Sprintf("%s[%s]", path, formatAny(key)), v.MapIndex(key))
      }
   case reflect.Pointer:
      if v.IsNil() {
         fmt.Printf("%s = nil\n", path)
      } else {
         display(fmt.Sprintf("(*%s)", path), v.Elem())
      }
   case reflect.Interface:
      if v.IsNil() {
         fmt.Printf("%s = nil\n", path)
      } else {
         fmt.Printf("%s.type = %s\n", path, v.Elem().Type())
         display(path+".value", v.Elem())
      }
   default:
      fmt.Printf("%s = %s\n", path, formatAny(v))
   }
}
```

#### 常用的 reflect.Type 方法

`reflect.Type` 的常用方法:
``` 
// Type 是 Go 类型的表示。
//
// 并非所有方法都适用于所有类型。
// 在调用 kind 具体方法之前，先使用 Kind 方法找出类型的种类。因为调用一个方法如果类型不匹配会导致 panic
//
// Type 类型值是可以比较的，比如用 == 操作符。所以它可以用做 map 的 key
// 如果两个 Type 值代表相同的类型，那么它们一定是相等的。
type Type interface {
   // Align 返回该类型在内存中分配时，以字节数为单位的字节数
   Align() int
   
   // FieldAlign 返回该类型在结构中作为字段使用时，以字节数为单位的字节数
   FieldAlign() int
   
   // Method 这个方法返回类型方法集中的第 i 个方法。
   // 如果 i 不在[0, NumMethod()]范围内，就会 panic。
   // 对于非接口类型 T 或 *T，返回的 Method 的 Type 和 Func 字段描述了一个函数，
   // 其第一个参数是接收者，并且只能访问导出的方法。
   // 对于一个接口类型，返回的 Method 的 Type 字段给出的是方法签名，没有接收者，Func字段为nil。
   // 方法是按字典序顺序排列的。
   Method(int) Method

   // MethodByName 返回类型的方法集中具有该名称的方法和一个指示是否找到该方法的布尔值。
   // 对于非接口类型 T 或 *T，返回的 Method 的 Type 和 Func 字段描述了一个函数，
   // 其第一个参数是接收者。
   // 对于一个接口类型，返回的 Method 的 Type 字段给出的是方法签名，没有接收者，Func字段为nil。
   MethodByName(string) (Method, bool)

   // NumMethod 返回使用 Method 可以访问的方法数量。
   // 对于非接口类型，它返回导出方法的数量。
   // 对于接口类型，它返回导出和未导出方法的数量。
   NumMethod() int

   // Name 返回定义类型在其包中的类型名称。
   // 对于其他（未定义的）类型，它返回空字符串。
   Name() string

   // PkgPath 返回一个定义类型的包的路径，也就是导入路径，导入路径是唯一标识包的类型，如 "encoding/base64"。
   // 如果类型是预先声明的(string, error)或者没有定义(*T, struct{}, []int，或 A，其中 A 是一个非定义类型的别名），包的路径将是空字符串。
   PkgPath() string

   // Size 返回存储给定类型的值所需的字节数。它类似于 unsafe.Sizeof.
   Size() uintptr

   // String 返回该类型的字符串表示。
   // 字符串表示法可以使用缩短的包名。
   // (例如，使用 base64 而不是 "encoding/base64")并且它并不能保证类型之间是唯一的。如果是为了测试类型标识，应该直接比较类型 Type。
   String() string

   // Kind 返回该类型的具体种类。
   Kind() Kind

   // Implements 表示该类型是否实现了接口类型 u。
   Implements(u Type) bool

   // AssignableTo 表示该类型的值是否可以分配给类型 u。
   AssignableTo(u Type) bool

   // ConvertibleTo 表示该类型的值是否可转换为 u 类型。
   ConvertibleTo(u Type) bool

   // Comparable 表示该类型的值是否具有可比性。
   Comparable() bool
}
```

#### reflect.Value 方法

reflect.Value  同样有很多方法：具体可以分为以下几类：
1. 设置值的方法：SetXXX：`Set、SetBool、SetBytes、SetCap、SetComplex、SetFloat、SetInt、SetLen、SetMapIndex、SetPointer、SetString、SetUint`。通过这类方法，我们可以修改反射值的内容，前提是这个反射值得是合适的类型。CanSet 返回 true 才能调用这类方法
2. 获取值的方法：`Interface、InterfaceData、Bool、Bytes、Complex、Float、Int、String、Uint`。通过这类方法，我们可以获取反射值的内容。前提是这个反射值是合适的类型，比如我们不能通过 complex 反射值来调用 Int 方法（我们可以通过 Kind 来判断类型）。
3. map 类型的方法：`MapIndex、MapKeys、MapRange、MapSet`
4. chan 类型的方法：`Close、Recv、Send、TryRecv、TrySend`
5. slice 类型的方法：`Len、Cap、Index、Slice、Slice3`
6. struct 类型的方法：`NumField、NumMethod、Field、FieldByIndex、FieldByName、FieldByNameFunc`
7. 判断是否可以设置为某一类型：CanConvert、CanComplex、CanFloat、CanInt、CanInterface、CanUint。
8. 方法类型的方法：Method、MethodByName、Call、CallSlice。
9. 判断值是否有效：IsValid。
10. 判断值是否是 nil：IsNil。
11. 判断值是否是零值：IsZero。
12. 判断值能否容纳下某一类型的值：Overflow、OverflowComplex、OverflowFloat、OverflowInt、OverflowUint。
13. 反射值指针相关的方法：Addr（CanAddr 为 true 才能调用）、UnsafeAddr、Pointer、UnsafePointer。
14. 获取类型信息：Type、Kind。
15. 获取指向元素的值：Elem。
16. 类型转换：Convert。



### 参考资料
- [深入理解 go reflection](https://juejin.cn/post/7183132625580605498#heading-0)
- [Golang的反射reflect深入理解和示例](https://juejin.cn/post/6844903559335526407)