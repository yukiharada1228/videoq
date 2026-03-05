# Clean Architecture Review

- Date: 2026-03-06
- Scope: `app/domain`, `app/use_cases`, `app/presentation`, `app/infrastructure`, `app/tasks`, and adjacent HTTP entry points
- Verdict: **Partially aligned**. Core paths follow Clean Architecture, but there are boundary leaks in non-core endpoints.

## Findings (Severity Order)

### 1. High: `ProtectedMediaView` bypasses use case/repository boundaries and accesses ORM directly
- Evidence:
  - `app/media/views.py:13` imports `app.models` directly.
  - `app/media/views.py:27` uses `VideoGroupMember.objects...` in view logic.
  - `app/media/views.py:64` uses `Video.objects...` in view logic.
  - `app/urls.py:3` wires this endpoint from `app.media.views`, outside `app/presentation` layer.
- Why this matters:
  - Presentation adapter now contains persistence/query concerns and authorization data access logic.
  - This creates a second architecture path that bypasses `use_cases` and domain ports.
- Recommendation:
  - Move this endpoint into `app/presentation/media`.
  - Introduce a media access use case (e.g., `ResolveProtectedMediaUseCase`) and repository port for lookup/authorization checks.

### 2. Medium: Import-rule tests do not guard `app/media`, allowing boundary leaks to persist
- Evidence:
  - Rules validate `domain/use_cases/presentation/tasks/infrastructure` only (`app/tests/test_import_rules.py:143-218`).
  - Current leak in `app/media/views.py` is not caught by those tests.
- Why this matters:
  - CI guardrails can report green while architecture violations exist in production routes.
- Recommendation:
  - Add `media` to architecture tests (or migrate media endpoint under `presentation` so existing checks apply).

### 3. Low: Domain layer contains UI-facing choice labels
- Evidence:
  - `app/domain/auth/entities.py:11-14` defines `ACCESS_LEVEL_CHOICES = [(..., "All"), (..., "Read Only")]`.
  - `app/presentation/auth/serializers.py:8,90-93` uses that tuple for serializer choices.
- Why this matters:
  - Domain should generally own business invariants (`all`, `read_only`) but not display labels.
- Recommendation:
  - Keep domain constants as canonical values only.
  - Define presentation labels in serializer or presentation constants.

## What Is Working Well

- Clear layer separation exists for main flows: `presentation -> use_cases -> domain ports -> infrastructure`.
- Composition root is centralized (`app/factories.py`), and presentation resolves dependencies via container (`app/container.py`).
- Architecture constraints are codified and currently passing:
  - `python -m unittest app.tests.test_import_rules` => **28 tests passed**.
- Use cases avoid Django/DRF imports and depend on domain abstractions.

## Overall Assessment

The backend is **close to Clean Architecture for core features**, but it is **not fully clean** due to at least one production endpoint (`protected media`) that bypasses the established boundaries. Fixing that path and expanding CI guardrails would make the architecture consistently enforceable.
