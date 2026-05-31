package com.research.asset.service;

import com.research.asset.dto.NotificationDTO;
import com.research.asset.dto.PageResult;
import com.research.asset.entity.CirculationRecord;
import com.research.asset.entity.Notification;
import com.research.asset.repository.NotificationRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationRepository notificationRepository;

    @Transactional
    public void sendNotification(UUID userId, String type, String title, String content, UUID relatedId) {
        Notification notification = new Notification();
        notification.setUserId(userId);
        notification.setType(type);
        notification.setTitle(title);
        notification.setContent(content);
        notification.setRelatedId(relatedId);
        notification.setIsRead(false);
        notificationRepository.save(notification);
        log.info("已发送通知给用户 {}: {}", userId, title);
    }

    @Transactional(readOnly = true)
    public PageResult<NotificationDTO> getUserNotifications(UUID userId, Boolean isRead, int page, int size) {
        Pageable pageable = PageRequest.of(page - 1, size);
        Page<Notification> notificationPage;
        if (isRead != null) {
            notificationPage = notificationRepository.findByUserIdAndIsReadOrderByCreatedAtDesc(userId, isRead, pageable);
        } else {
            notificationPage = notificationRepository.findByUserIdOrderByCreatedAtDesc(userId, pageable);
        }
        List<NotificationDTO> dtoList = notificationPage.getContent().stream()
                .map(this::convertToDTO)
                .collect(Collectors.toList());
        return PageResult.of(notificationPage.getTotalElements(), page, size, dtoList);
    }

    @Transactional
    public void markAsRead(UUID id) {
        Notification notification = notificationRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("通知不存在"));
        notificationRepository.markAsRead(id);
    }

    @Transactional
    public void markAllAsRead(UUID userId) {
        notificationRepository.markAllAsRead(userId);
    }

    @Transactional(readOnly = true)
    public long getUnreadCount(UUID userId) {
        return notificationRepository.countByUserIdAndIsRead(userId, false);
    }

    @Transactional
    public void sendBorrowDueReminder(CirculationRecord record) {
        UUID userId = record.getBorrowerId();
        String type = "BORROW_DUE";
        UUID relatedId = record.getId();
        LocalDateTime todayStart = LocalDateTime.of(LocalDate.now(), LocalTime.MIN);

        if (notificationRepository.existsByUserIdAndTypeAndRelatedIdAndCreatedAtAfter(userId, type, relatedId, todayStart)) {
            log.debug("今日已发送过到期提醒给用户 {}，跳过重复发送", userId);
            return;
        }

        long daysUntilDue = ChronoUnit.DAYS.between(LocalDate.now(), record.getExpectedReturnDate());
        String title;
        String content;

        if (daysUntilDue == 0) {
            title = "借阅今日到期提醒";
            content = String.format("您借阅的《%s》今日到期，请及时归还。", record.getAsset().getTitle());
        } else {
            title = String.format("借阅即将到期提醒（还有%d天）", daysUntilDue);
            content = String.format("您借阅的《%s》将于 %s 到期，请及时归还。",
                    record.getAsset().getTitle(),
                    record.getExpectedReturnDate());
        }

        sendNotification(userId, type, title, content, relatedId);
    }

    @Transactional
    public void sendBorrowOverdueReminder(CirculationRecord record) {
        UUID userId = record.getBorrowerId();
        String type = "BORROW_OVERDUE";
        UUID relatedId = record.getId();
        LocalDateTime todayStart = LocalDateTime.of(LocalDate.now(), LocalTime.MIN);

        if (notificationRepository.existsByUserIdAndTypeAndRelatedIdAndCreatedAtAfter(userId, type, relatedId, todayStart)) {
            log.debug("今日已发送过逾期提醒给用户 {}，跳过重复发送", userId);
            return;
        }

        long daysOverdue = ChronoUnit.DAYS.between(record.getExpectedReturnDate(), LocalDate.now());
        String title = String.format("借阅逾期提醒（已逾期%d天）", daysOverdue);
        String content = String.format("您借阅的《%s》已逾期 %d 天，请尽快归还。原应归还日期：%s。",
                record.getAsset().getTitle(),
                daysOverdue,
                record.getExpectedReturnDate());

        sendNotification(userId, type, title, content, relatedId);
    }

    @Transactional
    public void deleteNotification(UUID id) {
        if (!notificationRepository.existsById(id)) {
            throw new EntityNotFoundException("通知不存在");
        }
        notificationRepository.deleteById(id);
    }

    private NotificationDTO convertToDTO(Notification notification) {
        NotificationDTO dto = new NotificationDTO();
        dto.setId(notification.getId());
        dto.setType(notification.getType());
        dto.setTitle(notification.getTitle());
        dto.setContent(notification.getContent());
        dto.setRelatedId(notification.getRelatedId());
        dto.setIsRead(notification.getIsRead());
        dto.setCreatedAt(notification.getCreatedAt());
        return dto;
    }
}
