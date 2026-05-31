from setuptools import setup, find_packages

setup(
    name="firmware-manager",
    version="1.0.0",
    description="嵌入式固件批量刷写与版本管理命令行工具",
    author="Embedded Tools Team",
    packages=find_packages(),
    install_requires=[
        "pyserial>=3.5",
        "click>=8.0.0",
        "colorama>=0.4.4",
        "tqdm>=4.62.0",
        "pyyaml>=6.0",
    ],
    entry_points={
        "console_scripts": [
            "fw-manager=main:main",
        ],
    },
    python_requires=">=3.7",
)
