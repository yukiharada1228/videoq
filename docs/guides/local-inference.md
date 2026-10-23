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

| Recipe | LLM / embedding runtime | Application overlay |
|---|---|---|
| CPU | llama.cpp, separate chat / embedding APIs | `local-ai-llamacpp.yaml` |
| NVIDIA GPU | vLLM, separate chat / embedding APIs | `local-ai-vllm.yaml` |

Whisper uses the independent private faster-whisper service in every recipe.
The application uses the OpenAI-compatible protocol with private endpoints;
`EMBEDDING_BASE_URL` separates query/indexing embeddings from `OPENAI_BASE_URL`
for chat. Optional `EMBEDDING_API_KEY` selects a separate credential.

Use the [inference chart's installation guide](https://github.com/yukiharada1228/videoq/blob/main/charts/videoq-inference/README.md).
It covers building the private Whisper image, CPU/GPU Helm settings, persistent
weights, disabling runtime downloads, egress restrictions and real-model checks.
Select the matching overlay from `charts/videoq/examples/`; retain it on upgrades.

The CPU baseline disables visual inspection because its chat model accepts text
only. Local visual inspection requires a validated vision model with tool calls
and strict JSON Schema support. The vLLM profile requests one GPU for chat and one for embeddings, with Whisper
on CPU. The optional `whisper-nvidia.yaml` overlay adds one GPU for Whisper.
vLLM GPU execution remains subject to actual hardware acceptance. Hardware sizing and Japanese
recognition/answer quality require acceptance on the actual site.

The local Whisper image is site-built and is not currently included in the
existing signed three-image GHCR release. No hosted OpenAI key is needed:
`OPENAI_API_KEY=local-inference` is an SDK placeholder. Retain the other runtime
Secret values from the [application installation](on-premises.md).

Before accepting the site, test a real upload through transcription, indexing,
cited streaming Q&A and timestamp playback with public egress blocked. A CNI
that enforces NetworkPolicy is required for the provided network restrictions.
Changing embedding weights, quantization, pooling or preprocessing requires
rebuilding existing scene embeddings, even when both models output 1536 dimensions.
The llama.cpp CPU recipe uses native 1536-dimensional gte-Qwen2 embeddings;
vLLM uses Qwen3-Embedding-4B with Matryoshka output set to 1536 dimensions.
The on-prem edition disables external mail, Google login, Stripe and
YouTube/SearchAPI; administrators issue local accounts and private setup links.
