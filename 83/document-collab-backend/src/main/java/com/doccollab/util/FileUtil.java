package com.doccollab.util;

import com.doccollab.exception.BusinessException;
import org.springframework.web.multipart.MultipartFile;

import java.util.Arrays;
import java.util.List;
import java.util.UUID;

public class FileUtil {

    private static final List<String> ALLOWED_EXTENSIONS = Arrays.asList(
            "jpg", "jpeg", "png", "gif", "pdf", "doc", "docx",
            "xls", "xlsx", "ppt", "pptx", "txt", "md", "zip", "rar"
    );

    private static final long MAX_FILE_SIZE = 100 * 1024 * 1024;

    public static String getFileExtension(String fileName) {
        if (fileName == null || fileName.isEmpty()) {
            return "";
        }
        int dotIndex = fileName.lastIndexOf('.');
        if (dotIndex == -1 || dotIndex == fileName.length() - 1) {
            return "";
        }
        return fileName.substring(dotIndex + 1).toLowerCase();
    }

    public static String generateUniqueFileName(String originalFileName) {
        String extension = getFileExtension(originalFileName);
        String uuid = UUID.randomUUID().toString().replace("-", "");
        if (extension.isEmpty()) {
            return uuid;
        }
        return uuid + "." + extension;
    }

    public static void validateFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException("文件不能为空");
        }
        if (file.getSize() > MAX_FILE_SIZE) {
            throw new BusinessException("文件大小不能超过100MB");
        }
        String extension = getFileExtension(file.getOriginalFilename());
        if (!ALLOWED_EXTENSIONS.contains(extension)) {
            throw new BusinessException("不支持的文件类型：" + extension);
        }
    }

    public static void validateFileSize(long size) {
        if (size > MAX_FILE_SIZE) {
            throw new BusinessException("文件大小不能超过100MB");
        }
    }

    public static void validateFileType(String fileName) {
        String extension = getFileExtension(fileName);
        if (!extension.isEmpty() && !ALLOWED_EXTENSIONS.contains(extension)) {
            throw new BusinessException("不支持的文件类型：" + extension);
        }
    }
}
