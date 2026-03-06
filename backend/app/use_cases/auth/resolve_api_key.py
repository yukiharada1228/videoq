"""
Use case: resolve API key authentication context.
"""

from app.domain.auth.ports import ApiKeyAuthContextDTO, ApiKeyResolverPort


class ResolveApiKeyUseCase:
    def __init__(self, resolver: ApiKeyResolverPort):
        self.resolver = resolver

    def execute(self, api_key: str) -> ApiKeyAuthContextDTO | None:
        return self.resolver.resolve(api_key)
