from django.conf import settings


def feature_flags(request):
    return {
        "SIGNUP_ENABLED": getattr(settings, "SIGNUP_ENABLED", True),
    }
