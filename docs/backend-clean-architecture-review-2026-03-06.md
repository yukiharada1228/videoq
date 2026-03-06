# Backend Clean Architecture Review (2026-03-06)

## Findings (Severity Order)

### 1. Medium: Domain entity carries presentation-oriented data and is mutated in use cases
- Evidence:
  - `VideoEntity` has both persistence key and resolved URL fields: [backend/app/domain/video/entities.py](/Users/yukiharada/dev/videoq/backend/app/domain/video/entities.py:41), [backend/app/domain/video/entities.py](/Users/yukiharada/dev/videoq/backend/app/domain/video/entities.py:42)
  - Use-case helper mutates `file_url` in place: [backend/app/use_cases/video/file_url.py](/Users/yukiharada/dev/videoq/backend/app/use_cases/video/file_url.py:14), [backend/app/use_cases/video/file_url.py](/Users/yukiharada/dev/videoq/backend/app/use_cases/video/file_url.py:17)
- Why it matters:
  - In clean architecture, entities ideally hold business state/invariants only. `file_url` is delivery/integration-oriented projection data, and in-place mutation in use cases mixes application mapping concerns into core objects.
- Recommendation:
  - Keep `VideoEntity` with `file_key` only, and map to response DTO/view-model in use case or presenter layer.

### 2. Low: Presentation layer depends directly on domain chat DTO
- Evidence:
  - Direct import: [backend/app/presentation/chat/views.py](/Users/yukiharada/dev/videoq/backend/app/presentation/chat/views.py:15)
  - Direct construction in view: [backend/app/presentation/chat/views.py](/Users/yukiharada/dev/videoq/backend/app/presentation/chat/views.py:95)
- Why it matters:
  - This couples HTTP adapter to domain contract. If domain message schema changes, presentation is directly impacted.
- Recommendation:
  - Define input DTO in `use_cases/chat/dto.py` and let use case map to domain DTO internally.

### 3. Low: Repository contracts include query/UI-oriented knobs
- Evidence:
  - `VideoRepository.list_for_user` takes `q`, `ordering`, `include_transcript`, `include_groups`: [backend/app/domain/video/repositories.py](/Users/yukiharada/dev/videoq/backend/app/domain/video/repositories.py:34)
  - `VideoGroupRepository.list_for_user` takes `annotate_only`: [backend/app/domain/video/repositories.py](/Users/yukiharada/dev/videoq/backend/app/domain/video/repositories.py:109)
- Why it matters:
  - Domain ports are trending toward ORM/query-optimization concerns instead of use-case language. It can make core contracts less stable and less intention-revealing.
- Recommendation:
  - Replace multiple flags with use-case-specific query objects or split read-model/query services from domain repositories.

## What Is Working Well

- Layering is explicit and consistent (`domain`, `use_cases`, `infrastructure`, `presentation`, `entrypoints`, `composition_root`).
- Dependency direction is strongly guarded by import-rule tests:
  - [backend/app/tests/test_import_rules.py](/Users/yukiharada/dev/videoq/backend/app/tests/test_import_rules.py:1)
- DI wiring is centralized in composition root and consumed via dependencies adapters:
  - [backend/app/composition_root/video.py](/Users/yukiharada/dev/videoq/backend/app/composition_root/video.py:1)
  - [backend/app/dependencies/video.py](/Users/yukiharada/dev/videoq/backend/app/dependencies/video.py:1)
- Presentation is mostly thin HTTP adapter code delegating to use cases.

## Test Result Used for Review

- Executed:
  - `docker compose exec backend python manage.py test app.tests.test_import_rules -v 2 --keepdb`
- Result:
  - `36` tests passed, `0` failures.

## Verdict

- Current backend is **largely aligned with clean architecture**.
- No critical boundary break was found.
- Addressing the medium finding (entity pollution with `file_url`) would improve architectural purity and long-term maintainability.
