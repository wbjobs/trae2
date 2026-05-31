-- 海洋生物标本影像归档与生态溯源系统数据库初始化脚本

CREATE DATABASE IF NOT EXISTS marine_specimen DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE marine_specimen;

-- 创建管理员用户 (用户名: admin, 密码: admin123)
-- 注意：实际使用时请在应用中创建，因为密码需要bcrypt加密
