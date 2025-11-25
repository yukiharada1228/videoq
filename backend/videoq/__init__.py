"""
Django project initialization file
"""

# Import Celery application
from app.celery_config import app as celery_app

__all__ = ("celery_app",)
