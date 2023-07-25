---
title: go context原理
date: 2023-06-15 10:51:23
tags: context
categories: go
---

### context 是什么

在官方文档中对 context 描述如下:
``` 
A Context carries a deadline, a cancellation signal, and other values across
```
翻译过来就是: 携带了超时时间、取消信号和值的一种结构。

在 go 语言开发中， context 用于提供上下文的联系， 在不同协程调用间建立取消和超时机制，也可以用于传递相关值。


### context 源码

go 提供了几种不同类型的 context， 他们都实现了 `context.Context` 接口:

``` 
type Context interface {
    // 返回 context 被取消的时间，当 context 没有设置取消时间时，ok 则等于 false；
	Deadline() (deadline time.Time, ok bool)
	
	// 返回一个channel，当任务已完成或者上下文被取消时关闭。如果是一个不会被取消的上下文，Done会返回nil
	// WithCancel方法，会在被调用cancel时，关闭 Done 的 channel
    // WithDeadline方法，会在过截止时间时，关闭 Done 的 channel
    // WithTimeout方法，会在超时结束时，关闭Done
	Done() <-chan struct{}
	
	// 返回 context 关闭的原因， 如果 done 对应的 channel 没有被关闭则返回 nil
    // 如果 Done 关闭了，将会返回关闭的原因(Canceled 取消、DeadlineExceed 超时)
	Err() error
	
	// 可以从 context 中获取 key 对应的值，可以用来在不同的 context 间传递数据
	Value(key interface{}) interface{}
}
```

下面看不同 context 的具体实现

#### context.Background 和 context.todo

``` 
var (
	background = new(emptyCtx)
	todo       = new(emptyCtx)
)

// Background returns a non-nil, empty Context. It is never canceled, has no
// values, and has no deadline. It is typically used by the main function,
// initialization, and tests, and as the top-level Context for incoming
// requests.
func Background() Context {
	return background
}

// TODO returns a non-nil, empty Context. Code should use context.TODO when
// it's unclear which Context to use or it is not yet available (because the
// surrounding function has not yet been extended to accept a Context
// parameter).
func TODO() Context {
	return todo
}
```

两者皆是 `emptyCtx` 的实例, `emptyCtx` 源码如下:
``` 
type emptyCtx int

func (*emptyCtx) Deadline() (deadline time.Time, ok bool) {
	return
}

func (*emptyCtx) Done() <-chan struct{} {
	return nil
}

func (*emptyCtx) Err() error {
	return nil
}

func (*emptyCtx) Value(key interface{}) interface{} {
	return nil
}

func (e *emptyCtx) String() string {
	switch e {
	case background:
		return "context.Background"
	case todo:
		return "context.TODO"
	}
	return "unknown empty Context"
}
```

可以看到 `emptyCtx` 对 `Context` 接口所有实现都返回了 nil, 基本可以认为 `Background` 和 `Todo` 互为别名。在源码注释上的差别:
- `context.Background`，是上下文默认值，一般用在主函数（入口函数）或者最初的根context，其他所有的context上下文都是基于它创建出来
- `context.Todo`，仅在不知道使用哪种context时使用

#### context.WithValue

`WithValue` 可以用于在父子上下文之间传递值，它会基于父上下文创建一个类型为 `valueCtx` 的子上下文，使用如下:
``` 
ctx := context.Background()
valCtx := context.WithValue(ctx, "foo", "bar")
fmt.Println(valCtx.Value("foo")) // bar
```

源码:
``` 
func WithValue(parent Context, key, val any) Context {
	if parent == nil {
		panic("cannot create context from nil parent")
	}
	if key == nil {
		panic("nil key")
	}
	// key 必须是可比较的
	if !reflectlite.TypeOf(key).Comparable() {
		panic("key is not comparable")
	}
	return &valueCtx{parent, key, val}
}

type valueCtx struct {
	Context
	key, val any
}

func (c *valueCtx) Value(key any) any {
	if c.key == key {
		return c.val
	}
    // 从 父 Context 中查找
	return value(c.Context, key)
}

func value(c Context, key any) any {
	for {
		switch ctx := c.(type) {
		case *valueCtx:
			if key == ctx.key {
				return ctx.val
			}
			c = ctx.Context
		case *cancelCtx:
			if key == &cancelCtxKey {
				return c
			}
			c = ctx.Context
		case *timerCtx:
			if key == &cancelCtxKey {
				return ctx.cancelCtx
			}
			c = ctx.Context
		case *emptyCtx:
			return nil
		default:
		    // 继续向父 Context 查找
			return c.Value(key)
		}
	}
}
```

`ValueCtx` 自己没有实现`Err`、`Deadline`等方法, 而是代理了父 Context。 查找key对应 value 的值时，如果没找到，就会从父 Context 中查找，直某个父 Context 中返回nil或者找到对应的值

#### context.WithCancel

`WithCancel` 能够基于给定的 context 中派生出一个能够被取消的 context 上下文。一旦该 context 被取消，其所有子 context 都会被取消。

使用如下:
``` 
func cancelDemo(ctx context.Context) {
  ctx, cancel = context.WithCancel(ctx)
  defer cancel()
  // 在函数退出后被取消
  go doSomething1(ctx)
  go doSomething2(ctx)
}
```

##### WithCancel 创建源码

``` 
func WithCancel(parent Context) (ctx Context, cancel CancelFunc) {
	c := withCancel(parent)
	return c, func() { c.cancel(true, Canceled, nil) }
}

func withCancel(parent Context) *cancelCtx {
	if parent == nil {
		panic("cannot create context from nil parent")
	}
	// 创建 cancelCtx
	c := newCancelCtx(parent)
	// 建立父子 Context 联系
	propagateCancel(parent, c)
	return c
}

func newCancelCtx(parent Context) *cancelCtx {
	return &cancelCtx{Context: parent}
}


// A cancelCtx can be canceled. When canceled, it also cancels any children
// that implement canceler.
type cancelCtx struct {
	Context

	mu       sync.Mutex            // protects following fields
	done     atomic.Value          // of chan struct{}, created lazily, closed by first cancel call
	children map[canceler]struct{} // set to nil by the first cancel call
	err      error                 // set to non-nil by the first cancel call
	cause    error                 // set to non-nil by the first cancel call
}
```


##### cancelCtx 实现 canceler 接口


`WithCancel` 首先调用 `newCancelCtx` 创建了一个 `cancelCtx`, 注释表面 `cancelCtx` 取消的时候会把所有的 children 同样取消， 另外可以看到 `cancelCtx` 保存了父 Context， 同时也实现了 `canceler` 接口(实现该接口就能拥有取消上下文的能力):
``` 
type canceler interface {
    // removeFromParent: 是否将 Context 从父 Context 中移除
    // err: 上下文被取消的错误
	cancel(removeFromParent bool, err, cause error)
	Done() <-chan struct{}
}
```

对 `canceler` 接口的实现如下:
``` 
// 定义 cancelCtxKey 
var cancelCtxKey int

// 从 Context 中查找 key 对应的 value， 自身没有从父 Context 开始查找
func (c *cancelCtx) Value(key interface{}) interface{} {
	if key == &cancelCtxKey {
		return c
	}
	return c.Context.Value(key)
}

// 返回一个非空的 channel， 使用 double check lock
func (c *cancelCtx) Done() <-chan struct{} {
    // 加载原子变量
	d := c.done.Load()
	if d != nil {
		return d.(chan struct{})
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	d = c.done.Load()
	if d == nil {
		d = make(chan struct{})
		c.done.Store(d)
	}
	return d.(chan struct{})
}

// 返回当前 context 的 err 信息
func (c *cancelCtx) Err() error {
	c.mu.Lock()
	err := c.err
	c.mu.Unlock()
	return err
}

// 关闭 c.done 这个 channel
func (c *cancelCtx) cancel(removeFromParent bool, err, cause error) {
	if err == nil {
		panic("context: internal error: missing cancel error")
	}
	if cause == nil {
		cause = err
	}
	c.mu.Lock()
	
	// err 非空代表已经被取消了， 直接返回
	if c.err != nil {
		c.mu.Unlock()
		return // already canceled
	}
	
	// 复制取消的 err 和 cause
	c.err = err
	c.cause = cause
	d, _ := c.done.Load().(chan struct{})
	
	
	if d == nil {
		c.done.Store(closedchan) // 将一个已经关闭的 channel 复制给 done
	} else {
		close(d) // 关闭 done 的 channel
	}
	for child := range c.children {
		// NOTE: acquiring the child's lock while holding parent's lock.
		// 将所有子 context 全部取消， 这里注意第一个参数是 false， 即不会断开与父 context 的关联， 断开与父 context 的关联由父 context 来做
		child.cancel(false, err, cause)
	}
	
	// 断开与子 context 的关联
	c.children = nil
	c.mu.Unlock()
    
    //  将 context 从父 context 中移除， 避免祖宗节点(父节点之前的节点)调用 cancel 后信号重复传递到已取消的节点
	if removeFromParent {
		removeChild(c.Context, c)
	}
}


func removeChild(parent Context, child canceler) {
    // 只有父 context 是 cancelCtx 且还没被取消
	p, ok := parentCancelCtx(parent)
	if !ok {
		return
	}
	p.mu.Lock()
	if p.children != nil {
		delete(p.children, child)
	}
	p.mu.Unlock()
}

// closedchan is a reusable closed channel.
var closedchan = make(chan struct{})
func init() {
	close(closedchan)
}

func parentCancelCtx(parent Context) (*cancelCtx, bool) {
	done := parent.Done()
	// 如果父 context 已经被取消， 或是一个不可取消的 context 则直接返回
	if done == closedchan || done == nil {
		return nil, false
	}
	
	 // 通过value，逐层向上查找，直到找到 cancelCtx 类型的context为止
	p, ok := parent.Value(&cancelCtxKey).(*cancelCtx)
	if !ok {
		return nil, false
	}
	
    // 判断是否是自己的父节点
	pdone, _ := p.done.Load().(chan struct{})
	if pdone != done {
		return nil, false
	}
	
	// 只有是自己的父 context 才返回 true
	return p, true
}
```

这里需要注意的是， 在 `cancel()` 中会调用 `parentCancelCtx()` 来寻找最近的父 `cancelCtx` 来取消， 避免以后祖宗节点调用 `cancel` 将信号传递到已经取消的节点

##### propagateCancel 建立父子 Context 联系

回到 `WithCancel` 创建 `cancelCtx` 的之后， 可以看到还调用了 `propagateCancel`, 目的就是建立父子 Context 的联系:


``` 
// propagateCancel arranges for child to be canceled when parent is.
func propagateCancel(parent Context, child canceler) {
	done := parent.Done()
	
	// 这里代表父 Context 不会有取消信号， 如通过 Background 和 Todo 创建的 Context
	if done == nil {
		return // parent is never canceled
	}

	select {
	case <-done:
	    // 父 Context 已经取消， 子 Context 也要调用取消
		// parent is already canceled
		child.cancel(false, parent.Err(), Cause(parent))
		return
	default:
	}

    // 找到最近的父 cancelCtx
	if p, ok := parentCancelCtx(parent); ok {
		p.mu.Lock()
		if p.err != nil {
			// parent has already been canceled
			child.cancel(false, p.err, p.cause)
		} else {
		    // 父 cancelCtx 没有被取消
		    // 将child contetx 加入到 parent 节点上
		    // 这里所有的子 context 节点采用了map来维护，其中 map 的 key 为 canceler 接口, 然后 child 作为 key
		    // 也就是只有实现了 canceler 接口的 context 才能被加入到该children map集合中
			if p.children == nil {
				p.children = make(map[canceler]struct{})
			}
			p.children[child] = struct{}{}
		}
		p.mu.Unlock()
	} else {
	    // 父 context 是开发者自定义的类型
		// 开启一个新的协程，监听父子上下文取消的信号
		goroutines.Add(1)
		go func() {
			select {
			case <-parent.Done():
				child.cancel(false, parent.Err(), Cause(parent))
			case <-child.Done():
			}
		}()
	}
}
```

可以看到会通过 `parentCancelCtx` 来判断父 context 是否是一个可取消的上下文。当不是的时候，则会开启一个协程去监听自己和父上下文的取消信号。


#### context.WithDeadline 和 context.WithTimeout

`context.WithDeadline()` 和 `context.WithTimeout()` 也都能创建可以被取消的上下文。

`context.WithDeadline` 用于创建一个到达指定时间能被自动取消的上下文, 源码如下:


``` 
func WithDeadline(parent Context, d time.Time) (Context, CancelFunc) {
	if parent == nil {
		panic("cannot create context from nil parent")
	}
	if cur, ok := parent.Deadline(); ok && cur.Before(d) {
	    // 父 Context  的超时时间要早于本次设置的时间， 则基于父 contetx 返回一个可取消的 context
		// The current deadline is already sooner than the new one.
		return WithCancel(parent)
	}
	
	// 基于父 context 生成一个可取消的 context， 并设定超时时间
	c := &timerCtx{
		cancelCtx: newCancelCtx(parent),
		deadline:  d,
	}
	
	// 关联父子 context
	propagateCancel(parent, c)
	
	
	dur := time.Until(d)
	// 当前时间已经超过取消时间， 执行 cancel 取消 context， 并返回一个已经 cancel 过的 context
	if dur <= 0 {  
		c.cancel(true, DeadlineExceeded, nil) // deadline has already passed
		return c, func() { c.cancel(false, Canceled, nil) }
	}
	
	
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.err == nil {
	    // dur 过后， 调用 cancel
		c.timer = time.AfterFunc(dur, func() {
			c.cancel(true, DeadlineExceeded, nil)
		})
	}
	return c, func() { c.cancel(true, Canceled, nil) }
}


type timerCtx struct {
	*cancelCtx
	timer *time.Timer // Under cancelCtx.mu.

	deadline time.Time
}

func (c *timerCtx) Deadline() (deadline time.Time, ok bool) {
	return c.deadline, true
}

// timerCtx cancel 逻辑， 用 cancelCtx 来 cancel context， 然后将 timer 停止
func (c *timerCtx) cancel(removeFromParent bool, err, cause error) {
	c.cancelCtx.cancel(false, err, cause)
	if removeFromParent {
		// Remove this timerCtx from its parent cancelCtx's children.
		removeChild(c.cancelCtx.Context, c)
	}
	c.mu.Lock()
	if c.timer != nil {
		c.timer.Stop()
		c.timer = nil
	}
	c.mu.Unlock()
}
```

在理解了 `cancelCtx` 的逻辑后 `context.WithDeadline` 也十分好理解:
1. 整体是基于 `timerCtx` 来实现的， `timerCtx` 包含一个 `canclerCtx` 和一个超时时间
2. 如果到达超时时间， 则调用 `canclerCtx.cancle` 来取消 context， 如果未到达则等待超时时间到达后调用 `cancel`


`context.WithTimeout` 底层直接调用了 `context.WithDeadline`:
``` 
func WithTimeout(parent Context, timeout time.Duration) (Context, CancelFunc) {
	return WithDeadline(parent, time.Now().Add(timeout))
}
```

### 使用注意事项

#### context.WithValue 使用

在上面介绍 `context.WithValue` 的时候说过， 在key的使用上，必须是可以比较的key。虽然可以使用基本数据类型，如string、int等其他内置的基本类型作为key，但是为了防止key碰撞，不建议这么使用
例如:
``` 
// 虽然 pkg1.Foo 和 pkg2.Foo 是两个不同的包， 但值都是 foo
valCtx := context.WithValue(ctx, pkg1.Foo, "bar")
valCtx := context.WithValue(ctx, pkg2.Foo, "bar")
```
上述例子， 因为 pkg1.Foo 和 pkg2.Foo 的值都是 foo，导致用两个不同包的变量都能取到相同的值。

因此为了防止碰撞，最好的实践方式就是为key定义单独的类型，这个类型可以是string、int等基本类型，不过一般建议是struct，空的结构体不占用空间, 如:
``` 
type usrConfigKey struct{}
var (
  User = usrConfigKey{}
)
valCtx := context.WithValue(ctx, pkg.User, "zhangsan")
```

另外在使用 context 时，遵循以下原则可确保代码更加健壮、易于维护和理解：

1. value 应该是不可变的（Immutable）：在功能上下文中使用的值应该是不可变的。这意味着，一旦您将一个值与上下文关联，您不应再对其进行修改。这样可以避免潜在的竞态条件和不确定性，确保上下文行为的一致性和可预测性。

2. 避免在后续中修改 Context 属性：创建具有某种属性（例如超时）的 context 后，不要试图在后续阶段中修改这些属性。这样可以确保在代码的执行过程中，上下文属性保持一致。

#### 通过 context 来控制 http 请求超时

 go net 包下， 使用 httpclient 发起请求示例如下:

``` 
client := http.Client{
    // 设置超时时间
	Timeout: time.Duration(timeout) * time.Millisecond,
}
client.Do(req)
```

可以通过 Timeout 设置超时时间， DO 源码如下:
``` 
// 入口
func (c *Client) Do(req *Request) (*Response, error) {
	return c.do(req)
}


func (c *Client) do(req *Request) (retres *Response, reterr error) {
	// ..... 省略
	for {
		if resp, didTimeout, err = c.send(req, deadline); err != nil {
			// c.send() always closes req.Body
			reqBodyClosed = true
			if !deadline.IsZero() && didTimeout() {
				err = &httpError{
					err:     err.Error() + " (Client.Timeout exceeded while awaiting headers)",
					timeout: true,
				}
			}
			return nil, uerr(err)
		}
	}
	// ...... 省略
}

// 追踪 c.send() 一直到 setRequestCancel() 部分
func send(ireq *Request, rt RoundTripper, deadline time.Time) (resp *Response, didTimeout func() bool, err error) {
   // ....... 省略
	stopTimer, didTimeout := setRequestCancel(req, rt, deadline)
	resp, err = rt.RoundTrip(req)
}

func setRequestCancel(req *Request, rt RoundTripper, deadline time.Time) (stopTimer func(), didTimeout func() bool) {
    // ...... 省略
	if req.Cancel == nil && knownTransport {
		// If they already had a Request.Context that's
		// expiring sooner, do nothing:
		if !timeBeforeContextDeadline(deadline, oldCtx) {
			return nop, alwaysFalse
		}

		var cancelCtx func()
		// 通过 WithDeadline 设置了一个超时 context 赋给 req.ctx
		req.ctx, cancelCtx = context.WithDeadline(oldCtx, deadline)
		return cancelCtx, func() bool { return time.Now().After(deadline) }
	}
	// ....... 省略
}	
```

可以看到在 `setRequestCancel` 也是使用 `context.WithDeadline` 来控制超时， 接着进入 `transport.RoundTrip`：
``` 
func (t *Transport) roundTrip(req *Request) (*Response, error) {
    // .... 省略
    for {
		select {
		// 判断超时关闭body并返回超时错误
		case <-ctx.Done():
			req.closeBody()
			return nil, ctx.Err()
		default:
		}

		// treq gets modified by roundTrip, so we need to recreate for each retry.
		treq := &transportRequest{Request: req, trace: trace, cancelKey: cancelKey}
		cm, err := t.connectMethodForRequest(treq)
		if err != nil {
			req.closeBody()
			return nil, err
		}

		// Get the cached or newly-created connection to either the
		// host (for http or https), the http proxy, or the http proxy
		// pre-CONNECTed to https server. In any case, we'll be ready
		// to send it requests.
		pconn, err := t.getConn(treq, cm)
		if err != nil {
			t.setReqCanceler(cancelKey, nil)
			req.closeBody()
			return nil, err
		}

		var resp *Response
		if pconn.alt != nil {
			// HTTP/2 path.
			t.setReqCanceler(cancelKey, nil) // not cancelable with CancelRequest
			resp, err = pconn.alt.RoundTrip(req)
		} else {
		    // 请求的时候
			resp, err = pconn.roundTrip(treq)
		}
		if err == nil {
			resp.Request = origReq
			return resp, nil
		}

        // ..... 省略 下面判断请求失败是否需要进入重试
	}
}

func (pc *persistConn) roundTrip(req *transportRequest) (resp *Response, err error) {
    // ......... 省略
    var respHeaderTimer <-chan time.Time
	cancelChan := req.Request.Cancel
	ctxDoneChan := req.Context().Done()
	pcClosed := pc.closech
	canceled := false
	for {
		testHookWaitResLoop()
		select {
		case err := <-writeErrCh:
		    // 省略 writeErr
		case <-pcClosed:
			// 省略 连接关闭
		case <-respHeaderTimer:
			// 省略 响应头超时(区别于下面请求超时)， response header timeout 是一种更加具体的超时， 仅代表服务器响应头超时
			// response header timeout 可以理解为 java 发送 http 请求设置的 readTimeout(不过这里包含了响应头和响应体)
			// 因为 response header timeout 是在与服务器建立连接后，等待接收到完整响应头部的最长时间
		case re := <-resc:
	        // 省略 收到返回处理
		case <-cancelChan:
			// 省略 取消请求
		case <-ctxDoneChan:
			// 省略 请求超时， 区别于响应头超时， 覆盖整个请求以及接受响应周期
			// 这里近似可以理解为 java 的 connectTimeout + readTimeout
		}
	}
}
```

可以看到整个 httpClient 利用 `for + select`的方式去监听 req.Context() 和其他 channel 的请求， 来处理超时和各种情况