<!--
Sync Impact Report:
- Version: 0.0.0 → 1.0.0
- Type: MAJOR (Initial constitution ratification)
- Modified Principles: N/A (initial creation)
- Added Sections:
  * Core Principles (4 principles)
  * Performance & Scalability Standards
  * Development Workflow
  * Governance
- Removed Sections: N/A
- Templates Requiring Updates:
  * ✅ .specify/templates/plan-template.md (reviewed, already contains Constitution Check section)
  * ✅ .specify/templates/spec-template.md (reviewed, aligns with user scenarios and requirements)
  * ✅ .specify/templates/tasks-template.md (reviewed, aligns with testing discipline)
- Follow-up TODOs: None
-->

# VideoQ Constitution

## Core Principles

### I. Code Quality & Maintainability

All code MUST adhere to strict quality standards to ensure long-term maintainability:

- **Type Safety**: TypeScript MUST be used with strict mode enabled for frontend code; Python type hints MUST be used for all backend functions and methods
- **Linting**: All code MUST pass ESLint (frontend) and Black+isort (backend) checks before commit
- **Code Review**: All changes MUST be reviewed by at least one other developer before merging
- **Documentation**: Public APIs, complex logic, and non-obvious implementations MUST include clear comments explaining the "why" (not the "what")
- **Consistency**: Follow established patterns in the codebase; deviations MUST be justified and documented
- **No Dead Code**: Unused imports, commented-out code, and unreachable functions MUST be removed

**Rationale**: Clean, consistent code reduces technical debt, accelerates onboarding, and minimizes bugs in production.

### II. Testing Standards (NON-NEGOTIABLE)

Testing is mandatory and MUST follow these requirements:

- **Frontend Tests**: All new components, utilities, and services MUST have unit tests using Vitest; coverage threshold MUST be maintained at 80%
- **Backend Tests**: All new views, models, services, and utilities MUST have unit tests using Django's test framework; critical business logic MUST achieve 90%+ coverage
- **Test-First Mindset**: For critical features, tests SHOULD be written before implementation (red-green-refactor)
- **Test Isolation**: Tests MUST be independent and not rely on execution order; use fixtures and factories for test data
- **CI Integration**: All tests MUST pass in CI before merging; broken tests block deployment
- **Edge Cases**: Tests MUST cover error conditions, boundary values, and failure scenarios—not just happy paths

**Rationale**: Comprehensive testing catches regressions early, enables confident refactoring, and serves as living documentation.

### III. User Experience Consistency

All user-facing features MUST deliver a consistent, high-quality experience:

- **Internationalization**: All user-facing text MUST use i18next translation keys; hardcoded strings are prohibited
- **Accessibility**: Interactive elements MUST be keyboard-navigable; form inputs MUST have proper labels; color contrast MUST meet WCAG AA standards
- **Error Handling**: All errors MUST display user-friendly messages (not technical stack traces); error states MUST provide actionable guidance
- **Loading States**: Async operations MUST show loading indicators; users MUST never see frozen or unresponsive UI
- **Responsive Design**: All interfaces MUST be usable on mobile, tablet, and desktop viewports
- **Design System**: Use Radix UI components and Tailwind CSS utilities consistently; custom components MUST match the established visual language

**Rationale**: Consistent UX builds user trust, reduces support burden, and ensures the product is accessible to all users.

### IV. Performance Requirements

Performance is a feature, not an afterthought:

- **Frontend Performance**:
  - Initial page load MUST complete in under 3 seconds on 3G networks
  - Time to Interactive (TTI) MUST be under 5 seconds
  - Bundle size MUST be monitored; code splitting SHOULD be used for routes
  - Images MUST be optimized and lazy-loaded where appropriate

- **Backend Performance**:
  - API endpoints MUST respond in under 200ms for 95th percentile (p95) under normal load
  - Database queries MUST be optimized; N+1 queries are prohibited
  - Celery tasks for video processing MUST include progress tracking
  - Vector search queries MUST leverage pgvector indexes

- **Scalability Considerations**:
  - Services MUST be designed for horizontal scaling (stateless where possible)
  - Large files (videos) MUST be processed asynchronously
  - Rate limiting MUST be implemented for user-facing APIs
  - Caching strategies MUST be documented and justified

**Rationale**: Users abandon slow applications; performance directly impacts user satisfaction and operational costs.

## Performance & Scalability Standards

### Resource Constraints

- **Memory**: Backend services SHOULD target under 512MB memory usage per instance under normal load
- **Storage**: Video storage cleanup tasks MUST run automatically when user limits are exceeded
- **Database**: Database migrations MUST be backward-compatible; zero-downtime deployments are the goal

### Monitoring & Observability

- **Logging**: All critical operations (auth, uploads, transcriptions) MUST be logged with structured data
- **Error Tracking**: Production errors MUST be captured and triaged within 24 hours
- **Metrics**: Key metrics (upload success rate, transcription duration, API latency) SHOULD be tracked

## Development Workflow

### Version Control

- **Branching**: Feature branches MUST follow naming convention: `feature/description` or `fix/description`
- **Commits**: Commit messages MUST be descriptive and follow conventional commits format when appropriate
- **Pull Requests**: PRs MUST include description of changes, testing performed, and any breaking changes

### Quality Gates

Before merging, ALL of the following MUST pass:

1. Linting and formatting checks
2. Unit and integration tests
3. Type checking (frontend TypeScript, backend type hints)
4. Code review approval
5. No merge conflicts with target branch

### Security Practices

- **Authentication**: JWT tokens MUST use HttpOnly cookies; session tokens MUST have appropriate expiration
- **Authorization**: All API endpoints MUST verify user permissions; media files MUST be protected
- **Dependencies**: Security vulnerabilities MUST be addressed within 1 week for critical, 2 weeks for high severity
- **Secrets**: API keys and secrets MUST never be committed; use environment variables exclusively
- **Input Validation**: All user inputs MUST be validated and sanitized; protect against XSS, CSRF, and SQL injection

## Governance

### Constitution Authority

This constitution supersedes all other development practices and documentation. When conflicts arise, the constitution takes precedence.

### Amendment Process

1. Proposed changes MUST be documented with clear rationale
2. Team discussion and consensus required for amendments
3. Version number MUST be updated following semantic versioning:
   - **MAJOR**: Backward-incompatible changes, principle removals, or fundamental redefinitions
   - **MINOR**: New principles added or material expansions of existing guidance
   - **PATCH**: Clarifications, wording improvements, or non-semantic refinements
4. All dependent templates and documentation MUST be updated to maintain consistency

### Compliance & Review

- All pull requests MUST verify compliance with constitution principles
- Code that violates constitutional requirements MUST be rejected unless exception is explicitly justified and approved
- Constitution compliance SHOULD be reviewed quarterly and updated as project needs evolve

### Complexity Justification

When introducing complexity that appears to violate simplicity or maintainability principles (e.g., new architecture patterns, additional dependencies, abstractions), developers MUST:

1. Document the specific problem being solved
2. Explain why simpler alternatives are insufficient
3. Gain approval from at least one senior team member

**Version**: 1.0.0 | **Ratified**: 2026-02-01 | **Last Amended**: 2026-02-01
