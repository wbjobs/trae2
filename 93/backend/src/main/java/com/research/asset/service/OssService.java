package com.research.asset.service;

import com.aliyun.oss.OSS;
import com.aliyun.oss.OSSClientBuilder;
import com.aliyun.oss.model.*;
import com.research.asset.config.OssConfig;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class OssService {

    private final OssConfig ossConfig;

    private OSS createOSSClient() {
        return new OSSClientBuilder().build(
                ossConfig.getEndpoint(),
                ossConfig.getAccessKeyId(),
                ossConfig.getAccessKeySecret()
        );
    }

    public String uploadFile(MultipartFile file) {
        String originalFilename = file.getOriginalFilename();
        String extension = "";
        if (originalFilename != null && originalFilename.contains(".")) {
            extension = originalFilename.substring(originalFilename.lastIndexOf("."));
        }
        String ossKey = UUID.randomUUID().toString().replace("-", "") + extension;
        OSS ossClient = createOSSClient();
        try {
            ossClient.putObject(ossConfig.getBucketName(), ossKey, file.getInputStream());
        } catch (IOException e) {
            throw new RuntimeException("文件上传失败", e);
        } finally {
            ossClient.shutdown();
        }
        return ossKey;
    }

    public String uploadFileWithVersion(MultipartFile file, String versionId) {
        String originalFilename = file.getOriginalFilename();
        String extension = "";
        if (originalFilename != null && originalFilename.contains(".")) {
            extension = originalFilename.substring(originalFilename.lastIndexOf("."));
        }
        String ossKey = UUID.randomUUID().toString().replace("-", "") + "_v" + versionId + extension;
        OSS ossClient = createOSSClient();
        try {
            ossClient.putObject(ossConfig.getBucketName(), ossKey, file.getInputStream());
        } catch (IOException e) {
            throw new RuntimeException("文件上传失败", e);
        } finally {
            ossClient.shutdown();
        }
        return ossKey;
    }

    public InputStream downloadFile(String ossKey) {
        OSS ossClient = createOSSClient();
        OSSObject ossObject = ossClient.getObject(ossConfig.getBucketName(), ossKey);
        return ossObject.getObjectContent();
    }

    public void deleteFile(String ossKey) {
        OSS ossClient = createOSSClient();
        try {
            ossClient.deleteObject(ossConfig.getBucketName(), ossKey);
        } finally {
            ossClient.shutdown();
        }
    }

    public String getPreviewUrl(String ossKey) {
        OSS ossClient = createOSSClient();
        try {
            Date expiration = new Date(System.currentTimeMillis() + 3600 * 1000);
            GeneratePresignedUrlRequest request = new GeneratePresignedUrlRequest(ossConfig.getBucketName(), ossKey);
            request.setExpiration(expiration);
            URL url = ossClient.generatePresignedUrl(request);
            return url.toString();
        } finally {
            ossClient.shutdown();
        }
    }

    public String uploadChunk(MultipartFile file, String ossKey) {
        OSS ossClient = createOSSClient();
        try {
            ossClient.putObject(ossConfig.getBucketName(), ossKey, file.getInputStream());
            return ossKey;
        } catch (IOException e) {
            throw new RuntimeException("分片上传失败", e);
        } finally {
            ossClient.shutdown();
        }
    }

    public void mergeChunks(List<String> chunkOssKeys, String finalOssKey) {
        OSS ossClient = createOSSClient();
        try {
            String bucketName = ossConfig.getBucketName();
            String uploadId = ossClient.initiateMultipartUpload(new InitiateMultipartUploadRequest(bucketName, finalOssKey)).getUploadId();

            List<PartETag> partETags = new ArrayList<>();
            for (int i = 0; i < chunkOssKeys.size(); i++) {
                String chunkOssKey = chunkOssKeys.get(i);
                CopyPartRequest copyPartRequest = new CopyPartRequest()
                        .withSourceBucketName(bucketName)
                        .withSourceKey(chunkOssKey)
                        .withDestinationBucketName(bucketName)
                        .withDestinationKey(finalOssKey)
                        .withUploadId(uploadId)
                        .withPartNumber(i + 1);

                CopyPartResult copyPartResult = ossClient.copyPart(copyPartRequest);
                partETags.add(copyPartResult.getPartETag());
            }

            CompleteMultipartUploadRequest completeRequest = new CompleteMultipartUploadRequest(
                    bucketName, finalOssKey, uploadId, partETags);
            ossClient.completeMultipartUpload(completeRequest);

            for (String chunkOssKey : chunkOssKeys) {
                try {
                    ossClient.deleteObject(bucketName, chunkOssKey);
                } catch (Exception e) {
                    // ignore delete errors
                }
            }
        } catch (Exception e) {
            throw new RuntimeException("分片合并失败", e);
        } finally {
            ossClient.shutdown();
        }
    }
}
