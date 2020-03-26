---
title: spring事务传播
date: 2020-02-07 14:44:02
tags:
categories: spring
---
### Spring 事务不生效的原因

#### 同一个类中无事务方法调用一个有事务方法事务不生效

``` 
public void testTransactionWork() {
    insertTransaction();
}

@Transactional
public void insertTransaction() {
    testMapper.insert("lili");
    throw new NullPointerException("null");
}
```
在同一个类中，外部调用`testTransactionWork`，`testTransactionWork`无事务, `insertTransaction
`有事务, 执行后记录还是插入成功，并没有因为`insertTransaction`抛出异常而回滚，事务没有生效.


原因: AOP使用的是动态代理的机制，它会给类生成一个代理类，事务的相关操作都在代理类上完成。内部方式是实例调用，调用的还是原来的对象的方法，不会被 AOP 增强。


### Spring 事务的传播级别

Spring 事务传播级别与数据库事务隔离级别不同，传播分为 7 种级别:
1. `PROPAGATION_REQUIRED`：Spring的默认传播级别，如果上下文中存在事务则加入当前事务，如果不存在事务则新建事务执行。

2. `PROPAGATION_SUPPORTS`：如果上下文中存在事务则加入当前事务，如果没有事务则以非事务方式执行。

3. `PROPAGATION_MANDATORY`：该传播级别要求上下文中必须存在事务，否则抛出异常

4. `PROPAGATION_REQUIRES_NEW`：该传播级别每次执行都会创建新事务，并同时将上下文中的事务挂起，执行完当前线程后再恢复上下文中事务。（子事务的执行结果不影响父事务的执行和回滚）

5. `PROPAGATION_NOT_SUPPORTED`：当上下文中有事务则挂起当前事务，执行完当前逻辑后再恢复上下文事务。（降低事务大小，将非核心的执行逻辑包裹执行。）

6. `PROPAGATION_NEVER`：该传播级别要求上下文中不能存在事务，否则抛出异常。

7. `PROPAGATION_NESTED`：嵌套事务，如果上下文中存在事务则作为内层事务嵌套执行，如果不存在则新建事务。如果外层有事务并抛出异常，被嵌套的内层事务会回滚，反之如果内层事务抛出异常，外层事务不受影响。

### PROPAGATION_REQUIRED    

在`UserService`中申明事务的传播级别为`PROPAGATION.REQUIRED`:
``` 
@Service
public class UserServiceImpl {

    @Transactional(propagation = Propagation.REQUIRED)
    public void addRequired(User user){
        userMapper.insert(user);
    }

    @Transactional(propagation = Propagation.REQUIRED)
    public void addRequiredException(User user){
        userMapper.insert(user);
        throw new RuntimeException();
    }
    
}
```

#### 外围未开启事务

方法一:
``` 
public void notransaction_exception_required_required(){
    User user=new User();
    user.setName("李四");
    userService.addRequired(user);
    throw new RuntimeException();
}
```

方法二:
``` 
@Override
public void notransaction_required_required_exception(){
    User user1=new User();
    user1.setName("张三");
    userService.addRequired(user1);
    
    User user2=new User();
    user2.setName("李四");
    userService.addRequiredException(user2);
}
```

结果分析:

| 序号        | 结果    |  原因  |
| --------   | :-----:   | :---- |
| 方法一        | 插入数据"李四"      |   外围方法没开启事务, 不影响插入数据的独立方法    |
| 方法二        | 未插入数据      |   在 addRequiredException 独立事务中抛出了异常，数据回滚   |

#### 外围方法开启事务

方法一:
``` 
@Transactional(propagation = Propagation.REQUIRED)
public void transaction_exception_required_required(){
    User user1=new User();
    user1.setName("张三");
    userService.addRequired(user1);  
    throw new RuntimeException();
}
```

方法二:
``` 
@Transactional(propagation = Propagation.REQUIRED)
public void transaction_required_required_exception(){
    User user1=new User();
    user1.setName("张三");
    userService.addRequired(user1);
    
    User user2=new User();
    user2.setName("李四");
    userService.addRequiredException(user2);
}
```

方法三:
``` 
@Transactional
public void transaction_required_required_exception_try(){
    User user1=new User();
    user1.setName("张三");
    userService.addRequired(user1);
    
    User user2=new User();
    user2.setName("李四");
    try {
        userService.addRequiredException(user2);
    } catch (Exception e) {
        System.out.println("方法回滚");
    }
}
```

结果分析:

| 序号        | 结果    |  原因  |
| --------   | :-----:   | :---- |
| 方法一        | 未插入数据      |   外围方法开启事务，内部方法加入外围方法事务，外围方法回滚，内部方法也要回滚    |
| 方法二        | 未插入数据      |  外围方法开启事务，内部方法加入外围方法事务，内部方法抛出异常回滚，外围方法感知异常致使整体事务回滚   |
| 方法三        | 未插入数据      |  外围方法开启事务，内部方法加入外围方法事务，内部方法抛出异常回滚，即使方法被catch不被外围方法感知，整个事务依然回滚   |

这里针对方法三的情况做一个分析，这是比较常见的情况，很多时候我们认为异常被捕获了就可以正常插入数据，但是实际会抛出`org.springframework.transaction.UnexpectedRollbackException
: Transaction rolled back because it has been marked as rollback-only`这个异常，数据不会插入。

这里的原因是，当事务发生异常会设置一个状态 `Rollback`, 如果外围事务读到了这个异常的状态，提交的时候就会抛出上述的异常(详细代码可以看参考资料中 Spring 事务源码分析)

### PROPAGATION_REQUIRES_NEW

给 `UserService` 新增一个传播等级为 `Propagation.REQUIRES_NEW` 的方法:
``` 
@Service
public class UserServiceImpl implements UserService {
    //省略其他...
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void addRequiresNew(User user){
        userMapper.insert(user);
    }
    
    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void addRequiresNewException(User user){
        userMapper.insert(user);
        throw new RuntimeException();
    }
}
```

#### 外围没有开启事务
方法一:
``` 
public void notransaction_exception_requiresNew_requiresNew(){
    User user1=new User();
    user1.setName("张三");
    userService.addRequiresNew(user1);
    
    User user2=new User();
    user2.setName("李四");
    userService.addRequiresNew(user2);
    throw new RuntimeException();
}
```

方法二:
``` 
public void notransaction_requiresNew_requiresNew_exception(){
    User user1=new User();
    user1.setName("张三");
    userService.addRequiresNew(user1);
    
    User user2=new User();
    user2.setName("李四");
    userService.addRequiresNewException(user2);
}
```

结果： 两种都成功插入，外围未开启事务。`Propagation.REQUIRES_NEW`传播级别下会开启自己的事务，独立运行

#### 外围开启事务

方法一:
``` 
@Transactional(propagation = Propagation.REQUIRED)
public void transaction_exception_required_requiresNew_requiresNew(){
    User user1=new User();
    user1.setName("张三");
    userService.addRequired(user1);
    
    User user2=new User();
    user2.setName("李四");
    userService.addRequiresNew(user2);
    
    User user3=new User();
    user3.setName("王五");
    userService.addRequiresNew(user3);
    throw new RuntimeException();
}
```

方法二:
``` 
@Transactional(propagation = Propagation.REQUIRED)
public void transaction_required_requiresNew_requiresNew_exception(){
    User user1=new User();
    user1.setName("张三");
    userService.addRequired(user1);
    
    User user2=new User();
    user2.setName("李四");
    userService.addRequiresNew(user2);
}
```

方法三
``` 
@Transactional(propagation = Propagation.REQUIRED)
public void transaction_required_requiresNew_requiresNew_exception(){
    User user1=new User();
    user1.setName("张三");
    userService.addRequired(user1);
    
    User user2=new User();
    user2.setName("李四");
    userService.addRequiresNew(user2);
    
    User user3=new User();
    user3.setName("王五");
    try {
        userService.addRequiresNewException(user3);
    } catch (Exception e) {
        System.out.println("回滚");
    }
}
```


结果:

| 序号        | 结果    |  原因  |
| --------   | :-----:   | :---- |
| 方法一        | 张三未插入，李四插入     |   外围方法开启事务，并抛出异常，张三与外围方法共一个事务故回滚，李四都是新开启事务，不受外围方法影响    |
| 方法二        | 张三未插入，李四插入，王五未插入      |  外围方法开启事务，插入“张三”方法和外围方法一个事务，插入“李四”方法、插入“王五”方法分别在独立的新建事务中。插入“王五”方法抛出异常，首先插入 “王五”方法的事务被回滚，异常继续抛出被外围方法感知，外围方法事务亦被回滚，故插入“张三”方法也被回滚   |
| 方法三        | 张三插入，李四插入，王五未插入     |  外围方法开启事务，插入“张三”方法和外围方法一个事务，插入“李四”方法、插入“王五”方法分别在独立的新建事务中。插入“王五”方法抛出异常，首先插入“王五”方法的事务被回滚，异常被catch不会被外围方法感知，外围方法事务不回滚，故插入“张三”方法插入成功   |


这里的捕获异常的情况下，与 `PROPAGATION_REQUIRE` 级别下比较， 因为捕获异常的事务方法是一个独立的事务，即使设置了自己的事务为 `Rollback-only` 也不会影响外围事务


### PROPAGATION_NESTED

`UserService` 新增 `PROPAGATION_NESTED` 传播级别的方法:
``` 
@Service
public class UserServiceImpl implements UserService {
    //省略其他...
    @Override
    @Transactional(propagation = Propagation.NESTED)
    public void addNested(User2 user){
        user2Mapper.insert(user);
    }
    
    @Override
    @Transactional(propagation = Propagation.NESTED)
    public void addNestedException(User2 user){
        user2Mapper.insert(user);
        throw new RuntimeException();
    }
}
```

#### 外围方法没有开启事务

方法一:
``` 
public void notransaction_exception_nested_nested(){
    User user1=new User();
    user1.setName("张三");
    userService.addNested(user1);
    throw new RuntimeException();
}
```

方法二:
``` 
public void notransaction_nested_nested_exception(){
    User1 user1=new User1();
    user1.setName("张三");
    user1Service.addNested(user1);
    
    User2 user2=new User2();
    user2.setName("李四");
    user2Service.addNestedException(user2);
}
```

结果:

| 序号        | 结果    |  原因  |
| --------   | :-----:   | :---- |
| 方法一        | 插入数据"张三"      |   外围方法没开启事务, 不影响插入数据的独立方法    |
| 方法二        | 张三插入，李四未插入      |   外围没有开启事务，分别在自己独立方法的事务中运行，李四插入抛出异常所以回滚   |

#### 外围方法开启事务

方法一:
``` 
@Transactional
public void transaction_exception_nested_nested(){
    User user1=new User();
    user1.setName("张三");
    userService.addNested(user1);
    throw new RuntimeException();
}
```

方法二:
``` 
@Transactional
public void transaction_nested_nested_exception(){
    User user1=new User();
    user1.setName("张三");
    userService.addNested(user1);
    
    User user2=new User();
    user2.setName("李四");
    userService.addNestedException(user2);
}
```

方法三
``` 
@Transactional
public void transaction_nested_nested_exception(){
    User user1=new User();
    user1.setName("张三");
    userService.addNested(user1);
    
    User user2=new User();
    user2.setName("李四");
    try {
        user2Service.addNestedException(user2);
    } catch (Exception e) {
        System.out.println("方法回滚");
    }
}
```

结果：

| 序号        | 结果    |  原因  |
| --------   | :-----:   | :---- |
| 方法一        | 张三未插入    |   外围方法开启事务，并抛出异常，内部方法必须回滚    |
| 方法二        | 张三、李四均未插入     |  外围方法开启事务，内部事务为外围事务的子事务，内部方法抛出异常回滚，且外围方法感知异常致使整体事务回滚   |
| 方法三        | 张三插入，李四未插入     |  外围方法开启事务，内部事务为外围事务的子事务，插入“张三”内部方法抛出异常，可以单独对子事务回滚   |

### 参考资料

- [Spring 事务源码剖析](https://www.javazhiyin.com/24922.html)
- [一口气说出6中@Transactional失效的场景](https://juejin.im/post/5e72e97c6fb9a07cb346083f#heading-2)