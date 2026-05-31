"""
声学样本降噪与特征分类 AI 预处理平台 - 全局配置
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

SAMPLE_RATE = 16000
N_FFT = 512
HOP_LENGTH = 256
N_MELS = 128
N_MFCC = 40
CHUNK_DURATION = 3.0
CHUNK_SAMPLES = int(SAMPLE_RATE * CHUNK_DURATION)

MAX_CONCURRENT_STREAMS = 8
STREAM_QUEUE_SIZE = 100

DENOISE_METHODS = ["spectral_subtraction", "wiener", "wavelet", "none"]
DEFAULT_DENOISE_METHOD = "spectral_subtraction"

SPECTRAL_SUBTRACTION_ALPHA = 2.0
SPECTRAL_SUBTRACTION_BETA = 0.01
WIENER_NR_ITER = 3
WAVELET_LEVEL = 3
WAVELET_WAVELET = "db4"
WAVELET_MODE = "soft"

FEATURE_TYPES = [
    "time_domain",
    "frequency_domain",
    "mfcc",
    "mel_spectrogram",
    "spectral_contrast",
    "zero_crossing_rate",
]
DEFAULT_FEATURE_TYPES = ["mfcc", "mel_spectrogram"]

MODEL_DIR = BASE_DIR / "models"
MODEL_DIR.mkdir(exist_ok=True)
DEFAULT_MODEL_PATH = MODEL_DIR / "classifier.pth"
MODEL_LABELS = [
    "silence",
    "speech",
    "music",
    "noise",
    "alarm",
    "door_knock",
    "scream",
    "footstep",
]
MODEL_EMBEDDING_DIM = 256
MODEL_NUM_CLASSES = len(MODEL_LABELS)

SAMPLE_DB_PATH = BASE_DIR / "data" / "samples.db"
SAMPLE_DB_PATH.parent.mkdir(exist_ok=True)
SAMPLE_STORAGE_DIR = BASE_DIR / "data" / "samples"
SAMPLE_STORAGE_DIR.mkdir(exist_ok=True, parents=True)
MAX_SAMPLE_SIZE_MB = 50
ALLOWED_AUDIO_EXTENSIONS = {".wav", ".mp3", ".flac", ".ogg", ".m4a"}

LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)
LOG_LEVEL = "INFO"
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

API_HOST = "0.0.0.0"
API_PORT = 8000
API_RELOAD = False

CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:8080",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8080",
]

DATABASE_URL = f"sqlite:///{SAMPLE_DB_PATH}"
TABLE_SAMPLES = "samples"
TABLE_SAMPLE_FEATURES = "sample_features"
TABLE_CLASSIFICATION_RESULTS = "classification_results"

REDIS_ENABLED = False
REDIS_URL = "redis://localhost:6379/0"
REDIS_CACHE_TTL = 3600


def get_config_summary():
    return {
        "sample_rate": SAMPLE_RATE,
        "max_concurrent_streams": MAX_CONCURRENT_STREAMS,
        "denoise_methods": DENOISE_METHODS,
        "default_denoise_method": DEFAULT_DENOISE_METHOD,
        "feature_types": FEATURE_TYPES,
        "model_labels": MODEL_LABELS,
        "api_host": API_HOST,
        "api_port": API_PORT,
        "sample_db_path": str(SAMPLE_DB_PATH),
        "sample_storage_dir": str(SAMPLE_STORAGE_DIR),
    }
