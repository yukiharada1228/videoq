from unittest.mock import MagicMock

from worker_python.pipeline import plog_build


def test_generated_chain_is_a_presentation_proposal_not_a_verified_prerequisite():
    concepts = [
        {"label": "Independent topic A"}, {"label": "Independent topic B"},
        {"label": "Independent topic C"},
    ]
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [{"id": 1}, {"id": 2}, {"id": 3}]

    plog_build.save_plog_artifacts(conn, 42, plog_build.PlogArtifacts(concepts, [[1.0]] * 3))

    edges = [call.args for call in conn.execute.call_args_list if "INSERT INTO plog_edges" in call.args[0]]
    assert [params for _, params in edges] == [(1, 2, 42), (2, 3, 42)]
    for statement, _ in edges:
        assert "'presentation_order', '', 'generated'" in statement
        assert "prerequisite_of" not in statement
        assert "accepted" not in statement
