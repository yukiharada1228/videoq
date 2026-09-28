# Repository review — 2026-09-28

Reviewed the current working tree, including the structured-answer implementation
for issue #996. The review covered API, web, shared TypeScript contracts, Python
worker, documentation, migration and maintenance scripts, CI, and Terraform.
Third-party `whisper.cpp` sources and generated Cloudflare declarations were not
treated as application code to prune.

## Changes

- Removed unused UI components and helpers, obsolete test-auth helpers, redundant
  exports, and 13 unused translation keys in each locale. Application, Storybook,
  test, and maintenance-script references were checked before removal.
- Removed unused frontend dependencies and duplicate root dependencies. Kept the
  existing `fast-uri` and `qs` security pins as overrides. Declared the browser
  benchmark and documentation dependencies in the workspaces that import them.
  Existing locked versions were preserved except for the OpenAI SDK change
  already required by #996.
- Made the structured answer the single source of citation metadata in RAG
  results. CSV export now parses each stored answer once.
- Fail a chat stream immediately on malformed JSON or invalid typed events,
  preventing a missing delta followed by `done` from looking like a complete
  answer. Four regression cases verify rejection and reader cleanup.
- Reduced stream-rendering allocations: copy only the part being extended and
  iterate only the Unicode characters needed for the next display tick.
- Removed the obsolete fallback for missing search IDs; producers and consumers
  now use the required shared contract.
- Release migration advisory locks even when temporary directory creation or
  removal fails. Both failure paths have regression tests. Browser benchmark
  startup and shutdown also close acquired resources on failure.
- Updated integration-test fixtures to the current authentication and course-info
  contracts and corrected an invalid type-import path.

## Validation

| Check | Result |
| --- | --- |
| API unit and PostgreSQL integration tests | 1,243 passed; 27 opt-in live-provider tests skipped |
| Cloudflare Workers runtime tests | 12 passed |
| Frontend unit tests | 1,012 passed |
| Storybook Chromium tests | 594 passed |
| Python worker, including persistence tests | 295 passed |
| CI/deployment policy tests | 69 passed |
| Web distribution worker tests | 7 passed |
| Terraform mocked tests | 4 passed |
| Additional answer browser smoke | Both course/no-course passed; literal `[1]` preserved and citations rendered as time links |
| Type checking, all four workspaces | Passed |
| Frontend ESLint | Passed |
| Frontend production build | Passed |
| English/Japanese documentation builds and public-content checks | Passed |
| Drizzle checks and migration provenance | Passed; 26 migration entries |
| Terraform validation | Passed |
| npm dependency audit | 0 reported vulnerabilities |
| Diff whitespace check | Passed |

Database tests used an isolated PostgreSQL 17.11 instance with pgvector 0.8.6.
The API run included Python-to-TypeScript embedding storage compatibility and
fresh/populated database migration tests. Docker-based runs affected by local VM
load and the exploratory PostgreSQL 15 run are excluded from the successful
results above. No production migration or deployment was performed.

The opt-in provider tests were not rerun during this cleanup. The earlier #996
comparison is recorded separately in `issue-996-comparison.json`. Python reports
four upstream RAGAS 0.4 deprecation warnings; the pinned adapter's scoring parity
and cancellation tests pass. Vite/SWC also reports an upstream deprecated option
in the browser test tooling.

## Final unused-code review

Repeated Knip analysis found no remaining actionable unused dependencies,
exports, types, or files in owned code. Its remaining diagnostics were checked:

- Legacy maintenance scripts are invoked through `maintain.sh`; the historical
  UUID migration generator is retained for reproducibility.
- The answer benchmark TSX entry is loaded through generated HTML, the test
  worker through Wrangler configuration, and contract tests through TypeScript
  configuration.
- `cloudflare:workers` is a runtime module. The Docusaurus theme diagnostic is a
  package-name normalization false positive.
- The two CommonJS token-expiry helpers are called by their Node tests.

Python unused-code candidates were pytest fixtures or callback parameters.
After resolving the findings and rerunning the relevant checks, no additional
actionable finding remained within this review's scope. Static analysis and tests
do not establish that all possible defects or unreachable runtime paths are absent.

## Follow-up review

A second pass focused on redundant data transformations, forwarding functions,
stream ordering, immutable UI state, and worker endpoint selection.

- Replaced 25 API functions that only forwarded unchanged arguments and results
  with direct re-exports. Feature entry points remain available, while their
  function signatures no longer duplicate repository definitions. Functions
  that validate, transform, authorize, or supply defaults remain explicit.
- Render answer segments directly. Removed the answer-to-stream-parts-to-render
  round trip; changing only source metadata no longer reparses the answer text.
  TeX/code syntax split across adjacent segments still renders correctly.
- Copy only segments changed by the current rendering tick. A regression test
  freezes an earlier answer snapshot and verifies that subsequent text and
  citations preserve it, including references to completed segments.
- Validate segment order and citation targets before dispatching stream events
  to the rendering timer. Gaps, backward indices, citations before their segment,
  and unknown sources now terminate with `STREAM_INVALID` instead of producing
  an asynchronous rendering exception or silently losing a citation. Six failing
  cases were reproduced before the fix; consecutive and empty segments are also
  covered.
- Classify inferred SQS endpoints by hostname rather than a substring anywhere
  in the queue URL. Local queue names containing `amazonaws.com`, similarly named
  local hosts, and uppercase AWS hostnames previously behaved incorrectly.
  Three failing cases were reproduced; the China AWS domain is also covered.
- Preserve segment indices in the Storybook stream fixtures. The stricter
  stream validation exposed an existing fixture error that assigned every text
  segment index zero. The corrected fixtures exercise the real stream contract.

This follow-up reran all API/PostgreSQL tests (1,243 passed, 27 skipped), frontend
unit tests (994 passed), and Python tests (298 passed), along with all workspace
type checks, frontend lint, and the production frontend build. The full
Storybook run passed all 548 tests outside ChatPanel and exposed the fixture
error above. After fixing it, all 46 ChatPanel tests passed on a targeted rerun,
covering all 594 Storybook tests. The remaining validation table entries retain
the successful initial-review results; those areas were unchanged by this pass.

Repeated unused-code analysis has the same documented false positives as the
initial pass and no new actionable diagnostic. Provider-free browser checks
passed for both no-course and course answers, including multiple segments,
literal `[1]` text, and a citation rendered as a video time link.

## Third review

The next pass examined upload validation, media and playback paths, background
jobs, stream framing and cancellation, resource lifetimes, and remaining unused
code. Three additional problems were reproduced and fixed:

- Full reindexing deleted the entire search index before generating replacements.
  It now uses the existing atomic replacement for each video, preserving failed
  and unvisited videos' scenes. PostgreSQL regression tests reproduce provider,
  invalid-transcript, and database-write failures, then verify preservation and
  a successful retry without duplicate scenes. Removed the full-table deletion
  helper, the `replace_existing` switch, and the redundant provider preflight.
  Removed test variants for those retired paths while retaining transaction,
  reader visibility, cursor cleanup, and locking coverage.
- Upload format lists and filename handling now have one shared definition.
  The picker, frontend validation, and API agree on supported formats. Unknown
  browser MIME types use the supported filename extension for both presigned
  requests/PUT headers and multipart bodies, instead of treating every file as
  MP4 or sending `application/octet-stream`. Explicit unsupported types and
  extensions fail before upload. Removed the duplicate frontend allow-list and
  an unused upload-form prop. Six previously failing cases were reproduced.
- SSE data is decoded as complete events rather than independent lines. The old
  decoder rejected valid multiline/CR streams and could accept a `done` event
  before its terminating blank line. It now uses `eventsource-parser` 3.1.0,
  already present in the API dependency tree, as a direct frontend dependency.
  Existing package versions were preserved. Tests cover all three line endings,
  optional spaces after `data:`, comments, UTF-8 bytes split individually, BOM,
  truncated terminal events, schema/reference validation, and cancellation.
  The parser's buffered final CR is completed at EOF without adding a new blank
  line. Four framing failures were reproduced before the change; all 31 stream
  tests pass afterward. SSE remains the transport, and `[N]` parsing is still
  absent from the current answer path.

The framing behavior follows the [HTML SSE specification](https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation);
the parser API was checked against its installed types and
[upstream documentation](https://github.com/rexxars/eventsource-parser).

Validation after these changes:

| Check | Result |
| --- | --- |
| API unit and PostgreSQL integration | 1,243 passed; 27 live-provider tests skipped |
| Cloudflare Workers runtime | 12 passed |
| Frontend unit | 1,012 passed |
| Storybook Chromium | 594 passed across all 45 files in one run |
| Python worker and PostgreSQL persistence | 295 passed |
| All workspace type checks, frontend lint and production build | Passed |
| Documentation public-content source check and diff whitespace | Passed |
| npm dependency audit | 0 reported vulnerabilities |
| Repeated Knip analysis | No new diagnostics; the previously documented false positives remain |

The five test suites above passed 3,156 tests. The lower Python count reflects
removing six obsolete full-purge/preflight/append-only variants and adding three
database failure-and-retry regressions. Relevant regressions were run before the
fixes to establish failure, then the complete affected suites were rerun. No
additional actionable finding remained in this pass. The isolated test database
was stopped afterward. No production migration, deployment, or paid model call
was performed. The unchanged CI, Terraform, web distribution worker, and full
documentation-build results in the main table are from the initial review.

## Fourth review

This pass rechecked route state, authentication/cache boundaries, course and video
mutations, invitations, billing reconciliation, deletion, and background jobs.
The route boundary already remounts content by pathname, and confirmations are
cancelled on navigation; no additional page-reset mechanism was needed.

- Fixed indexing races with API edits and deletion. Worker advisory locks did not
  coordinate with API video-row locks, so a slow embedding request could recreate
  scenes for a deleted video, restore an older title, or publish an older
  transcript. After generation, the writer now locks the owned video row in the
  same transaction as scene replacement. It skips deleted videos, reads the
  latest title, and rejects a changed transcript for retry before deleting any
  previous scenes. Provider calls still run outside this transaction.
- Added PostgreSQL regressions for deletion, title changes, transcript replacement
  and clearing during embedding generation, and row-lock exclusion during writes.
  All five cases failed before the fix. Existing rollback, reader visibility,
  multi-batch generation, full-reindex retry, and unrelated-video preservation
  tests continue to pass.
- Removed the unused indexing `job_id` parameter and its special dispatch path.
  Job-level idempotency remains in the dispatcher; transcription still receives
  its job ID because it uses it. Removed the upload hook's unused public `file`
  field while retaining its private selected-file state and submission tests;
  updated the Storybook mock to match.
- Corrected the opt-in embedding test's old `content`/`citations` assertions to
  use the structured answer. Its Python fixture now reads the stored video
  instead of constructing a duplicate row with the removed `error_message`
  argument. The provider-free cross-language fixture also creates actual owners
  and videos before indexing, then reads them through the production SQL helper.

Validation for this pass:

| Check | Result |
| --- | --- |
| Complete Python suite, including PostgreSQL persistence | 300 passed; 4 existing RAGAS deprecation warnings |
| API embedding storage, video deletion, and service atomicity | 26 passed; 2 live-provider tests skipped |
| Frontend upload hook, workflow, and modal | 42 passed |
| Upload Storybook tests in Chromium | 43 passed |
| All workspace type checks | Passed |
| ESLint for changed frontend files | Passed |
| Documentation source check and diff whitespace | Passed |
| Repeated Knip analysis | Same 11 owned-file diagnostics documented above; no new actionable diagnostic |

The affected suites passed 411 tests. The unchanged suites retain their successful
third-review results; the paid embedding tests were not executed. Final review of
these changes found no further actionable issue in the paths examined. The
isolated PostgreSQL instance was stopped. No production migration, deployment,
commit, or push was performed.

## Fifth review

This pass traced alternate worker execution paths, transcript editing and playback,
signup quota defaults, authentication helpers, and their tests and browser fixtures.

- Corrected an incomplete fourth-pass cleanup: transcription's inline indexing
  fallback still supplied the removed `job_id` argument. A new regression invokes
  the real indexing task when queue delivery returns no message ID, rather than
  replacing that task with a permissive mock. It reproduced the `TypeError` before
  the fix and now verifies scene writing and completion of the status transition.
- Completed videos can be edited again after their transcript is cleared. The
  previous button condition made this operation irreversible through the UI.
  The regression clears and restores the transcript through the page; the browser
  fixture also opens the editor for an empty completed transcript. Empty transcripts
  on videos still being processed retain their disabled editor.
- Preserve fractional seconds for native video playback through subtitle clicks,
  chat citations, deferred video switching, and `?t=` links. The shared converter
  now handles fractional seconds without accepting malformed numeric prefixes,
  negative values, or non-finite values. Only the YouTube iframe URL rounds down to
  whole seconds, as required by the [YouTube `start` parameter](https://developers.google.com/youtube/player_parameters#start).
- Removed the separate SRT-format detector and duplicate timestamp arithmetic.
  The UI derives transcript display mode from one parse. The parser requires a
  complete timing line with valid minutes/seconds and ordered start/end times,
  leaving unparseable transcript content readable as plain text.
- Removed the duplicate free-tier quota constants. Signup reads the plan catalog,
  and optional environment overrides retain their existing meaning. Invalid
  negative limits, non-finite upload limits, and fractional/out-of-range values
  for integer DB columns now fall back to the catalog defaults. Zero usage limits,
  unlimited tokens, and fractional storage quotas remain supported.

Before the fixes, regressions reproduced one inline-worker failure, eight transcript
and playback failures, and six quota-validation failures. Existing tests for the
removed detector were retired; submission, rendering, and playback behavior remain
covered through the actual parser and its consumers.

Validation after the fifth-pass changes:

| Check | Result |
| --- | --- |
| Complete API unit and PostgreSQL integration | 1,250 passed; 27 live-provider tests skipped |
| Complete Python suite, including PostgreSQL persistence | 301 passed; 4 existing RAGAS deprecation warnings |
| Frontend unit | 1,035 tests covered successfully across the full run and final targeted rerun |
| TranscriptPanel and ChatPanel in Chromium | 62 passed |
| All workspace type checks, frontend lint, production frontend build | Passed |
| Diff whitespace | Passed |
| Repeated Knip analysis | Same owned-file diagnostics as the fourth review; no new actionable finding |

The frontend full run passed 1,031 tests and reported four newly added timing
assertions while the final parser change was being made. The finalized parser and
all directly affected consumers were then rerun: all 70 tests across those four
files passed, including the four timing cases. These runs cover 2,648 distinct
tests across the four suites above. The unchanged runtime, documentation, CI, and
infrastructure checks retain their previously recorded results.

Final inspection found no additional actionable issue in the reviewed paths.
The isolated test database was stopped. No paid provider call, production change,
commit, or push was performed.

## Sixth review

This pass traced API input contracts, ownership checks, subtitle parsing across
runtimes, job redelivery, and the remaining update endpoints.

- Removed the unused `videos.replace`, `courses.replace`, and `tags.replace`
  procedures, including their input/output schemas, handlers, the separate
  `putUserVideo` service, and obsolete duplicate assertions. Application callers
  already use `update`; its ownership, atomicity, and response tests remain.
  Single-use handler aliases were inlined after removing the duplicate routes.
- Replaced independent API/frontend SRT parsing with a shared lazy parser in
  `@videoq/trpc/transcript`. Saving and playback now agree on cue numbering,
  complete timing lines, millisecond precision, minute/second bounds, and ordered
  intervals. Dot milliseconds, compact arrows, and hours beyond two digits work
  consistently. Invalid timestamps cannot become a zero-second seek target.
  Empty transcripts still clear subtitles; invalid stored cues are skipped by readers.
- Aligned Python parsing with that contract, including UTF-8 BOM handling and
  rejecting malformed or reversed intervals before indexing. Twenty-one shared
  fixtures run against the API, frontend, and Python. CI also selects the worker
  suite when those fixtures change. The English/Japanese architecture documents
  describe the accepted format and handling of invalid cues.
- Completed videos now short-circuit duplicate indexing before requiring a
  transcript. Clearing a completed video's subtitles no longer turns a delayed
  indexing delivery into a failing retry.
- Duplicate tag creation and renaming now return HTTP 409 with a usable message,
  rather than HTTP 500. Both writes use the database's existing unique constraint;
  no preflight query or race-prone duplicate check was added. Only the specific
  tag-name constraint is translated. PostgreSQL tests verify concurrent creation,
  unchanged rows after a rejected rename, ownership precedence, independent owner
  namespaces, and preservation of unrelated database errors. HTTP tests verify
  the response and absence of internal-error logging.

Before correction, shared fixtures reproduced six API, three frontend, and ten
Python parsing mismatches (including the BOM case). Two empty-transcript retry
cases and two duplicate-tag scenarios also failed before their fixes.

Validation after the sixth-pass changes:

| Check | Result |
| --- | --- |
| API unit and PostgreSQL integration | 1,265 passed in the full run; all five additional tag regressions passed in the final affected-suite runs; 27 live-provider tests skipped |
| Python, including PostgreSQL persistence | 323 passed in the full run; final parsing/indexing/persistence rerun passed all 54 tests, including the additional BOM case |
| Frontend unit | Final full rerun: all 1,056 tests passed across 93 files |
| TranscriptPanel in Chromium | 16 passed |
| CI/deployment policy | 69 passed |
| All workspace type checks, with an additional final API type check | Passed |
| Frontend ESLint and production build | Passed |
| Documentation source check and diff whitespace | Passed |
| Repeated Knip analysis | Identical 11 owned-file diagnostics previously verified as entry points, runtime modules, or tooling false positives |

The initial frontend run passed 1,030 tests but its navigation suite hit the
10-second module-preparation timeout under concurrent test/typecheck load. The
navigation and subtitle suites passed all 58 tests with one test worker; the
full frontend suite was then rerun with that same concurrency setting. No test
assertion or timeout was relaxed.

Across the full runs and final affected-suite reruns, 2,735 distinct tests passed:
1,270 API, 324 Python, 1,056 frontend, 16 browser, and 69 CI policy tests. Paid
provider tests remain skipped. Final inspection of the changed contracts and
their consumers found no additional actionable issue in the reviewed scope.
The isolated PostgreSQL instance was stopped. No production migration, deployment,
commit, or push was performed.

## Seventh review

This pass followed deletion and delayed-completion paths through the API outbox,
Python task dispatcher, media cleanup, React mutations, route boundaries, and
query caches. Existing account-deletion transactions and ownership checks were
retained. The route boundary already resets page state by pathname; no duplicate
state-reset effects or page wrappers were introduced.

- Fixed delayed video deletion, course deletion, and course leaving redirecting
  users after they had already left the initiating page. Navigation now uses the
  mutation observer's per-call success callback, which stops running after
  unmount. Cache cleanup remains in the mutation's shared success handler so it
  still runs after navigation. All three regressions failed before correction.
- Centralized course-removal cache cleanup for deletion and leaving. The removed
  course's detail is evicted and course lists are invalidated. Deletion carries
  its original course ID through completion, so changing the hook's current
  course does not remove or invalidate the new course's cache.
- Removed the redundant local `isLeaving` state and its manual success/error
  cleanup; the mutation's pending state covers both the request and cache work.
  Removed the separate `onDeleteSuccess` hook argument and its dummy test callbacks.
- Transcription and indexing deliveries for deleted videos now complete without
  provider work, another queued job, or repeated SQS failures. Dispatcher tests
  execute the real tasks and check completion of the execution lease. Both cases
  failed before correction. Removed the two obsolete missing-target exception
  classes and the duplicate empty-transcript check; the indexer still validates
  transcripts before provider calls. Existing videos awaiting indexing with
  missing or malformed subtitles continue to fail without being marked completed.
- Updated the English/Japanese processing documentation and corrected the manual
  reindex task's stale delete-before-index docstring.

Validation for this pass:

| Check | Result |
| --- | --- |
| Complete Python suite, including PostgreSQL persistence | 329 passed; 4 existing upstream RAGAS warnings |
| Complete frontend unit suite | 1,061 passed across 93 files |
| Application routes and interactions in Chromium | 51 passed |
| All four workspace type checks | Passed |
| Frontend ESLint | Passed |
| Production frontend build | Passed |
| Documentation source check and diff whitespace | Passed |
| Repeated Knip analysis | Same 11 previously reviewed owned-file tooling diagnostics; no new actionable finding |

All 1,441 tests in this pass's full Python/frontend and browser runs passed.
The affected page/hook tests also passed independently before the full run.
The API, infrastructure, and CI sources were unchanged in this pass and retain
their previously recorded validation results. No paid provider tests were run.
Final inspection found no additional actionable issue in the reviewed paths.
The isolated PostgreSQL instance was stopped. No production migration, deployment,
commit, or push was performed.

## Eighth review

This pass traced chat authorization, source selection, stream cancellation,
history and analytics queries, shared playback, and asynchronous evaluation
persistence. The existing structured answer contract and SSE transport were
retained. Local multipart uploads remain an active development storage mode;
their production restriction does not make that implementation dead code.

- Saved chat answers now invalidate the current course's history, analytics,
  evaluation pages, and evaluation summary immediately when the server confirms
  persistence. This happens before the display animation finishes, so leaving
  the page during animation cannot retain stale caches. An in-flight first
  history read is cancelled and restarted: invalidation alone would reuse its
  pre-save snapshot. Other courses and shared visitors' private caches are left
  alone. Usage is marked stale for the next visit without an immediate account
  request.
- Feedback saves retain the existing direct history-page updates and refresh
  the affected analytics. Cached history pages do not need another read, and
  delayed saves after unmount still update only their original course. Moved
  the cache work into the existing cache-invalidation module.
- Shared video selection now uses native buttons with a visible focus outline
  and selected-state semantics. Chromium verifies Enter and Space selection
  on desktop and mobile. Corrected the player heading level and removed the
  unnecessary `VideoStatusBadge` forwarding component from sortable course
  videos.
- Evaluation persistence now selects and locks the surviving chat row in its
  single upsert statement. If history is deleted during provider work or a
  concurrent deletion wins the row lock, the save completes without an orphaned
  evaluation, foreign-key failure, or another delivery. The PostgreSQL test
  fixture now includes the real parent/foreign-key relationship; both deletion
  regressions failed before the fix. Existing repeated and concurrent saves
  still preserve one evaluation row. Provider work remains outside the database
  transaction.

The first regression run reproduced seven frontend failures. The affected
frontend tests then passed (66 tests before the final usage regression), as did
23 evaluation tests. The first browser run exposed an incomplete test fixture
(one video for a two-video keyboard interaction); the fixture was corrected and
all 51 browser tests passed. No assertions or timeouts were relaxed.

Validation for this pass:

| Check | Result |
| --- | --- |
| Complete frontend unit suite | 1,070 passed across 94 files |
| Complete Python suite, including PostgreSQL persistence | 331 passed; 4 existing upstream RAGAS warnings |
| Application routes and keyboard interactions in Chromium | 51 passed |
| All four workspace type checks | Passed |
| Frontend ESLint | Passed |
| Production frontend build | Passed |
| Documentation source check and diff whitespace | Passed |
| Repeated Knip analysis | Exactly the same 11 previously reviewed owned-file tooling diagnostics; no new actionable finding |

All 1,452 tests in the final full frontend/Python and browser runs passed.
API, infrastructure, and CI behavior was unchanged and retains the previously
recorded validation. Final inspection found no additional actionable issue in
the reviewed paths. The isolated PostgreSQL instance was stopped. No paid
provider tests, production migration, deployment, commit, or push were performed.

## Ninth review

This pass followed shared media authorization, object-storage responses, upload
calls, transcription completion, and existing static-analysis findings. It
preserved the structured answer contract and SSE transport.

- Signed-in visitors can now play videos through a valid public course link,
  matching the documented optional-login behavior. An explicit share link
  selects that course's scope: invalid links and videos outside the shared course
  cannot fall back to the visitor's private library. Rejected credentials still
  fail before share authorization. Replaced an earlier test that incorrectly
  required login to remove public sharing access, and added positive and negative
  coverage for both share query aliases and account access.
- R2 responses now use Cloudflare's actual range type. A length-only range
  starts at zero instead of producing an invalid `Content-Range`. Removed the
  duplicate local range union, unsafe cast, unnecessary numeric conversion and
  nullable-size checks, and redundant exception handling around URL resolution.
  Checked the current official Workers types (`5.20260928.1`).
- Removed eleven ineffective `use client` directives from Vite components,
  two private upload forwarding functions, their orphaned response alias, and
  the one-line JSON-header helper. Uploads call the inferred tRPC methods
  directly. CSV GET requests no longer send a JSON content-type header.
- Transcription previously overwrote subtitle edits made during provider work
  and could enqueue indexing after deletion. Completion now locks the current
  row and compares the original subtitle fingerprint before saving the provider
  result and changing status in one statement. Manual edits and clears survive
  both provider success and failure; their existing transactional reindex job
  remains responsible for search updates. Deleted or completed work stays
  untouched, while an existing indexing handoff can resume. Title-only edits do
  not prevent a valid transcription from being saved.
- Unified successful and failed transcription persistence and removed the old
  unconditional transcript writer and two unused transition helpers. Only a
  fingerprint crosses the metadata-only task boundary, preserving the earlier
  large-transcript transfer reduction. Ordinary provider failures remain
  retryable, and quota failures retain their terminal behavior.

The first media regression run reproduced six failures. The initial PostgreSQL
transcription regression run reproduced four failures. The final transcription
persistence matrix covers seven intervening changes with success, provider
failure, and quota failure, plus first transcripts starting from null or empty
text (23 cases). Together with delivery-resume and metadata tests, all 38 related
worker tests passed. The targeted API/frontend checks also passed (117 tests).
English and Japanese sharing and transcription documentation were updated.

Validation for this pass:

| Check | Result |
| --- | --- |
| Complete API unit/integration suite | 1,277 passed; 27 live-provider tests skipped |
| Complete frontend unit suite | 1,070 passed across 94 files |
| Complete Python suite, including PostgreSQL persistence | 354 passed; 4 existing upstream RAGAS warnings |
| Application routes and keyboard interactions in Chromium | 51 passed |
| API workerd suite | 12 passed |
| All four workspace type checks | Passed |
| Frontend ESLint | Passed |
| Production frontend build | Passed |
| Documentation source check and diff whitespace | Passed |
| Repeated Knip analysis | Exactly the same 11 previously reviewed owned-file tooling diagnostics; no new actionable finding |

All 2,764 tests in the final full suites and browser/workerd runs passed.
Final inspection found no additional actionable issue in the reviewed paths;
this is not a claim that every possible repository defect has been excluded.
The isolated PostgreSQL instance was stopped after validation. No paid provider
tests, production migration, deployment, commit, or push were performed.

## Tenth review

This pass inspected account deletion and billing reconciliation, invitation and
course mutations, media/transcription and indexing helpers, deferred usage
refreshes, and CI/worker queue configuration. The actionable findings were in
frontend cache updates. API and Python behavior was left unchanged.

- A first list/detail read could finish after a successful mutation and retain
  its pre-save snapshot. Reused the existing cancellation-and-refresh helper
  across video, course, tag, participant, username, and administrative updates.
  The normal invalidation path in the installed Query implementation only
  cancels an ongoing fetch when it already has data; first loads need explicit
  cancellation. Regression tests also cover transports that still resolve after
  cancellation. See the upstream [query cancellation documentation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation).
- Accepting a course invitation now refreshes the affected course and both
  regular and infinite course lists, including when the recipient leaves the
  invitation page before the response arrives. Declining does not refresh those
  lists, and delayed acceptance does not redirect away from a different page.
- Upload and deletion now refresh video lists and status counts without
  invalidating unrelated video detail caches. Removed two redundant query-key
  constants and the unnecessary async wrappers around course-list refreshes.
- Consolidated the three deferred usage invalidations. An old account response
  can no longer erase the stale flag after upload, deletion, or a saved answer.
  Cached usage still waits until the next visit to refresh; an interrupted first
  account load resumes immediately so authentication does not stay pending.
- Reviewed the remaining direct invalidations: cache-patching paths already
  cancel older reads before applying their response and selectively restart
  missing first loads. They do not need an additional refresh.

The initial targeted run reproduced 13 failures: stale first loads, unnecessary
detail invalidation, and missing invitation-acceptance invalidation. After the
first fix, 100 related tests passed. The full run caught a status-count refresh
omitted while narrowing the upload/deletion scope; that regression was corrected
without relaxing its existing assertions. Four further usage-race tests failed
before the final usage fix. The final targeted run passed 71 tests, including
authentication and upload navigation. No timeouts or error assertions were
weakened.

Validation for this pass:

| Check | Result |
| --- | --- |
| Complete frontend suite with V8 coverage | 1,085 passed across 94 files; all coverage thresholds passed |
| Coverage | Statements 90.75%; branches 81.42%; functions 88.55%; lines 92.59% |
| Chromium application routes, participants, administration, and settings | 106 passed across 4 story files |
| All four workspace type checks | Passed |
| Frontend ESLint | Passed |
| Production frontend build | Passed |
| Documentation source check and diff whitespace | Passed |
| Final Knip analysis | Exactly the same 11 previously reviewed owned-file tooling diagnostics; no new actionable finding |

All 1,191 tests in the final complete frontend and selected browser runs passed.
The Python declaration-reference scan found only the externally invoked Lambda
entry point without an internal reference. No further removal was justified.
API/Python, infrastructure, and CI sources were unchanged in this pass and retain
the previously recorded validation. Final inspection found no additional
actionable issue in the reviewed paths. No paid provider calls, production
migration, deployment, commit, or push were performed.

## Eleventh review

This pass reviewed URL and numeric-input boundaries, chat request language,
SQL-array callers, CSV/history streaming, vector-store adaptation, and worker
evaluation helpers. The actionable findings were at the URL/SQL and browser/API
boundaries.

- Video and course detail pages used `parseInt`, allowing a URL such as
  `/videos/1suffix` to query video 1. CSV exports accepted unsafe integers,
  exponent notation, and hexadecimal IDs. One shared decimal-ID parser now
  rejects these inputs before resource reads, while preserving leading-zero
  decimal IDs and the maximum safe integer. Tag URL filters reuse it and drop
  invalid entries without losing valid filters.
- SQL numeric arrays accepted integers beyond JavaScript's safe range and
  values outside PostgreSQL `int4` when that cast was requested. They now reject
  those values before SQL construction. Removed the unnecessary numeric
  coercion, intermediate mapped array, and separate empty-array branch. Valid
  negative order slots and safe `bigint` values remain supported.
- SSE and tRPC requests did not send the selected UI language, so answer
  instructions could follow browser preferences instead. Both transports now
  read the configured i18n language at request time. Switching languages works
  with an existing client. English and Japanese documentation describe this
  contract.
- Removed a redundant tag-palette import alias and constant. The vector-store
  metadata adapter remains necessary for the installed dependency's handling
  of string-valued JSON metadata; its removal was not justified.

Added 44 regressions: 20 detail-route cases, 10 CSV ID cases, 11 SQL-array cases,
one tag-filter case, and two language-switching cases. Before the corresponding
fixes, 10 frontend route cases, eight API/SQL cases, and all three language/tag
cases failed. The final focused runs passed 223 tests.

Validation for this pass:

| Check | Result |
| --- | --- |
| Complete API unit/integration suite | 1,298 passed; 27 live-provider tests skipped |
| Complete frontend suite with V8 coverage | 1,108 passed across 95 files; all coverage thresholds passed |
| Coverage | Statements 90.75%; branches 81.42%; functions 88.56%; lines 92.60% |
| Chromium application routes and keyboard interactions | 51 passed |
| API workerd suite | 12 passed |
| All four workspace type checks | Passed |
| Frontend ESLint | Passed |
| Production frontend build | Passed |
| Documentation source check and diff whitespace | Passed |
| Final Knip analysis | Exactly the same 11 previously reviewed owned-file tooling diagnostics; no new actionable finding |

The first full API attempt failed because the isolated database had started on
the default port rather than the test port. The owned instance was restarted on
loopback port 55796 and its database/user/port were verified before rerunning the
complete suite. No test assertions or timeouts were relaxed.

All 2,469 tests in the final complete API/frontend suites and selected
browser/workerd runs passed. Python sources, infrastructure, and CI were
unchanged in this pass and retain their previously recorded validation. Final
inspection found no additional actionable issue in the reviewed paths. The
isolated PostgreSQL instance was stopped after validation. No paid provider
tests, production migration, deployment, commit, or push were performed.

## Twelfth review

This pass revisited worker storage and account deletion, AWS client lifecycle,
scene splitting, API response cleanup, chat body-size boundaries, authentication
forms, route identity, and history/evaluation reads. The confirmed behavioral
defects were in the S3 client's configuration.

- The worker copied standard AWS access/secret keys into explicit client
  arguments but dropped `AWS_SESSION_TOKEN`. It also forced the region to
  `auto` for ordinary S3 when `AWS_REGION` was absent, overriding the SDK's
  standard environment/config-file region. Standard AWS credentials and region
  configuration now use the [Boto3 provider chain](https://docs.aws.amazon.com/boto3/latest/guide/credentials.html).
- R2 and `AWS_S3_*` storage credentials previously selected access and secret
  keys independently, allowing a partial pair to borrow a value from another
  source. Pairs are now selected together, in the existing priority order. An
  incomplete selected pair raises a configuration error before creating the
  client. Static storage credentials do not inherit the Lambda session token.
  Custom endpoint region defaults remain `auto`.
- Consolidated Mailgun delivery into the public `sendMail` function, removing
  an internal boolean-return protocol and duplicate response-body cancellation.
  Missing-key errors, timeout, request contents, and status-only provider errors
  retain their behavior.
- Removed the forwarding middleware around Hono's chat body limiter. SSE and
  tRPC continue to use the same limiter, including encoded batch-path handling.
- Removed the constructor-only `create_embedder` factory and its re-export.
  The splitter directly constructs `SceneEmbedder`; explicit embedder injection
  remains available. Existing pipeline tests now replace that constructor
  without weakening their assertions.

Eleven storage regressions exercise real boto3 signing with isolated dummy
credentials and temporary AWS configuration files. Seven failed before the fix:
missing session token, two ignored region sources, and four mixed-credential
cases. These tests make no AWS request. The final targeted API/worker runs passed
144 tests.

Validation for this pass:

| Check | Result |
| --- | --- |
| Complete API unit/integration suite | 1,298 passed; 27 live-provider tests skipped |
| Complete Python suite, including PostgreSQL persistence | 365 passed; 4 existing upstream RAGAS deprecation warnings |
| API workerd suite | 12 passed |
| All four workspace type checks | Passed |
| Documentation source check and diff whitespace | Passed |
| Final Knip analysis | Exactly the same 11 previously reviewed owned-file tooling diagnostics; no new actionable finding |
| Python declaration/reference scan | The remaining unreferenced public method implements LangChain's required abstract `embed_documents` interface; retained |

All 1,675 tests in the final complete API/Python suites and workerd run passed.
Frontend sources, infrastructure, and CI were unchanged and retain the preceding
pass's validation. Route content already remounts by pathname, so resource drafts
do not require a second reset mechanism. Final inspection found no additional
actionable issue in the reviewed paths. The isolated PostgreSQL instance was
stopped after validation. No paid provider calls, actual emails, production
migration, deployment, commit, or push were performed.

## Thirteenth review

This pass revisited queue producers and consumers, task dispatch, execution
leases, batch failures, API outbox delivery, and declarations without local
references. It also checked authentication form lifetimes, route remounting,
and chat-history/evaluation pagination; these paths did not yield an additional
confirmed defect.

- The Python consumer converted resource IDs with `int()`, allowing `1.9` or
  `true` to execute work for resource `1`. Account deletion converted arbitrary
  values with `str()`. Shared job-payload validation now rejects those inputs
  before claiming an execution lease or calling a task. Numeric IDs must be
  positive safe integers; user IDs must be nonblank strings.
- Each active job accepts exactly its documented arguments. Unknown job types,
  missing or extra arguments, and nonobject envelopes fail before database
  access. A malformed batch item is reported independently so valid items still
  run. The Python producer uses the same validation before creating an SQS
  client, including rejecting falsey nonobject payloads instead of replacing
  them with an empty object.
- Removed the per-job `_dispatch` conversion branches. Validated arguments now
  bind directly to task keyword parameters, with the execution ID supplied only
  to transcription. Tests check the real signatures of all six registered
  callables without invoking providers or destructive tasks.
- Kept the base64 envelope reader and acknowledgement of retired `build_plog`
  messages: the staged queue migration explicitly requires these paths. They
  are exercised by existing tests and are separate from the removed plain-text
  chat/citation compatibility paths.

Added 61 regression/boundary cases. The initial 49 malformed-input cases failed
before the fix; the final suite also covers valid producer-to-consumer dispatch
for all six jobs and additional invalid producer payloads. Worker documentation
now records the accepted payload shapes and batch-failure behavior.

Validation for this pass:

| Check | Result |
| --- | --- |
| Complete Python suite, including isolated PostgreSQL persistence | 426 passed; 4 existing upstream RAGAS deprecation warnings |
| API job construction, durable outbox, and delivery tests | 19 passed across 3 files |
| Documentation source check and diff whitespace | Passed |
| Final Knip analysis | Exactly the same 11 previously reviewed owned-file tooling diagnostics; no new actionable finding |
| Python declaration/reference scan | Only LangChain's required abstract `embed_documents` implementation lacks a local caller; retained |

All 445 tests in the final Python and targeted API runs passed. TypeScript,
frontend, infrastructure, and CI sources were unchanged in this pass and retain
their preceding validation. Final inspection found no additional actionable
issue in the reviewed paths. The isolated PostgreSQL instance was stopped after
validation. No paid provider calls, actual emails, production migration,
deployment, commit, or push were performed.

## Fourteenth review

This pass revisited MCP inputs and SDK registration, JSON/SSE chat contracts,
frontend playback and sharing hooks, billing reconciliation and deletion,
user-secret envelopes, membership writes, and evaluation reads. The confirmed
behavioral defects were in input validation at the MCP and SSE boundaries.

- MCP used unrestricted numeric coercion: booleans and arrays could become
  resource IDs, byte sizes, or pagination values. Numeric inputs now accept
  constrained integers or decimal digit strings only. Existing decimal-string
  IDs remain supported; hexadecimal/exponent strings, surrounding whitespace,
  booleans, and arrays are rejected before resource reads or writes.
- The SDK previously removed unknown arguments before the tool's strict
  validation could inspect them. Registration and direct execution now share
  the same strict schema objects. HTTP regressions verify rejection before
  resource access, and discovery tests verify both `additionalProperties: false`
  and the published numeric constraints.
- Preserve the relationship between tool name and validated argument types.
  Removed repeated `Number`/`String` conversions, the pagination normalization
  function and its unreachable clamping/fallback branches, the duplicate video
  status enumeration, and the second unknown-tool dispatch branch. Pagination
  and description defaults now belong to the schemas. Idempotency inputs and
  normal requests retain their previous values.
- SSE chat accepted course IDs that the JSON/tRPC path rejected, including
  booleans, arrays, numeric strings, zero, and negative numbers. Both transports
  now use `chatCourseIdSchema`, removing the separate coercing SSE definition.
  Optional/null selection and valid safe integers retain their behavior. Invalid
  input fails before answer generation or quota reservation. SSE remains the
  streaming transport.
- English/Japanese API guides now describe these input contracts and where to
  maintain them. The other inspected paths yielded no additional confirmed
  defect; no speculative rewrites were made there.

Added 48 regression/boundary cases: 34 MCP cases and 14 chat cases. Before the
fixes, 14 MCP cases and nine chat cases failed. The final focused run passed all
140 tests without weakening existing assertions.

Validation for this pass:

| Check | Result |
| --- | --- |
| Complete API unit/integration suite, including isolated PostgreSQL | 1,346 passed; 27 live-provider tests skipped |
| API workerd suite | 12 passed |
| All four workspace type checks | Passed |
| Documentation source check and diff whitespace | Passed |
| Final Knip analysis | Exactly the same 11 previously reviewed owned-file tooling diagnostics; no new actionable finding |

All 1,358 tests in the final complete API and workerd runs passed. The complete
API suite was rerun after discovering and fixing the additional SSE input issue.
Frontend application code, Python, infrastructure, and CI were unchanged in this
pass and retain their preceding validation. Final inspection found no further
actionable issue in the reviewed paths. The isolated PostgreSQL instance was
stopped after validation. No paid provider calls, actual emails, production
migration, deployment, commit, or push were performed.

## Fifteenth review

This pass revisited worker secret loading and storage credentials, deletion and
transcription tasks, frontend upload/course mutations, API cleanup and retention,
and declaration references. The confirmed defects were in SSM bootstrap.

- Bootstrap selected R2 access and secret keys independently. A partial
  environment override could borrow the other key from SSM, and partial
  canonical SSM credentials could borrow a legacy value. Credentials are now
  selected as a complete pair: environment R2, canonical SSM R2, then legacy
  SSM AWS names. An incomplete selected pair fails before changing the
  environment. Lambda execution-role credentials and session tokens are
  preserved.
- Extracted the credential-pair validation shared by bootstrap and the S3
  client, removing the duplicate storage checks. Existing AWS provider-chain
  behavior and source precedence remain covered by real local boto3 signing
  tests using dummy credentials.
- Empty/nonobject SSM payloads, missing or blank database URLs, and non-string
  selected app settings no longer silently mark the container loaded. Blank
  environment values no longer hide valid SSM configuration. Failed loads are
  retried on the next invocation, including after correcting the SSM value.
- Database and app settings are staged until both loads and validation finish.
  An app failure no longer leaves an earlier DATABASE_URL committed to the
  process, so retries read the complete configuration again. Missing boto3 now
  raises when SSM is configured instead of reporting successful bootstrap.
- Removed `_mirror_if_missing` and three redundant legacy environment writes.
  All storage consumers already read canonical R2 values first. Existing legacy
  parameter/key inputs remain supported; writing aliases back into the process
  is unnecessary. The worker README records the pair precedence and retry
  behavior.

Added 31 regression/boundary cases; 27 failed before their corresponding fixes.
The initial targeted bootstrap/storage/client-lifecycle run passed 55 tests,
followed by the complete suite including the two final blank-environment cases.
No actual credentials, SSM requests, or provider calls were used for these tests.

Validation for this pass:

| Check | Result |
| --- | --- |
| Complete Python suite, including isolated PostgreSQL persistence | 457 passed; 4 existing upstream RAGAS deprecation warnings |
| Documentation source check and diff whitespace | Passed |
| Final Knip analysis | Exactly the same 11 previously reviewed owned-file tooling diagnostics; no new actionable finding |
| Python declaration/reference scan | Only LangChain's required abstract `embed_documents` implementation lacks a local caller; retained |

The upload form already catches the hook's rejected promise, so no redundant
error-handling change was needed there. Final inspection found no additional
actionable issue in the reviewed paths. API/frontend TypeScript, infrastructure,
and CI were unchanged and retain their preceding validation. The isolated
PostgreSQL instance was stopped after validation. No real SSM access, paid
provider calls, actual emails, production migration, deployment, commit, or push
were performed.

## Sixteenth review

This pass revisited frontend authentication and account settings, OAuth consent
and API-key adapters, invitation/membership repositories, idempotency and
maintenance queries, upload reconciliation, and worker transcription/scene
splitting. The confirmed defect was the client-side OAuth disconnect scope.

- The server deletes all of the current user's grants for the selected OAuth
  client. The connected-apps UI removed only the selected consent ID, leaving
  other grants for the same disconnected app visible until a reload. The
  mutation now captures the client ID and removes all matching rows after
  success. Its busy indicators use the same client identity.
- Display names are not used for identity: another app with the same name stays
  visible. Failed revocations preserve every grant. Cancelling an older list
  request still prevents its result from restoring revoked rows.
- The confirmation state now derives its fields from `AuthorizedOAuthToken`,
  replacing a separately declared shape and the redundant name-field mapping.
- Corrected the Storybook endpoint fixture to match the server's client-wide
  revocation behavior. Added a Chromium interaction covering multiple grants.
- Added an isolated PostgreSQL regression proving the server removes multiple
  grants for one client while retaining another client's grants and another
  user's credentials. No server behavior change was needed.

Added five cases: three UI unit cases, one PostgreSQL case, and one browser
interaction. Two UI cases failed before the fix. The focused UI/adapter run
passed 44 tests. The first type check identified an unsupported Storybook
assertion type; it was replaced with the existing supported call-count and
argument assertions, and the final type check passed.

Validation for this pass:

| Check | Result |
| --- | --- |
| Complete frontend unit suite | 1,111 passed across 95 files |
| OAuth security and isolated PostgreSQL persistence | 67 passed |
| Connected-apps Chromium interactions | 14 passed |
| Frontend application, Storybook and Worker type checks | Passed |
| Frontend lint | Passed |
| Documentation source check and diff whitespace | Passed |
| Final Knip analysis | Exactly the same 11 previously reviewed owned-file tooling diagnostics; no new actionable finding |

The 1,192 tests in these complete/targeted runs passed. Native OAuth query
injection already belongs to the installed client plugin; no duplicate frontend
implementation was added. Inspection of the remaining paths found no additional
confirmed defect or unused-code removal. The isolated PostgreSQL instance was
stopped after validation. Python and API production code, infrastructure, and CI
were unchanged in this pass and retain their preceding validation. No real
OAuth applications were disconnected, and no provider requests, production
migration, deployment, commit, or push were performed.


## Seventeenth review

Reviewed the account integration read path, authentication boundaries, shared
contracts, query-cache updates, and their browser fixtures. Repeated the
repository-wide unused-code scan and complete API/frontend validation.

- Reproduced two incomplete-list defects in the installed Better Auth adapter:
  105 stored API keys and 105 OAuth consents each produced only 100 results from
  the native list APIs. Client-side pagination cannot recover the missing rows
  from these plugin implementations.
- Added session-protected `account.integrationApiKeys` and
  `account.connectedApps` read procedures. Explicit Drizzle projections return
  the complete current user's display metadata with deterministic ordering.
  Key hashes, private metadata, and client secrets are not selected. Key reads
  include the two supported VideoQ configurations only.
- Resolve OAuth client names in the consent query. Removed the browser's
  per-client requests and its promise cache. Missing client names use client
  IDs; unknown consent dates remain null instead of becoming today's date.
- The shared output schemas now define both display types. Settings components
  use tRPC query options, keys, and filters directly. Removed the two API-client
  list wrappers, manual query-key module, unsafe list casts, and duplicate type
  declarations. Native Better Auth creation and revocation remain authoritative.
- Removed the always-null OAuth expiry property, its misleading display column,
  and its unused translations. Updated typed Storybook fixtures, removed the
  now-unused GET mock helper and stale mocks, and documented the read boundary
  in English and Japanese.
- Added PostgreSQL coverage for lists above 100 rows, stable ordering, ownership,
  explicit secret-free selections, single-query name lookup, malformed stored
  permissions, absent display fields, and empty accounts. Extended router and
  real API-key tests to ensure these reads require a browser session.

The new PostgreSQL regression group has 13 cases. Two additional router cases
verify that unauthenticated requests never call the handlers. The frontend
adapter tests now exercise typed list transport; database-level mapping cases
live with the repository tests. The existing loading-during-key-creation test
now waits until the initial batched query has actually started before creating
another key. It still verifies that the delayed older result cannot overwrite
the complete reloaded list.

Validation for this pass:

| Check | Result |
| --- | --- |
| Complete API unit and isolated PostgreSQL suite | 1,362 passed across 107 files; 27 opt-in provider tests skipped |
| Complete frontend unit suite | 1,108 passed across 95 files |
| Cloudflare Workers runtime | 12 passed |
| Complete Storybook Chromium suite | 595 passed across 45 files |
| All four workspace type checks | Passed |
| Frontend lint | Passed |
| Documentation source check and diff whitespace | Passed |
| Final Knip analysis | Exactly the same 11 previously reviewed owned-file tooling diagnostics; no new actionable finding |

One intermediate Chromium execution reported a disconnect failure in the
no-list-refresh scenario. The scenario passed in a separate 14-case run and
in two subsequent complete 40-case focused runs. Added explicit assertions
that the disconnect request is sent exactly once. Its intermittent failure
was not reproduced in those follow-ups or either subsequent full browser run;
no production change was attributed to an unconfirmed cause.

The first full 595-case Chromium run passed 594 cases and timed out while
waiting for the library search's empty result. The standalone 21-case library
suite passed. Its empty-result interaction now explicitly verifies the
request containing the debounced search text before waiting for its rendered response,
matching the adjacent search scenario, and also verifies that no selectable
rows remain. No application search behavior or global timeout was changed.
The final complete browser run passed all 595 cases. The final complete API,
frontend, Workers, and browser runs therefore passed 3,077 tests in total; the
27 opt-in provider cases were not run. Final inspection and unused-code checks
found no additional confirmed production defect or removal candidate in the
reviewed paths.

The isolated PostgreSQL instance was stopped after validation. No live provider
requests, production data changes, migration, deployment, commit, or push were
performed. Python worker behavior was unchanged in this pass. Static analysis
and passing tests do not prove that all possible defects are absent.


## Eighteenth review

Repeated the owned-code unused-code scan and inspected account authorization
and revocation, video/tag reads, frontend cache updates, job delivery and worker
execution, storage helpers, deployment guards, and prompt construction. The
confirmed cleanup was redundant prompt-configuration machinery.

- Both bundled prompt locales already contain complete configurations. Replaced
  the generic root lookup, recursive merging, per-request deep clone, unknown
  records, and type assertions with a typed locale map. TypeScript checks each
  locale's structure against the default configuration.
- Locale resolution still tries the full locale, then its primary language,
  then the default. Unknown names, including Object prototype property names,
  resolve to the default. Internal consumers only read the selected settings.
- Removed repeated runtime shape checks for this build-time JSON input. Prompt
  content and the JSON itself were preserved. Partial locale configurations are
  no longer a supported input; future locale additions must be complete.
- Removed the unused reference-label argument and four header substitutions
  that occur in neither bundled header. The actual header placeholders remain
  role, background, and request. Search limits still populate tool instructions.
- Updated English and Japanese prompt documentation to describe complete locale
  settings and selection without request-time merging.

Before editing, saved complete outputs for 13 locale inputs, both prompt modes,
and three agent search-limit combinations (52 outputs in total). Compared the
final implementation against those saved outputs byte for byte; all matched.
This exercises absent/default/regional/unknown locales as well as prototype
property names, without relying on a snapshot generated by the new code.

Validation for this pass:

| Check | Result |
| --- | --- |
| Complete prompt-output comparisons | All 52 unchanged |
| Prompt, RAG agent, chat send/history/schema/citation, and structured-answer tests | 178 passed across 7 files |
| RAG agent in Cloudflare Workers runtime | 6 passed |
| API TypeScript check | Passed |
| Documentation source check and diff whitespace | Passed |
| Final Knip analysis | Exactly the same 11 previously reviewed owned-file tooling diagnostics; no new actionable finding |

The final relevant test runs passed 184 cases. No additional confirmed behavior
bug or unused-code removal was found in the reviewed paths. The OAuth disconnect
path uses transactional bulk deletion by user and client, so it does not inherit
the native list adapter's 100-row limit investigated in the preceding pass.
Frontend, Python worker, database schema, and infrastructure code were unchanged
and retain their preceding validation. No live provider calls, production data
changes, migration, deployment, commit, or push were performed. These checks do
not establish that every possible defect or unused runtime path is absent.


## Nineteenth review

Repeated the owned-code unused-code scan and reviewed frontend stream lifecycle
and cache handling, API stream and database helpers, worker storage and account
deletion, and schema/migration consistency. The confirmed finding was a mismatch
between five Drizzle foreign-key declarations and the actual migrated database.

- Migration 0006 established `NO ACTION` on the user references in `videos`,
  `video_courses`, `tags`, `chat_logs`, and `course_evaluation_snapshots`, while
  their current Drizzle declarations and generated snapshots still said
  `CASCADE`. An attempted cleanup based only on those declarations would wrongly
  remove necessary account-deletion statements. Retained that deletion workflow.
- Changed the five declarations to `NO ACTION`, matching the existing database
  and worker sequence. Generated migration 0026, its snapshot, and the journal
  entry with Drizzle Kit; no historical migration or snapshot was rewritten.
  The new SQL reinstates those five constraints with their existing behavior
  and contains no data deletion. Snapshot comparison found only those five
  foreign-key changes.
- Extended the migration-chain integration test to compare all 34 current
  foreign keys against PostgreSQL after applying the complete migration history
  to both empty and populated databases. It verifies constraint names, source
  and target tables/columns, and delete/update actions. The comparison failed
  on exactly the five delete actions before the fix, and passes afterward.
- Corrected the account-deletion PostgreSQL fixture's video user reference to
  use the real `NO ACTION` behavior. Existing rollback, retry, locking, media
  cleanup, and other-user isolation checks continue to pass.
- Documented the actual database comparison and account-deletion constraints
  in the English and Japanese database guides.

Validation for this pass:

| Check | Result |
| --- | --- |
| Migration-chain regression before fix | Both empty/populated cases failed on the five expected delete-action mismatches |
| Migration-chain regression after generated migration | 2 passed; all 34 current foreign keys match |
| Worker account-deletion persistence/retry and video-deletion tests | 16 passed |
| Drizzle history check and generated migration verification | Passed; 27 journal entries |
| API TypeScript check | Passed |
| Documentation source check and diff whitespace | Passed |
| Final Knip analysis | Exactly the same 11 previously reviewed owned-file tooling diagnostics; no new actionable finding |

The final focused test runs passed 18 cases. Broader suites were not rerun in
this pass; their previous results remain recorded above. Final inspection found
no further confirmed defect or removable code in the reviewed paths. In
particular, the explicit worker deletion steps are required by the real foreign
keys and are not redundant.

The isolated PostgreSQL instance was stopped after validation. Migration 0026
was applied only in disposable test databases; no production migration, live
provider request, deployment, commit, or push was performed. Passing checks and
static analysis do not prove the absence of every possible defect or unused
runtime path.


## Twentieth review

Reviewed delivery and recovery, request-scoped database connections, streaming
cancellation, frontend editing/sharing/playback and authentication, evaluation
reads, Python job leases and media processing, and unused declarations and
translations. The confirmed cleanup was a second retry loop in SQS delivery.

- `sendSqsMessage` is called only by the durable outbox dispatcher. Its AWS HTTP
  client also retried HTTP 429 and 5xx responses inside the same API invocation.
  The installed aws4fetch 1.0.20 defaults to ten retries; its backoff uses a timer
  that does not observe the request's AbortSignal. A delivery can therefore keep
  waiting during backoff after its ten-second deadline expires.
- Disabled that in-process retry loop. Each outbox attempt sends one signed SQS
  request. Failures return to the existing persisted retry schedule; the same
  job identity and worker duplicate protection remain in use. A transient
  response now waits for scheduled redelivery rather than an immediate client
  retry. No new retry machinery or compatibility path was introduced.
- Added eleven tests using the actual AWS signer and a mocked fetch boundary.
  They cover temporary credentials and the exact form-encoded job body, one
  attempt on 429/500/503, absent configuration, network failure, missing message
  ID, cancellation at the delivery deadline, and interrupted response bodies.
  The three HTTP retry cases failed before the fix and passed afterward.
- Updated both language versions of the delivery/recovery guide to state where
  retries and their waiting time belong.

For the Workers review, retrieved the current
[Cloudflare best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
and workers-types 5.20260928.1, and checked the relevant handler, execution-context,
Hyperdrive, and local Wrangler schema definitions. The
[aws4fetch documentation](https://github.com/mhart/aws4fetch#new-awsclientoptions)
confirms its retry options; the non-abortable backoff finding also follows from
the installed implementation. No dependencies or compatibility dates changed.

Validation for this pass:

| Check | Result |
| --- | --- |
| SQS signer/delivery, outbox dispatcher, scheduled maintenance, and chat send | 96 passed across 4 files |
| Isolated PostgreSQL outbox maintenance and wakeup scheduling | 21 passed across 2 files |
| API TypeScript check | Passed |
| Documentation source check and diff whitespace | Passed |
| Final Knip analysis | Exactly the same 11 previously reviewed owned-file tooling diagnostics; no new actionable finding |

The final focused suites passed 117 cases. The additional declaration/reference
scan found the expected test-only rate-limit helpers, retained schema exports,
and the page-copy function used by the distribution Worker. Translation
candidates were accounted for by dynamic keys and plural forms. None justified
removal. Final inspection found no additional confirmed change in these reviewed
paths; this does not establish the absence of every possible repository defect.

The isolated PostgreSQL instance was stopped after validation. Only the SQS
client configuration, its new tests, and documentation changed in this pass.
No real SQS messages, paid provider calls, production data changes, migration,
deployment, commit, or push were performed. Broader suites were not rerun; their
previous results remain recorded above.


## Twenty-first review

Reviewed upload inputs and transport adapters, transcript and citation data
boundaries, frontend mutation completion and cache handling, Python job dispatch
and indexing, and the owned-code unused-code findings. The confirmed cleanup was
redundant machinery in the frontend upload workflow.

- Replaced the two upload command classes with `prepareVideoUpload`, which
  returns either a validation error or a discriminated, typed request for the
  selected transport. The submission consumes that prepared request directly.
  Removed the second validation during execution, the command interface,
  constructor/input wrappers, assertion helper, and custom validation exception.
- File selection still validates immediately for user feedback. Submission
  validates the edited input and current upload-size limit again. These are
  distinct checks; only the duplicate check within the same submission was
  removed. Filename fallback is now computed in one place and reused by the
  picker and submission.
- Derive the YouTube and tag transport signatures from the actual tRPC client.
  Removed the manually declared snake-case YouTube input and the conversion to
  snake case followed by conversion back to camel case. The existing API request
  payloads, trimming, and optional-description behavior remain covered.
- The workflow now returns only its optional tag-assignment warning. The caller
  did not use the returned video or warning wrapper. Removed the warning
  parameter state, repeated resets, component props, and fixture fields that
  always held an empty object. Error interpolation parameters remain because
  file-size errors use them.
- Renamed the module and its existing tests to `videoUpload`. Updated the tests
  to the new function boundary while retaining their validation, filename,
  progress, transport selection, and partial-success assertions. Existing hook
  tests cover duplicate submissions, retries, and query/tag-count refreshes.
  No new test cases or runtime compatibility layer were added for this cleanup.
- Updated the frontend README to explain preparation, dispatch, and the two
  meaningful validation moments. No API, database, or Python behavior changed.

Validation for this pass:

| Check | Result |
| --- | --- |
| Existing upload module/hook/page tests before refactor | 32 passed |
| Updated upload module/hook/page and modal tests | 44 passed |
| Complete frontend unit suite | 1,108 passed across 95 files |
| Complete Storybook Chromium suite | 595 passed across 45 files |
| Frontend application, Storybook, and distribution Worker type checks | Passed |
| Frontend lint | Passed |
| Documentation source check and diff whitespace | Passed |
| Final Knip analysis | Same 11 previously reviewed owned-file tooling diagnostics; only output ordering changed |

The final complete unit and browser suites passed 1,703 cases. The browser run
includes the existing file/YouTube upload, pending/error/retry/warning states and
navigation scenarios. Intentional failure fixtures produced their expected
console messages; all assertions passed. References to the retired classes,
exception, input type, module path, and warning parameters were checked and none
remain in frontend source or fixtures.

Final inspection found no further confirmed removal or correction in the
reviewed paths. Static analysis and tests do not prove that every possible
repository defect is absent. API, Python, database and infrastructure suites
were not rerun in this frontend-only pass and retain their earlier recorded
validation. No real uploads, provider calls, production data changes, migration,
deployment, commit, or push were performed.


## Twenty-second review

Reviewed shared request schemas against database column types, administrative
quota/usage editing, the matching Python processing reservation, worker failure
and retry paths, and the repository unused-code diagnostics. Resource IDs use
bigint columns; no artificial int4 restriction was added to them. The confirmed
issues were in administrative numeric/date validation and quota arithmetic.

- The admin API accepted negative quota values, fractional processing/answer
  limits, out-of-range integer values and arbitrary usage-period strings.
  Reject these at the shared input boundary before a database update. Upload
  size remains positive; other integer quotas and monthly counters are
  non-negative and bounded by their PostgreSQL int4 columns. Fractional storage
  quotas, hard-zero limits, nullable/unlimited quotas, and safe-integer bigint
  storage usage remain supported. Usage-period strings must be valid ISO
  datetimes with an explicit timezone, or null.
- Removed the admin form's three independent numeric validation helpers.
  A single text-to-number/null conversion feeds the same field schemas used by
  the API, exposed through a browser-safe `@videoq/trpc/admin` entry point. Every
  form field is checked before any mutation. Blank required usage counters no
  longer silently become zero. No new dependency or compatibility adapter was
  introduced.
- Removed the three hand-maintained quota, usage and flags patch types. The
  repository and service signatures now derive their inputs from `RpcInputMap`.
  Existing changed-field detection, plan quotas, partial-save recovery, and
  retry behavior are preserved.
- Updated English/Japanese validation messages and added browser scenarios for
  invalid input followed by correction and saving, including a mobile layout.
  The scenarios verify that invalid input does not partially save flags or
  quotas and that corrected input saves exactly the edited fields.
- The Python quota comparison multiplied two PostgreSQL integers when converting
  minutes to seconds, overflowing for a valid large minute limit. Adding the
  requested seconds to a large existing counter could also overflow before an
  over-quota request was rejected. Compute the limit in bigint arithmetic and
  compare existing usage against the remaining allowance instead. A one-line
  query change preserves the conditional update and per-video reservation.
  Real PostgreSQL tests check both previously failing paths, exact/over-limit
  requests, zero limits, unlimited quotas, and persisted user/video counters.
- Documented the shared validation and processing comparison in both versions
  of the tRPC architecture guide. No database schema or migration changed.

Before the fixes, the new regression cases reproduced 13 API failures, 12
frontend failures and 2 PostgreSQL arithmetic failures. The unsafe-byte input was
already rejected by the API; the new frontend now enforces that same boundary.

Validation for this pass:

| Check | Result |
| --- | --- |
| Admin API, PostgreSQL quota/flags/deletion, quota reservation, and signup defaults | 93 passed across 7 files |
| Admin frontend validation, saves, partial failure/retry, and deletion | 31 passed |
| Admin Chromium stories, including Japanese and English/mobile correction flows | 8 passed |
| Python processing quota, video reads, transcription persistence/resume/provider adapters | 58 passed across 6 files |
| Type checks for all four workspaces, including Storybook and the distribution Worker | Passed |
| Frontend lint and production build | Passed |
| Documentation source check and diff whitespace | Passed |
| Final Knip analysis | Same 11 previously reviewed owned-file tooling diagnostics; no new actionable finding |

The final focused suites passed 190 cases. The browser assertions were adjusted
to the matchers supported by the installed Storybook type declarations; both the
final browser run and type checks passed. Final inspection found no further
confirmed correction or removal in the reviewed paths. This is a scoped review
result, not proof that every possible repository defect is absent. Broader
unchanged suites retain their earlier validation recorded above.

Database checks used the existing isolated PostgreSQL 17 instance, which was
stopped after validation. No real uploads, provider calls, production writes,
migration, deployment, commit or push were performed.


## Twenty-third review

Repeated the owned-code unused-code scan and inspected worker job dispatch,
transaction boundaries, transcription/indexing state checks, reindex results,
frontend query refreshes, media handling, and evaluation reads. Confirmed changes
were confined to Python worker connection lifetime and redundant task machinery.

- Reproduced an open connection after a deferred PostgreSQL constraint failed
  during commit. The installed psycopg connection context calls commit before
  closing; a commit exception could bypass that close. The shared connection
  context now has an outer `closing` guard, preserving normal commit/rollback
  behavior and the original exception while ensuring resource cleanup.
- Added three real-PostgreSQL cases checking successful persistence, rollback
  after an application exception, and rollback after a commit-time constraint
  violation. They also check that the acquired connection is closed. The
  commit-failure case failed before the fix; the other two preserved existing
  behavior. All pass after the fix.
- Removed the separate `db_transaction` wrapper. Job execution claims,
  completion and failure use the same connection context as other worker work.
  Removed five explicit commits immediately before connection-context exit in
  transcription, indexing and evaluation. The context remains the owner of
  those commits. Account deletion retains its intermediate commits and per-video
  transactions because it deliberately checkpoints work for retries.
- Removed the constant-returning indexing transition helper and the generic
  transition table, assertion, exception and start-planning helper that were
  only consulted for transcription startup. Tasks now state their actual entry
  conditions directly. Pending/error videos can start, processing resumes,
  indexing resumes handoff, and completed duplicates remain no-ops. Uploading
  and unknown states fail before writes/provider work. Conditional SQL updates
  still check the previously read status to handle concurrent changes.
- Removed the full-reindex result dictionaries, including the always-empty
  failed-video field. Production callers discarded these values; task success
  is recorded by the dispatcher and failures are exceptions. The registry now
  declares `Callable[..., None]`. Reindex counts remain in logs, and a failed
  reindex no longer emits a misleading completion message before raising.
- Adapted existing tests to assert persisted results, exact status transitions,
  progress logs, retries and resource ordering rather than removed manual
  commits/result dictionaries. Two entry-state cases passed before and after
  the simplification. Documented task outcomes and transaction ownership in
  the English/Japanese worker guides.

Validation for this pass:

| Check | Result |
| --- | --- |
| Initial connection and related worker suite | 60 passed; 1 reproduced commit-time connection leak |
| Connection fix and related persistence/retry/streaming suite | 61 passed |
| Complete Python suite after final state-check simplification | 468 passed, including PostgreSQL integration/persistence cases |
| Documentation source check and diff whitespace | Passed |
| Final Knip analysis | Same 11 previously reviewed owned-file tooling diagnostics; no new actionable finding |

The complete run includes job execution concurrency, account-deletion rollback
and retry, vector replacement/reader visibility, transcription persistence,
evaluation races and quota boundaries. The four existing upstream RAGAS
import-deprecation warnings remain unchanged. Retired helper names and result
fields have no remaining application or test references. Final inspection found
no further confirmed correction or removal in the reviewed paths; this does not
prove that every possible repository defect is absent.

No TypeScript application code, input/output contracts, migrations or dependencies
changed in this pass, so those unchanged suites retain their previously recorded
validation. The isolated PostgreSQL instance was stopped after checks. No real
provider calls, production writes, deployment, commit or push were performed.


## Twenty-fourth review

Repeated the repository unused-code scan and inspected list/search queries,
course sharing and media authorization, course update locking, invitation
creation/resend/delivery, and frontend course lists and optimistic updates.
Confirmed two corrections in the API and removed obsolete invitation metadata.

- Admin user search interpolated the search term into an ILIKE pattern without
  escaping it. Percent signs, underscores and backslashes could therefore match
  different usernames/emails from the literal text entered. Reproduced six
  failures on PostgreSQL: all three characters in both searchable fields.
  Extracted the existing video-search escaping into `db/sql-like.ts` and use it
  in both repositories. Video search keeps its existing behavior. Tests check
  case-insensitive matching, total counts, pagination, and unfiltered lists.
- Invitation creation and manual resend still fetched and returned course and
  inviter display names even though email delivery loads those values later.
  Removed the unused `CreatedInvitation` type, metadata selections and result
  transformations. Creation returns the inserted IDs/emails; successful resend
  returns only its success discriminator. Delivery-time metadata loading and
  invitation previews retain the information they actually consume.
- The redundant users join during manual resend also made `SELECT FOR UPDATE`
  lock the owner's profile row. Reproduced a lock timeout while another
  transaction held only that row. Removed the join; the query still checks
  ownership and locks the invitation and course. The new PostgreSQL regression
  verifies that resend completes while the profile is locked, invalidates the
  old token, queues delivery and writes one invitation-ID outbox entry.
- Updated existing invitation service fixtures and documented literal search
  semantics in the English/Japanese tRPC architecture guide.

Validation for this pass:

| Check | Result |
| --- | --- |
| Initial search regression and related API suite | 46 passed; 6 reproduced incorrect literal-search results |
| Initial invitation regression suite | 15 passed; 1 reproduced unrelated profile lock timeout |
| Final focused admin/video search, invitation and course-membership suites | 98 passed across 7 files |
| Complete API unit/integration suite with isolated PostgreSQL | 1,398 passed across 108 files; 28 optional cases skipped across 4 files |
| API TypeScript check | Passed |
| Documentation source check and diff whitespace | Passed |
| Final Knip analysis | Same 11 previously reviewed owned-file tooling diagnostics; no new actionable finding |

The skipped cases comprise 27 opt-in live-provider cases and one separately
configured cross-language embedding storage case. Embedding code was unchanged;
its earlier validation remains recorded above. No frontend, Python worker,
public input/output contract, schema, migration or dependency changed in this
pass. Final inspection found no further confirmed correction or removal in the
reviewed paths; this is not proof that every possible repository defect is absent.

The isolated PostgreSQL instance was stopped after validation. No live email,
provider calls, production writes, deployment, commit or push were performed.


## Twenty-fifth review

Repeated the repository unused-code scan and reviewed browser authentication,
profile/query lifetimes, verification flows, billing reconciliation, external
job delivery, account deletion and media-processing boundaries. Confirmed changes
remove duplicate authentication navigation, synthetic verification display data,
and an unused optional billing-update path.

- `AuthProvider` already owns session revalidation and login navigation, but
  every `useAuth` consumer repeated navigation in its own effect. A regression
  with two profile consumers reproduced three login navigations on one mount.
  `useAuth` now only reads the app profile. Removed its navigation effect,
  options, unused application callback and ref, and the profile-null redirect
  branch. Profile fetch errors alone do not expire the session; revalidation
  and cache replacement remain with `AuthProvider`.
- Removed the course-detail page's standalone auth-hook call, whose return value
  was unused, and obsolete redirect options in upload and Storybook callers.
  Provider tests verify a single navigation with multiple profile consumers and
  recovery from a session-service outage. Existing tests retain session expiry,
  late unauthorized responses, refresh coalescing, account switching and isolation
  from stale query/mutation writes. Profile tests cover session gating, public
  pages, loading and request failures. Video tests verify that an anonymous
  session does not trigger private profile/video requests.
- The email-verification adapter fabricated an English success message which
  overrode the page's translations. Both Japanese and English/mobile browser
  scenarios failed against the old code. The adapter now resolves without
  display data; removed `VerifyEmailResponse` and its duplicate query shape.
  The query stores null on success (a valid cache value), and the page uses its
  translated success message. Reconnect/remount caching, errors, invalid links,
  token changes and delayed login navigation remain covered. Updated an older
  redirect test so it actually advances the timer and asserts navigation.
- The private billing-update function accepted an optional revision, although
  its sole caller always supplies the required revision from `BillingUpdate`.
  Made the argument mandatory and removed both unreachable omission branches.
  Every update must compare the stored revision and reject a stale write.
  Existing PostgreSQL tests cover concurrent events, duplicates, stale Stripe
  lookups, transaction rollback/redelivery, quota overrides and account deletion.
- Documented authentication ownership and localized verification messages in
  both versions of the tRPC architecture guide.

Validation for this pass:

| Check | Result |
| --- | --- |
| Initial auth regression and existing auth tests | 26 passed; 1 reproduced three login navigations instead of one |
| Initial real-browser verification scenarios | 2 reproduced hard-coded success text overriding translations |
| Focused profile/session/verification/API/upload/course tests | 126 passed across 8 files |
| Focused verification, email-change and API browser stories | 21 passed across 3 files |
| Final complete frontend unit suite | 1,118 passed across 95 files |
| Complete Chromium Storybook suite | 599 passed across 46 files |
| Billing webhook, catalog, admin quota/deletion and external-task suites | 88 passed across 5 files, with isolated PostgreSQL |
| API and frontend TypeScript checks, frontend lint and production build | Passed |
| Documentation source check and diff whitespace | Passed |
| Final Knip analysis | Same 11 previously reviewed owned-file tooling diagnostics; no new actionable finding |

The first complete frontend run found one old video-hook test asserting the
removed hook-owned redirect. Its anonymous-data gating assertion now uses an
absent session; navigation is covered at the provider boundary. The final full
run passed all 1,118 tests. Browser error-fixture logs and the existing upstream
Vite plugin deprecation warning are expected; no test failures remain.

Final inspection found no further confirmed correction or removal in the reviewed
paths. This scoped result does not prove that every possible repository defect
is absent. No public API contract, database schema, migration, dependency or Python
worker changed. Unchanged broader API/Python checks retain their earlier results.
The isolated PostgreSQL instance was stopped after validation. No real email,
provider/payment calls, production writes, deployment, commit or push were performed.


## Twenty-sixth review

Repeated the repository unused-code scan and reviewed upload reservation and
confirmation, cleanup/retry paths, course membership, browser editing/playback,
transcription, indexing and subtitle scene boundaries. Confirmed two token-budget
errors and one duplicate URL-validation path.

- Scene acceptance summed each subtitle cue's tokens but omitted the spaces added
  when joining cues. With the actual `cl100k_base` tokenizer, 300 numeric cues
  individually counted as 300 tokens became one 599-token scene despite the
  512-token budget. Acceptance now verifies the actual joined text when the
  prefix-count check fits. The prefix check still avoids repeatedly tokenizing
  large ranges that already require splitting. Two-cue splits remain deterministic;
  semantic embeddings are requested lazily only when a boundary choice needs them.
- Long-cue splitting respected the original token slices but did not recheck text
  after SRT's outer-whitespace normalization. Removing a leading space can expand
  a BPE token; repeated words reproduced chunks of 513 and 514 tokens with the
  default 512 limit. Each decoded chunk now checks the normalized text and shrinks
  its token window until it fits, while retaining strict UTF-8 decoding and time
  interpolation. Impossible budgets fail explicitly instead of emitting an
  oversized chunk.
- Added five parameterized regression cases using offline real tiktoken encodings.
  They cover joining spaces, an exact boundary, a multi-cue semantic split and
  normalization at small/default budgets. Assertions retain subtitle content,
  continuous start/end times and embedding-call avoidance. Existing assertions
  still require each original long cue to be encoded once; bounded chunk checks
  are now allowed.
- Removed `isValidUrlFormat` and its extra `new URL` pass before
  `extractYoutubeVideoId`, which already validates the scheme, approved host and
  video ID. Accepted/rejected URLs are unchanged. Malformed URL input now uses the
  existing `Invalid YouTube URL.` error instead of the duplicate generic message.
- Updated English/Japanese transcription architecture documentation for joined
  text, normalized chunk budgets and lazy embedding calls. Corrected the diagram
  that implied embeddings were always generated, and documented that the existing
  fallback to original SRT does not guarantee scene token limits. Embedding-contract
  errors continue to fail the job.

Validation for this pass:

| Check | Result |
| --- | --- |
| Initial merged-scene regression suite | 39 passed; 2 reproduced oversized joined scenes |
| Long-cue normalization regression before its fix | 41 passed; 2 reproduced oversized normalized chunks |
| Focused scene/transcription/resume/YouTube-caption suite | 64 passed |
| Complete Python worker suite with isolated PostgreSQL | 473 passed; 4 existing RAGAS deprecation warnings |
| YouTube parser, video atomicity/multipart, MCP write and tRPC suites | 74 passed across 5 files |
| API TypeScript check | Passed |
| Documentation source check and diff whitespace | Passed |
| Final Knip analysis | Same 11 previously reviewed owned-file tooling diagnostics; no added, removed or changed diagnostics |

A separate probe using the locally cached default `cl100k_base` tokenizer confirmed
that the numeric-cue case now produces two 299-token scenes. Long cues consisting
of repeated `accomplishments` and `appropriately` produced token counts
`[512, 512, 282]` and `[512, 512, 279]`, respectively. Text reconstruction was
unchanged, and neither long-cue case requested embeddings. The numeric-cue probe
used one stubbed embedding call; no live provider was contacted.

Final inspection found no additional confirmed correction or removal in the
reviewed paths. This scoped result does not establish that every possible defect
or unused path in the repository is absent. No frontend code, public input/output
shape, database schema, migration or dependency changed. Unchanged frontend and
broader API checks retain their earlier recorded results.

The isolated PostgreSQL instance was stopped after validation. No live provider
calls, production writes, deployment, commit or push were performed.


## Twenty-seventh review

Repeated the repository unused-code scan and reviewed evaluation/analytics reads,
media transcription, maintenance scheduling, billing deletion, worker locks,
frontend query and resource lifetimes, authentication redirects, shared playback,
and common UI controls. Confirmed corrections concern untranslated common UI and
redundant confirmation/URL-helper implementations.

- Confirmation defaults and notification dismissal were hard-coded in English.
  Resolve default confirm/cancel labels from the active locale during rendering,
  and translate the notification button's accessible name. Open confirmations
  follow language changes for their default labels; explicitly supplied labels
  remain caller-owned.
- Removed the unused string-only confirmation input, its normalizer, the duplicate
  required-options type construction, and default variant materialization. Every
  application, test and story caller already supplies an options object. Removed
  six repeated default cancel labels and one repeated default confirm label from
  application callers now that the provider owns these translated defaults.
- Removed the hidden English filler paragraph and empty description container
  from confirmations without a description. The heading still names the dialog;
  confirmation/cancellation, keyboard operation, focus restoration, navigation
  cancellation and timer cleanup retain their existing coverage.
- Loading indicators and removable tags also contained fixed English labels.
  Their visible/accessible loading text and tag removal names now use translations.
  `DialogClose` now requires caller-supplied content instead of fixing its label to
  Japanese; the analytics dialog supplies the existing translated close action.
  Added three translation keys per locale and reused existing confirm/cancel/close
  keys. Loading text is resolved once and shared by the indicator and its label.
- Removed the global test setup's two copies of video URL generation. One used
  the obsolete `share_token` query parameter and modified external URLs as well.
  Spies now delegate to the real pure API-client methods. Removed three page-local
  URL stubs, including another obsolete `token` parameter variant. Course playback
  tests now assert the actual resolved resource path, and the shared-player test
  checks that its URL carries `share_slug`.
- Updated existing stories to verify localized control names, including keyboard
  tag removal in both languages. One new confirmation story checks English mobile
  defaults, a language change while open, cancellation and restored focus. Updated
  loading-state assertions to use translations while retaining their original
  pending-data, persistent-layout and navigation checks.

Validation for this pass:

| Check | Result |
| --- | --- |
| Initial feedback browser checks before implementation/translation updates | 6 passed; 9 failed |
| Focused feedback/share/video/course unit suites | 108 passed across 4 files |
| Focused feedback browser suite after the correction | 15 passed |
| Loading/tag/analytics browser checks before their correction | 33 passed; 5 reproduced fixed-English controls in Japanese views |
| Final complete frontend unit suite | 1,118 passed across 95 files |
| Final complete Chromium Storybook suite | 600 passed across 46 files |
| Final frontend TypeScript checks, ESLint and production build | Passed |
| Diff whitespace and translation JSON checks | Passed |
| Final Knip analysis | Same 11 previously reviewed owned-file tooling diagnostics; no added, removed or changed diagnostics |

Intermediate full unit runs exposed three old assertions expecting the removed
relative-URL stubs and seven navigation cases expecting English loading text in
Japanese views. Those assertions now check the real URLs and localized text. One
asynchronous chat citation assertion timed out while checks ran concurrently;
the unchanged case passed in an isolated 35-test rerun and in the final complete
run with four unit workers. No final test failures remain. Browser error-fixture
logs and upstream Vite/Zod tooling warnings were non-fatal.

Final inspection found no additional confirmed correction or removal in the
reviewed paths. This scoped result does not establish that every possible defect
or unused path in the repository is absent. API/Python code, public API contracts,
database schemas, migrations and dependencies were unchanged in this pass; their
earlier validation results remain recorded above.

No live provider calls, production writes, database startup, deployment, commit
or push were performed.

## Twenty-eighth review

Repeated the repository-wide unused-code scan and traced search/chat permission
boundaries, structured-answer validation, stream cancellation, course/tag
membership updates, and frontend query/playback lifetimes. No additional
functional defect or safely removable implementation was confirmed in this pass.

- Membership mutation messages are consumed by the public tRPC and MCP response
  contracts. They are not unused internal return values and were retained.
- The RAG tool-call wrapper preserves exception propagation, embedding-schema
  checks validate the stored dimensions, and the embedding adapter implements the
  library interface. These were not removed merely because a local call appears
  redundant or an interface method has no application call site.
- Retained ownership checks and database locks in membership updates, stable
  pagination ordering, cancellation cleanup, and optimistic rollback guards after
  following their callers and corresponding test coverage.
- Corrected a vector metadata normalization comment that still referenced the
  deleted `mapCitations` function. This pass changes no runtime behavior, API
  contract, dependency, or schema.

Validation for this pass:

| Check | Result |
| --- | --- |
| Chat/citation/structured-answer/RAG/membership API suites, including isolated PostgreSQL reads | 216 passed across 10 files |
| Frontend editing/playback/reordering/pagination/chat/tag suites | 97 passed across 9 files |
| Root TypeScript checks (shared contracts, API, web and docs) | Passed |
| Knip analysis | Same 11 previously reviewed owned-file tooling diagnostics; no added, removed or changed diagnostics |
| Diff whitespace checks | Passed |

The remaining Knip diagnostics are the previously traced script, configuration,
HTML, worker, and type-test entry points/tooling limitations, not newly confirmed
unused application code. The frontend emitted the existing non-fatal Vite plugin
option deprecation warning. The earlier full frontend/browser/Python results
remain recorded above; those suites were not repeated for a comment-only edit.

The final review found no further actionable finding within these inspected
paths. This is not a guarantee that the repository has no possible defect or
unused code. Existing workspace changes were preserved. The isolated local test
PostgreSQL server was stopped after validation. No live provider calls,
production writes, deployment, commit, or push were performed.
