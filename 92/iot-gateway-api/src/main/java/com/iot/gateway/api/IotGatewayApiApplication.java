package com.iot.gateway.api;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication(scanBasePackages = "com.iot.gateway")
@EnableDiscoveryClient
@EnableFeignClients(basePackages = "com.iot.gateway.common.feign")
@MapperScan("com.iot.gateway.persistence.mapper")
@EnableAsync
public class IotGatewayApiApplication {

    public static void main(String[] args) {
        SpringApplication.run(IotGatewayApiApplication.class, args);
    }
}
