---
title: PHP使用RabbitMQ之安装使用
date: 2017-10-22 10:30:31
tags: rabbitMQ
categories: RabbitMQ
---
本次操作基于centos7


RabbitMQ是基于erlang，首先安装erlang
> rpm -Uvh http://www.rabbitmq.com/releases/erlang/erlang-18.1-1.el7.centos.x86_64.rpm

然后安装rabbitMQ-server
> rpm -Uvh http://www.rabbitmq.com/releases/rabbitmq-server/v3.5.6/rabbitmq-server-3.5.6-1.noarch.rpm

检查是否安装成功命令 `rpm -qa | grep rabbitmq`


- 开启rabbitmq`service rabbitmq-server start`
- 关闭rabbitmq`service rabbitmq-server stop`
- 查看rabbitmq运行状态`rabbitmqctl status`

安装rabbitmq-c-0.8.0
> wget https://github.com/alanxz/rabbitmq-c/releases/download/v0.8.0/rabbitmq-c-0.8.0.tar.gz  
cd rabbitmq-c-0.8.0  
./configure --prefix=/usr/local/rabbitmq-c  
make  
make install   

安装AMQP扩展
> wget http://pecl.php.net/get/amqp-1.7.1.tgz  
解压并进入：  
phpize  
./configure --with-php-config=/usr/local/php/bin/php-config --with-amqp --with-librabbitmq-dir=/usr/local/rabbitmq-c/  
make && make install

执行phpize期间出现了一个错误`Cannot find autoconf. Please check your autoconf installation and the $PHP_AUTOCONF environment variable. Then, rerun this script.`
``` 
yum install m4
yum install autoconf
```

修改php配置文件，在最后一行加上`extionsion=amqp.so`

执行`php -m | grep amqp`,完美！

接下来看看AMQP类的大概使用

### 一、AMQPConnection
```
public bool connect ( void )
public __construct ([ array $credentials = array() ] )
public bool disconnect ( void )
public string getHost ( void )
public string getLogin ( void )
public string getPassword ( void )
public int getPort ( void )
public string getVhost ( void )
public bool isConnected ( void )
public bool reconnect ( void )
public bool setHost ( string $host )
public bool setLogin ( string $login )
public bool setPassword ( string $password )
public bool setPort ( int $port )
public bool setVhost ( string $vhost )
```
1. construct  
$credentials是凭证，是传一些配置参数。包括host、vhost、port、login、password(前五个值会有默认值，建议在config里面初始化)、read_timeout、connect_timeout、write_timeout（这三个值是最新版才有）

2. AMQPChannel  
``` 
client ：客户端
Broker：英文含义是代理，这里指代理服务器，也是通常说的server，也可以指Rabbit cluster的节点，
也就是在AMQPConnection的配置文件中的host、port
virtual_host：虚拟host，这个可以理解为在Broker中，虚拟出来的消息处理模块。一个Broker中
可以创建多个virtual_host.
exchange：逻辑上属于virtual_host的子模块，负责消息转发到queue中。
queue：逻辑上属于virtual_host的子模块。
channel：通道。链接virtual_host的通道。
routingkey：

virtual_host和channel的设置都是为了增加并发性能，降低资源消耗的。
```

3.AMQPExchange  
主要是::setType(String $exchangeType)设置exchange的类型，是rabbitmq的核心。目前有：AMQP_EX_TYPE_DIRECT、 AMQP_EX_TYPE_FANOUT、AMQP_EX_TYPE_HEADERS 、 AMQP_EX_TYPE_TOPIC   

4.AMQPQueue  
::setFlags(int $flag)，可选参数：AMQP_DURABLE, AMQP_PASSIVE,AMQP_EXCLUSIVE, AMQP_AUTODELETE  

auto_delete:默认参数，当队列中有消费者，则队列存在，当没有消费者链接，则队列删除

durable：持久化，队列不删除，注意仅仅是队列持久，消息不持久（消息的持久在publish时的增加属性delivery_mode）。消费的消息，从队列里删除，未消费的消息保存在队列中，不需要关注是否有消费者。最实用

passive：声明一个已存在的队列。意义不大，如果队列不存在会抛出异常。

exclusive：排他队列，如果一个队列被声明为排他队列，该队列仅对首次声明它的连接可见，并在连接断开时自动删除。这里需要注意三点：
- 排他队列是基于连接可见的，同一连接的不同信道是可以同时访问同一个连接创建的排他队列的。
- “首次”，如果一个连接已经声明了一个排他队列，其他连接是不允许建立同名的排他队列的，这个与普通队列不同。
- 即使该队列是持久化的，一旦连接关闭或者客户端退出，该排他队列都会被自动删除的。这种队列适用于只限于一个客户端发送读取消息的应用场景。


本文来自：[PHP的AMQP类](http://www.huangxiaobai.com/archives/1294)


