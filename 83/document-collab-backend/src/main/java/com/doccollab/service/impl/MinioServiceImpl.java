package com.doccollab.service.impl;

import com.doccollab.exception.BusinessException;
import com.doccollab.service.MinioService;
import com.doccollab.util.FileUtil;
import io.minio.*;
import io.minio.errors.*;
import io.minio.http.Method;
import io.minio.messages.Item;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class MinioServiceImpl implements MinioService {

    private final MinioClient minioClient;

    @Value("${minio.bucketName}")
    private String bucketName;

    public MinioServiceImpl(MinioClient minioClient) {
        this.minioClient = minioClient;
    }

    @Override
    public String uploadFile(String tenantId, String fileName, InputStream inputStream, String contentType) {
        try {
            createBucketIfNotExists();

            String uniqueFileName = FileUtil.generateUniqueFileName(fileName);
            String objectName = getObjectName(tenantId, uniqueFileName);

            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(bucketName)
                            .object(objectName)
                            .stream(inputStream, -1, 10 * 1024 * 1024)
                            .contentType(contentType)
                            .build()
            );

            return uniqueFileName;
        } catch (ErrorResponseException e) {
            throw new BusinessException("MinIO错误响应：" + e.getMessage(), e);
        } catch (InsufficientDataException e) {
            throw new BusinessException("数据不足：" + e.getMessage(), e);
        } catch (InternalException e) {
            throw new BusinessException("MinIO内部错误：" + e.getMessage(), e);
        } catch (InvalidKeyException e) {
            throw new BusinessException("无效的密钥：" + e.getMessage(), e);
        } catch (InvalidResponseException e) {
            throw new BusinessException("无效的响应：" + e.getMessage(), e);
        } catch (IOException e) {
            throw new BusinessException("IO异常：" + e.getMessage(), e);
        } catch (NoSuchAlgorithmException e) {
            throw new BusinessException("算法不存在：" + e.getMessage(), e);
        } catch (ServerException e) {
            throw new BusinessException("服务器异常：" + e.getMessage(), e);
        } catch (XmlParserException e) {
            throw new BusinessException("XML解析异常：" + e.getMessage(), e);
        }
    }

    @Override
    public InputStream downloadFile(String tenantId, String fileName) {
        try {
            String objectName = getObjectName(tenantId, fileName);

            return minioClient.getObject(
                    GetObjectArgs.builder()
                            .bucket(bucketName)
                            .object(objectName)
                            .build()
            );
        } catch (ErrorResponseException e) {
            throw new BusinessException("文件不存在或MinIO错误：" + e.getMessage(), e);
        } catch (InsufficientDataException e) {
            throw new BusinessException("数据不足：" + e.getMessage(), e);
        } catch (InternalException e) {
            throw new BusinessException("MinIO内部错误：" + e.getMessage(), e);
        } catch (InvalidKeyException e) {
            throw new BusinessException("无效的密钥：" + e.getMessage(), e);
        } catch (InvalidResponseException e) {
            throw new BusinessException("无效的响应：" + e.getMessage(), e);
        } catch (IOException e) {
            throw new BusinessException("IO异常：" + e.getMessage(), e);
        } catch (NoSuchAlgorithmException e) {
            throw new BusinessException("算法不存在：" + e.getMessage(), e);
        } catch (ServerException e) {
            throw new BusinessException("服务器异常：" + e.getMessage(), e);
        } catch (XmlParserException e) {
            throw new BusinessException("XML解析异常：" + e.getMessage(), e);
        }
    }

    @Override
    public void deleteFile(String tenantId, String fileName) {
        try {
            String objectName = getObjectName(tenantId, fileName);

            minioClient.removeObject(
                    RemoveObjectArgs.builder()
                            .bucket(bucketName)
                            .object(objectName)
                            .build()
            );
        } catch (ErrorResponseException e) {
            throw new BusinessException("文件不存在或MinIO错误：" + e.getMessage(), e);
        } catch (InsufficientDataException e) {
            throw new BusinessException("数据不足：" + e.getMessage(), e);
        } catch (InternalException e) {
            throw new BusinessException("MinIO内部错误：" + e.getMessage(), e);
        } catch (InvalidKeyException e) {
            throw new BusinessException("无效的密钥：" + e.getMessage(), e);
        } catch (InvalidResponseException e) {
            throw new BusinessException("无效的响应：" + e.getMessage(), e);
        } catch (IOException e) {
            throw new BusinessException("IO异常：" + e.getMessage(), e);
        } catch (NoSuchAlgorithmException e) {
            throw new BusinessException("算法不存在：" + e.getMessage(), e);
        } catch (ServerException e) {
            throw new BusinessException("服务器异常：" + e.getMessage(), e);
        } catch (XmlParserException e) {
            throw new BusinessException("XML解析异常：" + e.getMessage(), e);
        }
    }

    @Override
    public String getFileUrl(String tenantId, String fileName) {
        try {
            String objectName = getObjectName(tenantId, fileName);

            return minioClient.getPresignedObjectUrl(
                    GetPresignedObjectUrlArgs.builder()
                            .method(Method.GET)
                            .bucket(bucketName)
                            .object(objectName)
                            .expiry(7, TimeUnit.DAYS)
                            .build()
            );
        } catch (ErrorResponseException e) {
            throw new BusinessException("文件不存在或MinIO错误：" + e.getMessage(), e);
        } catch (InsufficientDataException e) {
            throw new BusinessException("数据不足：" + e.getMessage(), e);
        } catch (InternalException e) {
            throw new BusinessException("MinIO内部错误：" + e.getMessage(), e);
        } catch (InvalidKeyException e) {
            throw new BusinessException("无效的密钥：" + e.getMessage(), e);
        } catch (InvalidResponseException e) {
            throw new BusinessException("无效的响应：" + e.getMessage(), e);
        } catch (IOException e) {
            throw new BusinessException("IO异常：" + e.getMessage(), e);
        } catch (NoSuchAlgorithmException e) {
            throw new BusinessException("算法不存在：" + e.getMessage(), e);
        } catch (ServerException e) {
            throw new BusinessException("服务器异常：" + e.getMessage(), e);
        } catch (XmlParserException e) {
            throw new BusinessException("XML解析异常：" + e.getMessage(), e);
        }
    }

    @Override
    public void copyFile(String tenantId, String sourceFileName, String targetFileName) {
        try {
            String sourceObjectName = getObjectName(tenantId, sourceFileName);
            String targetObjectName = getObjectName(tenantId, targetFileName);

            minioClient.copyObject(
                    CopyObjectArgs.builder()
                            .bucket(bucketName)
                            .object(targetObjectName)
                            .source(
                                    CopySource.builder()
                                            .bucket(bucketName)
                                            .object(sourceObjectName)
                                            .build()
                            )
                            .build()
            );
        } catch (ErrorResponseException e) {
            throw new BusinessException("源文件不存在或MinIO错误：" + e.getMessage(), e);
        } catch (InsufficientDataException e) {
            throw new BusinessException("数据不足：" + e.getMessage(), e);
        } catch (InternalException e) {
            throw new BusinessException("MinIO内部错误：" + e.getMessage(), e);
        } catch (InvalidKeyException e) {
            throw new BusinessException("无效的密钥：" + e.getMessage(), e);
        } catch (InvalidResponseException e) {
            throw new BusinessException("无效的响应：" + e.getMessage(), e);
        } catch (IOException e) {
            throw new BusinessException("IO异常：" + e.getMessage(), e);
        } catch (NoSuchAlgorithmException e) {
            throw new BusinessException("算法不存在：" + e.getMessage(), e);
        } catch (ServerException e) {
            throw new BusinessException("服务器异常：" + e.getMessage(), e);
        } catch (XmlParserException e) {
            throw new BusinessException("XML解析异常：" + e.getMessage(), e);
        }
    }

    @Override
    public boolean bucketExists() {
        try {
            return minioClient.bucketExists(
                    BucketExistsArgs.builder()
                            .bucket(bucketName)
                            .build()
            );
        } catch (ErrorResponseException e) {
            throw new BusinessException("MinIO错误响应：" + e.getMessage(), e);
        } catch (InsufficientDataException e) {
            throw new BusinessException("数据不足：" + e.getMessage(), e);
        } catch (InternalException e) {
            throw new BusinessException("MinIO内部错误：" + e.getMessage(), e);
        } catch (InvalidKeyException e) {
            throw new BusinessException("无效的密钥：" + e.getMessage(), e);
        } catch (InvalidResponseException e) {
            throw new BusinessException("无效的响应：" + e.getMessage(), e);
        } catch (IOException e) {
            throw new BusinessException("IO异常：" + e.getMessage(), e);
        } catch (NoSuchAlgorithmException e) {
            throw new BusinessException("算法不存在：" + e.getMessage(), e);
        } catch (ServerException e) {
            throw new BusinessException("服务器异常：" + e.getMessage(), e);
        } catch (XmlParserException e) {
            throw new BusinessException("XML解析异常：" + e.getMessage(), e);
        }
    }

    @Override
    public void createBucketIfNotExists() {
        try {
            if (!bucketExists()) {
                minioClient.makeBucket(
                        MakeBucketArgs.builder()
                                .bucket(bucketName)
                                .build()
                );
            }
        } catch (ErrorResponseException e) {
            throw new BusinessException("MinIO错误响应：" + e.getMessage(), e);
        } catch (InsufficientDataException e) {
            throw new BusinessException("数据不足：" + e.getMessage(), e);
        } catch (InternalException e) {
            throw new BusinessException("MinIO内部错误：" + e.getMessage(), e);
        } catch (InvalidKeyException e) {
            throw new BusinessException("无效的密钥：" + e.getMessage(), e);
        } catch (InvalidResponseException e) {
            throw new BusinessException("无效的响应：" + e.getMessage(), e);
        } catch (IOException e) {
            throw new BusinessException("IO异常：" + e.getMessage(), e);
        } catch (NoSuchAlgorithmException e) {
            throw new BusinessException("算法不存在：" + e.getMessage(), e);
        } catch (ServerException e) {
            throw new BusinessException("服务器异常：" + e.getMessage(), e);
        } catch (XmlParserException e) {
            throw new BusinessException("XML解析异常：" + e.getMessage(), e);
        }
    }

    private String getObjectName(String tenantId, String fileName) {
        if (tenantId == null || tenantId.trim().isEmpty()) {
            throw new BusinessException("租户ID不能为空");
        }
        if (fileName == null || fileName.trim().isEmpty()) {
            throw new BusinessException("文件名不能为空");
        }
        return tenantId + "/" + fileName;
    }

    @Override
    public List<String> listObjectKeys(String prefix) {
        try {
            createBucketIfNotExists();
            Iterable<Result<Item>> results = minioClient.listObjects(
                    ListObjectsArgs.builder()
                            .bucket(bucketName)
                            .prefix(prefix)
                            .recursive(true)
                            .build()
            );
            List<String> keys = new ArrayList<>();
            for (Result<Item> result : results) {
                Item item = result.get();
                keys.add(item.objectName());
            }
            return keys;
        } catch (Exception e) {
            log.error("Failed to list MinIO objects with prefix {}: {}", prefix, e.getMessage());
            return new ArrayList<>();
        }
    }
}
