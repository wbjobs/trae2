package com.iot.gateway.common.model;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import java.io.Serializable;
import java.util.Map;

@Data
public class CommandRequest implements Serializable {

    private static final long serialVersionUID = 1L;

    @NotBlank(message = "设备ID不能为空")
    private String deviceId;

    @NotBlank(message = "命令类型不能为空")
    private String commandType;

    @NotNull(message = "命令参数不能为空")
    private Map<String, Object> params;

    private Integer timeout = 30;

    private Boolean needAck = true;

    private Integer qos = 1;
}
