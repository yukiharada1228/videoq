


class ChatService:
    """Service for chat related operations"""

    @staticmethod
    def get_chat_logs_queryset(group, ascending=True):
        """
        Get chat log queryset

        Args:
            group: VideoGroup instance
            ascending: Whether to sort ascending (True: ascending, False: descending)

        Returns:
            QuerySet: Chat log queryset
        """
        order_field = "created_at" if ascending else "-created_at"
        return group.chat_logs.select_related("user").order_by(order_field)
