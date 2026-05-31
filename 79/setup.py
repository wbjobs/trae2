from setuptools import setup, find_packages

setup(
    name="k8s-inspector",
    version="1.0.0",
    description="K8s 集群节点资源水位巡检命令行工具集",
    author="K8s Inspector Team",
    packages=find_packages(),
    include_package_data=True,
    install_requires=[
        "click>=8.1.0",
        "paramiko>=3.0.0",
        "PyYAML>=6.0",
        "kubernetes>=26.0.0",
        "tabulate>=0.9.0",
        "colorama>=0.4.6",
        "rich>=13.0.0",
    ],
    entry_points={
        "console_scripts": [
            "k8s-inspector=k8s_inspector.cli:cli",
        ],
    },
    python_requires=">=3.8",
    classifiers=[
        "Programming Language :: Python :: 3",
        "Operating System :: OS Independent",
        "Environment :: Console",
    ],
)
