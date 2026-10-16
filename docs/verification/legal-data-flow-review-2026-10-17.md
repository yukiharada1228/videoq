# Legal and data-flow review (2026-10-17)

This records the implementation checked for the Japanese and English `/terms`, `/privacy`, `/refund`, and `/legal` pages. It is an operational review, not a determination that every transfer meets the law in every jurisdiction.

| Operation | Data sent or stored | Implementation | Disclosure |
| --- | --- | --- | --- |
| Uploaded media | Original video and derived visual caches in Cloudflare R2; metadata, transcript, and chat records in Neon PostgreSQL; jobs in AWS SQS and processing in Lambda | `apps/api/src/integrations/media.ts`, `apps/worker/worker_python/pipeline/storage.py`, `infra/locals.tf`, `infra/secrets.tf` | Privacy §§2, 4–6 |
| Uploaded-audio transcription | Worker extracts at most 300-second MP3 intervals. With `WHISPER_BACKEND=modal`, it sends each audio file to VideoQ's authenticated Modal Web Function and receives segments. The backend can instead be OpenAI or local. | `apps/worker/worker_python/pipeline/transcription.py`, `apps/worker/modal_batched_whisper.py` | Privacy §§5–6 |
| Search and answers | Subtitle passages and search queries go to the configured embedding provider; the current default is OpenAI. The configured chat provider receives the latest question and selected course/subtitle evidence. Selected still frames may also be sent for visual inspection. | `apps/worker/worker_python/pipeline/embeddings.py`, `apps/api/src/lib/rag.ts`, `apps/api/src/lib/visual-inspection.ts` | Privacy §§4–5 |
| YouTube import | YouTube video ID and transcript request go to SearchAPI using a configured key; the user's SearchAPI contract may incur separate fees. | `apps/worker/worker_python/pipeline/transcription.py`, `apps/web/src/i18n/locales/ja/translation.json` | Privacy §5; legal notice fees |
| Authentication, email, billing | Optional Google sign-in; Mailgun receives service-email address, subject and body; Stripe receives billing/customer details. | `apps/api/src/lib/auth.ts`, `apps/api/src/lib/mail.ts`, `apps/api/src/features/billing/service.ts` | Privacy §§3–5 |
| Landing measurement | First-party browser session storage and a limited event payload to Cloudflare Workers Logs; DNT and GPC disable it. | `apps/web/src/lib/landingAnalytics.ts`, `apps/web/worker/landing-events.ts` | Privacy §8 |
| Account deletion | An administrator starts an asynchronous deletion: Stripe customer deletion, then media and database deletion. External providers can retain prior transfers under their own policies. | `apps/api/src/repositories/admin-repository.ts`, `apps/api/src/features/billing/account-deletion.ts`, `apps/worker/worker_python/tasks/account_deletion.py` | Privacy §§6–7 |

## Publication checks

1. Check the production worker's actual `WHISPER_BACKEND`, Modal endpoint, and AI provider settings without exposing secret values. The repository documents options but does not prove which are active in production.
2. Review the transfer basis and processor agreements for Modal, OpenAI, Neon, Cloudflare, SearchAPI, Google, Mailgun, Stripe, and AWS, including foreign-transfer obligations. The [PPC foreign-transfer guidelines](https://www.ppc.go.jp/personalinfo/legal/guidelines_offshore/) distinguish processor arrangements from other transfers and require appropriate safeguards and ongoing checks where applicable. Modal's [DPA](https://modal.com/legal/dpa) and [data residency guide](https://modal.com/docs/guide/data-residency) are starting points, not evidence that VideoQ's own configuration and contracts have been checked.
3. Confirm that the operator can promptly provide the complete working address and reachable phone number by email when requested. The [Consumer Affairs Agency's mail-order guidance](https://www.no-trouble.caa.go.jp/qa/advertising.html-2) permits omission from the advertisement only with the stated disclosure process and actual ability to respond before purchase.
4. Published the revised policy and terms together on 2026-10-17 JST as web Worker version `a7a6074c-28b7-4824-b198-e37a2698856e`. `AppPageShell` includes a Japanese/English in-service notice linking to both documents through 2026-11-16 (UTC).
5. The published Japanese and English legal pages and in-service notice were checked in the browser. Check Stripe Checkout/Portal legal links against live sessions when next available. The repository's static prices matched `apps/api/src/features/billing/catalog.ts` on this review date.

## Notice for existing users

The Japanese and English in-service banner in `AppPageShell` explains the Modal disclosure and the limited permission to process videos. It links directly to `/terms` and `/privacy` and is available across app pages until 2026-11-17 UTC. Users can close it; a revision-specific local-storage flag keeps it closed in that browser. It does not send an email.

The dismiss button was published as web Worker version `013209f3-40fc-4a5c-b854-cc08a8917d17`. A browser check confirmed that closing the banner removes it and that it stays hidden after reload.

Modal's [security documentation](https://modal.com/docs/guide/security) says Web Function inputs and outputs may be retained for up to seven days. The repository's `@modal.asgi_app()` function has no configured durable audio storage and no region pin; confirm the deployed version before relying on that observation. Do not promise Japanese-only processing or immediate deletion of Modal's retained payloads. OpenAI's [API data controls](https://developers.openai.com/api/docs/guides/your-data) describe separate abuse-monitoring retention; avoid implying that deleting a VideoQ account immediately erases earlier transfers from all providers.
