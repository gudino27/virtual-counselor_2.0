import os
import re
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv

load_dotenv()

CONFIG_DIR = Path(__file__).parent.parent.parent / "config"

_ENV_VAR_PATTERN = re.compile(r"\$\{([^}]+)\}")


def _substitute_env_vars(obj: Any) -> Any:
    if isinstance(obj, str):
        def replace(match):
            var = match.group(1)
            return os.environ.get(var, "")
        return _ENV_VAR_PATTERN.sub(replace, obj)
    if isinstance(obj, dict):
        return {k: _substitute_env_vars(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_substitute_env_vars(item) for item in obj]
    return obj


def _deep_merge(base: dict, override: dict) -> dict:
    merged = base.copy()
    for key, value in override.items():
        if key in merged and isinstance(merged[key], dict) and isinstance(value, dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def load_search_config(algorithm: str) -> dict:
    """Load hyperparameters for a search algorithm from config/{algorithm}.yaml."""
    path = CONFIG_DIR / f"{algorithm}.yaml"
    if not path.exists():
        raise FileNotFoundError(f"No search config found for '{algorithm}' at {path}")
    with open(path) as f:
        return yaml.safe_load(f)


def load_config(profile: str = "claude") -> dict:
    default_path = CONFIG_DIR / "default.yaml"
    profile_path = CONFIG_DIR / f"{profile}.yaml"

    with open(default_path) as f:
        config = yaml.safe_load(f)

    if profile_path.exists():
        with open(profile_path) as f:
            profile_config = yaml.safe_load(f)
        config = _deep_merge(config, profile_config)

    return _substitute_env_vars(config)
