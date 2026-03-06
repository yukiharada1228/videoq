"""Chat presentation dependency providers."""

from app import composition_root


def get_send_message_use_case():
    return composition_root.get_send_message_use_case()


def get_submit_feedback_use_case():
    return composition_root.get_submit_feedback_use_case()


def get_chat_history_use_case():
    return composition_root.get_chat_history_use_case()


def get_export_history_use_case():
    return composition_root.get_export_history_use_case()


def get_popular_scenes_use_case():
    return composition_root.get_popular_scenes_use_case()


def get_chat_analytics_use_case():
    return composition_root.get_chat_analytics_use_case()
