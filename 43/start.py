"""
启动脚本
Usage:
    python start.py              # 启动 API 服务
    python start.py --workers 4  # 指定 worker 数量
    python start.py --port 8001  # 指定端口
"""

import uvicorn
import argparse
import os


def main():
    parser = argparse.ArgumentParser(
        description="油气管道阴极保护参数采集与阈值告警 API 服务集群"
    )
    parser.add_argument(
        "--host",
        default=os.getenv("HOST", "0.0.0.0"),
        help="监听地址 (default: 0.0.0.0)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("PORT", 8000)),
        help="监听端口 (default: 8000)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=int(os.getenv("WORKERS", 4)),
        help="Worker 数量 (default: 4)",
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        default=os.getenv("DEBUG", "false").lower() == "true",
        help="热重载模式 (开发用)",
    )

    args = parser.parse_args()

    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=args.port,
        workers=args.workers,
        reload=args.reload,
        log_level="info",
        access_log=True,
    )


if __name__ == "__main__":
    main()