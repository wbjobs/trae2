package com.research.asset.controller;

import com.research.asset.dto.NotificationCountDTO;
import com.research.asset.dto.NotificationDTO;
import com.research.asset.dto.PageResult;
import com.research.asset.dto.Result;
import com.research.asset.service.NotificationService;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/notifications")
@CrossOrigin
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    @GetMapping
    public Result<PageResult<NotificationDTO>> getNotifications(
            @RequestHeader UUID userId,
            @RequestParam(required = false) Boolean isRead,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size) {
        return Result.success(notificationService.getUserNotifications(userId, isRead, page, size));
    }

    @GetMapping("/count")
    public Result<NotificationCountDTO> getNotificationCount(@RequestHeader UUID userId) {
        long unread = notificationService.getUnreadCount(userId);
        long total = notificationService.getUserNotifications(userId, null, 1, 1).getTotal();
        return Result.success(new NotificationCountDTO(total, unread));
    }

    @PutMapping("/{id}/read")
    public Result<Void> markAsRead(@PathVariable UUID id) {
        try {
            notificationService.markAsRead(id);
            return Result.success();
        } catch (EntityNotFoundException e) {
            return Result.error(404, e.getMessage());
        }
    }

    @PutMapping("/read-all")
    public Result<Void> markAllAsRead(@RequestHeader UUID userId) {
        notificationService.markAllAsRead(userId);
        return Result.success();
    }

    @DeleteMapping("/{id}")
    public Result<Void> deleteNotification(@PathVariable UUID id) {
        try {
            notificationService.deleteNotification(id);
            return Result.success();
        } catch (EntityNotFoundException e) {
            return Result.error(404, e.getMessage());
        }
    }
}
