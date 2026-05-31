package com.iot.gateway.common.model;

import com.iot.gateway.common.enums.ProtocolType;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
public class ProtocolVersion implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;

    private ProtocolType protocolType;

    private String version;

    private String versionName;

    private String description;

    private String codecClassName;

    private Boolean isDefault;

    private Boolean isEnabled;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private String extraInfo;
}
