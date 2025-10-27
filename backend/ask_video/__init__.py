"""
Djangoプロジェクトの初期化ファイル
"""

# Celeryアプリケーションをインポート
from app.celery_config import app as celery_app

__all__ = ("celery_app",)
