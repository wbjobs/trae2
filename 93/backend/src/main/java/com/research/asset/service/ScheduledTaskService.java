package com.research.asset.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class ScheduledTaskService {

    private final CirculationService circulationService;

    @Scheduled(cron = "0 0 9 * * ?")
    public void sendBorrowDueReminders() {
        log.info("开始执行每日到期提醒任务...");
        try {
            circulationService.sendDueReminders();
            log.info("每日到期提醒任务执行完成");
        } catch (Exception e) {
            log.error("每日到期提醒任务执行失败", e);
        }
    }

    @Scheduled(cron = "0 0 10 * * ?")
    public void sendBorrowOverdueReminders() {
        log.info("开始执行每日逾期提醒任务...");
        try {
            circulationService.sendOverdueReminders();
            log.info("每日逾期提醒任务执行完成");
        } catch (Exception e) {
            log.error("每日逾期提醒任务执行失败", e);
        }
    }
}
