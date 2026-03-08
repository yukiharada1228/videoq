"""
Use case: resolve share token authentication context.
"""

from app.domain.auth.ports import ShareTokenResolverPort
from app.use_cases.auth.dto import ResolvedShareTokenOutput


class ResolveShareTokenUseCase:
    def __init__(self, resolver: ShareTokenResolverPort):
        self.resolver = resolver

    def execute(self, share_token: str) -> ResolvedShareTokenOutput | None:
        resolved = self.resolver.resolve(share_token)
        if resolved is None:
            return None
        return ResolvedShareTokenOutput(
            share_token=resolved.share_token,
            group_id=resolved.group_id,
        )
