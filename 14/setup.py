from setuptools import setup, find_packages

setup(
    name="cfd-dem-suite",
    version="1.0.0",
    description="流体力学离散元数值仿真科学计算服务套件",
    author="CFD-DEM Team",
    packages=find_packages(),
    install_requires=[
        "numpy>=1.24.0",
        "scipy>=1.10.0",
        "pyyaml>=6.0",
        "matplotlib>=3.7.0",
        "h5py>=3.8.0",
        "pandas>=2.0.0",
        "psutil>=5.9.0",
        "requests>=2.31.0",
        "python-dotenv>=1.0.0",
        "numba>=0.57.0",
    ],
    python_requires=">=3.9",
    entry_points={
        "console_scripts": [
            "cfd-dem-sim=cfd_dem_suite.main:main",
        ],
    },
)
