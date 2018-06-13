---
title: mysql基础类型
date: 2017-12-07 10:49:21
tags: mysql
categories: mysql
---
### 数据类型
创建mysql数据表的时候，通常会指定类型和长度，那么到底代表什么意思呢，每种类型最大长度又是多少，经过我的查阅资料和实验，把结果记录一下

#### tinyint、smallint等整型
对于tinyint、smallint、mediumint、int、bigint等指定长度是没有意义的，后面那个length只是影响显示字符的个数，比如int(10)，如果不足十位会补足0(zerofill)，如果超过了宽度则不受此限制。

#### float,double,decimal等实数
值得注意的是decimal(十六个字节)一般用于精度高的存储，decimal(4,1)指的是一共四位，小数点后1位，如果插入1234，则显示999.9

长度表：

| type |  length | 
|-----|---------|
| tinyint | 1 字节 | 
| smallint | 2 字节 |
| mediumint | 3 字节 |
| int   | 4 字节 |
| bigint | 8 字节 |
| float(length, decimals) | 4 字节 |
| double (length, decimals)| 8 字节 |
| decimal (length, decimals) | 16 字节 |

#### 日期和时间类型
timestamp比datatime空间效率更高

| type |  length | description |
|-----|---------|--------------|
| date | 3 字节 | YYYY-MM-DD 格式|
| time | 3 字节 | HH:MM:SS 格式|
| datetime | 8 字节 | YYYY-MM-DD HH:MM:SS |
| TIMESTAMP | 4 字节 | YYYYMMDDHHMMSS |

#### char和varchar

对于char来说，长度是固定的，最大为255字符，最大长度=255*每个字符占用的字节数，由编码来决定的。

对于varchar来说，长度不是固定的，最大长度为65535个字节，但是varchar需要用额外的字节来存储长度信息，小于255时一个字节来存储，大于255需要两个字节。varchar(length)这个length实际上是字符数，最大长度也是根据编码来决定的，比如utf8一个字符占三个字节，那么varchar的最大长度=65535/3约为21485个字符。

但是！！！！varchar的最大长度可不是这么算的，干货来了！

mysql有个限制规则
##### 限制规则
- 存储限制：varchar 字段是将实际内容单独存储在聚簇索引之外，内容开头用1到2个字节表示实际长度（长度超过255时需要2个字节），因此最大长度不能超过65535
- 编码长度限制：
    - 字符类型若为gbk，每个字符最多占2个字节，最大长度不能超过32766;
    - 字符类型若为utf8，每个字符最多占3个字节，最大长度不能超过21845  
 若定义的时候超过上述限制，则varchar字段会被强行转为text类型，并产生warning
 
- 行长度限制

导致实际应用中varchar长度限制的是一个行定义的长度。 MySQL要求一个行的定义长度不能超过65535。

举个例子：
``` 
create table t4(c int, c2 char(30), c3 varchar(N)) charset=utf8;
```
此刻N =  (65535-1-2-4-30*3)/3=21812

减1的原因是实际行存储从第二个字节开始’;

减2的原因是varchar头部的2个字节表示长度;

减的4原因是字符编码是int占4个字节。

减30*3的原因是char(30)占90个字节

除3的原因是utf8一个字符占三个字节


### 参考资料
- [varchar最大长度的计算](http://www.voidcn.com/article/p-qbqrcutb-kq.html)
- 高性能MySQL
