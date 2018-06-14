---
title: 记录一次编译安装PHP的过程
date: 2017-10-24 23:00:27
tags: php
categories: php
---
为了装rabbitMQ，不得不又重新编译一次PHP，正好换上最新的PHP7.1.2，以后还可以装个Swoole来玩玩，记录一下安装的过程

### 安装PHP
1. 先下载PHP的源码包，在PHP的官网
> wget -O php7.tar.gz http://hk2.php.net/get/php-7.1.10.tar.gz/from/this/mirror(-O的意思是以文件形式下载)

2.解压并进入
> tar -xvf php7.tar.gz  
cd php-7.1.2

3.安装依赖包
> yum install libxml2 libxml2-devel openssl openssl-devel bzip2 bzip2-devel libcurl libcurl-devel libjpeg libjpeg-devel libpng libpng-devel freetype freetype-devel gmp gmp-devel libmcrypt libmcrypt-devel readline readline-devel libxslt libxslt-devel

4.编译配置
``` 
./configure \
--prefix=/usr/local/php \
--with-config-file-path=/etc \
--enable-fpm \
--with-fpm-user=nginx  \
--with-fpm-group=nginx \
--enable-inline-optimization \
--disable-debug \
--disable-rpath \
--enable-shared  \
--enable-soap \
--with-libxml-dir \
--with-xmlrpc \
--with-openssl \
--with-mcrypt \
--with-mhash \
--with-pcre-regex \
--with-sqlite3 \
--with-zlib \
--enable-bcmath \
--with-iconv \
--with-bz2 \
--enable-calendar \
--with-curl \
--with-cdb \
--enable-dom \
--enable-exif \
--enable-fileinfo \
--enable-filter \
--with-pcre-dir \
--enable-ftp \
--with-gd \
--with-openssl-dir \
--with-jpeg-dir \
--with-png-dir \
--with-zlib-dir  \
--with-freetype-dir \
--enable-gd-native-ttf \
--enable-gd-jis-conv \
--with-gettext \
--with-gmp \
--with-mhash \
--enable-json \
--enable-mbstring \
--enable-mbregex \
--enable-mbregex-backtrack \
--with-libmbfl \
--with-onig \
--enable-pdo \
--with-mysqli=mysqlnd \
--with-pdo-mysql=mysqlnd \
--with-zlib-dir \
--with-pdo-sqlite \
--with-readline \
--enable-session \
--enable-shmop \
--enable-simplexml \
--enable-sockets  \
--enable-sysvmsg \
--enable-sysvsem \
--enable-sysvshm \
--enable-wddx \
--with-libxml-dir \
--with-xsl \
--enable-zip \
--enable-mysqlnd-compression-support \
--with-pear \
--enable-opcache
```

5.make安装
> make && make install （其实建议两个分开，有错误方便排查）

6.配置环境变量
> vim /etc/profile  
在末尾追加：  
PATH=$PATH:/usr/local/php/bin  
export PATH  
执行命令使改动生效  
source /etc/profile

7.配置php-fpm
``` 
cp php.ini-production /etc/php.ini
cp /usr/local/php/etc/php-fpm.conf.default /usr/local/php/etc/php-fpm.conf
cp /usr/local/php/etc/php-fpm.d/www.conf.default /usr/local/php/etc/php-fpm.d/www.conf
cp sapi/fpm/init.d.php-fpm /etc/init.d/php-fpm
chmod +x /etc/init.d/php-fpm
```

8.启动php-fpm
>/etc/init.d/php-fpm start

此刻php -v，成功安装PHP

### 安装Nginx
nginx由于各个模块都不太清楚就不编译安装了，找到一个rpm源，yum install之后，由于之前已经把php-fpm相关配置配置好并且成功启动，现在只需要在nginx.conf,把server配置一下

``` 
在server块中修改location
     location ~ \.php$ {
            root    html;
            fastcgi_pass 127.0.0.1:9000;
            fastcgi_param SCRIPT_FILENAME$document_root$fastcgi_script_name;
            fastcgi_index index.php;
            include fastcgi_params;
        }
```
在/usr/share/www/html下新建info.php输出phpinfo()；完美解决