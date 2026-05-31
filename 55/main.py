"""
主入口文件
工业设备故障文本描述智能研判AI服务系统 - 应用启动入口
"""

import os
import sys
import yaml
import uvicorn
from loguru import logger


def load_config(config_path: str = "config.yaml") -> dict:
    try:
        if not os.path.exists(config_path):
            logger.warning(f"配置文件不存在: {config_path}，使用默认配置")
            return get_default_config()

        with open(config_path, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)

        logger.info(f"配置文件加载成功: {config_path}")
        return config

    except Exception as e:
        logger.error(f"配置文件加载失败: {str(e)}，使用默认配置")
        return get_default_config()


def get_default_config() -> dict:
    return {
        "server": {
            "host": "0.0.0.0",
            "port": 8080,
            "workers": 4,
            "log_level": "info"
        },
        "app": {
            "name": "工业设备故障智能研判AI服务系统",
            "version": "1.0.0",
            "debug": False
        },
        "nlp": {
            "model_path": "./models",
            "embedding_model": "paraphrase-multilingual-MiniLM-L12-v2",
            "max_text_length": 500,
            "min_text_length": 5
        },
        "fault": {
            "types_file": "./data/fault_types.json",
            "similarity_threshold": 0.6,
            "max_candidates": 5
        },
        "repair": {
            "solutions_file": "./data/repair_solutions.json",
            "max_recommendations": 3
        },
        "parallel": {
            "max_workers": 8,
            "timeout": 30
        },
        "cache": {
            "enabled": True,
            "redis_url": "redis://localhost:6379/0",
            "ttl": 3600
        },
        "logging": {
            "level": "INFO",
            "format": "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
            "file": "./logs/app.log",
            "rotation": "10 MB",
            "retention": "30 days"
        }
    }


def setup_logging(config: dict):
    log_config = config.get("logging", {})
    log_level = log_config.get("level", "INFO")
    log_format = log_config.get("format", "{time} | {level} | {message}")
    log_file = log_config.get("file", "./logs/app.log")

    os.makedirs(os.path.dirname(log_file) if os.path.dirname(log_file) else ".", exist_ok=True)

    logger.remove()

    logger.add(
        sys.stdout,
        level=log_level,
        format=log_format,
        colorize=True
    )

    logger.add(
        log_file,
        level=log_level,
        format=log_format,
        rotation=log_config.get("rotation", "10 MB"),
        retention=log_config.get("retention", "30 days"),
        compression="zip",
        encoding="utf-8"
    )

    logger.info("日志系统配置完成")


def create_directories():
    directories = [
        "./logs",
        "./data",
        "./models"
    ]

    for directory in directories:
        os.makedirs(directory, exist_ok=True)
        logger.debug(f"目录已创建: {directory}")


def main():
    config_path = os.environ.get("CONFIG_PATH", "config.yaml")
    config = load_config(config_path)

    setup_logging(config)

    create_directories()

    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

    from gateway import create_app

    app = create_app(config)

    server_config = config.get("server", {})
    host = server_config.get("host", "0.0.0.0")
    port = int(server_config.get("port", 8080))
    workers = int(server_config.get("workers", 4))
    log_level = server_config.get("log_level", "info")

    logger.info(f"{'='*60}")
    logger.info(f"工业设备故障文本描述智能研判AI服务系统")
    logger.info(f"版本: {config.get('app', {}).get('version', '1.0.0')}")
    logger.info(f"服务地址: http://{host}:{port}")
    logger.info(f"API文档: http://{host}:{port}/docs")
    logger.info(f"健康检查: http://{host}:{port}/health")
    logger.info(f"工作线程数: {workers}")
    logger.info(f"{'='*60}")

    uvicorn.run(
        app,
        host=host,
        port=port,
        workers=workers,
        log_level=log_level,
        access_log=True
    )


if __name__ == "__main__":
    main()