package com.doccollab.service;

import com.doccollab.dto.BranchCreateDTO;
import com.doccollab.dto.BranchMergeDTO;
import com.doccollab.dto.DocumentBranchDTO;

import java.util.List;

public interface DocumentBranchService {
    DocumentBranchDTO createBranch(String tenantId, String userId, String documentId, BranchCreateDTO createDTO);
    DocumentBranchDTO getBranchById(String tenantId, String branchId);
    List<DocumentBranchDTO> getBranchesByDocumentId(String tenantId, String documentId);
    DocumentBranchDTO getDefaultBranch(String tenantId, String documentId);
    DocumentBranchDTO switchBranch(String tenantId, String userId, String documentId, String branchId);
    DocumentBranchDTO mergeBranch(String tenantId, String userId, String documentId, BranchMergeDTO mergeDTO);
    DocumentBranchDTO updateBranch(String tenantId, String branchId, String name, String description);
    void deleteBranch(String tenantId, String branchId);
}
