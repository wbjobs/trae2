from setuptools import setup, find_packages

setup(
    name="slope-fem",
    version="1.0.0",
    description="岩土工程边坡稳定性有限元分析计算工具集",
    author="Geotechnical Engineering Team",
    packages=find_packages(),
    install_requires=[
        "numpy>=1.21.0",
        "scipy>=1.7.0",
        "matplotlib>=3.4.0",
        "pandas>=1.3.0",
        "jinja2>=3.0.0",
        "pyyaml>=5.4.0",
        "requests>=2.26.0",
    ],
    extras_require={
        "distributed": ["mpi4py>=3.1.0"],
        "visualization": ["pyvista>=0.32.0", "meshpy>=2018.2.1"],
    },
    python_requires=">=3.8",
)
