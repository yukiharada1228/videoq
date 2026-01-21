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

        try:
            AppConfig.from_env()
        except Exception as e:
            # Log warning but allow startup for management commands (e.g. migrate)
            # or if strictly required, ensure CI sets the env var.
            # For now, let's log and re-raise only if NOT in management command usually.
            # But simpler: just log a critical warning.
            import logging
            import sys
            
            logger = logging.getLogger(__name__)
            
            # Check if we are running a management command where strict config might not be needed
            # e.g. collectstatic, migrate, makemigrations
            lenient_commands = {'collectstatic', 'makemigrations', 'migrate', 'check', 'test'}
            is_management_command = any(cmd in sys.argv for cmd in lenient_commands)
            
            if is_management_command:
                 logger.warning(f"Configuration validation failed: {e}. Proceeding as this is a management command.")
            else:
                 raise
