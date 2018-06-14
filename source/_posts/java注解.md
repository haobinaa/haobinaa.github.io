---
title: java注解
date: 2017-11-27 14:06:31
tags: javaSE
categories: javaSE
---
### 元注解
元注解的作用是为了注释其他注解

#### @Target
说明了注解修饰的对象范围，可能的值在枚举类`ElementType`中:
1. ElemenetType.CONSTRUCTOR 构造器声明 
2. ElemenetType.FIELD 域声明(包括 enum 实例) 
3. ElemenetType.LOCAL_VARIABLE 局部变量声明 
4. ElemenetType.METHOD 方法声明 
5. ElemenetType.PACKAGE 包声明 
6. ElemenetType.PARAMETER 参数声明 
7. ElemenetType.TYPE 类，接口(包括注解类型)或enum声明 

示例:
``` 
@Target(ElementType.TYPE)
public @interface Table {
    public String tableName() default "className";
}


@Target(ElementType.FIELD)
public @interface NoDBColumn {

}
```
上述例子中，注解Table 可以用于注解类、接口(包括注解类型) 或enum声明,而注解NoDBColumn仅可用于注解类的成员变量。

#### @Retention
表示需要在什么级别保存该注释信息，用于描述注解的生命周期（即：被描述的注解在什么范围内有效）。可能的值在枚举类`RetentionPolicy`中：

- RetentionPolicy.SOURCE 源文件有效(被编译器抛弃)
- RetentionPolicy.CLASS class文件有效(被VM抛弃)
- RetentionPolicy.RUNTIME VM将在运行期也保留注解，因此可以通过反射机制读取注解的信息

#### @Documented
用于描述其它类型的annotation应该被作为被标注的程序成员的公共API，因此可以被例如javadoc此类的工具文档化。Documented是一个标记注解，没有成员。

示例：
``` 
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface Column {
    public String name() default "fieldName";
    public String setFuncName() default "setField";
    public String getFuncName() default "getField"; 
    public boolean defaultDBValue() default false;
}
```

#### @Inherited

@Inherited 元注解是一个标记注解，@Inherited阐述了某个被标注的类型是被继承的。如果一个使用了@Inherited修饰的annotation类型被用于一个class，则这个annotation将被用于该class的子类。

@Inherited annotation类型是被标注过的class的子类所继承。类并不从它所实现的接口继承annotation，方法并不从它所重载的方法继承annotation。

当@Inherited annotation类型标注的annotation的Retention是RetentionPolicy.RUNTIME，则反射API增强了这种继承性。如果我们使用java.lang.reflect去查询一个@Inherited annotation类型的annotation时，反射代码检查将展开工作：检查class和其父类，直到发现指定的annotation类型被发现，或者到达类继承结构的顶层

示例：
``` 
@Inherited
public @interface Greeting {
    public enum FontColor{ BULE,RED,GREEN};
    String name();
    FontColor fontColor() default FontColor.GREEN;
}
```


### 自定义注解
使用@interface自定义注解时，自动继承了java.lang.annotation.Annotation接口，由编译程序自动完成其他细节。在定义注解时，不能继承其他的注解或接口。@interface用来声明一个注解，其中的每一个方法实际上是声明了一个配置参数。方法的名称就是参数的名称，返回值类型就是参数的类型（返回值类型只能是基本类型、Class、String、enum）。可以通过default来声明参数的默认值

#### 定义注解格式：  
public @interface 注解名 {定义体}
- 注解参数支持类型：  
    1. 所有基本类型
    2. String类型
    3. Class类型
    4. enum类型
    5. Annotation类型
    6. 以上所有类型的数组

#### Annotation参数
1. 只能用public或默认(default)这两个访问权修饰.例如,String value();这里把方法设为defaul默认类型
2. 参数成员只能用基本类型byte,short,char,int,long,float,double,boolean八种基本数据类型和 String,Enum,Class,annotations等数据类型,以及这一些类型的数组.例如,String value();这里的参数成员就为String;
3. 如果只有一个参数成员,最好把参数名称设为"value",后加小括号.例:下面的例子FruitName注解就只有一个参数成员

``` 
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface FruitName {
    String value() default "";
}
```
#### 示例
- 先定义一个注解Definination:
``` 
@Target({ElementType.TYPE, ElementType.METHOD, ElementType.FIELD, ElementType.CONSTRUCTOR})
@Retention(RetentionPolicy.RUNTIME)
public @interface Definination {
    String name();
    int id() default 0;
    Class<Long> gid();
}
```


- 在`UseAntation`中使用注解
```
@Definination(name = "type", gid = Long.class) //类注解
public class UseAnotation {
    // 类成员注解
    @Definination(name = "param", id = 1, gid = Long.class)
    private Integer age;

    // 构造方法注解
    @Definination(name = "construct", id = 2, gid = Long.class)
    public UseAnotation() {}

    // 类方法注解
    @Definination(name = "public method", id = 3, gid = Long.class)
    public void publicClassMethod() {

    }

    // 类方法注解
    @Definination(name = "protected method", id = 4, gid = Long.class)
    protected void protectedClassMethod() {}

    // 类方法注解
    @Definination(name = "private method", id = 5, gid = Long.class)
    private  void privateClassMethod() {}
}
```


- 实现注解
``` 
public class AnotationImplement {
    /**
     * 打印UseAntation中所有的类注解
     */
    public static void parseTypeAnotation() throws ClassNotFoundException {
        Class clazz = Class.forName("org.javacore.anotation.UseAnotation");
        Annotation[] annotations = clazz.getAnnotations();
        for (Annotation annotation : annotations) {
            Definination definination = (Definination) annotation;
            System.out.println("id = " + definination.id() + " ;name = " + definination.name() + " ;gid = " + definination.gid());
        }
    }

    public static void parseMethodAnotation() {
        Method[] methods = UseAnotation.class.getDeclaredMethods();
        for (Method method : methods) {
            // 判断方法中是否有指定注解类型的注解
            boolean hasAnnotation = method.isAnnotationPresent(Definination.class);
            if (hasAnnotation) {
                // 根据注解类型返回方法的指定类型注解
                Definination annotation = method.getAnnotation(Definination.class);
                System.out.println("method = " + method.getName()
                    + " ; id = " + annotation.id() + " ; description = "
                    + annotation.name() + "; gid= " + annotation.gid());
            }
        }
    }

    public static void parseConstructAnnotation() {
        Constructor[] constructors = UseAnotation.class.getConstructors();
        for (Constructor constructor : constructors) {
            boolean hasAnnotation = constructor.isAnnotationPresent(Definination.class);
            if (hasAnnotation) {
                Definination annotation = (Definination) constructor.getAnnotation(Definination.class);
                System.out.println("constructor = " + constructor.getName()
                    + " ; id = " + annotation.id() + " ; description = "
                    + annotation.name() + "; gid= "+annotation.gid());
            }
        }
    }

    public static void main(String[] args) throws ClassNotFoundException {
        System.out.println("class annotation:");
        parseTypeAnotation();
        System.out.println("method annotation: ");
        parseMethodAnotation();
        System.out.println("constructor annotation: ");
        parseConstructAnnotation();
    }
```


### 参考资料
- [java注解](https://github.com/brianway/java-learning/blob/master/blogs/javase/java%E5%9F%BA%E7%A1%80%E5%B7%A9%E5%9B%BA%E7%AC%94%E8%AE%B0(6)-%E6%B3%A8%E8%A7%A3.md)
- [自定义注解入门](http://www.cnblogs.com/peida/archive/2013/04/24/3036689.html)
- [java注解的几大用法](http://blog.csdn.net/tigerdsh/article/details/8848890)
- [深入理解java注解](https://zhuanlan.zhihu.com/p/33062491)