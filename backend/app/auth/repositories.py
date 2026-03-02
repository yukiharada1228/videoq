from django.db.models import Count

from app.models import AccountDeletionRequest, UserApiKey


def create_account_deletion_request(*, user, reason: str):
    return AccountDeletionRequest.objects.create(user=user, reason=reason)


def has_active_api_key_with_name(*, user, name: str) -> bool:
    return UserApiKey.objects.filter(
        user=user,
        name=name,
        revoked_at__isnull=True,
    ).exists()


def get_active_api_keys(*, user):
    return UserApiKey.objects.filter(
        user=user,
        revoked_at__isnull=True,
    )


def get_active_user_by_email(*, user_model, email: str):
    return (
        user_model.objects.filter(email__iexact=email, is_active=True)
        .order_by("id")
        .first()
    )


def get_user_by_id(*, user_model, user_id):
    return user_model.objects.get(pk=user_id)


def get_user_with_video_count(*, user_model, user_id: int):
    return user_model.objects.annotate(video_count=Count("videos")).get(pk=user_id)


def get_active_api_key(*, user, api_key_id: int):
    return get_active_api_keys(user=user).get(pk=api_key_id)
