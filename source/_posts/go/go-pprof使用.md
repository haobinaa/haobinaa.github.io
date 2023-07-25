---
title: go pprof使用
date: 2023-06-25 16:35:27
tags: tools
categories: go
---

### pprof 简介

工欲善其事必先利其器， java 中有 [async-profile](https://github.com/async-profiler/async-profiler)、 [arthas](https://arthas.aliyun.com/doc/)、`jstack/jmap/jstat` 等一系列工具来辅助排查性能问题

在 linux 下，常用的调试定位工具：
- vmstat、iostat、 mpstat、netstat、 sar 、top：查看系统、程序信息等
- gprof、perf、perf top：定位到具体函数、调用等
- strace、ltrace：系统调用、函数调用、库函数调用等
- pstack、ptree、pmap：堆栈信息
- dmesg：系统log信息



go 语言中在内存、性能排查方面主要使用 `pprof`:
- pprof 是用于可视化和分析性能分析数据的工具
- pprof 以 profile.proto 读取分析样本的集合，并生成报告以可视化并帮助分析数据（支持文本和图形报告）
- profile.proto 是一个 Protocol Buffer v3 的描述文件，它描述了一组 callstack 和 symbolization 信息， 作用是表示统计分析的一组采样的调用栈，是很常见的 stacktrace 配置文件格式


pprof 的使用场景:
- CPU Profiling：CPU 分析，按照一定的频率采集所监听的应用程序 CPU（含寄存器）的使用情况，可确定应用程序在主动消耗 CPU 周期时花费时间的位置
- Memory Profiling：内存分析，在应用程序进行堆分配时记录堆栈跟踪，用于监视当前和历史内存使用情况，以及检查内存泄漏
- Block Profiling：阻塞分析，记录 goroutine 阻塞等待同步（包括定时器通道）的位置
- Mutex Profiling：互斥锁分析，报告互斥锁的竞争情况

pprof 的使用方式:
- Report generation：报告生成
- Interactive terminal use：交互式终端使用
- Web interface：Web 界面

### pprof 使用

#### 引入 pprof

pprof 是入侵式的， 需要先引入依赖:
``` 
"net/http"
_ "net/http/pprof"
```

然后显示的开启一个端口(最好是单独启一个协程， 如果程序是一个web服务， 避免和web Server公用同一个端口):
``` 
go func() {
   log.Println(http.ListenAndServe(":6060", nil))
}()
```

我们引入了两个包: `net/http` 和 `net/http/pprof`, 前者是启动一个http服务监听一个端口， 后者做了几件事情：
1. 在 `init` 里面注册路由:
``` 
func init() {
	http.HandleFunc("/debug/pprof/", Index)
	http.HandleFunc("/debug/pprof/cmdline", Cmdline)
	http.HandleFunc("/debug/pprof/profile", Profile)
	http.HandleFunc("/debug/pprof/symbol", Symbol)
	http.HandleFunc("/debug/pprof/trace", Trace)
}
```
2. 实现`ServeHTTP`并注册以下几个路由:
```
var profileSupportsDelta = map[handler]bool{
	"allocs":       true,
	"block":        true,
	"goroutine":    true,
	"heap":         true,
	"mutex":        true,
	"threadcreate": true,
}
```

#### 通过 web 界面访问

直接访问`ip:port/debug/pprof` 可以看到一些子页面， 类似如下:

``` 
/debug/pprof/

Types of profiles available:
Count	Profile
95	allocs
3	block
0	cmdline
55	goroutine
95	heap
1	mutex
0	profile
5	threadcreate
0	trace
full goroutine stack dump
```

我们常用的一些性能分析数据可以从这些页面得到:
- cpu（CPU Profiling): `/debug/pprof/profile`，默认进行 30s 的 CPU Profiling，得到一个分析用的 profile 文件
- block（Block Profiling）：`/debug/pprof/block`，查看导致阻塞同步的堆栈跟踪
- goroutine：`/debug/pprof/goroutine`，查看当前所有运行的 goroutines 堆栈跟踪
- heap（Memory Profiling）: `/debug/pprof/heap`，查看活动对象的内存分配情况
- mutex（Mutex Profiling）：`/debug/pprof/mutex`，查看导致互斥锁的竞争持有者的堆栈跟踪
- threadcreate：`/debug/pprof/threadcreate`，查看创建新 OS 线程的堆栈跟踪
- cmdline: 显示程序启动命令及参数
- trace: 程序运行跟踪信息

#### 交互终端使用

1. CPU Profile: `go tool pprof http://localhost:6060/debug/pprof/profile?seconds=60`

执行该命令后，需等待 60 秒（可调整 seconds 的值），pprof 会进行 CPU Profiling。结束后将默认进入 pprof 的交互式命令模式，可以对分析的结果进行查看或导出。交互模式下具体的命令可以通过 help 查看命令说明
``` 
go tool pprof http://localhost:6060/debug/pprof/profile?seconds=60
Fetching profile over HTTP from http://localhost:6060/debug/pprof/profile?seconds=60
Saved profile in /root/pprof/pprof.pprof-amd64-linux.samples.cpu.001.pb.gz
File: pprof-amd64-linux
Type: cpu
Time: Jun 27, 2023 at 7:56pm (CST)
Duration: 60.14s, Total samples = 32.90s (54.71%)
Entering interactive mode (type "help" for commands, "o" for options)


#### CPU Profile 
(pprof) top
Showing nodes accounting for 32.88s, 99.94% of 32.90s total
Dropped 15 nodes (cum <= 0.16s)
      flat  flat%   sum%        cum   cum%
    32.88s 99.94% 99.94%     32.88s 99.94%  github.com/wolfogre/go-pprof-practice/animal/felidae/tiger.(*Tiger).Eat
         0     0% 99.94%     32.88s 99.94%  github.com/wolfogre/go-pprof-practice/animal/felidae/tiger.(*Tiger).Live
         0     0% 99.94%     32.90s   100%  main.main
         0     0% 99.94%     32.90s   100%  runtime.main
```
上面的示例在结束 CPU Profiling 后， 通过 top 命令查看CPU占用久的函数， top 输出各列的含义:
- flat：给定函数上运行耗时
- flat%：同上的 CPU 运行耗时总比例
- sum%：给定函数累积使用 CPU 总比例
- cum：当前函数加上它之上的调用运行总耗时
- cum%：同上的 CPU 运行耗时总比例

2. 分析内存使用情况 `go tool pprof http://localhost:6060/debug/pprof/heap`
3. 阻塞同步分析 `go tool pprof http://localhost:6060/debug/pprof/block`
4. 锁竞争分析 ` go tool pprof http://localhost:6060/debug/pprof/mutex`

