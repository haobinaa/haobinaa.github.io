---
title: go net/http标准库源码
date: 2023-10-08 20:12:19
tags:
categories: go
---

### go 快速实现一个 HttpServer

go 的标准库 `net/http` 可以快速实现一个 web 服务器:
``` 
func index(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "Hello World")
}

type HelloHandleStruct struct {
	content string
}

// ServeHTTP 实现 http.Handler 接口
func (h *HelloHandleStruct) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, h.content)
}

func startServer() {
	// handleFunc 函数签名
	http.HandleFunc("/", index)
	// handle 实现 http.Handler 接口
	http.Handle("/hello", &HelloHandleStruct{content: "Hello Hanlder"})
	http.ListenAndServe(":8080", nil)
}
```

上述代码就能启动一个web服务， 包含两个路由: `/` 和 `/hello`。

可以看到 Go 实现的http服务步骤非常简单，首先注册路由，然后创建服务并开启监听即可。


### 源码分析

#### 注册路由

注册路由有两个方式:
1. 通过实现 `http.Handler` 接口, `Handler` 接口中声明了名为 `ServeHTTP` 的函数签名，也就是说任何结构只要实现了这个ServeHTTP方法，那么这个结构体就是一个Handler对象。
go 的 http 服务都是基于 Handler 进行处理，而 Handler 对象的 `ServeHTTP` 方法会读取 `Request` 进行逻辑处理然后向 `ResponseWriter` 中写入响应的头部信息和响应内容。Handler 接口:
``` 
type Handler interface {
    ServeHTTP(ResponseWriter, *Request)
} 
// 通过 DefaultServeMux 进行路由注册
func Handle(pattern string, handler Handler) { DefaultServeMux.Handle(pattern, handler) }
```

2. 通过 `HandleFunc` 函数:
``` 
func HandleFunc(pattern string, handler func(ResponseWriter, *Request)) {
	DefaultServeMux.HandleFunc(pattern, handler)
}

func (mux *ServeMux) HandleFunc(pattern string, handler func(ResponseWriter, *Request)) {
	if handler == nil {
		panic("http: nil handler")
	}
	mux.Handle(pattern, HandlerFunc(handler))
} 

type HandlerFunc func(ResponseWriter, *Request)

// HandlerFunc 实现了 ServeHTTP, 代表也是一个 Handler 类型对象
func (f HandlerFunc) ServeHTTP(w ResponseWriter, r *Request) {
	f(w, r)
}
```
可以看到 HandleFunc 实际上还是通过 `*ServeMux.Handle` 的方式进行注册， 只是将 `handler` 函数做了一个类型转换，将函数转换为了 `http.HandlerFunc` 类型

`HandlerFunc` 类型表示的是一个具有 `func(ResponseWriter, *Request)` 签名的函数类型，并且这种类型实现了 `ServeHTTP` 方法（在其实现的ServeHTTP方法中又调用了被转换的函数自身）。
也就是说这个类型的函数其实就是一个`Handler`类型的对象。利用这种类型转换，我们可以将将具有 `func(ResponseWriter, *Request)` 签名的普通函数转换为一个Handler对象，而不需要定义一个结构体，再让这个结构实现ServeHTTP方法。


#### ServeMux