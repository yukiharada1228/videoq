"""Evaluation dependency providers for presentation and entrypoint layers."""

from app.composition_root import evaluation as _cr


def get_evaluate_chat_log_use_case():
    return _cr.get_evaluate_chat_log_use_case()


def get_get_evaluation_summary_use_case():
    return _cr.get_get_evaluation_summary_use_case()


def get_list_chat_log_evaluations_use_case():
    return _cr.get_list_chat_log_evaluations_use_case()
