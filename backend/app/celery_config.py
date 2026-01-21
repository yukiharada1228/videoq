"""
Celery application configuration
"""

import logging
import os

from celery import Celery
from celery.schedules import crontab

logger = logging.getLogger(__name__)

# Load Django settings
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "videoq.settings")

# Create Celery application
app = Celery("videoq")

# Load Celery settings from Django settings
app.config_from_object("django.conf:settings", namespace="CELERY")

# Auto-discover tasks in application
app.autodiscover_tasks()

logger.info("Celery app configured")
app.conf.beat_schedule = {
    "cleanup-orphaned-vectors-daily": {
        "task": "cleanup_orphaned_vectors",
        "schedule": crontab(hour=3, minute=0),  # Run daily at 3:00 AM
    },
}

@app.task(bind=True, ignore_result=True)
def debug_task(self):
    """Debug task"""
    pass
