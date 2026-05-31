package com.doccollab.service;

import com.doccollab.dto.DocumentCreateDTO;
import com.doccollab.dto.DocumentDTO;

import java.util.List;

public interface DocumentService {

    DocumentDTO createDocument(String tenantId, String userId, DocumentCreateDTO createDTO);

    DocumentDTO getDocumentById(String tenantId, String documentId);

    List<DocumentDTO> getDocumentsByTenantId(String tenantId);

    DocumentDTO updateDocument(String tenantId, String documentId, String name, String description);

    void deleteDocument(String tenantId, String documentId);
}
