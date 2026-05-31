package com.doccollab.service;

import com.doccollab.dto.DocumentVersionDTO;
import com.doccollab.dto.VersionSnapshotDTO;

import java.util.List;

public interface VersionService {

    DocumentVersionDTO createVersion(String tenantId, String userId, VersionSnapshotDTO snapshotDTO);

    DocumentVersionDTO getVersionById(String tenantId, String versionId);

    DocumentVersionDTO getVersionByNumber(String tenantId, String documentId, Integer versionNumber);

    List<DocumentVersionDTO> getVersionsByDocumentId(String tenantId, String documentId);

    DocumentVersionDTO getLatestVersion(String tenantId, String documentId);

    void deleteVersion(String tenantId, String versionId);

    DocumentVersionDTO restoreVersion(String tenantId, String userId, String documentId, Integer versionNumber);
}
