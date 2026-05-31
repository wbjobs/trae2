import json
import os

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'settings.json')


def load_config():
    with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_config(config):
    with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=4, ensure_ascii=False)


def get_config(key_path, default=None):
    config = load_config()
    keys = key_path.split('.')
    value = config
    for key in keys:
        if isinstance(value, dict):
            value = value.get(key)
            if value is None:
                return default
        else:
            return default
    return value


def set_config(key_path, value):
    config = load_config()
    keys = key_path.split('.')
    cfg = config
    for key in keys[:-1]:
        if key not in cfg:
            cfg[key] = {}
        cfg = cfg[key]
    cfg[keys[-1]] = value
    save_config(config)
