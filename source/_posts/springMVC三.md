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