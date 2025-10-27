from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    encrypted_openai_api_key = models.TextField(
        blank=True, null=True, help_text="Encrypted OpenAI API key"
    )
