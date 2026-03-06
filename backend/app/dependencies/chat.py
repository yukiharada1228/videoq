"""Chat presentation dependency providers."""

from app import factories


def get_send_message_use_case():
    return factories.get_send_message_use_case()


def get_submit_feedback_use_case():
    return factories.get_submit_feedback_use_case()


def get_chat_history_use_case():
    return factories.get_chat_history_use_case()


def get_export_history_use_case():
    return factories.get_export_history_use_case()


def get_popular_scenes_use_case():
    return factories.get_popular_scenes_use_case()


def get_chat_analytics_use_case():
    return factories.get_chat_analytics_use_case()
