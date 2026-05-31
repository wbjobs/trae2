#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
物联网终端固件差分升级与版本管控工具 - 主入口
"""

import sys
import signal
import logging
from typing import List

from .cli import CLI
from .utils.logger import setup_logger
from .utils.config import load_config


def signal_handler(signum, frame):
    """信号处理函数"""
    logging.info("收到退出信号，正在清理资源...")
    sys.exit(0)


def main(argv: List[str] = None) -> int:
    """主函数"""
    if argv is None:
        argv = sys.argv[1:]

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    config = load_config()
    setup_logger(config.get('log_level', 'INFO'))

    cli = CLI(config)
    return cli.run(argv)


if __name__ == "__main__":
    sys.exit(main())
