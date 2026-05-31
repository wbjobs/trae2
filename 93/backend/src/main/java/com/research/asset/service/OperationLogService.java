package com.research.asset.service;

import com.research.asset.dto.PageResult;
import com.research.asset.entity.OperationLog;
import com.research.asset.repository.OperationLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class OperationLogService {

    private final OperationLogRepository operationLogRepository;

    @Transactional
    public void logOperation(UUID userId, UUID assetId, String action, String detail, String ip) {
        OperationLog log = new OperationLog();
        log.setUserId(userId);
        log.setAssetId(assetId);
        log.setAction(action);
        log.setDetail(detail);
        log.setIpAddress(ip);
        operationLogRepository.save(log);
    }

    public PageResult<OperationLog> getUserLogs(UUID userId, int pageNum, int pageSize) {
        Pageable pageable = PageRequest.of(pageNum - 1, pageSize, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<OperationLog> page = operationLogRepository.findByUserIdOrderByCreatedAtDesc(userId, pageable);
        return PageResult.of(page.getTotal(), pageNum, pageSize, page.getContent());
    }

    public PageResult<OperationLog> getAssetLogs(UUID assetId, int pageNum, int pageSize) {
        Pageable pageable = PageRequest.of(pageNum - 1, pageSize, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<OperationLog> page = operationLogRepository.findByAssetIdOrderByCreatedAtDesc(assetId, pageable);
        return PageResult.of(page.getTotal(), pageNum, pageSize, page.getContent());
    }

    public List<OperationLog> getRecentLogs() {
        return operationLogRepository.findTop10ByOrderByCreatedAtDesc();
    }
}
