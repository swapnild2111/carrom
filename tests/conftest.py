"""Shared pytest fixtures."""

from __future__ import annotations

import pytest

from helpers import make_isolated_env


@pytest.fixture
def isolated_env(tmp_path):
    return make_isolated_env(tmp_path)
