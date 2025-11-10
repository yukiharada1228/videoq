from django.apps import AppConfig as DjangoAppConfig


class AppConfig(DjangoAppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "app"

    def ready(self):
        """アプリケーションの準備完了時にCeleryアプリを初期化"""
        # Celeryアプリをインポート（循環インポートを避けるため）
        import app.celery_config  # noqa
