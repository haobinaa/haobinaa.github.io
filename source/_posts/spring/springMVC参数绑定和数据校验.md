---
title: springMVC(参数绑定)
date: 2017-12-20 18:39:25
tags: springmvc
categories: spring
---
### 参数绑定过程

1. 客户端发出`key:value`形式的请求数据
2. 处理器适配器(handleAdapter)调用SpringMVC的参数绑定组件(`convert`转换器)将key/value转成Controller的形参

### 参数绑定类型

#### Controller形参默认支持的类型
- HttpServletRequest： 获取请求信息的requests对象
- HttpServletResponse： 处理相应信息的response对象
- HttpSession： 操作session的对象
- Model/ModelMap: model是接口，modelMap是model的实现，用于将数据填充到response信息里面


#### 简单类型绑定

对于简单类型，request传入参数名和Controller一致，就能直接绑定

如果参数和Controller形参不一致，可以使用`@RequestParam`进行绑定，还可以通过注解参数`require`来指定参数是否必须要传入

#### pojo绑定
如果页面中input的name与controller形参的pojo属性一致(pojo的属性包含了请求参数的所有key)


#### 日期类型的绑定
对于controller形参中pojo对象，如果属性中有日期类型，需要自定义参数绑定。

1.自定义参数绑定组件(convert)
``` 
public class CustomDateConverter implements Converter<String,Date>{

    public Date convert(String s) {
        //实现 将日期串转成日期类型(格式是yyyy-MM-dd HH:mm:ss)
        SimpleDateFormat simpleDateFormat = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");

        try {
            //转成直接返回
            return simpleDateFormat.parse(s);
        } catch (ParseException e) {
            // TODO Auto-generated catch block
            e.printStackTrace();
        }
        //如果参数绑定失败返回null
        return null;
    }
}
```
2. 配置

首先配置处理器适配器
``` 
<mvc:annotation-driven conversion-service="conversionService"></mvc:annotation-driven>
```

自定义参数绑定
```
<!-- 自定义参数绑定 -->
<bean id="conversionService" class="org.springframework.format.support.FormattingConversionServiceFactoryBean">
    <!-- 转换器 -->
    <property name="converters">
        <list>
            <!-- 日期类型转换 -->
            <bean class="com.haobin.ssm.controller.converter.CustomDateConverter"/>
       </list>
    </property>
</bean>
```

#### 包装类型参数绑定

有时候参数比较复杂，pojo里面的属性是pojo就需要包装类型绑定

当页面参数为这样时：`<input name="itemsCustom.name" />`

在pojo中这样体现：
``` 
public class ItemsQueryVo {

    //商品信息
    private Items items;

    //为了系统 可扩展性，对原始生成的po进行扩展
    private ItemsCustom itemsCustom;
```

controller形参：
``` 
public ModelAndView queryItems(HttpServletRequest request, ItemsQueryVo itemsQueryVo)
```

#### 集合类型绑定

##### 数组类型
如果页面为多选框`checkbox`，一次性传入多个name一致的如下：
```
for
.....
<input type="checkbox" name="items_id" value="${item.id}"/><
```

controller定义：
``` 
public String deleteItems(Integer[] items_id) throws Exception
```

##### list类型

页面表示如下：
``` 
<c:forEach items="${itemsList}" var="item" varStatus="status">
    <tr>

        <td><input name="itemsList[${status.index }].name" value="${item.name }"/></td>
        <td><input name="itemsList[${status.index }].price" value="${item.price }"/></td>
        <td><input name="itemsList[${status.index }].createtime" value="<fmt:formatDate value="${item.createtime}" pattern="yyyy-MM-dd HH:mm:ss"/>"/></td>
        <td><input name="itemsList[${status.index }].detail" value="${item.detail }"/></td>

    </tr>
</c:forEach>
```
定义pojo的属性为list
``` 
public class ItemsQueryVo {

    //商品信息
    private Items items;

    //为了系统 可扩展性，对原始生成的po进行扩展
    private ItemsCustom itemsCustom;

    //批量商品信息
    private List<ItemsCustom> itemsList;
```

controller定义：
``` 
public String editItemsAllSubmit(ItemsQueryVo itemsQueryVo)  {
 
}
```

##### map的绑定
页面定义如下：
``` 
<tr>
<td>学生信息：</td>
<td>
姓名：<inputtype="text"name="itemInfo['name']"/>
年龄：<inputtype="text"name="itemInfo['price']"/>
.. .. ..
</td>
</tr>
```

pojo对象定义：
``` 
Public class QueryVo {
private Map<String, Object> itemInfo = new HashMap<String, Object>();
  //get/set方法..
}
```

controller形参
```

public String useraddsubmit(Model model,QueryVo queryVo) {
System.out.println(queryVo.getStudentinfo());
}
```

### 数据校验
使用hibernate校验框架(`hibernate-validator`)进行后端的数据校验


maven依赖：

``` 
<dependency>
    <groupId>org.hibernate</groupId>
    <artifactId>hibernate-validator</artifactId>
    <version>5.2.4.Final</version>
</dependency>
```

#### 配置校验器
``` 
<!-- 校验器 -->
<bean id="validator"
      class="org.springframework.validation.beanvalidation.LocalValidatorFactoryBean">
    <!-- hibernate校验器-->
    <property name="providerClass" value="org.hibernate.validator.HibernateValidator" />
    <!-- 指定校验使用的资源文件，在文件中配置校验错误信息，如果不指定则默认使用classpath下的ValidationMessages.properties -->
    <property name="validationMessageSource" ref="messageSource" />
</bean>
<!-- 校验错误信息配置文件 -->
<bean id="messageSource"
      class="org.springframework.context.support.ReloadableResourceBundleMessageSource">
    <!-- 资源文件名-->
    <property name="basenames">
        <list>
            <value>classpath:CustomValidationMessages</value>
        </list>
    </property>
    <!-- 资源文件编码格式 -->
    <property name="fileEncodings" value="utf-8" />
    <!-- 对资源文件内容缓存时间，单位秒 -->
    <property name="cacheSeconds" value="120" />
</bean>
```
将校验器注入处理器适配器
``` 
<mvc:annotation-driven conversion-service="conversionService"
                       validator="validator">
</mvc:annotation-driven>
```
`CustomValidationMessages.properties`配置校验错误信息：
``` 
items.name.length.error=请输入1到30个字符的商品名称
items.createtime.isNUll=请输入商品的生产日期
```

#### pojo中添加校验规则
``` 
public class Items {
    private Integer id;
    //校验名称在1到30字符中间
    //message是提示校验出错显示的信息
    //groups：此校验属于哪个分组，groups可以定义多个分组
    @Size(min=1,max=30,message="{items.name.length.error}")
    private String name;

    private Float price;

    private String pic;

    //非空校验
    @NotNull(message="{items.createtime.isNUll}")
    private Date createtime;
```

#### controller中校验

``` 
// 校验pojo
@RequestMapping("/editItemsSubmit")
public String editItemsSubmit(
        @Validated ItemsCustom itemsCustom,
        BindingResult bindingResult)
```

捕获错误并返回错误信息
``` 
//获取校验错误信息
if(bindingResult.hasErrors()){
    // 输出错误信息
    List<ObjectError> allErrors = bindingResult.getAllErrors();

    for (ObjectError objectError :allErrors){
        // 输出错误信息
        System.out.println(objectError.getDefaultMessage());
    }
    // 将错误信息传到页面
    model.addAttribute("allErrors", allErrors);;
}
```

#### 分组校验
有时候不同的controller对同一个pojo需要不同的校验规则，使用分组校验的方式

申明校验分组
``` 
public interface ValidGroup1 {
    //接口中不需要定义任何方法，仅是对不同的校验规则进行分组
    //此分组只校验商品名称长度

}
```

校验规则中添加分组
``` 
//校验名称在1到30字符中间
//message是提示校验出错显示的信息
//groups：此校验属于哪个分组，groups可以定义多个分组
@Size(min=1,max=30,message="{items.name.length.error}",groups = {ValidGroup1.class})
private String name;
```

在Controller中指定分组
``` 
// @Validated的value值指定是哪个分组
@RequestMapping("/editItemsSubmit")
public String editItemsSubmit(
        @Validated(value = ValidGroup1.class)ItemsCustom itemsCustom,
        BindingResult bindingResult)
```
 
### 异常处理

异常分为两种：   
1. 预期异常（在代码中可以预见发生的，代码可捕获的异常）
2. runtime异常，运行期间产生的RuntimeException，系统在运行期间，dao、service、controller抛出的异常都由springmvc前端控制器交给异常处理器(`ExceptionResolver`)处理

#### 自定义异常类
自己可以针对不同的异常类型，自定义异常类，继承于`Exception`
``` 
public class CustomException  extends  Exception{
    //异常信息
    public String message;

    public CustomException(String message){
        super(message);
        this.message = message;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }
}
```

#### 全局异常处理器
系统在运行期间遇到异常，会在程序中向上抛出，顺序是:dao->service->controller->前端控制器->全局异常处理器

全局异常处理器接受到抛出的异常后，进行的处理是：  
1. 如果异常是系统自定义异常，直接返回异常信息
2. 如果不是系统自定义的异常，构造一个自定义的异常类型


SpringMVC提供的`HandlerExceptionResolver`接口：
``` 
 public ModelAndView resolveException(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        //handler就是处理器适配器要执行Handler对象（只有method）
        //解析出异常类型
        //如果该 异常类型是系统 自定义的异常，直接取出异常信息，在错误页面展示
        //String message = null;
        //if(ex instanceof CustomException){
            //message = ((CustomException)ex).getMessage();
        //}else{
            ////如果该 异常类型不是系统 自定义的异常，构造一个自定义的异常类型（信息为“未知错误”）
            //message="未知错误";
        //}

        //上边代码变为
        CustomException customException;
        if(ex instanceof CustomException){
            customException = (CustomException)ex;
        }else{
            customException = new CustomException("未知错误");
        }

        //错误信息
        String message = customException.getMessage();

        ModelAndView modelAndView = new ModelAndView();

        //将错误信息传到页面
        modelAndView.addObject("message", message);

        //指向错误页面
        modelAndView.setViewName("error");

        return modelAndView;

    }
}
```

### 拦截器

#### 拦截定义
定义拦拦截器需要实现`HandlerInterceptor`接口：
``` 
public class HandlerInterceptor1 implements HandlerInterceptor{
    //进入 Handler方法之前执行
    //用于身份认证、身份授权
    //比如身份认证，如果认证通过表示当前用户没有登陆，需要此方法拦截不再向下执行
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {

        //return false表示拦截，不向下执行
        //return true表示放行
        return false;
    }

    //进入Handler方法之后，返回modelAndView之前执行
    //应用场景从modelAndView出发：将公用的模型数据(比如菜单导航)在这里传到视图，也可以在这里统一指定视图
    public void postHandle(HttpServletRequest request, HttpServletResponse response, Object handler, ModelAndView modelAndView) throws Exception {

    }

    //执行Handler完成执行此方法
    //应用场景：统一异常处理，统一日志处理
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) throws Exception {

    }
}
```

HandlerInterpceptor接口需要实现三个方法：  
- `public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)`，进入Handler方法之前执行，一般用于身份认证，授权认证

- `public void postHandle(HttpServletRequest request, HttpServletResponse response, Object handler, ModelAndView modelAndView)`
    - 进入handler方法之后，返回modelAndView之前执行
    - 可以将公共的模型数据放到这里传到视图（导航栏之类的）
- `public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex)`
    - handler执行完之后执行
    - 一般用于统一异常处理或者是统一日志记录
    
#### 拦截器配置
``` 
// 全局拦截器配置
 <!--拦截器 -->
<mvc:interceptors>
    <!--多个拦截器,顺序执行 -->
    <mvc:interceptor>
        <!-- /**表示所有url包括子url路径 -->
        <mvc:mapping path="/**"/>
        <bean class="com.iot.learnssm.firstssm.interceptor.HandlerInterceptor1"></bean>
    </mvc:interceptor>
    <mvc:interceptor>
        <mvc:mapping path="/**"/>
        <bean class="com.iot.learnssm.firstssm.interceptor.HandlerInterceptor2"></bean>
    </mvc:interceptor>
</mvc:interceptors>
```