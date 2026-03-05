# Backend Clean Architecture Review

- Review date: 2026-03-06
- Scope: `backend/app` (domain, use_cases, infrastructure, presentation, tasks, factories/container)
- Method: static structure review + import rule test execution

## Verdict

**Mostly yes (partially compliant).**

The backend has a clear layer split (`domain` / `use_cases` / `infrastructure` / `presentation`) and enforces dependency direction with automated tests. However, there are a few design points where dependency boundaries are weakened (mainly service-locator usage from serializers/views and a monolithic composition root).

## Findings (severity order)

### 1. Medium: Service locator usage leaks dependency wiring into presentation internals

`presentation` uses `get_container()` directly not only in view handlers but also inside serializer helper functions, which creates hidden runtime dependencies and makes adapter testing/composability harder.

- Evidence:
  - `backend/app/presentation/video/serializers.py:22-27` (`_resolve_file_url()` imports and calls container)
  - `backend/app/presentation/chat/views.py:278-287` (view resolves file URL via container directly)

Why this matters for clean architecture:
- Clean architecture favors explicit dependency injection at boundaries.
- Service locator pattern can obscure object graph and increase coupling to global state.

### 2. Low: Composition root is concentrated in a single large module

`factories.py` imports many infrastructure/use_case modules in one place and returns concrete implementations per function call.

- Evidence:
  - `backend/app/factories.py:6-81` (broad top-level imports)
  - `backend/app/factories.py:89-220` (many concrete bindings)

Why this matters:
- Not a direct rule violation, but maintainability risk grows as contexts increase.
- Changes in one bounded context can trigger import/load side effects for others.

### 3. Low: Legacy transitional module remains (`app/media/views.py`)

There is an empty legacy module kept for migration notes.

- Evidence:
  - `backend/app/media/views.py` (moved comment only)

Why this matters:
- Not a functional issue, but can confuse ownership of HTTP adapters (`app/media` vs `app/presentation/media`).

## Positive evidence (what is working well)

- Explicit architectural guardrails via tests:
  - `backend/app/tests/test_import_rules.py:143-218` blocks forbidden imports for domain/use_cases/infrastructure/tasks.
  - `backend/app/tests/test_import_rules.py:256-260` blocks direct `presentation -> factories` imports.
- Use cases depend on domain ports/interfaces, not ORM/framework objects:
  - `backend/app/use_cases/video/create_video.py:7-11,24-55`
- Domain repository interfaces are framework-agnostic:
  - `backend/app/domain/video/repositories.py:1-92`
- Infrastructure implements domain ports and isolates ORM:
  - `backend/app/infrastructure/repositories/django_video_repository.py:25-31,120-174`
- Async task dispatch is abstracted via gateway and transaction-safe hook:
  - `backend/app/infrastructure/tasks/task_gateway.py:12-20`

## Validation performed

Executed:

```bash
cd backend && python -m unittest -q app.tests.test_import_rules
```

Result:

- `Ran 29 tests in 0.009s`
- `OK`

## Recommended next actions

1. Replace serializer-level service locator calls with explicit resolver injection (e.g., pass resolved URLs from view/use case output DTO).
2. Split `factories.py` by bounded context (`video_factories.py`, `chat_factories.py`, etc.) and keep one thin composition root aggregator.
3. Remove or clearly deprecate legacy `app/media` module to reduce architectural ambiguity.
