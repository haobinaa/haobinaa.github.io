---
title: http协议
date: 2018-01-13 23:17:31
tags: http
categories: 网络协议
---

###  概述
超文本传输协议(http)是一个基于应用层的协议

### URL
Uniform Resource Locator(统一资源定位符)， 格式：  
>schema://host[:port#]/path/[?query-string][#anchor]

- schema:协议名(http、https)
- host: 主机名(域名、IP)
- port: 端口号，可选
- path: 资源路径
- query-string: 查询数据
- anchor: 片段标识（定位到哪个部分）

### HTTP结构

#### 请求(Request)

一般http请求的格式如下:
```  
METHOD URL HTTP-VERSION
Request Header
空行
Request Body


例如：
GET http://www.cnblogs.com/  HTTP/1.1
Host:www.cnblogs.com

name: zhangsan
```

#### 响应(Response)

相应格式：
``` 
HTTP-VERSION status-code message
Response Header
空行
Response Body
```

### HTTP请求方法
- GET: 请求一个指定资源的表示形式. 使用GET的请求应该只被用于获取数据
- POST: 将实体提交到指定的资源，通常导致状态或服务器上的副作用的更改
- HEAD: 请求一个与GET请求的响应相同的响应，但没有响应体
- PUT: 请求有效载荷替换目标资源的所有当前表示
- DELETE: 删除指定的资源
- PATCH: 用于对资源应用部分修改
- OPTIONS: OPTIONS方法用于描述目标资源的通信选项

参考[MDN](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Methods)

### 常见状态码
- 1XX（信息描述）：接受的请求正在处理。

- 2XX（成功状态）：请求正常处理完毕。其中206表示请求部分内容成功/Range。

- 3XX（重定向状态）：需要进行附加操作以完成请求。

- 4XX（客户端错误）：服务器无法处理请求。

- 5XX（服务器错误）：服务器处理请求出错。

### 常见的请求头和响应头

#### 请求头(Request Header Field)

- Accept：浏览器可接受的MIME类型。
    - Accept-Charset：浏览器可接受的字符集。
    - Accept-Encoding：浏览器能够进行解码的数据编码方式，比如gzip。Servlet能够向支持gzip的浏览器返回经gzip编码的HTML页面。许多情形下这可以减少5到10倍的下载时间。
    - Accept-Language：浏览器所希望的语言种类，当服务器能够提供一种以上的语言版本时要用到。
    - Authorization：授权信息，通常出现在对服务器发送的WWW - Authenticate头的应答中。
- Connection：表示是否需要持久连接。如果Servlet看到这里的值为“Keep - Alive”，或者看到请求使用的是HTTP 1.1（HTTP 1.1默认进行持久连接），它就可以利用持久连接的优点，当页面包含多个元素时（例如Applet，图片），显著地减少下载所需要的时间。要实现这一点，Servlet需要在应答中发送一个  Content - Length头，最简单的实现方法是：先把内容写入ByteArrayOutputStream，然后在正式写出内容之前计算它的大小。
- Content - Length：表示请求消息正文的长度。
- Cookie：这是最重要的请求头信息之一，参见后面《Cookie处理》一章中的讨论。
- From：请求发送者的email地址，由一些特殊的Web客户程序使用，浏览器不会用到它。
- Host：初始URL中的主机和端口。
- If-Modified-Since：只有当所请求的内容在指定的日期之后又经过修改才返回它，否则返回304“Not Modified”应答。
- Pragma：指定“no - cache”值表示服务器必须返回一个刷新后的文档，即使它是代理服务器而且已经有了页面的本地拷贝。
- Referer：包含一个URL，用户从该URL代表的页面出发访问当前请求的页面。
- User - Agent：浏览器类型，如果Servlet返回的内容与浏览器类型有关则该值非常有用。

#### 响应头
- Location：服务器通过这个头告诉浏览器去访问哪个页面，这个头通常配合302状态码使用
- server: 服务器通过这个头，告诉浏览器服务器类型
- Content-Encoding: 服务器通过这个头告诉浏览器，回送的数据采用的压缩格式
- Content-Length: 服务器通过这个头告诉浏览器，回送的数据的大小长度
- Content-Type: 服务器通过这个头告诉浏览器，回送数据的类型
- Last-Modified: 服务器通过这个头告诉浏览器，缓存资源的最后修改时间
- Refresh：服务器通过这个头告诉浏览器，定时刷新网页
- Content-Disposition: attachment; filename=aaa.zip：服务器通过这个头告诉浏览器，以下载方式打开数据
- ETag: W/"7777-1242234904000"：缓存相关的头，为每一个资源配一个唯一的编号

以下三个组合可以告诉浏览器不要缓存:
``` 
Expires: 0 服务器通过这个头，告诉浏览器把会送的资源缓存多长时间，-1或0，则是不缓存
Cache-Control: no-cache
Pragma: no-cache
```

#### 单请求体
- 单文件上传
``` 
/*
原始boundary以及头尾部boundary的不同之处：
  ---------------------------195362999817818974031690194806 // oriBoundary，设置在Content-Type中
-----------------------------195362999817818974031690194806 // 头部boundary，--oriBoundary（前面2个-）
-----------------------------195362999817818974031690194806-- // 尾部boundary，--oriBoundary--（前后都有2个--）
*/

-----------------------------195362999817818974031690194806 // 头部boundary
Content-Disposition: form-data; name="userfile"; filename="vcpg" // 内容属性，form-data; name="服务器用于接收文件的参数名": filename="文件被发送给服务器时所使用的名称"
Content-Type: application/octet-stream // 万能文件类型
// 空行
// 文件内容开始
//...
// 文件内容结束
-----------------------------195362999817818974031690194806-- // 尾部boundary，其紧贴文件内容的结尾
```

- 多文件上传
``` 
-----------------------------418888951815204591197893077 // 文件1的头部boundary
Content-Disposition: form-data; name="userfile[]"; filename="文件1.md"
Content-Type: text/markdown
// 空行
// 文件1内容开始
// ...
// 文件1内容结束
-----------------------------418888951815204591197893077 // 文件2的头部boundary
Content-Disposition: form-data; name="userfile[]"; filename="文件2"
Content-Type: application/octet-stream
// 空行
// 文件2内容开始
// ...
// 文件2内容结束
-----------------------------418888951815204591197893077 // 文件3的头部boundary
Content-Disposition: form-data; name="userfile[]"; filename="文件3"
Content-Type: application/octet-stream
// 空行
// 文件3内容开始
// ...
// 文件3内容结束
-----------------------------418888951815204591197893077 // 参数username的头部boundary
Content-Disposition: form-data; name="username"

zhangsan
-----------------------------418888951815204591197893077 // 参数password的头部boundary
Content-Disposition: form-data; name="password"

zhangxx
-----------------------------418888951815204591197893077-- // 尾部boundary，表示结束
```

### 常见的POST提交数据

#### application/x-www-form-urlencoded
这应该是最常见的 POST 提交数据的方式了。浏览器的原生 <form> 表单，如果不设置 enctype 属性，那么最终就会以 application/x-www-form-urlencoded 方式提交数据。请求类似于下面这样（无关的请求头在本文中都省略掉了）：
``` 
POST http://www.example.com HTTP/1.1
Content-Type: application/x-www-form-urlencoded;charset=utf-8

title=test&sub%5B%5D=1&sub%5B%5D=2&sub%5B%5D=3
```

在chrome的network里面显示的是form-data，可用getParameter获取

#### multipart/form-data

我们使用表单上传文件时，必须让 <form> 表单的 enctype 等于 multipart/form-data。示例：
``` 
POST http://www.example.com HTTP/1.1
Content-Type:multipart/form-data; boundary=----WebKitFormBoundaryrGKCBY7qhFd3TrwA

------WebKitFormBoundaryrGKCBY7qhFd3TrwA
Content-Disposition: form-data; name="text"

title
------WebKitFormBoundaryrGKCBY7qhFd3TrwA
Content-Disposition: form-data; name="file"; filename="chrome.png"
Content-Type: image/png

PNG ... content of chrome.png ...
------WebKitFormBoundaryrGKCBY7qhFd3TrwA--
```
首先生成了一个 boundary 用于分割不同的字段，为了避免与正文内容重复，boundary 很长很复杂。然后 Content-Type 里指明了数据是以 multipart/form-data 来编码，本次请求的 boundary 是什么内容。消息主体里按照字段个数又分为多个结构类似的部分，每部分都是以 --boundary 开始，紧接着是内容描述信息，然后是回车，最后是字段具体内容（文本或二进制）。如果传输的是文件，还要包含文件名和文件类型信息。消息主体最后以 --boundary-- 标示结束。

#### application/json
例如AngularJS中Ajax请求，默认提交JSon

``` 
// http post
var data = {'title':'test', 'sub' : [1,2,3]};
$http.post(url, data).success(function(result) {
    ...
});


// http request
POST http://www.example.com HTTP/1.1 
Content-Type: application/json;charset=utf-8

{"title":"test","sub":[1,2,3]}
```

这个时候就不是form-data，而是Request-payLoad，如果要接受，需要用InputStream从body里面获取
#### application/xml

用的很少，是一种XML-RPC


### http常见知识点

####　301和302的区别

- 301 redirect: 301 代表永久性转移(Permanently Moved)
- 302 redirect: 302 代表暂时性转移(Temporarily Moved )

301和302都代表重定向，也就是说浏览器拿到这个状态码后会自动跳转到一个新地址，这个地址可以从`Location`中获取。

不同点在于301表示旧地址A的资源已经被永久地移除了（这个资源不可访问了），搜索引擎在抓取新内容的同时也将旧的网址交换为重定向之后的网址；302表示旧地址A的资源还在（仍然可以访问），这个重定向只是临时地从旧地址A跳转到地址B，搜索引擎会抓取新的内容而保存旧的网址
