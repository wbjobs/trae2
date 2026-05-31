package com.doccollab.service.impl;

import com.doccollab.dto.DocumentVersionDTO;
import com.doccollab.dto.VersionSnapshotDTO;
import com.doccollab.entity.Document;
import com.doccollab.entity.DocumentVersion;
import com.doccollab.exception.BusinessException;
import com.doccollab.repository.DocumentRepository;
import com.doccollab.repository.DocumentVersionRepository;
import com.doccollab.service.VersionService;
import org.springframework.beans.BeanUtils;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.annotation.Resource;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class VersionServiceImpl implements VersionService {

    @Resource
    private DocumentVersionRepository documentVersionRepository;

    @Resource
    private DocumentRepository documentRepository;

    @Resource
    private MongoTemplate mongoTemplate;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public DocumentVersionDTO createVersion(String tenantId, String userId, VersionSnapshotDTO snapshotDTO) {
        Query docQuery = new Query();
        docQuery.addCriteria(Criteria.where("_id").is(snapshotDTO.getDocumentId()).and("tenantId").is(tenantId));
        Document document = mongoTemplate.findOne(docQuery, Document.class);

        if (document == null) {
            throw new BusinessException("文档不存在");
        }

        if (snapshotDTO.getExpectedVersion() != null) {
            if (!snapshotDTO.getExpectedVersion().equals(document.getVersion())) {
                throw new BusinessException(409, "文档已被其他人修改，请刷新后重新编辑");
            }
        }

        Integer nextVersionNumber = getNextVersionNumber(snapshotDTO.getDocumentId(), tenantId);

        String snapshotHash = calculateHash(snapshotDTO.getFileContent());

        DocumentVersion previousLatest = null;
        if (nextVersionNumber > 1) {
            previousLatest = documentVersionRepository
                    .findFirstByDocumentIdAndTenantIdOrderByVersionNumberDesc(snapshotDTO.getDocumentId(), tenantId)
                    .orElse(null);

            if (previousLatest != null && previousLatest.getSnapshotHash() != null && previousLatest.getSnapshotHash().equals(snapshotHash)) {
                throw new BusinessException("文件内容未变更，无需创建新版本");
            }

            Query updateQuery = new Query();
            updateQuery.addCriteria(Criteria.where("documentId").is(snapshotDTO.getDocumentId())
                    .and("tenantId").is(tenantId)
                    .and("isLatest").is(true));
            Update update = new Update();
            update.set("isLatest", false);
            mongoTemplate.updateMulti(updateQuery, update, DocumentVersion.class);
        }

        DocumentVersion version = new DocumentVersion();
        version.setDocumentId(snapshotDTO.getDocumentId());
        version.setTenantId(tenantId);
        version.setVersionNumber(nextVersionNumber);
        version.setBaseVersionNumber(previousLatest != null ? previousLatest.getVersionNumber() : null);
        version.setFileName(snapshotDTO.getFileName());
        version.setFilePath(snapshotDTO.getFilePath());
        version.setFileSize(snapshotDTO.getFileSize());
        version.setMimeType(snapshotDTO.getMimeType());
        version.setSnapshotHash(snapshotHash);
        version.setChangeLog(snapshotDTO.getChangeLog());
        version.setCreatedBy(userId);
        version.setIsLatest(true);

        version = documentVersionRepository.save(version);

        Query updateDocQuery = new Query();
        updateDocQuery.addCriteria(Criteria.where("_id").is(snapshotDTO.getDocumentId()).and("tenantId").is(tenantId)
                .and("version").is(document.getVersion()));
        Update docUpdate = new Update();
        docUpdate.set("currentVersionId", version.getId());
        docUpdate.inc("version", 1);
        mongoTemplate.updateFirst(updateDocQuery, docUpdate, Document.class);

        return convertToDTO(version);
    }

    @Override
    public DocumentVersionDTO getVersionById(String tenantId, String versionId) {
        Query query = new Query();
        query.addCriteria(Criteria.where("_id").is(versionId).and("tenantId").is(tenantId));
        DocumentVersion version = mongoTemplate.findOne(query, DocumentVersion.class);

        if (version == null) {
            throw new BusinessException("版本不存在");
        }

        return convertToDTO(version);
    }

    @Override
    public DocumentVersionDTO getVersionByNumber(String tenantId, String documentId, Integer versionNumber) {
        Query query = new Query();
        query.addCriteria(Criteria.where("documentId").is(documentId)
                .and("tenantId").is(tenantId)
                .and("versionNumber").is(versionNumber));
        DocumentVersion version = mongoTemplate.findOne(query, DocumentVersion.class);

        if (version == null) {
            throw new BusinessException("版本不存在");
        }

        return convertToDTO(version);
    }

    @Override
    public List<DocumentVersionDTO> getVersionsByDocumentId(String tenantId, String documentId) {
        Query query = new Query();
        query.addCriteria(Criteria.where("documentId").is(documentId).and("tenantId").is(tenantId));
        List<DocumentVersion> versions = mongoTemplate.find(query, DocumentVersion.class);

        return versions.stream()
                .map(this::convertToDTO)
                .collect(Collectors.toList());
    }

    @Override
    public DocumentVersionDTO getLatestVersion(String tenantId, String documentId) {
        Query query = new Query();
        query.addCriteria(Criteria.where("documentId").is(documentId)
                .and("tenantId").is(tenantId)
                .and("isLatest").is(true));
        DocumentVersion version = mongoTemplate.findOne(query, DocumentVersion.class);

        if (version == null) {
            throw new BusinessException("暂无版本");
        }

        return convertToDTO(version);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteVersion(String tenantId, String versionId) {
        Query query = new Query();
        query.addCriteria(Criteria.where("_id").is(versionId).and("tenantId").is(tenantId));
        DocumentVersion version = mongoTemplate.findOne(query, DocumentVersion.class);

        if (version == null) {
            throw new BusinessException("版本不存在");
        }

        documentVersionRepository.delete(version);

        if (version.getIsLatest()) {
            Optional<DocumentVersion> newLatestOpt = documentVersionRepository
                    .findFirstByDocumentIdAndTenantIdOrderByVersionNumberDesc(version.getDocumentId(), tenantId);

            if (newLatestOpt.isPresent()) {
                DocumentVersion newLatest = newLatestOpt.get();
                newLatest.setIsLatest(true);
                documentVersionRepository.save(newLatest);

                Query updateDocQuery = new Query();
                updateDocQuery.addCriteria(Criteria.where("_id").is(version.getDocumentId()).and("tenantId").is(tenantId));
                Update docUpdate = new Update();
                docUpdate.set("currentVersionId", newLatest.getId());
                mongoTemplate.updateFirst(updateDocQuery, docUpdate, Document.class);
            } else {
                Query updateDocQuery = new Query();
                updateDocQuery.addCriteria(Criteria.where("_id").is(version.getDocumentId()).and("tenantId").is(tenantId));
                Update docUpdate = new Update();
                docUpdate.unset("currentVersionId");
                mongoTemplate.updateFirst(updateDocQuery, docUpdate, Document.class);
            }
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public DocumentVersionDTO restoreVersion(String tenantId, String userId, String documentId, Integer versionNumber) {
        Query docQuery = new Query();
        docQuery.addCriteria(Criteria.where("_id").is(documentId).and("tenantId").is(tenantId));
        Document document = mongoTemplate.findOne(docQuery, Document.class);

        if (document == null) {
            throw new BusinessException("文档不存在");
        }

        DocumentVersion targetVersion = documentVersionRepository
                .findByDocumentIdAndVersionNumberAndTenantId(documentId, versionNumber, tenantId)
                .orElseThrow(() -> new BusinessException("版本不存在"));

        Query updateQuery = new Query();
        updateQuery.addCriteria(Criteria.where("documentId").is(documentId)
                .and("tenantId").is(tenantId)
                .and("isLatest").is(true));
        Update update = new Update();
        update.set("isLatest", false);
        mongoTemplate.updateMulti(updateQuery, update, DocumentVersion.class);

        targetVersion.setIsLatest(true);
        targetVersion = documentVersionRepository.save(targetVersion);

        Query updateDocQuery = new Query();
        updateDocQuery.addCriteria(Criteria.where("_id").is(documentId).and("tenantId").is(tenantId));
        Update docUpdate = new Update();
        docUpdate.set("currentVersionId", targetVersion.getId());
        mongoTemplate.updateFirst(updateDocQuery, docUpdate, Document.class);

        return convertToDTO(targetVersion);
    }

    private Integer getNextVersionNumber(String documentId, String tenantId) {
        Optional<DocumentVersion> latestVersion = documentVersionRepository
                .findFirstByDocumentIdAndTenantIdOrderByVersionNumberDesc(documentId, tenantId);

        return latestVersion.map(version -> version.getVersionNumber() + 1).orElse(1);
    }

    private String calculateHash(byte[] content) {
        if (content == null || content.length == 0) {
            return null;
        }

        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            InputStream is = new ByteArrayInputStream(content);
            byte[] buffer = new byte[8192];
            int read;
            while ((read = is.read(buffer)) > 0) {
                digest.update(buffer, 0, read);
            }
            byte[] hashBytes = digest.digest();
            StringBuilder sb = new StringBuilder();
            for (byte b : hashBytes) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new BusinessException("计算文件哈希失败：" + e.getMessage());
        }
    }

    private DocumentVersionDTO convertToDTO(DocumentVersion version) {
        DocumentVersionDTO dto = new DocumentVersionDTO();
        BeanUtils.copyProperties(version, dto);
        return dto;
    }
}
