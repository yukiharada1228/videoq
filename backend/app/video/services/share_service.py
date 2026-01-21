"""
Share link service operations
"""


class ShareLinkService:
    """Handles share link operations"""

    @staticmethod
    def update_share_token(group, token_value):
        """Update share token for group"""
        group.share_token = token_value
        group.save(update_fields=["share_token"])
