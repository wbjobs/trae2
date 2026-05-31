package com.doccollab.service.impl;

import com.doccollab.dto.DocumentCreateDTO;
import com.doccollab.dto.DocumentDTO;
import com.doccollab.entity.Document;
import com.doccollab.entity.DocumentVersion;
import com.doccollab.exception.BusinessException;
import com.doccollab.repository.DocumentRepository;
import com.doccollab.repository.DocumentVersionRepository;
import com.doccollab.service.DocumentService;
import org.springframework.beans.BeanUtils;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.annotation.Resource;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class DocumentServiceImpl implements DocumentService {

    @Resource
    private DocumentRepository documentRepository;

    @Resource
    private DocumentVersionRepository documentVersionRepository;

    @Resource
    private MongoTemplate mongoTemplate;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public DocumentDTO createDocument(String tenantId, String userId, DocumentCreateDTO createDTO) {
        if (documentRepository.existsByTenantIdAndName(tenantId, createDTO.getName())) {
            throw new BusinessException("文档名称已存在");
        }

        Document document = new Document();
        document.setTenantId(tenantId);
        document.setName(createDTO.getName());
        document.setDescription(createDTO.getDescription());
        document.setCreatedBy(userId);
        document.setVersion(0L);

        document = documentRepository.save(document);

        return convertToDTO(document);
    }

    @Override
    public DocumentDTO getDocumentById(String tenantId, String documentId) {
        Query query = new Query();
        query.addCriteria(Criteria.where("_id").is(documentId).and("tenantId").is(tenantId));
        Document document = mongoTemplate.findOne(query, Document.class);

        if (document == null) {
            throw new BusinessException("文档不存在");
        }

        return convertToDTO(document);
    }

    @Override
    public List<DocumentDTO> getDocumentsByTenantId(String tenantId) {
        Query query = new Query();
        query.addCriteria(Criteria.where("tenantId").is(tenantId));
        List<Document> documents = mongoTemplate.find(query, Document.class);

        return documents.stream()
                .map(this::convertToDTO)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public DocumentDTO updateDocument(String tenantId, String documentId, String name, String description) {
        Query query = new Query();
        query.addCriteria(Criteria.where("_id").is(documentId).and("tenantId").is(tenantId));
        Document document = mongoTemplate.findOne(query, Document.class);

        if (document == null) {
            throw new BusinessException("文档不存在");
        }

        if (!document.getName().equals(name) && documentRepository.existsByTenantIdAndName(tenantId, name)) {
            throw new BusinessException("文档名称已存在");
        }

        document.setName(name);
        document.setDescription(description);
        document = documentRepository.save(document);

        return convertToDTO(document);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteDocument(String tenantId, String documentId) {
        Query query = new Query();
        query.addCriteria(Criteria.where("_id").is(documentId).and("tenantId").is(tenantId));
        Document document = mongoTemplate.findOne(query, Document.class);

        if (document == null) {
            throw new BusinessException("文档不存在");
        }

        documentRepository.delete(document);

        Query versionQuery = new Query();
        versionQuery.addCriteria(Criteria.where("documentId").is(documentId).and("tenantId").is(tenantId));
        List<DocumentVersion> versions = mongoTemplate.find(versionQuery, DocumentVersion.class);
        documentVersionRepository.deleteAll(versions);
    }

    private DocumentDTO convertToDTO(Document document) {
        DocumentDTO dto = new DocumentDTO();
        BeanUtils.copyProperties(document, dto);

        if (document.getCurrentVersionId() != null) {
            Optional<DocumentVersion> versionOpt = documentVersionRepository.findById(document.getCurrentVersionId());
            versionOpt.ifPresent(version -> dto.setCurrentVersionNumber(version.getVersionNumber()));
        }

        return dto;
    }
}
