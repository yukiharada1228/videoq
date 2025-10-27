"""
Celeryアプリケーションの設定
"""

import logging
import os

from celery import Celery
from django.conf import settings

logger = logging.getLogger(__name__)

# Djangoの設定をロード
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "ask_video.settings")

# Celeryアプリケーションを作成
app = Celery("ask_video")

# Djangoの設定からCelery設定を読み込む
app.config_from_object("django.conf:settings", namespace="CELERY")

# アプリケーション内のタスクを自動検出
app.autodiscover_tasks()

logger.info("Celery app configured")


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    """デバッグ用のタスク"""
    print(f"Request: {self.request!r}")
