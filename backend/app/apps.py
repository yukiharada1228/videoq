from django.apps import AppConfig as DjangoAppConfig


class AppConfig(DjangoAppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "app"

    def ready(self):
        """Initialize Celery app when application is ready"""
        # Import Celery app (to avoid circular import)
        import app.celery_config  # noqa

        # Validate configuration
        from app.core.config import AppConfig

        AppConfig.from_env()
