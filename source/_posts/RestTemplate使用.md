---
title: RestTemplate使用
date: 2018-03-16 23:00:28
tags: springboot
categories: spring
---
### 使用RestTemplate
服务间的调用通常用rest api和rpc两种方式，Spring cloud体系就是基于rest api，使用RestTemplate，基于HttpClient。
#### 配置bean注入的方式
``` 
@Configuration
public class RestTemplateConfig {

    @Bean
    public RestTemplate restTemplate(ClientHttpRequestFactory factory) {
        return new RestTemplate(factory);;
    }

    @Bean
    public ClientHttpRequestFactory simpleClientHttpRequestFactory() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setReadTimeout(5000);
        factory.setConnectTimeout(5000);
        return factory;
    }
}
```

### 配置拦截器

实现`ClientHttpRequestInterceptor`
```
public class HttpInterceptor implements ClientHttpRequestInterceptor {

    private Logger log = LoggerFactory.getLogger(HttpInterceptor.class);

    @Override
    public ClientHttpResponse intercept(HttpRequest request, byte[] body,
            ClientHttpRequestExecution execution) throws IOException {
        log.info("请求地址：{}", request.getURI());
        log.info("请求方法： {}", request.getMethod());
        log.info("请求内容：{}", new String(body));
        log.info("请求头：{}", request.getHeaders());
        return execution.execute(request, body);
    }
}
```
修改生成`RestTemplate`的bean,添加拦截器
```
    @Bean
    public RestTemplate restTemplate(ClientHttpRequestFactory factory) {
        RestTemplate restTemplate = new RestTemplate(factory);
        restTemplate.getInterceptors().add(new HttpInterceptor());
        return restTemplate;
    }
```

我们在拦截器里面打印了请求的信息，但是我想打印相应的信息的时候出了问题。

`ClientHttpResponse`的`getBody()`返回值是一个InputStream，如果在拦截器将`ClientHttpResponse`的body读取了，那么需要获得返回信息的地方就得不到相应体。

解决方案是，在new RestTemplate的时候，使用`BufferingClientHttpRequestFactory`，具体代码如下：
```
    public RestTemplate restTemplate(ClientHttpRequestFactory factory) {
        RestTemplate restTemplate = new RestTemplate(
                new BufferingClientHttpRequestFactory(factory));
        return restTemplate;
    }
```