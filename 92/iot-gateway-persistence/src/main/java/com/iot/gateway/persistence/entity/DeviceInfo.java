package com.iot.gateway.persistence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("iot_device_info")
public class DeviceInfo {

    @TableId(type = IdType.INPUT)
    private String deviceId;

    private String deviceName;

    private Integer protocolType;

    private String productKey;

    private String deviceSecret;

    private Integer status;

    private String lastIp;

    private Integer lastPort;

    private LocalDateTime lastOnlineTime;

    private LocalDateTime lastOfflineTime;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private String extraInfo;
}
