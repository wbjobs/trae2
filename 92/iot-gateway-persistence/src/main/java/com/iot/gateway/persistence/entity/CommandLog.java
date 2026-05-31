package com.iot.gateway.persistence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("iot_command_log")
public class CommandLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String deviceId;

    private String commandId;

    private String commandType;

    private String params;

    private Integer status;

    private String result;

    private LocalDateTime sendTime;

    private LocalDateTime ackTime;

    private String gatewayInstance;

    private LocalDateTime createTime;
}
