from setuptools import setup, find_packages

setup(
    name='seepage_fem',
    version='1.0.0',
    description='尾矿库坝体渗流场有限元分析计算工具集',
    author='FEA Engineering Team',
    packages=find_packages(),
    install_requires=[
        'numpy>=1.21.0',
        'scipy>=1.7.0',
        'matplotlib>=3.4.0',
        'jinja2>=3.0.0',
        'pandas>=1.3.0',
        'pyyaml>=5.4.0',
        'reportlab>=3.6.0',
    ],
    python_requires='>=3.8',
    entry_points={
        'console_scripts': [
            'seepage-fem=src.main:main',
        ],
    },
)
