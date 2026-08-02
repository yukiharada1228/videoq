"""Management command: score PLOG metrics against a gold JSON fixture."""

from __future__ import annotations

import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from app.infrastructure.external.plog.metrics import (
    concept_coverage,
    direction_agreement_and_inversion,
    edge_prf,
    is_dag,
    reachability_f1,
)
from app.infrastructure.models.plog import PlogConcept, PlogEdge


class Command(BaseCommand):
    help = "Compare a video's extracted PLOG ordering graph to a gold fixture JSON."

    def add_arguments(self, parser):
        parser.add_argument("video_id", type=int)
        parser.add_argument(
            "--gold",
            type=str,
            required=True,
            help="Path to gold JSON with concepts[] and ordering_edges[[src,tgt],...]",
        )

    def handle(self, *args, **options):
        video_id = options["video_id"]
        gold_path = Path(options["gold"])
        if not gold_path.exists():
            raise CommandError(f"Gold file not found: {gold_path}")

        gold = json.loads(gold_path.read_text(encoding="utf-8"))
        gold_concepts = {str(c).lower() for c in gold.get("concepts") or []}
        gold_edges = {
            (str(a).lower(), str(b).lower())
            for a, b in (gold.get("ordering_edges") or [])
        }

        concepts = list(PlogConcept.objects.filter(video_id=video_id))
        label_by_id = {c.id: c.label.lower() for c in concepts}
        extracted_concepts = set(label_by_id.values())
        extracted_edges = set()
        for e in PlogEdge.objects.filter(video_id=video_id, edge_type__in=["prerequisite_of", "builds_on"]):
            src = label_by_id.get(e.source_id)
            tgt = label_by_id.get(e.target_id)
            if src and tgt:
                extracted_edges.add((src, tgt))

        p, r, f1 = edge_prf(extracted_edges, gold_edges)
        agree, inv = direction_agreement_and_inversion(extracted_edges, gold_edges)
        self.stdout.write(
            json.dumps(
                {
                    "video_id": video_id,
                    "coverage": concept_coverage(extracted_concepts, gold_concepts),
                    "edge_precision": p,
                    "edge_recall": r,
                    "edge_f1": f1,
                    "reachability_f1": reachability_f1(extracted_edges, gold_edges),
                    "direction_agreement": agree,
                    "inversion_rate": inv,
                    "is_dag": is_dag(extracted_edges),
                    "extracted_concepts": len(extracted_concepts),
                    "extracted_ordering_edges": len(extracted_edges),
                },
                ensure_ascii=False,
                indent=2,
            )
        )
