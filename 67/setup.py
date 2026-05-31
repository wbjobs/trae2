from setuptools import setup, find_packages

setup(
    name="turbulence_interp",
    version="1.0.0",
    description="大气湍流观测数据时空插值并行计算套件",
    author="Atmospheric Science Team",
    packages=find_packages(),
    install_requires=[
        "numpy>=1.24.0",
        "scipy>=1.10.0",
        "pandas>=2.0.0",
        "xarray>=2023.6.0",
        "netCDF4>=1.6.4",
        "h5py>=3.8.0",
        "pyyaml>=6.0",
        "joblib>=1.3.0",
        "paramiko>=3.2.0",
        "dask>=2023.6.0",
        "distributed>=2023.6.0",
        "pydantic>=2.0.0",
    ],
    python_requires=">=3.9",
    entry_points={
        "console_scripts": [
            "turbulence-interp=turbulence_interp.main:main",
        ],
    },
)
