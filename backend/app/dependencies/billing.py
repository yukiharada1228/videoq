"""Billing dependency providers."""

from app.composition_root import billing as _cr


def get_plans_use_case():
    return _cr.get_plans_use_case()


def get_subscription_use_case():
    return _cr.get_subscription_use_case()


def get_create_checkout_session_use_case():
    return _cr.get_create_checkout_session_use_case()


def get_create_billing_portal_use_case():
    return _cr.get_create_billing_portal_use_case()


def get_handle_webhook_use_case():
    return _cr.get_handle_webhook_use_case()


def get_check_storage_limit_use_case():
    return _cr.get_check_storage_limit_use_case()


def get_check_processing_limit_use_case():
    return _cr.get_check_processing_limit_use_case()


def get_check_ai_answers_limit_use_case():
    return _cr.get_check_ai_answers_limit_use_case()


def get_record_storage_usage_use_case():
    return _cr.get_record_storage_usage_use_case()


def get_record_processing_usage_use_case():
    return _cr.get_record_processing_usage_use_case()


def get_record_ai_answer_usage_use_case():
    return _cr.get_record_ai_answer_usage_use_case()
