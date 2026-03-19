"""Django ORM implementation of OpenAiApiKeyRepository."""

from typing import Optional

from app.domain.user.ports import OpenAiApiKeyRepository
from app.infrastructure.common.cipher import FernetCipher


class DjangoOpenAiApiKeyRepository(OpenAiApiKeyRepository):
    """Persists encrypted OpenAI API keys on the User model."""

    def __init__(self, cipher: Optional[FernetCipher] = None) -> None:
        self._cipher = cipher or FernetCipher()

    def _get_user_model(self):
        from django.contrib.auth import get_user_model
        return get_user_model()

    def save_encrypted_key(self, user_id: int, raw_key: str) -> None:
        User = self._get_user_model()
        encrypted = self._cipher.encrypt(raw_key)
        User.objects.filter(pk=user_id).update(openai_api_key_encrypted=encrypted)

    def get_decrypted_key(self, user_id: int) -> Optional[str]:
        User = self._get_user_model()
        row = (
            User.objects.filter(pk=user_id)
            .values_list("openai_api_key_encrypted", flat=True)
            .first()
        )
        if row is None or not row:
            return None
        return self._cipher.decrypt(bytes(row))

    def delete_key(self, user_id: int) -> None:
        User = self._get_user_model()
        User.objects.filter(pk=user_id).update(openai_api_key_encrypted=None)

    def get_masked_key(self, user_id: int) -> Optional[str]:
        raw = self.get_decrypted_key(user_id)
        if raw is None:
            return None
        if len(raw) <= 7:
            return raw[:3] + "..."
        return raw[:3] + "..." + raw[-4:]

    def has_key(self, user_id: int) -> bool:
        User = self._get_user_model()
        return (
            User.objects.filter(pk=user_id)
            .exclude(openai_api_key_encrypted=None)
            .exclude(openai_api_key_encrypted=b"")
            .exists()
        )
