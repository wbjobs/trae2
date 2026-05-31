import os
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent

class Config:
    DEBUG = os.getenv('DEBUG', 'True') == 'True'
    
    SPARK_CONFIG = {
        'app_name': 'PV_Ops_Analysis',
        'master': os.getenv('SPARK_MASTER', 'local[*]'),
        'executor_memory': os.getenv('SPARK_EXECUTOR_MEMORY', '4g'),
        'driver_memory': os.getenv('SPARK_DRIVER_MEMORY', '2g'),
        'timezone': 'Asia/Shanghai'
    }
    
    HIVE_CONFIG = {
        'metastore_uris': os.getenv('HIVE_METASTORE_URIS', 'thrift://localhost:9083'),
        'database': 'pv_ops_db',
        'warehouse_dir': '/user/hive/warehouse/pv_ops_db.db'
    }
    
    FLASK_CONFIG = {
        'host': os.getenv('FLASK_HOST', '0.0.0.0'),
        'port': int(os.getenv('FLASK_PORT', '5000'))
    }
    
    DATA_PATHS = {
        'raw_data': BASE_DIR / 'data' / 'raw',
        'cleaned_data': BASE_DIR / 'data' / 'cleaned',
        'reports': BASE_DIR / 'reports',
        'samples': BASE_DIR / 'samples'
    }
    
    CLEANING_CONFIG = {
        'outlier_threshold': 3.0,
        'missing_strategy': 'impute',
        'quality_threshold': 0.95
    }
    
    REPORT_CONFIG = {
        'formats': ['xlsx', 'csv', 'json'],
        'default_format': 'xlsx',
        'output_dir': BASE_DIR / 'reports'
    }

class DevelopmentConfig(Config):
    DEBUG = True

class ProductionConfig(Config):
    DEBUG = False

config = DevelopmentConfig if Config.DEBUG else ProductionConfig

for path in config.DATA_PATHS.values():
    path.mkdir(parents=True, exist_ok=True)
