package com.iot.gateway.common.model;

import lombok.Data;

import javax.validation.Valid;
import javax.validation.constraints.NotEmpty;
import javax.validation.constraints.NotNull;
import java.io.Serializable;
import java.util.List;

@Data
public class BatchDeviceDataRequest implements Serializable {

    private static final long serialVersionUID = 1L;

    @NotEmpty(message = "设备数据列表不能为空")
    @Valid
    private List<DeviceDataItem> dataList;

    private String gatewayInstance;

    private Boolean async = true;

    @Data
    public static class DeviceDataItem implements Serializable {

        private static final long serialVersionUID = 1L;

        @NotNull(message = "deviceId不能为空")
        private String deviceId;

        @NotNull(message = "messageType不能为空")
        private Integer messageType;

        private java.util.Map<String, Object> payload;

        private Long timestamp;

        private String messageId;

        private Integer qos;

        private Boolean needAck;
    }
}
