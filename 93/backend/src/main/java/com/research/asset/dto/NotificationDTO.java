package com.research.asset.dto;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
public class NotificationDTO {

    private UUID id;
    private String type;
    private String title;
    private String content;
    private UUID relatedId;
    private Boolean isRead;
    private LocalDateTime createdAt;
}
