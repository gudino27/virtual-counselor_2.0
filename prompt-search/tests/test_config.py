import os
import tempfile
from pathlib import Path

import pytest
import yaml

from src.utils.config_loader import _deep_merge, _substitute_env_vars, load_config


def test_deep_merge_non_overlapping():
    base = {"a": 1, "b": {"x": 10}}
    override = {"c": 3, "b": {"y": 20}}
    result = _deep_merge(base, override)
    assert result == {"a": 1, "b": {"x": 10, "y": 20}, "c": 3}


def test_deep_merge_override_wins():
    base = {"a": 1, "b": 2}
    override = {"b": 99}
    result = _deep_merge(base, override)
    assert result["b"] == 99


def test_substitute_env_vars(monkeypatch):
    monkeypatch.setenv("TEST_KEY", "hello")
    result = _substitute_env_vars("Value is ${TEST_KEY}")
    assert result == "Value is hello"


def test_substitute_env_vars_missing(monkeypatch):
    monkeypatch.delenv("MISSING_VAR", raising=False)
    result = _substitute_env_vars("${MISSING_VAR}")
    assert result == ""


def test_substitute_env_vars_nested(monkeypatch):
    monkeypatch.setenv("MY_MODEL", "gpt-4")
    obj = {"llm": {"model": "${MY_MODEL}", "temp": 0.7}}
    result = _substitute_env_vars(obj)
    assert result["llm"]["model"] == "gpt-4"
    assert result["llm"]["temp"] == 0.7


def test_load_config_defaults_present():
    config = load_config("claude")
    assert "llm" in config
    assert "cache" in config
    assert "rate_limiter" in config


def test_load_config_claude_profile():
    config = load_config("claude")
    assert config["llm"]["provider"] == "claude"


def test_load_config_local_profile():
    config = load_config("local")
    assert config["llm"]["provider"] == "local"
