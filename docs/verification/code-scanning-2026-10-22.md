# Code scanning review, 2026-10-22

Scope: all 21 open CodeQL alerts on `main`, inspected against
`f052229322af7e2066ada926dd5ead73a62cc256`.

## Code changes

| Alerts | Resolution |
|---|---|
| #2–#9 | CD checks out GitHub's immutable `github.sha`, after the trusted policy verifies that the workflow context, successful source-repository main push CI, and current main all identify the same commit. The workflow never checks out a SHA taken from the triggering event or a job output. Credential-free builds, separately locked deployment tools and existing production gates remain in place. |
| #10 | The TLS test server explicitly requires TLS 1.2 or later. Both trusted-certificate success and untrusted-certificate rejection remain covered. |
| #11 | Multipart upload XML entities are decoded in a single pass, so `&amp;lt;` stays `&lt;` rather than becoming `<`. |
| #12 | Checkout's eight-letter suffix uses five random bits and rejection sampling for values 26–31, preserving a uniform distribution over a–z. |
| #13 | Local password recovery requires `VIDEOQ_LOCAL_PASSWORD`; no password is generated or printed. The recovery guide uses a hidden Bash prompt. |
| #14–#15 | URL suffix normalization uses a linear scan instead of an unanchored, backtracking slash expression. |
| #22 | The live test creates its default report in a private `mkdtemp` directory and opens every report exclusively with mode `0600`. Progress writes use the same open descriptor, preventing symlink replacement between writes. Existing explicit report paths are rejected. |

Regression coverage includes rejected random samples and refills, nested XML
entities, long URL inputs, mismatched workflow-context commits and immutable
checkout references.

## Reviewed intentional data flows

These six alerts do not identify a vulnerability. Resolve each individually
with the following evidence; retain all CodeQL languages and queries without
path exclusions or inline suppression.

| Alert | Evidence and disposition |
|---|---|
| #16 `js/http-to-file-access` | `apps/demo-video/scripts/capture-answer.mjs` deliberately records an anonymous answer from the fixed public demo course as JSON at the fixed repository path `content/answer.json`. The destination and extension are not controlled by the response. `StudentDemo.tsx` imports it as data and renders answer text through React, without evaluating it as code. This is an explicit, manually invoked recording operation. **False positive.** |
| #17 `js/file-access-to-http` | `prepare-landing-demo.ts` deliberately uploads the repository's owned Japanese and English landing-page MP4s through `videos.requestUpload`, using the returned signed upload URL. The source is `landingDemoMedia('ja'/'en')`, not a credential file. Remote API origins require HTTPS; local test-user headers are limited to loopback. **False positive.** |
| #18 `js/file-access-to-http` | `prepare-student-demo.ts` uploads the five original lesson MP4s listed in repository-owned `content/course.json`, through the same normal API upload flow. This is the documented purpose of the explicitly invoked demo preparation command; no credential file is uploaded. **False positive.** |
| #19–#20 `js/file-access-to-http` | The two PUT bodies are the fixed repository fixture `apps/web/.storybook/fixtures/media/preview.webm`. `garage-storage.integration.test.ts` runs only with `GARAGE_INTEGRATION=1`, signs against its configured loopback Garage endpoint and deletes its isolated test objects. One PUT intentionally tests MIME rejection; the other tests successful upload. **Used in tests.** |
| #21 `js/missing-origin-check` | `videoCompression.worker.ts` runs in a dedicated module Worker created at the static URL in `videoCompression.ts`. Its message channel is private to the creator; it is not a Window listener reachable through cross-window `postMessage`. Dedicated-worker messages have an empty origin, so a Window-style origin comparison would break valid compression. The caller terminates the Worker after completion or bounded cancellation. **False positive.** |

The CodeQL [file-to-network](https://codeql.github.com/codeql-query-help/javascript/js-file-access-to-http/)
and [network-to-file](https://codeql.github.com/codeql-query-help/javascript/js-http-to-file-access/)
queries request inspection for unintended backdoors; the source/destination
review above establishes the intended operations. The dedicated-worker channel
is specified in the [HTML Standard](https://html.spec.whatwg.org/multipage/workers.html#dom-worker-postmessage).

Completion requires successful checks and a fresh analysis of the merged main
commit for JavaScript/TypeScript, Python and Actions, followed by verification
that no open code-scanning alerts remain.
