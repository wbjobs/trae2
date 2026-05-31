package com.research.asset.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class UploadInitDTO {

    @NotBlank(message = "文件名不能为空")
    private String fileName;

    @NotNull(message = "文件大小不能为空")
    private Long fileSize;

    private String fileType;

    private String mimeType;

    @NotNull(message = "分片大小不能为空")
    private Integer chunkSize;
}
