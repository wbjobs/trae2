CREATE DATABASE IF NOT EXISTS `ai_extraction` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `ai_extraction`;

CREATE TABLE IF NOT EXISTS `extraction_batches` (
  `id` int NOT NULL AUTO_INCREMENT,
  `batch_id` varchar(64) NOT NULL,
  `total_count` int DEFAULT 0,
  `completed_count` int DEFAULT 0,
  `failed_count` int DEFAULT 0,
  `status` enum('pending','processing','partial_completed','completed','failed') DEFAULT 'pending',
  `schema_definition` json NOT NULL,
  `error_message` text,
  `created_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `completed_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `batch_id` (`batch_id`),
  KEY `idx_batch_status` (`status`),
  KEY `idx_batch_created_at` (`created_at`),
  KEY `idx_batch_status_created` (`status`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `extraction_tasks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `task_id` varchar(64) NOT NULL,
  `batch_id` varchar(64) DEFAULT NULL,
  `original_text` text NOT NULL,
  `schema_definition` json NOT NULL,
  `status` enum('pending','processing','completed','failed') DEFAULT 'pending',
  `result` json DEFAULT NULL,
  `error_message` text,
  `preprocessed_text` text,
  `llm_response` text,
  `content_hash` varchar(64) DEFAULT NULL,
  `created_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `completed_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `task_id` (`task_id`),
  KEY `idx_status` (`status`),
  KEY `idx_batch_id` (`batch_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_content_hash` (`content_hash`),
  KEY `idx_task_status_created` (`status`,`created_at`),
  CONSTRAINT `fk_tasks_batch` FOREIGN KEY (`batch_id`) REFERENCES `extraction_batches` (`batch_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
