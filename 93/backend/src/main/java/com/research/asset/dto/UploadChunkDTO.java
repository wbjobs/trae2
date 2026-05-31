package com.research.asset.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class UploadChunkDTO {

    @NotBlank(message = "上传任务ID不能为空")
    private String uploadId;

    @NotNull(message = "分片号不能为空")
    private Integer chunkNumber;

    @NotNull(message = "分片大小不能为空")
    private Integer chunkSize;

    private String md5;
}
