from unittest.mock import MagicMock

from worker_python.pipeline import plog_build


def test_generated_chain_is_a_presentation_proposal_not_a_verified_prerequisite(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(plog_build, "_extract_concepts", lambda *_: [
        {"label": "Independent topic A"}, {"label": "Independent topic B"},
        {"label": "Independent topic C"},
    ])
    monkeypatch.setattr(plog_build, "embed_texts", lambda texts: [[1.0] for _ in texts])
    monkeypatch.setattr(plog_build, "assert_embedding_schema", lambda *_: None)
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [{"id": 1}, {"id": 2}, {"id": 3}]

    plog_build.run_plog_pipeline(conn, 42, "Independent topics in a lecture")

    edges = [call.args for call in conn.execute.call_args_list if "INSERT INTO plog_edges" in call.args[0]]
    assert [params for _, params in edges] == [(1, 2, 42), (2, 3, 42)]
    for statement, _ in edges:
        assert "'presentation_order', '', 'generated'" in statement
        assert "prerequisite_of" not in statement
        assert "accepted" not in statement
