#!/usr/bin/env python
"""PoC #02 — Worker が生成する SQS メッセージを、既存 Lambda consumer が受理するか検証。

方針: 実際の lambda_handler._execute_task（消費側の本物のコード）に、
  (A) Celery が生成する本物のメッセージ（golden, kombu SQS transport 相当の外側base64）
  (B) Worker が生成する最小 plain-JSON メッセージ（方式B/C）
を食わせ、いずれも同じ task / args / kwargs でディスパッチされることを確認する。
task.apply はモックして副作用（実 transcription 等）を起こさない。

実行（backend の venv で）:
    cd backend
    DJANGO_SETTINGS_MODULE=videoq.settings .venv/bin/python \
        ../poc/worker-sqs-dispatch/verify_dispatch.py
"""
import base64
import json
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

import django  # noqa: E402

django.setup()

import lambda_handler  # noqa: E402  (backend/lambda_handler.py)
from app.celery_config import app as celery_app  # noqa: E402

celery_app.loader.import_default_modules()
import app.entrypoints.tasks  # noqa: E402, F401

TASK = "app.entrypoints.tasks.transcription.transcribe_video"
VIDEO_ID = 123


def build_celery_golden() -> str:
    """Celery の canonical v2 プロデューサでメッセージを生成し、kombu SQS transport が
    送るのと同じ「外側 base64(JSON)」の SQS body を組み立てて返す。"""
    headers, properties, body, _sent = celery_app.amqp.as_task_v2(
        "golden-task-id-0001", TASK, args=(VIDEO_ID,), kwargs={}
    )
    inner_body_b64 = base64.b64encode(json.dumps(body).encode("utf-8")).decode("utf-8")
    envelope = {
        "body": inner_body_b64,
        "headers": headers,
        "content-type": "application/json",
        "content-encoding": "utf-8",
        "properties": properties,
    }
    # kombu SQS transport は全体を base64 する
    return base64.b64encode(json.dumps(envelope).encode("utf-8")).decode("utf-8")


def build_worker_message() -> str:
    """Worker が SendMessage で送る最小 plain-JSON。Celery/kombu 全体は不要で、
    lambda_handler が読む headers.task / headers.id / body の3つだけを満たす。"""
    inner = [[VIDEO_ID], {}, {}]  # [args, kwargs, embed]  embed は無視される
    body_b64 = base64.b64encode(json.dumps(inner).encode("utf-8")).decode("utf-8")
    return json.dumps({
        "headers": {"task": TASK, "id": "worker-generated-uuid-0002"},
        "body": body_b64,
    })


def run_case(label: str, raw_body: str) -> dict:
    """本物の lambda_handler._execute_task を呼ぶ。apply はモックし副作用を止める。"""
    captured = {}

    class _FakeResult:
        def get(self, *a, **k):
            return None

    def _fake_apply(self, args=None, kwargs=None, task_id=None, throw=True):
        captured.update(task=self.name, args=args, kwargs=kwargs, task_id=task_id)
        return _FakeResult()

    with patch("celery.app.task.Task.apply", _fake_apply):
        lambda_handler._execute_task(raw_body)

    print(f"[{label}] dispatched -> task={captured.get('task')} "
          f"args={captured.get('args')} kwargs={captured.get('kwargs')} id={captured.get('task_id')}")
    return captured


def main() -> None:
    print(f"registered? {TASK in celery_app.tasks}")

    # --message "<json>" が渡されたら、外部（JS Worker）生成メッセージを検証して終了
    if "--message" in sys.argv:
        msg = sys.argv[sys.argv.index("--message") + 1]
        cap = run_case("C js-worker (node build_message.mjs)  ", msg)
        ok = cap.get("task") == TASK and list(cap.get("args") or []) == [VIDEO_ID]
        print("\nRESULT:", "PASS ✅ — JS Worker 生成メッセージを既存Lambdaが受理" if ok else "FAIL ❌")
        sys.exit(0 if ok else 1)

    golden = run_case("A golden (Celery/kombu, outer base64)", build_celery_golden())
    worker = run_case("B worker  (minimal plain JSON)      ", build_worker_message())

    ok = (
        golden["task"] == worker["task"] == TASK
        and list(golden["args"]) == list(worker["args"]) == [VIDEO_ID]
        and golden["task"] in celery_app.tasks
    )
    print("\nRESULT:", "PASS ✅ — Worker の最小JSONは既存Lambdaが同一タスク/引数で受理" if ok else "FAIL ❌")
    # 参考: Worker が送る plain-JSON を表示（JS 側実装の期待値）
    print("\n[worker message the JS Worker must produce]\n" + build_worker_message())
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
