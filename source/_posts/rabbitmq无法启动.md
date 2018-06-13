---
title: Rabbitmq无法启动
date: 2017-10-31 23:41:53
tags: rabbitMQ
categories: RabbitMQ
---

最近一直忙项目，Spring boot好多坑 -_- ！！ 今晚来折腾一下rabbitMQ，打开vagrant，`service rabbitmq-server start`，启动不了，报错如下：
``` 
DIAGNOSTICS
===========

attempted to contact: [rabbit@10]

rabbit@10:
* unable to connect to epmd (port 4369) on 192: badarg (unknown POSIX error)


current node details:
- node name: 'rabbitmq-cli-60@192'
- home dir: /var/lib/rabbitmq
- cookie hash: rb2CNGgDqm+k5+jq1wj6vg==
```

这不是坑爹吗，赶紧百度，CSDN上有人说是什么hostname被改了，我又忘了我之前的hostname是什么，还有人说是报错中`cookie hash`对应的值应该与`.erlang.cookie`的值相等，我由于是rpm装的rabbitmq，`.erlang.cookie`的路径应该是`/var/lib/rabbitmq/.erlang.cookie`，打开果然不一样，然后把上面的值复制进去，重启，还是报一样的错，并且`cookie hash`变了，果然网上的答案水分很大，继续搜索，终于找到答案。


`vim /etc/rabbitmq/rabbitmq-env.conf`，在文件中写入`NODENAME=rabbit@localhost`，保存。再次启动rabbitmq-server，成功！

另外在rabbit-mq的日志看到rabbitmq的各个信息:
``` 
node           : rabbit@he07
home dir       : /var/lib/rabbitmq
config file(s) : /etc/rabbitmq/rabbitmq.config (not found)
cookie hash    : qhOGp9TtH4Rn+BekiYXxIg==
log            : /var/log/rabbitmq/rabbit@he07.log
sasl log       : /var/log/rabbitmq/rabbit@he07-sasl.log
database dir   : /var/lib/rabbitmq/mnesia/rabbit@he07
```
