"""
Use case: resolve API key authentication context.
"""

from app.domain.auth.ports import ApiKeyResolverPort
from app.use_cases.auth.dto import ResolvedApiKeyOutput


class ResolveApiKeyUseCase:
    def __init__(self, resolver: ApiKeyResolverPort):
        self.resolver = resolver

    def execute(self, api_key: str) -> ResolvedApiKeyOutput | None:
        resolved = self.resolver.resolve(api_key)
        if resolved is None:
            return None
        return ResolvedApiKeyOutput(
            api_key_id=resolved.api_key_id,
            user_id=resolved.user_id,
            user_video_limit=resolved.user_video_limit,
            access_level=resolved.access_level,
        )
