package com.doccollab.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;

@Data
public class BranchCreateDTO {
    @NotBlank(message = "分支名称不能为空")
    private String name;

    private String description;

    private String baseVersionId;

    private Integer baseVersionNumber;
}
