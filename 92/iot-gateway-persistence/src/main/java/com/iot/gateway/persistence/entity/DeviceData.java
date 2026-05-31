package com.iot.gateway.persistence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("iot_device_data")
public class DeviceData {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String deviceId;

    private String messageId;

    private Integer messageType;

    private String payload;

    private String gatewayInstance;

    private LocalDateTime createTime;
}
