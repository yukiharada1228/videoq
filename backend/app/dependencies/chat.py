"""Chat presentation dependency providers."""

from app.composition_root import chat as _cr


def get_send_message_use_case():
    return _cr.get_send_message_use_case()

def get_submit_feedback_use_case():
    return _cr.get_submit_feedback_use_case()


def get_chat_history_use_case():
    return _cr.get_chat_history_use_case()


def get_export_history_use_case():
    return _cr.get_export_history_use_case()


def get_popular_scenes_use_case():
    return _cr.get_popular_scenes_use_case()


def get_chat_analytics_use_case():
    return _cr.get_chat_analytics_use_case()
