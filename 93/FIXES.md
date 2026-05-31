# 问题修复说明

## 修复的三个问题

---

### 问题一：多人同时借阅同一资产引发的状态冲突

#### 问题根源
1. 资产实体缺少版本控制，并发修改时会出现状态不一致
2. 借阅申请未检查该资产是否已被借阅或在审批中
3. 审批通过时未同步更新资产状态为 `BORROWED`
4. 归还时未同步恢复资产状态为 `ARCHIVED`

#### 修复方案

**1. 乐观锁实现** ([Asset.java](file:///e:/标注项目/trae2/93/backend/src/main/java/com/research/asset/entity/Asset.java#L74-L76))
```java
@Version
@Column(nullable = false)
private Integer version;
```

**2. 借阅冲突检查** ([CirculationService.java](file:///e:/标注项目/trae2/93/backend/src/main/java/com/research/asset/service/CirculationService.java#L46-L52))
```java
boolean isBorrowed = circulationRecordRepository.existsByAssetIdAndStatusIn(
    dto.getAssetId(),
    Arrays.asList(PENDING, APPROVED, ACTIVE)
);
if (isBorrowed) {
    throw new IllegalStateException("该资产当前已被借阅或在审批流程中");
}
```

**3. 审批通过时同步资产状态** ([CirculationService.java](file:///e:/标注项目/trae2/93/backend/src/main/java/com/research/asset/service/CirculationService.java#L87-L92))
```java
try {
    asset.setStatus(AssetStatus.BORROWED);
    assetRepository.save(asset);
} catch (ObjectOptimisticLockingFailureException e) {
    throw new IllegalStateException("资产状态已被其他操作修改");
}
```

**4. 归还时恢复资产状态** ([CirculationService.java](file:///e:/标注项目/trae2/93/backend/src/main/java/com/research/asset/service/CirculationService.java#L140-L147))
```java
if (!hasOtherActiveBorrow) {
    try {
        asset.setStatus(AssetStatus.ARCHIVED);
        assetRepository.save(asset);
    } catch (ObjectOptimisticLockingFailureException e) {
        throw new IllegalStateException("资产状态已被其他操作修改");
    }
}
```

**5. 新增查询方法** ([CirculationRecordRepository.java](file:///e:/标注项目/trae2/93/backend/src/main/java/com/research/asset/repository/CirculationRecordRepository.java#L27-L29))
```java
boolean existsByAssetIdAndStatusIn(UUID assetId, List<CirculationStatus> statuses);
Optional<CirculationRecord> findTopByAssetIdOrderByCreatedAtDesc(UUID assetId);
```

**6. 完善Controller** ([CirculationController.java](file:///e:/标注项目/trae2/93/backend/src/main/java/com/research/asset/controller/CirculationController.java#L60-L68))
- 新增 `rejectBorrow` 驳回接口
- 所有操作异常捕获并返回友好错误信息
- 获取客户端IP地址用于操作日志

---

### 问题二：前端文件预览组件格式兼容异常

#### 问题根源
1. 缺少统一的文件预览组件，不同文件类型处理逻辑缺失
2. 图片、PDF、Office文档、文本等格式的预览方式不同
3. 缺少文件类型识别和降级处理机制

#### 修复方案

**新建文件预览组件** ([FilePreviewComponent](file:///e:/标注项目/trae2/93/frontend/src/app/shared/components/file-preview.component.ts))

支持的文件类型：
- **图片** (jpg, jpeg, png, gif, bmp, webp, svg) → `<img>` 标签直接预览
- **PDF** (.pdf) → `<iframe>` 内嵌预览 + 错误降级
- **文本** (txt, md, log, csv, xml, json, yaml) → 异步加载内容显示
- **Office文档** (doc, docx, xls, xlsx, ppt, pptx) → Microsoft Office Online 在线预览
- **视频** (mp4, webm, ogg, avi, mov) → HTML5 `<video>` 播放器
- **音频** (mp3, wav, ogg, flac) → HTML5 `<audio>` 播放器
- **代码** (js, ts, html, css, java, py, cpp 等) → 代码高亮显示
- **压缩包** (zip, rar, 7z, tar, gz) → 提示下载，不支持预览

核心功能：
```typescript
detectFileType(extension, mimeType): PreviewType  // 智能类型检测
getOfficeViewerUrl(): string                      // Office在线预览URL
loadTextContent(): void                           // 文本内容加载
toggleFullscreen(): void                          // 全屏预览
handleImageError()                                // 图片加载错误降级
```

**集成到资产详情页** ([ArchiveDetailComponent](file:///e:/标注项目/trae2/93/frontend/src/app/archive/archive-detail/archive-detail.component.ts#L151-L157))
```html
<div class="attachment-actions">
  <button (click)="previewFile(item)">👁️ 预览</button>
  <button (click)="downloadFile(item)">⬇ 下载</button>
</div>
```

---

### 问题三：文件流转模块产生的孤立无效附件文件

#### 问题根源
1. 文件先上传到OSS，然后才关联到资产
2. 如果创建资产失败或用户取消操作，OSS上的文件变成孤立文件
3. 缺少文件追踪和自动清理机制，导致存储成本增加

#### 修复方案

**1. 新增临时文件追踪实体** ([TempFile.java](file:///e:/标注项目/trae2/93/backend/src/main/java/com/research/asset/entity/TempFile.java))
```java
public class TempFile {
    private UUID id;
    private String ossKey;           // OSS对象键
    private String ossBucket;        // OSS存储桶
    private String originalFileName; // 原始文件名
    private Long fileSize;           // 文件大小
    private String uploadSession;    // 上传会话
    private LocalDateTime expiresAt; // 过期时间（默认24小时）
    private Boolean isAttached;      // 是否已关联到资产
}
```

**2. 新增Repository** ([TempFileRepository.java](file:///e:/标注项目/trae2/93/backend/src/main/java/com/research/asset/repository/TempFileRepository.java))
```java
List<TempFile> findByIsAttachedFalseAndExpiresAtBefore(LocalDateTime dateTime);
void deleteByIsAttachedFalseAndExpiresAtBefore(LocalDateTime dateTime);
long countByIsAttachedFalseAndExpiresAtBefore(LocalDateTime dateTime);
```

**3. 文件清理定时任务服务** ([FileCleanupService.java](file:///e:/标注项目/trae2/93/backend/src/main/java/com/research/asset/service/FileCleanupService.java))

定时任务配置：
```java
@Scheduled(cron = "0 0 2 * * ?")    // 每天凌晨2点清理
public void cleanupOrphanFiles() {
    // 1. 删除过期的临时文件（OSS+数据库）
    // 2. 删除过期的资产临时文件
    // 3. 记录清理日志
}

@Scheduled(cron = "0 0 */6 * * ?")   // 每6小时检查一次
public void checkOrphanFiles() {
    // 统计待清理的孤立文件数量并告警
}
```

**4. 整合到文件上传流程**
- [OssController.upload()](file:///e:/标注项目/trae2/93/backend/src/main/java/com/research/asset/controller/OssController.java#L38-L59): 上传时记录到临时文件表
- [AssetService.attachFile()](file:///e:/标注项目/trae2/93/backend/src/main/java/com/research/asset/service/AssetService.java#L171): 关联资产时标记为已关联
- 新增会话清理接口：`/api/oss/cleanup/session`
- 新增统计接口：`/api/oss/cleanup/count`

**5. 启用定时任务** ([AssetApplication.java](file:///e:/标注项目/trae2/93/backend/src/main/java/com/research/asset/AssetApplication.java#L10))
```java
@SpringBootApplication
@EnableJpaAuditing
@EnableScheduling  // 启用Spring定时任务
public class AssetApplication { ... }
```

**6. 数据库表更新** ([schema.sql](file:///e:/标注项目/trae2/93/database/schema.sql#L440-L473))
- 新增 `temp_file` 表
- 新增 `is_temporary` 和 `expires_at` 字段到 `asset_file` 表

---

## 验证方法

### 1. 借阅冲突验证
1. 用户A和用户B同时对同一资产提交借阅申请
2. 先到的申请进入待审批状态
3. 后到的申请应返回错误："该资产当前已被借阅或在审批流程中"

### 2. 文件预览验证
1. 上传不同类型的文件（jpg, pdf, docx, txt, mp4, zip）
2. 点击预览按钮，验证各类型是否正确显示
3. 验证错误降级处理（如PDF跨域时显示下载按钮）

### 3. 孤立文件清理验证
1. 上传文件但不创建资产（模拟取消操作）
2. 24小时后执行清理任务
3. 验证OSS上的孤立文件已被删除
4. 验证 `/api/oss/cleanup/count` 返回清理数量

---

## 修改文件清单

### 后端
- `entity/Asset.java` - 添加@Version乐观锁
- `entity/AssetFile.java` - 添加临时文件字段
- `entity/TempFile.java` - 新增（临时文件追踪）
- `repository/CirculationRecordRepository.java` - 新增查询方法
- `repository/AssetFileRepository.java` - 新增查询方法
- `repository/TempFileRepository.java` - 新增
- `service/CirculationService.java` - 重构借阅逻辑，冲突检查
- `service/FileCleanupService.java` - 新增（定时清理任务）
- `service/AssetService.java` - 整合文件关联标记
- `controller/CirculationController.java` - 新增驳回接口，异常处理
- `controller/OssController.java` - 整合临时文件记录
- `AssetApplication.java` - 启用@EnableScheduling

### 前端
- `shared/components/file-preview.component.ts` - 新增（通用文件预览）
- `archive/archive-detail/archive-detail.component.ts` - 集成预览功能

### 数据库
- `database/schema.sql` - 新增temp_file表，新增字段注释
