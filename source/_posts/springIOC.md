---
title: springIOC(bean和基本注入)
date: 2017-11-28 09:29:37
tags: spring
categories: spring
---
### 注入方式

#### 构造注入
在类被实例化的时候，它的构造方法被调用并且只能调用一次。所以它被用于类的初始化操作。`<constructor-arg>`是`<bean>`标签的子标签。通过其`<value>`子标签可以为构造方法传递参数

``` 
构造方法如下：
public Student(String name, String sex, int age) {   
    this.name = name;  
    this.sex = sex;  
    this.age = age;  
}  
对应的bean配置：
<bean id="student" class="com.haobin.Student">  
    <constructor-arg>  
        <value>haobin</value>  
    </constructor-arg>  
    <constructor-arg>  
        <value>man</value>  
    </constructor-arg>  
    <constructor-arg>  
        <value>22</value>  
    </constructor-arg>  
</bean>  
```
可以看到`<constructor-arg>`与构造方法参数的顺序一致。
`<constructor-arg>`还有index和type属性可以配置参数的匹配顺序
#### 设值注入
JavaBean的私有属性以对应的get、set方法来实现对属性的封装，Spring也有`<property>`为JavaBean的set方法传递参数
``` 
通过<property>对set方法传递参数：
<bean id="moniter" class="com.haobin.Student">  
    <property name="age">  
        <value>26</value>  
    </property>  
    <property name="name">  
        <value>欣欣</value>  
    </property>  
    <property name="sex">  
        <value>女</value>  
    </property>  
    </bean>
```

#### 赋值标签
- value标签，把值注入指定的Javabean中
``` <value>arg</value>  ```
- ref标签，引用其他的Javabean
``` <ref bean="beanId"/>  ```
- null标签，如Javabean某个属性暂时不用，为他赋NULL值
``` <null/>  ```
- list标签， 为List集合赋值
``` 
<list>  
 // 引用一个定义好的bean
    <ref bean="moniter"/> 
    // 定义一个匿名内部类，用set注入
    <bean class="com.brianway.learning.spring.helloworld.bean.Moniter">
        <property name="age" value="20"/>
        <property name="name" value="阿屁"/>
    </bean> 
</list> 
```
- set标签， 与list类似
``` 
<bean id="school" class="School">  
    <property name="student">  
      <set>  
        <ref bean=" student1"/>  
        <value>name</value>  
      </set>  
    </property>  
<bean> 
```
- map标签，  Map 以键值对（key/value）的方式存放数据，所以需要使用<entry>子标签装载 key 与 value 数据。Map 集合的 key 可以是任何类型的对象，而<entry>标签的属性 key 是以 String 类型表示的，所以限制了 Spring 中 Map 的 key 只能用 String 来表示。
``` 
<bean id="school" class="School">  
  <property name="student">  
    <map>  
      <entry key="key1">  
      <ref bean=" student1" />  
      </entry>  
      <entry key="key2">  
      <value> student2</value>  
      </entry>  
   </map>  
  </property>  
</bean> 
```
- props标签，这是为 java.util.Properties 类型属性赋值的标签，和<map>标签类似，但是它的（key/value）键值全都是 String 类型的，无法赋予 Object 对象类型。props的key对应properties类的key
``` 
<bean id="school" class="School">  
    <property name="student">  
        <props>  
          <prop key="key1">student1</prop>  
          <prop key="key2">student2</prop>  
         </props>  
     </property>  
</bean> 
```
- 匿名内部Javabean，不指定bean的id或者name
``` 
<bean id="school" class="School">  
 <property name="student">  
    <bean class="Student"/> <!--定义学生匿名内部类-->  
 </property>  
</bean>  
```

### 自动装配
 set注入和构造注入有时在做配置时比较麻烦。所以框架为了提高开发效率，提供自动装配功能，简化配置。  
 通过`autowire`属性实现自动装配

### Spring容器bean

#### bean的使用
- id标识了唯一的bean，name可以标识bean或者起别名
- class指定bean的来源
- scope，对应singleton和prototype两种模式，默认是singleton模式
    - singleton：所有对这个bean的请求都只返回唯一实例
    - prototype：每次请求都会创建一个新的bean
改成prototype模式：
``` 
<bean id="student3" class="com.haobin.beanfactory.Student" scope="prototype"></bean> 
```
- bean属性，可以构造注入和set注入

#### bean的生命周期

todo

#### ApplicationContext和beanFactory的区别
1.从`ApplicationContext`中获取bean:  
```
 ApplicationContext ac = new ClassPathXmlApplicationContext("beans.xml");
```
如果使用ApplicationContext，则配置的bean如果是singleton（单例）不管你用不用都被实例化，好处就是可以预先加载，坏处是浪费内存

2.从`beanfactory`获取bean：  
``` 
BeanFactory factory = new XmlBeanFactory（new ClassPathResource("beans.xml")）;
factory.getBean("student");
```
如果是用BeanFactory，则当你实例化该对象的时候，配置的bean不会被马上实例化，当你使用的时候才会被实例化（就像延缓加载机制）好处就是节约内存，缺点是速度回降慢

### bean之间的关系
#### 继承bean配置
1. Spring允许继承bean的配置 ，被继承的bean称为父bean，继承这个父Bean的Bean称为子Bean
- 子Bean从父Bean中继承配置，包括Bean的属性配置
- 子Bean也可以 覆盖 从父Bean继承过来的配置
- 父Bean可以作为配置模版，也可以作为Bean实例， 若只想把父Bean作为模版，可以配置<bean>的abstract属性为true ，这样Spring将不会实例化这个Bean

如果多个bean存在相同的配置信息，Spring允许我们定义一个父，子将自动继承父的配置信息。
``` 
// 假设有有个House.java拥有size、position、price三个属性
<!-- 定义抽象bean -->  
<bean id="abstracthouse" class="com.mucfc.House" p:size="150坪"  
   p:position="天府新区" p:price="15万"/>  
<!-- 继承于abstracthouse -->  
 <bean id="house2" parent="abstracthouse" p:position="软件园"/>  
 <!-- 继承于abstracthouse -->  
 <bean id="house3" parent="abstracthouse" p:price="8万"/>
```
house2,house3将继承abstracthouse的属性，并且house2覆盖position，house3覆盖price
#### 依赖bean
Spring允许用户通过depends-on属性设定Bean前置依赖的Bean ，前置依赖的Bean会在本Bean实例化之前创建好
``` 
<bean id="buyHouser" class="com.mucfc.depend.BuyHouser" />   
<bean id="HouseAgent" class="com.mucfc.depend.HouseAgent" depends-on="buyHouser" /> 
```
在HouseAgent初始化之前，buyHouse会先初始化

### 方法注入
调用一个singleton类型bean A的某个方法时，需要引用另一个非singleton（prototype）类型的bean B，对于bean A来说，容器只会创建一次，这样就没法在需要的时候每次让容器为bean A提供一个新的的bean B实例。spring 提供了三种解决方案：
- 放弃控制反转：通过实现ApplicationContextAware接口让bean A能够感知bean 容器，并且在需要的时候通过使用getBean("B")方式向容器请求一个新的bean B实例
- Lookup方法注入：Lookup方法注入利用了容器的覆盖受容器管理的bean方法的能力，从而返回指定名字的bean实例
- 自定义方法的替代方案(replace)：该注入能使用bean的另一个方法实现去替换自定义的方法

#### lookup方法注入
 Lookup方法注射指容器能够重写容器中bean的抽象或具体方法，返回查找容器中其他bean的结果。 被查找的bean在上面描述的场景中通常是一个non-singleton bean （尽管也可以是一个singleton的）。Spring通过使用CGLIB库在客户端的类之上修改二进制码， 从而实现上述的场景要求
 
 Lookup方法可以使Spring替换一个bean原有的，获取其它对象具体的方法，并自动返回在容器中的查找结果。
 
 ``` 
 首先定义house类
 public class House {
    private String houseSize;  
    private String housePosition;  
    private String housePrice;
    // 省略get/set
 }
 定义每次都能获取一个house对象的MaginHouse
 public interface MaginHouse {  
     House getHouse();  
 }  
 对应的bean.xml
 <!-- House的一个实例bean，定义每次返回不同的实例对象 -->  
 <bean id="house1" class="com.mucfc.House" p:houseSize="200坪"  
     p:housePosition="深南花园" p:housePrice="10万" scope="prototype" />  
 <!-- 实施方法注入 -->  
 <bean id="maginHouse" class="com.mucfc.MaginHouse">  
     <lookup-method name="getHouse" bean="house1" />   
 </bean> 
 // 测试代码
 ApplicationContext applicationContext = new ClassPathXmlApplicationContext("beans.xml");    
 MaginHouse maginHouse=applicationContext.getBean("maginHouse",MaginHouse.class);  
 House house1=maginHouse.getHouse();  
 House house2=maginHouse.getHouse();  
 System.out.println(house1);  
 System.out.println(house2);  
 System.out.println("house2==house1?:"+(house2==house1)); 
 
 可以看到house1和house2是两个不同的对象
 ```
 
 #### 方法替换
 可以用bean里面的方法替换另一个bean里的方法
 ``` 
 // 先定义一个HouseAgent
 public class HouseAgent {
     public House getHouse() {
         House house = new House();
         house.setHousePosition("天鹅湖");
         house.setHousePrice("2.8W");
         house.setHouseSize("100");
         return house;
     }
 }

// 定义OtherHouseAgent，实现MethodReplacer接口
public class OtherHouseAgent implements MethodReplacer{
    public Object reimplement(Object o, Method method, Object[] objects) throws Throwable {
        House house = new House();
        house.setHousePosition("春熙路");
        house.setHousePrice("3W");
        house.setHouseSize("100");
        return house;
    }
}

// bean中配置<replace-method>
    <bean id="houseagent1" class="com.brianway.learning.spring.helloworld.bean.HouseAgent">
        <replaced-method name="getHouse" replacer="houseagent2"/>
    </bean>
    <bean id="houseagent2" class="com.brianway.learning.spring.helloworld.bean.OtherHouseAgent"/>
    
// 测试代码
  HouseAgent houseagent1_1=new HouseAgent();
        House house3=houseagent1_1.getHouse();
        System.out.println("-----------------HouseAgent1未进行方法替换之前-------------------");
        System.out.println(house3);
        //进行方法替换之后
        HouseAgent houseagent1_2= applicationContext.getBean("houseagent1",HouseAgent.class);
        House house4=houseagent1_2.getHouse();
        System.out.println("-----------------HouseAgent1进行方法替换之后-------------------");
        System.out.println(house4);
 ```
 我们可以看到HouseAgent1的House被替换了

### 参考资料
- [林炳文-零基础学Spring](http://blog.csdn.net/column/details/springlearning.html)