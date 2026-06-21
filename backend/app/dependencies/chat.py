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


def get_chat_analytics_use_case():
    return _cr.get_chat_analytics_use_case()


def get_chat_keywords_use_case():
    return _cr.get_chat_keywords_use_case()


def get_reset_history_use_case():
    return _cr.get_reset_history_use_case()


def get_legacy_rag_gateway():
    return _cr.get_legacy_rag_gateway()


def get_agent_rag_gateway():
    return _cr.get_agent_rag_gateway()


def get_chat_repository():
    return _cr.get_chat_repository()


def get_video_group_query_repository():
    return _cr.get_video_group_query_repository()
