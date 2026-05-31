package com.doccollab.service;

import java.io.InputStream;
import java.util.List;

public interface MinioService {

    String uploadFile(String tenantId, String fileName, InputStream inputStream, String contentType);

    InputStream downloadFile(String tenantId, String fileName);

    void deleteFile(String tenantId, String fileName);

    String getFileUrl(String tenantId, String fileName);

    void copyFile(String tenantId, String sourceFileName, String targetFileName);

    boolean bucketExists();

    void createBucketIfNotExists();

    List<String> listObjectKeys(String prefix);
}
