"""Offline RAGAS evaluation for the agentic chat redesign (spec §13).

This ``manage.py`` command re-answers every :class:`ChatLog` question recorded
for a given :class:`VideoGroup` using one of the two chat gateways (the legacy
single-shot ``RagChatGateway`` or the tool-using ``AgenticChatGateway``), scores
each answer with :class:`RagasEvaluationGateway`, and writes the per-question
RAGAS metrics to CSV.

It is the acceptance-criteria harness for the agentic chat work: group 11's
fixed 38-question regression set is run through both gateways and compared
(§13). Because it drives a *real* LLM (both the gateway and the RAGAS judge),
it is intentionally a management command and is **not** part of the test suite.

Layering note: Django only discovers management commands under the installed
app's ``management/commands/`` directory, so this lives in ``app/management``
(not ``app/entrypoints``). It still reaches the inner layers only through
``app.dependencies`` (never ``app.use_cases`` / ``app.composition_root`` /
``app.infrastructure`` directly), mirroring the entrypoints layering discipline.
Gateways, repositories, and the RAGAS evaluator are all resolved via the
dependency providers, which wrap the same wiring used by the live
``USE_AGENT_CHAT`` selector.

Usage::

    python manage.py eval_agent_chat --group-id 11 --gateway agent --out agent.csv
    python manage.py eval_agent_chat --group-id 11 --gateway legacy
"""

import csv
import json
import sys
from typing import Dict, List, Optional

from django.core.management.base import BaseCommand, CommandError

from app.dependencies import chat as chat_deps
from app.dependencies import evaluation as eval_deps
from app.domain.chat.dtos import ChatMessageDTO


class Command(BaseCommand):
    """Re-answer a group's ChatLog questions and score them with RAGAS (§13)."""

    help = (
        "Re-answer every ChatLog question for a VideoGroup using the chosen chat "
        "gateway and score each answer with RAGAS. Writes question, type, "
        "faithfulness, answer_relevancy, context_precision to CSV. Uses a real "
        "LLM; not part of the test suite."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--group-id",
            type=int,
            required=True,
            help="VideoGroup id whose ChatLog questions are re-evaluated.",
        )
        parser.add_argument(
            "--gateway",
            choices=["legacy", "agent"],
            required=True,
            help="Which chat gateway to use: 'legacy' (RagChatGateway) or "
            "'agent' (AgenticChatGateway).",
        )
        parser.add_argument(
            "--out",
            type=str,
            default=None,
            help="Optional CSV output path. Defaults to stdout.",
        )
        parser.add_argument(
            "--type-fixture",
            type=str,
            default=None,
            help="Optional JSON file mapping question text -> failure-type label "
            "(spec §13's 4 failure types). When absent, the 'type' column is "
            "left blank.",
        )

    # ------------------------------------------------------------------
    # Gateway construction
    # ------------------------------------------------------------------
    def _build_gateway(self, gateway: str):
        """Build the chosen :class:`RagGateway` via the dependency providers.

        Both branches resolve through ``app.dependencies.chat`` so the evaluated
        gateways match production wiring exactly while keeping this entrypoint
        free of direct composition_root/infrastructure imports.
        """
        if gateway == "legacy":
            return chat_deps.get_legacy_rag_gateway()
        return chat_deps.get_agent_rag_gateway()

    # ------------------------------------------------------------------
    # Fixtures / data loading
    # ------------------------------------------------------------------
    def _load_type_fixture(self, path: Optional[str]) -> Dict[str, str]:
        """Load the question -> failure-type label map, or return ``{}``.

        Returns an empty mapping (so every 'type' cell is blank) when no fixture
        path is supplied or the file is missing/unreadable.
        """
        if not path:
            return {}
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, ValueError) as exc:
            raise CommandError(f"Failed to read type fixture {path!r}: {exc}")
        if not isinstance(data, dict):
            raise CommandError(
                f"Type fixture {path!r} must be a JSON object mapping "
                "question -> type label."
            )
        return {str(k): str(v) for k, v in data.items()}

    def _resolve_group(self, group_id: int):
        """Fetch the group context (owner id + member video ids) via the repo.

        Returns the :class:`VideoGroupContextEntity` (it exposes ``user_id``,
        ``description`` and ``member_video_ids``).
        """
        group_repo = chat_deps.get_video_group_query_repository()
        group = group_repo.get_with_members(group_id=group_id)
        if group is None:
            raise CommandError(f"VideoGroup {group_id} not found.")
        return group, group.user_id, list(group.member_video_ids)

    def _fetch_questions(self, group_id: int) -> List[str]:
        """Return the group's ChatLog questions via the chat repository."""
        chat_repo = chat_deps.get_chat_repository()
        return list(chat_repo.get_questions_for_group(group_id))

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------
    def handle(self, *args, **options) -> None:
        group_id: int = options["group_id"]
        gateway_name: str = options["gateway"]
        out_path: Optional[str] = options["out"]
        type_map = self._load_type_fixture(options["type_fixture"])
        if not type_map:
            self.stderr.write(
                "No --type-fixture supplied; the 'type' column will be blank."
            )

        group, owner_id, video_ids = self._resolve_group(group_id)
        questions = self._fetch_questions(group_id)
        if not questions:
            raise CommandError(
                f"VideoGroup {group_id} has no ChatLog questions to evaluate."
            )

        gateway = self._build_gateway(gateway_name)
        evaluator = eval_deps.get_ragas_evaluation_gateway()
        group_context = group.description or None

        rows: List[Dict[str, object]] = []
        total = len(questions)
        for idx, question in enumerate(questions, start=1):
            self.stderr.write(
                f"[{idx}/{total}] ({gateway_name}) {question[:60]!r}"
            )
            try:
                result = gateway.generate_reply(
                    messages=[ChatMessageDTO(role="user", content=question)],
                    user_id=owner_id,
                    video_ids=video_ids,
                    locale=None,
                    group_context=group_context,
                )
                scores = evaluator.evaluate(
                    question=question,
                    answer=result.content,
                    retrieved_contexts=list(result.retrieved_contexts or []),
                )
                faithfulness = scores.faithfulness
                answer_relevancy = scores.answer_relevancy
                context_precision = scores.context_precision
            except Exception as exc:  # noqa: BLE001 - log and continue the sweep
                self.stderr.write(
                    self.style.ERROR(f"  failed: {exc}")
                )
                faithfulness = answer_relevancy = context_precision = None

            rows.append(
                {
                    "question": question,
                    "type": type_map.get(question, ""),
                    "faithfulness": faithfulness,
                    "answer_relevancy": answer_relevancy,
                    "context_precision": context_precision,
                }
            )

        self._write_csv(rows, out_path)
        self.stderr.write(
            self.style.SUCCESS(
                f"Evaluated {len(rows)} questions for group {group_id} "
                f"via '{gateway_name}'."
            )
        )

    # ------------------------------------------------------------------
    # Output
    # ------------------------------------------------------------------
    def _write_csv(self, rows: List[Dict[str, object]], out_path: Optional[str]) -> None:
        """Write the scored rows as CSV to ``out_path`` or stdout."""
        fieldnames = [
            "question",
            "type",
            "faithfulness",
            "answer_relevancy",
            "context_precision",
        ]
        if out_path:
            handle = open(out_path, "w", encoding="utf-8", newline="")
            close = True
        else:
            handle = sys.stdout
            close = False
        try:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            for row in rows:
                writer.writerow(row)
        finally:
            if close:
                handle.close()
