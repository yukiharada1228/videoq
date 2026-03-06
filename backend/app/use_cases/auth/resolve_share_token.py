"""
Use case: resolve share token authentication context.
"""

from app.domain.auth.ports import ShareAuthContextDTO, ShareTokenResolverPort


class ResolveShareTokenUseCase:
    def __init__(self, resolver: ShareTokenResolverPort):
        self.resolver = resolver

    def execute(self, share_token: str) -> ShareAuthContextDTO | None:
        return self.resolver.resolve(share_token)
