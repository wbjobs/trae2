package com.doccollab.service.impl;

import com.doccollab.dto.BranchCreateDTO;
import com.doccollab.dto.BranchMergeDTO;
import com.doccollab.dto.DocumentBranchDTO;
import com.doccollab.entity.Document;
import com.doccollab.entity.DocumentBranch;
import com.doccollab.entity.DocumentVersion;
import com.doccollab.exception.BusinessException;
import com.doccollab.repository.DocumentBranchRepository;
import com.doccollab.repository.DocumentRepository;
import com.doccollab.repository.DocumentVersionRepository;
import com.doccollab.service.DocumentBranchService;
import com.doccollab.service.MinioService;
import org.springframework.beans.BeanUtils;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.annotation.Resource;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class DocumentBranchServiceImpl implements DocumentBranchService {

    @Resource
    private DocumentBranchRepository branchRepository;

    @Resource
    private DocumentRepository documentRepository;

    @Resource
    private DocumentVersionRepository versionRepository;

    @Resource
    private MinioService minioService;

    @Resource
    private MongoTemplate mongoTemplate;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public DocumentBranchDTO createBranch(String tenantId, String userId, String documentId, BranchCreateDTO createDTO) {
        Query docQuery = new Query();
        docQuery.addCriteria(Criteria.where("_id").is(documentId).and("tenantId").is(tenantId));
        Document document = mongoTemplate.findOne(docQuery, Document.class);
        if (document == null) {
            throw new BusinessException("文档不存在");
        }

        if (branchRepository.existsByDocumentIdAndTenantIdAndName(documentId, tenantId, createDTO.getName())) {
            throw new BusinessException("分支名称已存在");
        }

        DocumentVersion baseVersion = null;
        if (createDTO.getBaseVersionId() != null) {
            baseVersion = versionRepository.findByIdAndTenantId(createDTO.getBaseVersionId(), tenantId)
                    .orElseThrow(() -> new BusinessException("基础版本不存在"));
        } else if (createDTO.getBaseVersionNumber() != null) {
            baseVersion = versionRepository
                    .findByDocumentIdAndVersionNumberAndTenantId(documentId, createDTO.getBaseVersionNumber(), tenantId)
                    .orElseThrow(() -> new BusinessException("基础版本不存在"));
        } else if (document.getCurrentVersionId() != null) {
            baseVersion = versionRepository.findById(document.getCurrentVersionId()).orElse(null);
        }

        boolean isFirstBranch = branchRepository.findByDocumentIdAndTenantId(documentId, tenantId).isEmpty();

        DocumentBranch branch = new DocumentBranch();
        branch.setDocumentId(documentId);
        branch.setTenantId(tenantId);
        branch.setName(createDTO.getName());
        branch.setDescription(createDTO.getDescription());
        branch.setBaseVersionId(baseVersion != null ? baseVersion.getId() : null);
        branch.setBaseVersionNumber(baseVersion != null ? baseVersion.getVersionNumber() : null);
        branch.setCurrentVersionId(baseVersion != null ? baseVersion.getId() : null);
        branch.setCurrentVersionNumber(baseVersion != null ? baseVersion.getVersionNumber() : null);
        branch.setCreatedBy(userId);
        branch.setStatus("ACTIVE");
        branch.setIsDefault(isFirstBranch);
        branch.setUpdatedAt(LocalDateTime.now());

        branch = branchRepository.save(branch);

        return convertToDTO(branch);
    }

    @Override
    public DocumentBranchDTO getBranchById(String tenantId, String branchId) {
        DocumentBranch branch = branchRepository.findByIdAndTenantId(branchId, tenantId)
                .orElseThrow(() -> new BusinessException("分支不存在"));
        return convertToDTO(branch);
    }

    @Override
    public List<DocumentBranchDTO> getBranchesByDocumentId(String tenantId, String documentId) {
        Query query = new Query();
        query.addCriteria(Criteria.where("documentId").is(documentId).and("tenantId").is(tenantId));
        List<DocumentBranch> branches = mongoTemplate.find(query, DocumentBranch.class);
        return branches.stream()
                .map(this::convertToDTO)
                .collect(Collectors.toList());
    }

    @Override
    public DocumentBranchDTO getDefaultBranch(String tenantId, String documentId) {
        DocumentBranch branch = branchRepository
                .findByDocumentIdAndTenantIdAndIsDefaultTrue(documentId, tenantId)
                .orElse(null);
        return branch != null ? convertToDTO(branch) : null;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public DocumentBranchDTO switchBranch(String tenantId, String userId, String documentId, String branchId) {
        DocumentBranch targetBranch = branchRepository.findByIdAndTenantId(branchId, tenantId)
                .orElseThrow(() -> new BusinessException("分支不存在"));

        if (!targetBranch.getDocumentId().equals(documentId)) {
            throw new BusinessException("分支不属于该文档");
        }

        Query updateQuery = new Query();
        updateQuery.addCriteria(Criteria.where("documentId").is(documentId)
                .and("tenantId").is(tenantId)
                .and("isDefault").is(true));
        Update update = new Update();
        update.set("isDefault", false);
        mongoTemplate.updateMulti(updateQuery, update, DocumentBranch.class);

        targetBranch.setIsDefault(true);
        targetBranch.setUpdatedAt(LocalDateTime.now());
        targetBranch = branchRepository.save(targetBranch);

        Query docUpdateQuery = new Query();
        docUpdateQuery.addCriteria(Criteria.where("_id").is(documentId).and("tenantId").is(tenantId));
        Update docUpdate = new Update();
        docUpdate.set("currentVersionId", targetBranch.getCurrentVersionId());
        mongoTemplate.updateFirst(docUpdateQuery, docUpdate, Document.class);

        return convertToDTO(targetBranch);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public DocumentBranchDTO mergeBranch(String tenantId, String userId, String documentId, BranchMergeDTO mergeDTO) {
        DocumentBranch sourceBranch = branchRepository.findByIdAndTenantId(mergeDTO.getSourceBranchId(), tenantId)
                .orElseThrow(() -> new BusinessException("源分支不存在"));
        DocumentBranch targetBranch = branchRepository.findByIdAndTenantId(mergeDTO.getTargetBranchId(), tenantId)
                .orElseThrow(() -> new BusinessException("目标分支不存在"));

        if (!sourceBranch.getDocumentId().equals(documentId) || !targetBranch.getDocumentId().equals(documentId)) {
            throw new BusinessException("分支不属于该文档");
        }

        if (sourceBranch.getCurrentVersionId() == null) {
            throw new BusinessException("源分支没有可合并的版本");
        }

        DocumentVersion sourceVersion = versionRepository.findById(sourceBranch.getCurrentVersionId())
                .orElseThrow(() -> new BusinessException("源版本不存在"));

        String newFilePath = tenantId + "/" + documentId + "/" + UUID.randomUUID().toString() + ".html";
        minioService.copyFile(tenantId, sourceVersion.getFilePath(), newFilePath);

        DocumentVersion mergedVersion = new DocumentVersion();
        mergedVersion.setDocumentId(documentId);
        mergedVersion.setTenantId(tenantId);
        mergedVersion.setBaseVersionNumber(targetBranch.getCurrentVersionNumber());
        mergedVersion.setFileName(sourceVersion.getFileName());
        mergedVersion.setFilePath(newFilePath);
        mergedVersion.setFileSize(sourceVersion.getFileSize());
        mergedVersion.setMimeType(sourceVersion.getMimeType());
        mergedVersion.setSnapshotHash(sourceVersion.getSnapshotHash());
        mergedVersion.setChangeLog("Merge branch '" + sourceBranch.getName() + "' into '" + targetBranch.getName() + "': " +
                (mergeDTO.getChangeLog() != null ? mergeDTO.getChangeLog() : ""));
        mergedVersion.setCreatedBy(userId);
        mergedVersion.setIsLatest(true);

        Integer nextVersionNumber = getNextVersionNumber(documentId, tenantId);
        mergedVersion.setVersionNumber(nextVersionNumber);

        Query updateQuery = new Query();
        updateQuery.addCriteria(Criteria.where("documentId").is(documentId)
                .and("tenantId").is(tenantId)
                .and("isLatest").is(true));
        Update update = new Update();
        update.set("isLatest", false);
        mongoTemplate.updateMulti(updateQuery, update, DocumentVersion.class);

        mergedVersion = versionRepository.save(mergedVersion);

        targetBranch.setCurrentVersionId(mergedVersion.getId());
        targetBranch.setCurrentVersionNumber(mergedVersion.getVersionNumber());
        targetBranch.setUpdatedAt(LocalDateTime.now());
        targetBranch = branchRepository.save(targetBranch);

        Query docUpdateQuery = new Query();
        docUpdateQuery.addCriteria(Criteria.where("_id").is(documentId).and("tenantId").is(tenantId));
        Update docUpdate = new Update();
        docUpdate.set("currentVersionId", mergedVersion.getId());
        mongoTemplate.updateFirst(docUpdateQuery, docUpdate, Document.class);

        return convertToDTO(targetBranch);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public DocumentBranchDTO updateBranch(String tenantId, String branchId, String name, String description) {
        DocumentBranch branch = branchRepository.findByIdAndTenantId(branchId, tenantId)
                .orElseThrow(() -> new BusinessException("分支不存在"));

        if (!branch.getName().equals(name)) {
            if (branchRepository.existsByDocumentIdAndTenantIdAndName(branch.getDocumentId(), tenantId, name)) {
                throw new BusinessException("分支名称已存在");
            }
        }

        branch.setName(name);
        branch.setDescription(description);
        branch.setUpdatedAt(LocalDateTime.now());
        branch = branchRepository.save(branch);
        return convertToDTO(branch);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteBranch(String tenantId, String branchId) {
        DocumentBranch branch = branchRepository.findByIdAndTenantId(branchId, tenantId)
                .orElseThrow(() -> new BusinessException("分支不存在"));

        if (branch.getIsDefault()) {
            throw new BusinessException("不能删除默认分支");
        }

        branch.setStatus("DELETED");
        branch.setUpdatedAt(LocalDateTime.now());
        branchRepository.save(branch);
    }

    private Integer getNextVersionNumber(String documentId, String tenantId) {
        Optional<DocumentVersion> latestVersion = versionRepository
                .findFirstByDocumentIdAndTenantIdOrderByVersionNumberDesc(documentId, tenantId);
        return latestVersion.map(version -> version.getVersionNumber() + 1).orElse(1);
    }

    private DocumentBranchDTO convertToDTO(DocumentBranch branch) {
        DocumentBranchDTO dto = new DocumentBranchDTO();
        BeanUtils.copyProperties(branch, dto);
        Query versionCountQuery = new Query();
        versionCountQuery.addCriteria(Criteria.where("documentId").is(branch.getDocumentId())
                .and("tenantId").is(branch.getTenantId())
                .and("versionNumber").gte(branch.getBaseVersionNumber() != null ? branch.getBaseVersionNumber() : 0));
        dto.setVersionCount((int) mongoTemplate.count(versionCountQuery, DocumentVersion.class));
        return dto;
    }
}
