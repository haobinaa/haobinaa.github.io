---
title: equals和hashcode
date: 2017-11-22 17:05:40
tags: javaSE
categories: javaSE
---

才学java的时候，打印某个对象是打印的一串莫名其妙的数字，后来知道这个是hashcode，就以为hashcode是对象的某个地址信息，直到看了一些文章才发现事实并非如此。

### euqlas

equals的作用是用来判断两个对象是否相等，定义在Object中，通过两个对象的地址来判断对象是否相等。

#### 类没有覆盖equals方法时

如果类没有覆盖equals方法，如果通过equals比较两个对象，实际上是比较两个对象是不是同一个对象，相当于`==`比较

#### 覆盖了equals方法的情况
``` 
public class ConflictHashCodeTest2{

    public static void main(String[] args) {
        // 新建Person对象，
        Person p1 = new Person("eee", 100);
        Person p2 = new Person("eee", 100);
        Person p3 = new Person("aaa", 200);
        Person p4 = new Person("EEE", 100);

        // 新建HashSet对象 
        HashSet set = new HashSet();
        set.add(p1);
        set.add(p2);
        set.add(p3);

        // 比较p1 和 p2， 并打印它们的hashCode()
        System.out.printf("p1.equals(p2) : %s; p1(%d) p2(%d)\n", p1.equals(p2), p1.hashCode(), p2.hashCode());
        // 比较p1 和 p4， 并打印它们的hashCode()
        System.out.printf("p1.equals(p4) : %s; p1(%d) p4(%d)\n", p1.equals(p4), p1.hashCode(), p4.hashCode());
        // 打印set
        System.out.printf("set:%s\n", set);
    }

    private static class Person {
        int age;
        String name;

        public Person(String name, int age) {
            this.name = name;
            this.age = age;
        }

        public String toString() {
            return name + " - " +age;
        }

        /** 
         * @desc重写hashCode 
         */  
        public int hashCode(){  
            int nameHash =  name.toUpperCase().hashCode();
            return nameHash ^ age;
        }

        /** 
         * @desc 覆盖equals方法 
         */  
        @Override
        public boolean equals(Object obj){  
            if(obj == null){  
                return false;  
            }  
              
            //如果是同一个对象返回true，反之返回false  
            if(this == obj){  
                return true;  
            }  
              
            //判断是否类型相同  
            if(this.getClass() != obj.getClass()){  
                return false;  
            }  
              
            Person person = (Person)obj;  
            return name.equals(person.name) && age==person.age;  
        } 
    }
}
```
#### ==和equals
如果equals没有被重写，则与`==`相同，都是比较两个对象**地址是不是相等**


### hashcode方法
hashcode也是定义在Object中，作用是获取哈希码，它返回了一个整数。哈希码的作用是确定该对象在哈希表中索引的位置。  
虽然每个类都有hashcode，但是仅仅某个类的散列表时，该类的hashcode才有用，用来确定该类的某个对象在散列表中的位置，其他情况下hashcode没有作用。

#### 散列码的作用
>我们都知道，散列表存储的是键值对(key-value)，它的特点是：能根据“键”快速的检索出对应的“值”。这其中就利用到了散列码！
 散列表的本质是通过数组实现的。当我们要获取散列表中的某个“值”时，实际上是要获取数组中的某个位置的元素。而数组的位置，就是通过“键”来获取的；更进一步说，数组的位置，是通过“键”对应的散列码计算得到的
 ##### 散列的碰撞
简单的散列方法就是取余，2%10和12%10这两个产生的键都是一样的，这就是碰撞
- 链接法处理碰撞
让发生碰撞的数据公用一个地址，可以让数组的每个slot（槽）都指向一个链表。 
- 开放寻址法处理碰撞
让每个数据尽量分散的映射到一些探查序列上，让每个数据使用探查序列中任何一种的可能性相同，就是所谓的**一致散列**。

常用的方法：线性探查（按着顺序），二次探查、双重探查

### hashcode与equals的关系
当我们往散列表中插入元素时，是通过hashcode找到元素位置，所以有:
1. 两个对象相等，那么hashcode一定相等
2. hashcode相等，两个对象不一定相等（在同一个槽内）

#### 不会创建散列表的类
指的是不会是hashMap、hashTable、hashSet等这些本质是散列表的数据结构的类     
在这种类中，hashcode和equals是没有任何关系的

#### 会创建散列表的类
1. 如果两个对象相等，那么它们的hashCode()值一定相同。这里的相等是指，通过equals()比较两个对象时返回true。
2. 如果两个对象hashCode()相等，它们并不一定相等。因为在散列表中，hashCode()相等，即两个键值对的哈希值相等。然而哈希值相等，并不一定能得出键值对相等。补充说一句：“两个不同的键值对，哈希值相等”，这就是哈希冲突。

这种情况下如果要判断两个对象是否相等，需要同时覆盖equals和hashcode方法
``` 
public class ConflictHashCodeTest2{

    public static void main(String[] args) {
        // 新建Person对象，
        Person p1 = new Person("eee", 100);
        Person p2 = new Person("eee", 100);
        Person p3 = new Person("aaa", 200);
        Person p4 = new Person("EEE", 100);

        // 新建HashSet对象 
        HashSet set = new HashSet();
        set.add(p1);
        set.add(p2);
        set.add(p3);

        // 比较p1 和 p2， 并打印它们的hashCode()
        System.out.printf("p1.equals(p2) : %s; p1(%d) p2(%d)\n", p1.equals(p2), p1.hashCode(), p2.hashCode());
        // 比较p1 和 p4， 并打印它们的hashCode()
        System.out.printf("p1.equals(p4) : %s; p1(%d) p4(%d)\n", p1.equals(p4), p1.hashCode(), p4.hashCode());
        // 打印set
        System.out.printf("set:%s\n", set);
    }

    /**
     * @desc Person类。
     */
    private static class Person {
        int age;
        String name;

        public Person(String name, int age) {
            this.name = name;
            this.age = age;
        }

        public String toString() {
            return name + " - " +age;
        }

        /** 
         * @desc重写hashCode 
         */  
        @Override
        public int hashCode(){  
            int nameHash =  name.toUpperCase().hashCode();
            return nameHash ^ age;
        }

        /** 
         * @desc 覆盖equals方法 
         */  
        public boolean equals(Object obj){  
            if(obj == null){  
                return false;  
            }  
              
            //如果是同一个对象返回true，反之返回false  
            if(this == obj){  
                return true;  
            }  
              
            //判断是否类型相同  
            if(this.getClass() != obj.getClass()){  
                return false;  
            }  
              
            Person person = (Person)obj;  
            return name.equals(person.name) && age==person.age;  
        } 
    }
}
```
可以看到结果如下:
``` 
p1.equals(p2) : true; p1(68545) p2(68545)
p1.equals(p4) : false; p1(68545) p4(68545)
set:[aaa - 200, eee - 100]
```
### 参考资料
- (散列表从理论到实践一)[http://www.cnblogs.com/skywang12345/p/3311899.html]
- (散列表从理论到实践二)[http://www.cnblogs.com/skywang12345/p/3311909.html]
- (散列表从理论到实践三)[http://www.cnblogs.com/skywang12345/p/3311915.html]
