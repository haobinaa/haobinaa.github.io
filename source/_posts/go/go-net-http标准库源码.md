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

#### Handler与注册路由

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
	// 最终还是通过 DefaultServeMux 进行路由注册
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

上面的代码可以看出路由注册最后都会用到 `ServeMux` 的函数， 定义如下:
``` 
type ServeMux struct {
  mu    sync.RWMutex
  m     map[string]muxEntry
  es    []muxEntry // slice of entries sorted from longest to shortest.
  hosts bool       // whether any patterns contain hostnames
}
// 值变量指针
var DefaultServeMux = &defaultServeMux
// 申明一个值变量， 默认初始化
var defaultServeMux ServeMux
```

可以看到 `ServeMux` 提供了一个 `DefaultServeMux` 作为默认实现， 这种使用方式在 GO 的其他库里面也比较常见。
`ServeMux` 中的字段 m，是一个map，key是路由表达式，value是一个muxEntry结构. muxEntry 结构体存储了路由表达式和对应的 handler。
字段 m 对应的 map 用于路由的精确匹配, 而 es 字段的 slice 会用于路由的部分匹配

#### 路由注册流程

从上面可以看到， 不管是通过实现 `handler` 接口还是, `handlerFunc` 函数签名的方式来注册路由， 最终都会调用 `DefaultServeMux.Handle(pattern, handler)`:
``` 
func (mux *ServeMux) Handle(pattern string, handler Handler) {
	mux.mu.Lock()
	defer mux.mu.Unlock()

	if pattern == "" {
		panic("http: invalid pattern")
	}
	if handler == nil {
		panic("http: nil handler")
	}
	// 路由已经注册过了， 直接 panic
	if _, exist := mux.m[pattern]; exist {
		panic("http: multiple registrations for " + pattern)
	}
    // 初始化路由和handler的 map
	if mux.m == nil {
		mux.m = make(map[string]muxEntry)
	}
	// muxEntry 对象实例化
	e := muxEntry{h: handler, pattern: pattern}
	// 往 m 里面增加新的路由匹配规则
	mux.m[pattern] = e
	if pattern[len(pattern)-1] == '/' {
	       // 如果路由patterm以'/'结尾，则将对应的muxEntry对象加入到[]muxEntry中，路由长的位于切片的前面
		mux.es = appendSorted(mux.es, e)
	}

	if pattern[0] != '/' {
		mux.hosts = true
	}
}
```

Handle方法注册路由时主要做了两件事情：一个就是向ServeMux的map` [string]muxEntry` 增加给定的路由匹配规则；然后如果路由表达式以'/'结尾，则将对应的muxEntry对象加入到`[]muxEntry`中，按照路由表达式长度倒序排列。前者用于路由精确匹配，后者用于部分匹配，部分匹配的逻辑在后面介绍

#### Server 

注册好路由后， 最终是通过 `http.ListenAndServe` 来启动服务， 可以看到， 核心还是创建了一个 `server` 对象， 然后调用 `server.ListenAndServe` 启动服务:
``` 
func ListenAndServe(addr string, handler Handler) error {
	server := &Server{Addr: addr, Handler: handler}
	return server.ListenAndServe()
}
```

`Server` 结构体本身字段还是比较多的, 可以使用这些字段来调节 Web 服务器的参数，如的`ReadTimeout/ReadHeaderTimeout/WriteTimeout/IdleTimeout`用于控制读写和空闲超时等:
``` 
type Server struct {
    Addr    string  // TCP address to listen on, ":http" if empty
    Handler Handler // handler to invoke, http.DefaultServeMux if nil
    TLSConfig *tls.Config
    ReadTimeout time.Duration
    ReadHeaderTimeout time.Duration
    WriteTimeout time.Duration
    IdleTimeout time.Duration
    MaxHeaderBytes int
    TLSNextProto map[string]func(*Server, *tls.Conn, Handler)
    ConnState func(net.Conn, ConnState)
    ErrorLog *log.Logger

    disableKeepAlives int32     // accessed atomically.
    inShutdown        int32     
    nextProtoOnce     sync.Once 
    nextProtoErr      error     

    mu         sync.Mutex
    listeners  map[*net.Listener]struct{}
    activeConn map[*conn]struct{}// 活跃连接
    doneChan   chan struct{}
    onShutdown []func()
}
```

#### 处理请求连接

`Server.serve`  使用一个无限的for循环，不停地调用`Listener.Accept()`方法接受新连接，开启新 goroutine 处理新连接, 关键逻辑如下:
``` 
func (srv *Server) Serve(l net.Listener) error {
    // .............  省略部分
	var tempDelay time.Duration // how long to sleep on accept failure

	ctx := context.WithValue(baseCtx, ServerContextKey, srv)
	for {
		rw, err := l.Accept()
		if err != nil {
			if srv.shuttingDown() {
				return ErrServerClosed
			}
			// 如果 accept 过程报错， 但是错误是临时性的， 则 Sleep 一段时间后重试
			// Sleep 的时间会随着重试次数增多而翻倍
			if ne, ok := err.(net.Error); ok && ne.Temporary() {
				if tempDelay == 0 {
					tempDelay = 5 * time.Millisecond
				} else {
					tempDelay *= 2
				}
				if max := 1 * time.Second; tempDelay > max {
					tempDelay = max
				}
				srv.logf("http: Accept error: %v; retrying in %v", err, tempDelay)
				time.Sleep(tempDelay)
				continue
			}
			return err
		}
		connCtx := ctx
		if cc := srv.ConnContext; cc != nil {
			connCtx = cc(connCtx, rw)
			if connCtx == nil {
				panic("ConnContext returned nil")
			}
		}
		tempDelay = 0
		// 将 accept 的连接包装成一共 conn 对象
		c := srv.newConn(rw)
		c.setState(c.rwc, StateNew, runHooks) // before Serve can return
		// 创建 goroutines 
		go c.serve(connCtx)
	}
}

// c.serve 处理逻辑简化
func (c *conn) serve(ctx context.Context) {
    // 省略...
    // 该链接的所有请求都会在这个循环中处理
    for {
        // 读取本次请求
        w, err := c.readRequest(ctx)
        if c.r.remain != c.server.initialReadLimitSize() {
            // If we read any bytes off the wire, we're active.
            c.setState(c.rwc, StateActive)
        }
        // 代理 Server 对象， 调用 ServeHTTP 处理请求
        serverHandler{c.server}.ServeHTTP(w, w.req)
        w.cancelCtx()
        if c.hijacked() {
            return
        }
        // 一些清理工作
        w.finishRequest()
        if !w.shouldReuseConnection() {
            if w.requestBodyLimitHit || w.closedRequestBodyEarly() {
                c.closeWriteAndWait()
            }
            return
        }
        c.setState(c.rwc, StateIdle)
        c.curReq.Store((*response)(nil))
        /// 省略 ...
    }
}

// serverHandler 代理了 Server 对象
type serverHandler struct {
	srv *Server
}
// serverHandler 实现 ServeHTTP
func (sh serverHandler) ServeHTTP(rw ResponseWriter, req *Request) {
    // handler 即 http.ListenAndServe 的第二个参数 ，不传则是默认的 DefaultServeMux
	handler := sh.srv.Handler
	if handler == nil {
		handler = DefaultServeMux
	}
	// ... 省略
	// 默认是 DefaultServeMux 的  ServeHTTP 方法
	handler.ServeHTTP(rw, req)
}
```

1. 首先 `Server.Serve` 使用一个无限的for循环，不停地调用`Listener.Accept()`方法接受新连接
2. 在 accept 过程中有一个**指数退避策略**的用法。如果`l.Accept()`调用返回错误，则判断该错误是不是临时性地（ne.Temporary()）。如果是临时性错误，Sleep一小段时间后重试，每发生一次临时性错误，Sleep的时间翻倍，最多Sleep 1s。
3. accept 到连接后， 封装成一个 `conn` 对象(`srv.newConn(rw)`), 创建一个 goroutine 运行其 `serve()` 方法
4. `conn.serve` 方法里面， 会开启一个无限的 for 循环来处理该链接的所有请求, 读取到请求后， 将 `Server` 对象代理成 `serverHandler` 对象， 在 `serverHandler` 的 `ServeHTTP` 处理 HTTP 请求。 代理对象里面， 如果在开启服务的`http.ListenAndServe`里面传入了 handler， 则使用自定义的 ServeMux 对象的 ServeHttp 方法， 否则使用 `DefaultServeMux` 的 ServerHttp

#### DefaultServeMux.ServeHttp

默认的 `DefaultServeMux` 的 `Handler` 来匹配路由(拿到路由的 Handler)， 然后执行具体 Handler 的 `ServeHttp` 来执行:
``` 
func (mux *ServeMux) ServeHTTP(w ResponseWriter, r *Request) {
	if r.RequestURI == "*" {
		if r.ProtoAtLeast(1, 1) {
			w.Header().Set("Connection", "close")
		}
		w.WriteHeader(StatusBadRequest)
		return
	}
	// Handler 匹配路由
	h, _ := mux.Handler(r)
	h.ServeHTTP(w, r)
}

// ServeMux.Handler 
func (mux *ServeMux) Handler(r *Request) (h Handler, pattern string) {
    // .... 省略部分逻辑
	host := stripHostPort(r.Host)
	path := cleanPath(r.URL.Path)
    // ..... 省略
	return mux.handler(host, r.URL.Path)
}

// ServeMux.handler
func (mux *ServeMux) handler(host, path string) (h Handler, pattern string) {
	mux.mu.RLock()
	defer mux.mu.RUnlock()
	
	if mux.hosts {
		h, pattern = mux.match(host + path)
	}
	if h == nil {
		h, pattern = mux.match(path)
	}
	if h == nil {
		h, pattern = NotFoundHandler(), ""
	}
	return
}

// ServeMux.match
func (mux *ServeMux) match(path string) (h Handler, pattern string) {
	// Check for exact match first.
	v, ok := mux.m[path]
	if ok {
		return v.h, v.pattern
	}

	// Check for longest valid match.  mux.es contains all patterns
	// that end in / sorted from longest to shortest.
	for _, e := range mux.es {
	    // 最长前缀匹配
		if strings.HasPrefix(path, e.pattern) {
			return e.h, e.pattern
		}
	}
	return nil, ""
}
```

最终匹配路由的逻辑落在 `ServeMux.match`:
1. 实现会在 `mux.m` 里面进行进准匹配, 如果在 `map[string]muxEntry` 中查找到路由对象则直接返回， 否则在 `mux.es` 里面进行模糊匹配
2. 上面在注册路由的时候提到会把以`'/'`结尾的路由（可称为节点路由）加入到es字段的`[]muxEntry`中。对于类似`/path1/path2/path3`这样的路由，如果不能找到精确匹配的路由规则，那么则会去匹配和当前路由最接近的已注册的父节点路由，所以如果路由`/path1/path2/`已注册，那么该路由会被匹配，否则继续匹配下一个父节点路由，直到根路由`/`。。为了保证最长前缀优先，在注册时，会对路径进行排序。所以mux.es中存放的是按路径排序的处理列表：
``` 
func appendSorted(es []muxEntry, e muxEntry) []muxEntry {
  n := len(es)
  i := sort.Search(n, func(i int) bool {
    return len(es[i].pattern) < len(e.pattern)
  })
  if i == n {
    return append(es, e)
  }
  es = append(es, muxEntry{})
  copy(es[i+1:], es[i:])
  es[i] = e
  return es
}
```

#### 自定义 `ServeMux` && 流程总结

上面总结了整套源码的流程， 默认情况下调用 `http.HandleFunc/http.Handle` 都是将处理器/函数注册到 `ServeMux` 的默认对象 `DefaultServeMux` 上。 这样有几个问题:
1. `Server` 参数都使用了默认值
2. 第三方库也可能使用这个默认对象注册一些处理，容易冲突。更严重的是，如果我们在不知情中调用 `http.ListenAndServe()` 开启 Web 服务，那么第三方库注册的处理逻辑就可以通过网络访问到，有极大的安全隐患

所以一般情况下， 都是使用 `http.NewServeMux()` 创建一个新的 `ServeMux` 对象，然后创建 `http.Server` 对象定制参数，用 `ServeMux` 对象初始化 `Server` 的 `Handler` 字段，最后调用 `Server.ListenAndServe()` 方法开启 Web 服务：
``` 
func main() {
  mux := http.NewServeMux()
  mux.HandleFunc("/", index)
  mux.Handle("/Hello", Hello("Hello World!"))

  server := &http.Server{
    Addr:         ":8080",
    Handler:      mux,
    ReadTimeout:  20 * time.Second,
    WriteTimeout: 20 * time.Second,
  }
  server.ListenAndServe()
}
```

我们可以将整体流程总结为如下步骤:
1. `http.NewServeMux` 创建 `ServeMux` 对象
2. `http.HandleFunc/http.Handle` 注册路径
3. 创建 `http.Server` 对象， 设置参数并填入 `ServeMux` 对象
4. `Server.ListenAndServe` 开启 Web 服务器
5. `net.Listen` 创建监听器 Listener
6. `l.Accept` 接受客户端连接
7. `go c.serve`  开启 goroutines 处理链接。 下面的步骤就是客户端连接的处理过程
8. `c.readRequest` 读取请求
9. `ServeHttp` 处理请求

### 集成中间件

我们需要在处理请求的代码中增加一些通用逻辑如耗时统计、打印日志等等， 如果每个请求处理函数添加这些逻辑，代码很快就会变得不可维护，添加新的处理函数也会变得非常繁琐。所以就有了中间件的需求。
中间件有点像面向切面的编程思想，但是与 Java 语言不同。在 Java 中，通用的处理逻辑（也可以称为切面）可以通过反射插入到正常逻辑的处理流程中，在 Go 语言中基本不这样做。
在 Go 中，中间件是通过函数闭包来实现的。Go 语言中的函数是第一类值，既可以作为参数传给其他函数，也可以作为返回值从其他函数返回。我们前面介绍了处理器/函数的使用和实现。那么可以利用闭包封装已有的处理函数。

下面通过一个开发 http 中间件的例子来阐述如何使用中间件思想

#### 定义中间件类型和中间件

首先基于路由处理逻辑(`http.Handler`)定义一个中间件类型， 由于 `HandlerFunc` 实现了 `Handler`， 我们就很容易的来代理逻辑：
``` 
type Middleware func(http.Handler) http.Handler
```

然后定义一个 Panic 捕捉的中间件(类似一个代理)， 当然还可以有很多中间件:
``` 
func PanicRecover(handler http.Handler) http.Handler {
  return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    defer func() {
      if err := recover(); err != nil {
        logger.Println(string(debug.Stack()))
      }
    }()
    // 真正处理路由的 handler 
    handler.ServeHTTP(w, r)
  })
}
```

#### 注册中间件

定义一个帮助函数, 接受原始的处理器对象，和可变的多个中间件。对处理器对象应用这些中间件，返回新的处理器对象：
``` 
func applyMiddlewares(handler http.Handler, middlewares ...Middleware) http.Handler {
  for i := len(middlewares)-1; i >= 0; i-- {
    handler = middlewares[i](handler)
  }

  return handler
}
```
注意， 这里应用顺序是从右到左的，即右结合，越靠近原处理器的越晚执行。


自定义一个 `ServeMux` 结构， 然后定义一个方法 `Use()` 将中间件保存下来，重写 `Handle/HandleFunc` 将传入的 `http.HandlerFunc/http.Handler` 处理器包装中间件之后再传给底层的 `ServeMux.Handle()` 方法：
``` 
type MyMux struct {
  *http.ServeMux
  middlewares []Middleware
}

func NewMyMux() *MyMux {
  return &MyMux{
    ServeMux: http.NewServeMux(),
  }
}

func (m *MyMux) Use(middlewares ...Middleware) {
  m.middlewares = append(m.middlewares, middlewares...)
}

func (m *MyMux) Handle(pattern string, handler http.Handler) {
  handler = applyMiddlewares(handler, m.middlewares...)
  m.ServeMux.Handle(pattern, handler)
}

func (m *MyMux) HandleFunc(pattern string, handler http.HandlerFunc) {
  newHandler := applyMiddlewares(handler, m.middlewares...)
  m.ServeMux.Handle(pattern, newHandler)
}
```

#### 使用

使用时注册时只需要创建MyMux对象，调用其Use()方法传入要应用的中间件即可：
``` 
middlewares := []Middleware{
  PanicRecover,
  MiddlewareX,
  MiddlewareY,
}
mux := NewMyMux()
mux.Use(middlewares...)
mux.HandleFunc("/", index)
mux.Handle("/hello", Hello("welcome, dj"))
```

#### 改写 ServerHTTP

上面通过 `Use` 添加中间件的办法简单易用， 但是问题在于必须先设置好中间件，然后才能调用`Handle/HandleFunc`注册，后添加的中间件不会对之前注册的处理器/函数生效。
为了解决这个问题，  可以重写 `http.ServeMux` 的 `ServeHttp` 方法:
``` 
func (m *ServeMux) ServeHTTP(w http.ResponseWriter, r *http.Request) {
  if r.RequestURI == "*" {
    if r.ProtoAtLeast(1, 1) {
      w.Header().Set("Connection", "close")
    }
    w.WriteHeader(http.StatusBadRequest)
    return
  }
  // 应用中间件
  h = applyMiddlewares(h, m.middlewares...)
  h, _ := m.Handler(r)
  h.ServeHTTP(w, r)
}
```

### 扩展

#### 服务器超时控制

go 由于 chan 和 context 的特殊性， 超时控制和 java 不同(返回超时了， 实际上逻辑还会执行)。 譬如 http 标准库的 `TimeoutHandler` 实现:
``` 
func (h *timeoutHandler) ServeHTTP(w ResponseWriter, r *Request) {
  ctx := h.testContext
  if ctx == nil {
    var cancelCtx context.CancelFunc
    ctx, cancelCtx = context.WithTimeout(r.Context(), h.dt)
    defer cancelCtx()
  }
  // 将有 timeout 的 context 设置给 request
  // 后续我们自己 handler 中的 request.Context 也就有 timeout 了
  // 所以用了 request.Context 也会在超时时收到 done 信号
  r = r.WithContext(ctx)
  done := make(chan struct{})
  tw := &timeoutWriter{
    w:   w,
    h:   make(Header),
    req: r,
  }
  panicChan := make(chan interface{}, 1)
  // 单独一个 goroutines 去处理业务逻辑的 ServeHttp
  go func() {
    defer func() {
      if p := recover(); p != nil {
        panicChan <- p
      }
    }()
    h.handler.ServeHTTP(tw, r)
    close(done)
  }()
  select {
  case p := <-panicChan:
    panic(p)
  case <-done:
    tw.mu.Lock()
    defer tw.mu.Unlock()
    dst := w.Header()
    for k, vv := range tw.h {
      dst[k] = vv
    }
    if !tw.wroteHeader {
      tw.code = StatusOK
    }
    w.WriteHeader(tw.code)
    w.Write(tw.wbuf.Bytes())
  case <-ctx.Done(): // 超时时会返回 503
    tw.mu.Lock()
    defer tw.mu.Unlock()
    w.WriteHeader(StatusServiceUnavailable)
    io.WriteString(w, h.errorBody())
    tw.timedOut = true
  }
}

```
