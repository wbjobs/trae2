package com.doccollab.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;

@Data
public class DocumentCreateDTO {

    @NotBlank(message = "文档名称不能为空")
    private String name;

    private String description;

    private String fileName;

    private String mimeType;
}
