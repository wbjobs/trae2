from setuptools import setup, find_packages

setup(
    name='cnc-simulator',
    version='1.0.0',
    description='Industrial CNC Program Offline Simulation Verification Desktop Client',
    author='CNC Simulator Team',
    packages=find_packages(),
    python_requires='>=3.8',
    install_requires=[
        'PyQt5>=5.15.0',
        'PyQtGraph>=0.13.0',
        'numpy>=1.21.0',
        'pyopengl>=3.1.0',
    ],
    entry_points={
        'console_scripts': [
            'cnc-simulator=main:main',
        ],
    },
    classifiers=[
        'Programming Language :: Python :: 3',
        'Operating System :: Microsoft :: Windows',
        'Operating System :: POSIX :: Linux',
        'Topic :: Scientific/Engineering',
    ],
)
