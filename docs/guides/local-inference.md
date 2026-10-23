---
sidebar_label: Local AI inference
description: Run VideoQ chat, embeddings and Whisper inside the on-premises network.
---

# Keep AI processing on-premises

VideoQ can run chat, embeddings and Whisper on site alongside its web, API and
worker workloads. Initial container/model downloads can use the internet;
uploaded video, audio and AI requests use private services during processing.
The application's default Helm values still select hosted OpenAI. Applying
the local overlay explicitly switches all three AI functions.

| Function | Local service | CPU acceptance model |
|---|---|---|
| Chat and tools | Ollama, OpenAI-compatible Chat Completions | qwen3:4b |
| Query and indexing embeddings | Ollama /api/embed, 1536 dimensions | qwen3-embedding:4b |
| Uploaded-audio transcription | Private faster-whisper API | Whisper base |

Use the [inference chart's installation guide](https://github.com/yukiharada1228/videoq/blob/main/charts/videoq-inference/README.md).
It covers building the private Whisper image, CPU/GPU Helm settings, persistent
weights, disabling runtime downloads, egress restrictions and real-model checks.
The app overlay is `charts/videoq/examples/local-ai.yaml`.

The CPU baseline disables visual inspection because its chat model accepts text
only. Local visual inspection requires a validated vision model with tool calls
and strict JSON Schema support. The NVIDIA profile requests two GPUs unless
the site customizes one service to stay on CPU. Hardware sizing and Japanese
recognition/answer quality require acceptance on the actual site.

The local Whisper image is site-built and is not currently included in the
existing signed three-image GHCR release. No hosted OpenAI key is needed:
`OPENAI_API_KEY=local-inference` is an SDK placeholder. Retain the other runtime
Secret values from the [application installation](on-premises.md).

Before accepting the site, test a real upload through transcription, indexing,
cited streaming Q&A and timestamp playback with public egress blocked. A CNI
that enforces NetworkPolicy is required for the provided network restrictions.
Changing the embedding model requires rebuilding existing scene embeddings.
Optional email, Google OAuth, Stripe and YouTube/SearchAPI remain separate
external integrations; this local recipe covers uploaded videos and local
email/password sign-in.
