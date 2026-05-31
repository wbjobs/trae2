import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "Industrial Audio Fault Detection Platform"
    VERSION: str = "1.0.0"
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    SAMPLE_RATE: int = 44100
    AUDIO_DURATION: float = 5.0
    MAX_CONCURRENT_STREAMS: int = 100

    UPLOAD_DIR: str = "uploads"
    SAMPLE_STORAGE_DIR: str = "sample_storage"
    MODEL_DIR: str = "models"
    LOG_DIR: str = "logs"

    DATABASE_URL: str = "sqlite:///./audio_platform.db"

    FEATURE_N_MFCC: int = 40
    FEATURE_N_FFT: int = 2048
    FEATURE_HOP_LENGTH: int = 512
    FEATURE_N_MELS: int = 128

    NOISE_REDUCTION_STRENGTH: float = 0.8
    NOISE_THRESHOLD: float = 0.01

    CLASSIFICATION_MODEL_PATH: str = "models/fault_classifier.pkl"
    SCALER_PATH: str = "models/scaler.pkl"

    class Config:
        env_file = ".env"


settings = Settings()

for directory in [settings.UPLOAD_DIR, settings.SAMPLE_STORAGE_DIR,
                  settings.MODEL_DIR, settings.LOG_DIR]:
    os.makedirs(directory, exist_ok=True)
