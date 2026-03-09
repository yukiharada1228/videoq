## Backend PR Only

- Use this template only for backend changes in `backend/`.

## Backend Context: (`Auth` / `Video` / `Chat`)

- Specify the bounded context in the first line.

## Summary

- What changed and why.

## Scope

- In scope:
- Out of scope:

## Ubiquitous Language Checklist (Backend)

- [ ] I listed domain terms added/changed in this PR.
- [ ] I avoided ambiguous terms (`group`, `token`, `user`) without context.
- [ ] I used context-qualified terms when needed (e.g., `Video group` / `Chat group context`).
- [ ] For each changed core term, I described `Responsibilities`, `Invariants`, and `Out of scope`.
- [ ] If behavior changed, I updated allowed operations or state transitions in `docs/architecture/ubiquitous-language.md`.
- [ ] Error messages use nouns defined in the ubiquitous-language guide.
- [ ] I added or updated tests that validate changed invariants/transition rules.
- [ ] I updated `docs/architecture/domain-model-map.md` when context boundaries or cross-context interaction changed.

## Changed Files (Language / Contract Relevant)

- `docs/architecture/ubiquitous-language.md`:
- `docs/architecture/domain-model-map.md`:
- `presentation/*` error messages:
- `use_cases/*`:
- `domain/*`:

### Added/Changed Domain Terms (Backend)

- Term:
  Context:
  Definition:
  Responsibilities:
  Invariants:
  Allowed operations (if relevant):
  Out of scope:
  Replaced/Deprecated term (if any):

## Ubiquitous Language Behavior Delta (Backend)

- Changed term:
  Before:
  After:
  Affected use cases:
  Affected tests:

## Boundary Delta (Domain / Application / External)

- Domain model change:
- Use-case boundary change:
- External/API contract change:
- Reason this boundary is correct:

## API to Internal Mapping Delta

- External term:
  Internal term:
  Mapping rule:
  Compatibility impact:

## State Transition Delta (if applicable)

- State machine:
- Added allowed transitions:
- Removed allowed transitions:
- Forbidden transition changes:
- Retry / terminal semantics:

## Validation Evidence

- Tests run:
- Result:
- Notes (if warnings/log noise observed):
