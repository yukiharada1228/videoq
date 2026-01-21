"""
Core module for dependency injection and configuration
"""

from .config import AppConfig
from .registry import ServiceRegistry, registry

__all__ = ["AppConfig", "ServiceRegistry", "registry"]
