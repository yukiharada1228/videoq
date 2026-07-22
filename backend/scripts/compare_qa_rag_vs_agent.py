"""Compare classic RAG vs QA tool agent on the same hard questions.

Usage (inside backend container):
  python manage.py shell < scripts/compare_qa_rag_vs_agent.py
or:
  python scripts/compare_qa_rag_vs_agent.py  (with DJANGO_SETTINGS_MODULE)
"""

from __future__ import annotations

import json
import time
from typing import Any

import django

django.setup()

from django.contrib.auth import get_user_model

from app.infrastructure.external.llm import get_langchain_llm
from app.infrastructure.external.qa_agent.agent import QaToolAgent
from app.infrastructure.external.rag_service import RagChatService
from app.infrastructure.models import VideoGroup

GROUP_ID = 18
USER_ID = 5

# Hard / ambiguous questions where rewrite / video targeting may help.
QUESTIONS = [
    {
        "id": "q1_target_video",
        "question": "第12回のRSラッチについて、現在Q=0・Qバー=1のときの動作のポイントを説明して。",
        "expect_keywords": ["RS", "ラッチ", "リセット", "セット", "Q"],
        "gold_video_hint": "第12回",
    },
    {
        "id": "q2_paraphrase",
        "question": "1の個数が偶数になるようにパリティビットを付ける課題では、A=0 B=0 のとき P はどうなる？",
        "expect_keywords": ["0", "パリティ", "偶数"],
        "gold_video_hint": "第10回",
    },
    {
        "id": "q3_cross_detail",
        "question": "2桁の2進ダウンカウンターで、状態が11の次は何になる？Dフリップフロップの回の内容で。",
        "expect_keywords": ["10", "ダウン", "カウンター"],
        "gold_video_hint": "第14回",
    },
    {
        "id": "q4_karnaugh",
        "question": "カルノー図を書くとき、ABの並びが 00,01,11,10 になることに気をつけろと説明していた内容を要約して。",
        "expect_keywords": ["カルノー", "00", "01", "11", "10"],
        "gold_video_hint": "第6回",
    },
    {
        "id": "q5_ambiguous",
        "question": "加算器の桁上がり C がどう定義されるか、1桁分の全加算機の話で説明して。",
        "expect_keywords": ["桁", "加算", "C", "S"],
        "gold_video_hint": "第8回",
    },
]


def _keyword_hits(answer: str, keywords: list[str]) -> list[str]:
    return [k for k in keywords if k.lower() in answer.lower()]


def _citation_titles(citations: Any) -> list[str]:
    if not citations:
        return []
    titles = []
    for c in citations:
        if isinstance(c, dict):
            titles.append(str(c.get("title") or ""))
        else:
            titles.append(str(getattr(c, "title", "") or ""))
    return titles


def run_classic(service: RagChatService, question: str, video_ids: list[int], locale: str):
    t0 = time.perf_counter()
    result = service.run(
        messages=[{"role": "user", "content": question}],
        video_ids=video_ids,
        locale=locale,
    )
    elapsed = time.perf_counter() - t0
    content = result.llm_response.content
    text = content if isinstance(content, str) else str(content)
    return {
        "mode": "classic_rag",
        "answer": text,
        "elapsed_sec": round(elapsed, 2),
        "n_contexts": len(result.retrieved_contexts or []),
        "citation_titles": _citation_titles(result.citations),
    }


def run_agent(agent: QaToolAgent, question: str, locale: str):
    t0 = time.perf_counter()
    result = agent.run(
        messages=[{"role": "user", "content": question}],
        locale=locale,
    )
    elapsed = time.perf_counter() - t0
    return {
        "mode": "qa_agent",
        "answer": result.content,
        "elapsed_sec": round(elapsed, 2),
        "n_contexts": len(result.retrieved_contexts or []),
        "citation_titles": _citation_titles(result.citations),
        "n_collected_scenes": len(agent.toolkit.collected_scenes),
    }


def main() -> None:
    User = get_user_model()
    user = User.objects.get(pk=USER_ID)
    group = VideoGroup.objects.get(pk=GROUP_ID)
    video_ids = [m.video_id for m in group.members.all()]
    llm = get_langchain_llm()
    classic = RagChatService(user=user, llm=llm)
    locale = "ja"

    rows = []
    for item in QUESTIONS:
        q = item["question"]
        print(f"\n===== {item['id']} =====", flush=True)
        print(f"Q: {q}", flush=True)

        classic_out = run_classic(classic, q, video_ids, locale)
        # Fresh agent per question so collected scenes do not leak across qs.
        agent = QaToolAgent(user_id=user.id, llm=llm, video_ids=video_ids)
        agent_out = run_agent(agent, q, locale)

        classic_hits = _keyword_hits(classic_out["answer"], item["expect_keywords"])
        agent_hits = _keyword_hits(agent_out["answer"], item["expect_keywords"])
        classic_gold = any(
            item["gold_video_hint"] in t for t in classic_out["citation_titles"]
        )
        agent_gold = any(
            item["gold_video_hint"] in t for t in agent_out["citation_titles"]
        )

        row = {
            "id": item["id"],
            "question": q,
            "classic": {
                **{k: v for k, v in classic_out.items() if k != "answer"},
                "keyword_hits": classic_hits,
                "keyword_hit_rate": round(
                    len(classic_hits) / max(len(item["expect_keywords"]), 1), 2
                ),
                "cites_gold_video": classic_gold,
                "answer_preview": classic_out["answer"][:280].replace("\n", " "),
            },
            "agent": {
                **{k: v for k, v in agent_out.items() if k != "answer"},
                "keyword_hits": agent_hits,
                "keyword_hit_rate": round(
                    len(agent_hits) / max(len(item["expect_keywords"]), 1), 2
                ),
                "cites_gold_video": agent_gold,
                "answer_preview": agent_out["answer"][:280].replace("\n", " "),
            },
            "full_answers": {
                "classic": classic_out["answer"],
                "agent": agent_out["answer"],
            },
        }
        rows.append(row)
        print(
            json.dumps(
                {
                    "classic": row["classic"],
                    "agent": row["agent"],
                },
                ensure_ascii=False,
                indent=2,
            ),
            flush=True,
        )

    summary = {
        "n_questions": len(rows),
        "classic_gold_cite": sum(1 for r in rows if r["classic"]["cites_gold_video"]),
        "agent_gold_cite": sum(1 for r in rows if r["agent"]["cites_gold_video"]),
        "classic_avg_keyword_hit_rate": round(
            sum(r["classic"]["keyword_hit_rate"] for r in rows) / len(rows), 2
        ),
        "agent_avg_keyword_hit_rate": round(
            sum(r["agent"]["keyword_hit_rate"] for r in rows) / len(rows), 2
        ),
        "classic_avg_latency": round(
            sum(r["classic"]["elapsed_sec"] for r in rows) / len(rows), 2
        ),
        "agent_avg_latency": round(
            sum(r["agent"]["elapsed_sec"] for r in rows) / len(rows), 2
        ),
        "classic_avg_contexts": round(
            sum(r["classic"]["n_contexts"] for r in rows) / len(rows), 2
        ),
        "agent_avg_contexts": round(
            sum(r["agent"]["n_contexts"] for r in rows) / len(rows), 2
        ),
    }
    print("\n===== SUMMARY =====", flush=True)
    print(json.dumps(summary, ensure_ascii=False, indent=2), flush=True)

    out_path = "/tmp/qa_rag_vs_agent_compare.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"summary": summary, "rows": rows}, f, ensure_ascii=False, indent=2)
    print(f"\nWrote {out_path}", flush=True)


if __name__ == "__main__":
    main()
