"""
Celery application configuration
"""

import logging
import os

from celery import Celery
from celery.schedules import crontab

logger = logging.getLogger(__name__)

# Load Django settings
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "talk_video.settings")

# Create Celery application
app = Celery("talk_video")

# Load Celery settings from Django settings
app.config_from_object("django.conf:settings", namespace="CELERY")

# Auto-discover tasks in application
app.autodiscover_tasks()

# Celery Beat schedule configuration
app.conf.beat_schedule = {
    "cleanup-soft-deleted-videos": {
        "task": "app.tasks.cleanup_soft_deleted_videos",
        "schedule": crontab(hour=2, minute=0),  # Run daily at 2:00 AM
    },
}

logger.info("Celery app configured")


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    """Debug task"""
    pass
