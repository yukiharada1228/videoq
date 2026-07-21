"""PLOG presentation dependency providers."""

from app.composition_root import plog as _cr


def get_plog_graph_use_case():
    return _cr.get_plog_graph_use_case()


def get_rebuild_plog_use_case():
    return _cr.get_rebuild_plog_use_case()


def get_edit_plog_graph_use_case():
    return _cr.get_edit_plog_graph_use_case()


def get_learner_state_use_case():
    return _cr.get_learner_state_use_case()


def get_reset_learner_state_use_case():
    return _cr.get_reset_learner_state_use_case()
