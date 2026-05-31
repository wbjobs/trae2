package com.research.asset.service;

import com.research.asset.dto.CirculationApplyDTO;
import com.research.asset.dto.CirculationDTO;
import com.research.asset.dto.PageResult;
import com.research.asset.entity.Asset;
import com.research.asset.entity.CirculationRecord;
import com.research.asset.entity.User;
import com.research.asset.enums.AssetStatus;
import com.research.asset.enums.CirculationStatus;
import com.research.asset.repository.AssetRepository;
import com.research.asset.repository.CirculationRecordRepository;
import com.research.asset.repository.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import jakarta.persistence.OptimisticLockingFailureException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class CirculationService {

    private final CirculationRecordRepository circulationRecordRepository;
    private final AssetRepository assetRepository;
    private final UserRepository userRepository;
    private final OperationLogService operationLogService;
    private final NotificationService notificationService;

    @Transactional
    public CirculationDTO applyBorrow(CirculationApplyDTO dto, UUID borrowerId, String ipAddress) {
        Asset asset = assetRepository.findById(dto.getAssetId())
                .orElseThrow(() -> new EntityNotFoundException("资产不存在"));

        boolean isBorrowed = circulationRecordRepository.existsByAssetIdAndStatusIn(
                dto.getAssetId(),
                Arrays.asList(CirculationStatus.PENDING, CirculationStatus.APPROVED, CirculationStatus.ACTIVE)
        );
        if (isBorrowed) {
            throw new IllegalStateException("该资产当前已被借阅或在审批流程中，暂不可申请借阅");
        }

        if (asset.getStatus() != AssetStatus.ARCHIVED) {
            throw new IllegalStateException("只有已归档的资产才能申请借阅");
        }

        CirculationRecord record = new CirculationRecord();
        record.setAsset(asset);
        record.setBorrowerId(borrowerId);
        record.setBorrowPurpose(dto.getBorrowPurpose());
        record.setBorrowDate(dto.getBorrowDate());
        record.setExpectedReturnDate(dto.getExpectedReturnDate());
        record.setStatus(CirculationStatus.PENDING);
        record = circulationRecordRepository.save(record);

        operationLogService.logOperation(borrowerId, dto.getAssetId(), "申请借阅",
                "借阅用途：" + dto.getBorrowPurpose(), ipAddress);

        return convertToDTO(record);
    }

    @Transactional
    public CirculationDTO approveBorrow(UUID recordId, UUID approverId, String ipAddress) {
        CirculationRecord record = circulationRecordRepository.findById(recordId)
                .orElseThrow(() -> new EntityNotFoundException("借阅记录不存在"));

        if (record.getStatus() != CirculationStatus.PENDING) {
            throw new IllegalStateException("当前借阅记录状态不支持审批操作");
        }

        Asset asset = record.getAsset();
        if (asset.getStatus() != AssetStatus.ARCHIVED) {
            throw new IllegalStateException("资产状态已变更，无法完成审批");
        }

        try {
            asset.setStatus(AssetStatus.BORROWED);
            assetRepository.save(asset);
        } catch (ObjectOptimisticLockingFailureException | OptimisticLockingFailureException e) {
            throw new IllegalStateException("资产状态已被其他操作修改，请刷新后重试");
        }

        record.setStatus(CirculationStatus.ACTIVE);
        record.setApproverId(approverId);
        record.setApprovedAt(LocalDateTime.now());
        record = circulationRecordRepository.save(record);

        operationLogService.logOperation(approverId, asset.getId(), "审批通过借阅",
                "借阅人：" + record.getBorrowerId(), ipAddress);

        return convertToDTO(record);
    }

    @Transactional
    public CirculationDTO rejectBorrow(UUID recordId, UUID approverId, String reason, String ipAddress) {
        CirculationRecord record = circulationRecordRepository.findById(recordId)
                .orElseThrow(() -> new EntityNotFoundException("借阅记录不存在"));

        if (record.getStatus() != CirculationStatus.PENDING) {
            throw new IllegalStateException("当前借阅记录状态不支持审批操作");
        }

        record.setStatus(CirculationStatus.RETURNED);
        record.setApproverId(approverId);
        record.setApprovedAt(LocalDateTime.now());
        record = circulationRecordRepository.save(record);

        operationLogService.logOperation(approverId, record.getAsset().getId(), "驳回借阅申请",
                "驳回原因：" + reason, ipAddress);

        return convertToDTO(record);
    }

    @Transactional
    public CirculationDTO returnAsset(UUID recordId, UUID userId, String ipAddress) {
        CirculationRecord record = circulationRecordRepository.findById(recordId)
                .orElseThrow(() -> new EntityNotFoundException("借阅记录不存在"));

        if (record.getStatus() != CirculationStatus.ACTIVE && record.getStatus() != CirculationStatus.OVERDUE) {
            throw new IllegalStateException("当前借阅记录状态不支持归还操作");
        }

        Asset asset = record.getAsset();
        boolean hasOtherActiveBorrow = circulationRecordRepository.existsByAssetIdAndStatusIn(
                asset.getId(),
                Arrays.asList(CirculationStatus.APPROVED, CirculationStatus.ACTIVE)
        );

        if (!hasOtherActiveBorrow) {
            try {
                asset.setStatus(AssetStatus.ARCHIVED);
                assetRepository.save(asset);
            } catch (ObjectOptimisticLockingFailureException | OptimisticLockingFailureException e) {
                throw new IllegalStateException("资产状态已被其他操作修改，请刷新后重试");
            }
        }

        record.setActualReturnDate(LocalDate.now());
        record.setStatus(CirculationStatus.RETURNED);
        record = circulationRecordRepository.save(record);

        operationLogService.logOperation(userId, asset.getId(), "归还资产",
                "借阅记录ID：" + recordId, ipAddress);

        return convertToDTO(record);
    }

    public PageResult<CirculationDTO> getMyBorrowRecords(UUID borrowerId, int pageNum, int pageSize) {
        Pageable pageable = PageRequest.of(pageNum - 1, pageSize, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<CirculationRecord> page = circulationRecordRepository.findByBorrowerId(borrowerId, pageable);
        List<CirculationDTO> dtoList = page.getContent().stream()
                .map(this::convertToDTO)
                .collect(Collectors.toList());
        return PageResult.of(page.getTotal(), pageNum, pageSize, dtoList);
    }

    public PageResult<CirculationDTO> getBorrowRecordsByStatus(String status, int pageNum, int pageSize) {
        Pageable pageable = PageRequest.of(pageNum - 1, pageSize, Sort.by(Sort.Direction.DESC, "createdAt"));
        CirculationStatus circulationStatus = status != null ? CirculationStatus.valueOf(status) : null;
        Page<CirculationRecord> page;
        if (circulationStatus != null) {
            page = circulationRecordRepository.findByStatus(circulationStatus, pageable);
        } else {
            page = circulationRecordRepository.findAll(pageable);
        }
        List<CirculationDTO> dtoList = page.getContent().stream()
                .map(this::convertToDTO)
                .collect(Collectors.toList());
        return PageResult.of(page.getTotal(), pageNum, pageSize, dtoList);
    }

    public CirculationDTO getBorrowRecordById(UUID id) {
        CirculationRecord record = circulationRecordRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("借阅记录不存在"));
        return convertToDTO(record);
    }

    @Transactional
    public void checkOverdue() {
        LocalDate today = LocalDate.now();
        List<CirculationRecord> overdueRecords = circulationRecordRepository
                .findByStatusAndExpectedReturnDateBefore(CirculationStatus.ACTIVE, today);
        for (CirculationRecord record : overdueRecords) {
            record.setStatus(CirculationStatus.OVERDUE);
            circulationRecordRepository.save(record);
            notificationService.sendBorrowOverdueReminder(record);
        }
    }

    @Transactional
    public void sendDueReminders() {
        LocalDate today = LocalDate.now();
        LocalDate dueDateThreshold = today.plusDays(3);
        log.info("开始检查即将到期的借阅记录，日期范围: {} 到 {}", today, dueDateThreshold);

        List<CirculationRecord> activeRecords = circulationRecordRepository
                .findByStatusAndExpectedReturnDateBefore(CirculationStatus.ACTIVE, dueDateThreshold.plusDays(1));

        int reminderCount = 0;
        for (CirculationRecord record : activeRecords) {
            LocalDate expectedReturn = record.getExpectedReturnDate();
            if (!expectedReturn.isBefore(today) && !expectedReturn.isAfter(dueDateThreshold)) {
                notificationService.sendBorrowDueReminder(record);
                reminderCount++;
            }
        }
        log.info("到期提醒发送完成，共发送 {} 条提醒", reminderCount);
    }

    @Transactional
    public void sendOverdueReminders() {
        LocalDate today = LocalDate.now();
        log.info("开始检查逾期的借阅记录，当前日期: {}", today);

        List<CirculationRecord> overdueRecords = circulationRecordRepository
                .findByStatusAndExpectedReturnDateBefore(CirculationStatus.ACTIVE, today);
        for (CirculationRecord record : overdueRecords) {
            record.setStatus(CirculationStatus.OVERDUE);
            circulationRecordRepository.save(record);
        }

        List<CirculationRecord> allOverdueRecords = circulationRecordRepository
                .findByStatusAndExpectedReturnDateBefore(CirculationStatus.OVERDUE, today);

        int reminderCount = 0;
        for (CirculationRecord record : allOverdueRecords) {
            notificationService.sendBorrowOverdueReminder(record);
            reminderCount++;
        }
        log.info("逾期提醒发送完成，共发送 {} 条提醒", reminderCount);
    }

    private CirculationDTO convertToDTO(CirculationRecord record) {
        CirculationDTO dto = new CirculationDTO();
        dto.setId(record.getId());
        dto.setAssetId(record.getAsset().getId());
        dto.setAssetTitle(record.getAsset().getTitle());
        dto.setBorrowerId(record.getBorrowerId());
        dto.setBorrowPurpose(record.getBorrowPurpose());
        dto.setBorrowDate(record.getBorrowDate());
        dto.setExpectedReturnDate(record.getExpectedReturnDate());
        dto.setActualReturnDate(record.getActualReturnDate());
        dto.setStatus(record.getStatus().name());
        dto.setApprovedAt(record.getApprovedAt());
        dto.setCreatedAt(record.getCreatedAt());
        User borrower = userRepository.findById(record.getBorrowerId()).orElse(null);
        if (borrower != null) {
            dto.setBorrowerName(borrower.getRealName());
        }
        if (record.getApproverId() != null) {
            User approver = userRepository.findById(record.getApproverId()).orElse(null);
            if (approver != null) {
                dto.setApproverName(approver.getRealName());
            }
        }
        return dto;
    }
}
