---
title: ES快照原理
date: 2024-03-08 09:49:05
tags: es
categories: 中间件
---

### ES Snapshot 快照

快照模块是 ES 备份、迁移数据的重要手段。ES 快照支持增量备份，支持多种类型的仓库存储。

仓库用于存储快照，支持共享文件系统（例如 nfs），以及通过插件支持的HDFS、Amazon S3、Microsoft Azure、Google GCS。譬如云上对象存储:
- [elasticsearch-repository-cos](https://github.com/tencentyun/elasticsearch-repository-cos)
- [elasticsearch-repository-oss](https://github.com/aliyun/elasticsearch-repository-oss)


### 使用方式

#### repository

1. 创建 repository