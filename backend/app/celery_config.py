"""
Celery application configuration
"""

import logging
import os

from celery import Celery

logger = logging.getLogger(__name__)

# Load Django settings
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "ask_video.settings")

# Create Celery application
app = Celery("ask_video")

# Load Celery settings from Django settings
app.config_from_object("django.conf:settings", namespace="CELERY")

# Auto-discover tasks in application
app.autodiscover_tasks()

logger.info("Celery app configured")


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    """Debug task"""
    pass
