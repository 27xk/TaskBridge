CREATE DATABASE IF NOT EXISTS taskbridge CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'taskbridge'@'%' IDENTIFIED BY 'taskbridge_password';
GRANT ALL PRIVILEGES ON taskbridge.* TO 'taskbridge'@'%';
FLUSH PRIVILEGES;

