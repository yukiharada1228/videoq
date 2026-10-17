# Modal Whisper API security hardening (2026-10-17)

The public `WhisperService.api` URL was moved from the GPU class to a small CPU
Web Function. The original URL label and bearer token remain in use. The CPU
function checks the token, request body limit, model, response format, and audio
file limit before invoking a private GPU method. The bearer-token Secret is no
longer attached to the GPU class.

The request body is capped at 16 MiB + 64 KiB while streaming, including when
`Content-Length` is absent or false. The audio file itself is capped at 16 MiB.
Invalid audio duration remains a 400 response after GPU validation.

Verification:

- Worker test suite: 465 passed, 105 skipped (Python 3.14 local environment).
- Modal 1.6.1 / FastAPI 0.115.12 import and endpoint tests passed on Python 3.11.
- Deployed `apps/worker/modal_batched_whisper.py` to Modal `main` on 2026-10-17.
- Production URL without a bearer token: HTTP 401. Modal system log showed
  `POST /v1/audio/transcriptions -> 401` with 167 ms execution.
- Production URL with the SSM bearer token and a two-second synthetic MP3:
  HTTP 200, with the expected transcription response fields. Modal system log
  showed `POST /v1/audio/transcriptions -> 200` with 8.32 s execution.

Follow-up: a second URL with `requires_proxy_auth=True` was deployed and verified
with a new Modal proxy token. The worker's SSM app parameter was changed from
version 3 to 4 to use this URL and combined token. The Lambda configuration was
updated to recycle warm containers after the queue was confirmed empty. Calling
the new URL through the worker's OpenAI client succeeded. The old public URL was
then removed: it returns HTTP 404, while the protected URL returns HTTP 401
without a token. The obsolete Modal application Secret was deleted. A valid
proxy token still reached the ASGI app after Secret deletion (HTTP 400 for an
intentionally invalid model).

Modal [may retain Web Function and remote Function payloads for up to seven
days](https://modal.com/docs/guide/security).
This deployment does not pin processing or routing to a particular region.
