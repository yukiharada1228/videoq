---
title: Q&A prompts and answer evaluation
description: The model's inputs, tool decisions, citations, failure behavior, and evaluation after answering.
---

# Q&A prompts and answer evaluation

Prompts contain instructions and reference material for AI. VideoQ answers using the user's question together with accessible course information and subtitles.

Start with [How AI builds an answer](../concepts/how-ai-works.md) for a complete question-to-citation example. This page explains the inputs and controls behind that example.

## What reaches the answer model

| Stage | Material passed to the model |
|---|---|
| Start of ordinary Q&A | System instructions and the latest user question; earlier conversation turns are not included |
| Tool definitions | What each tool can do, its argument schema, and instructions about when to use it |
| After a tool call | The current answer's tool-call history and returned course metadata or numbered subtitle scenes |
| Final response | The model writes using the evidence acquired during that answer |

The prompt selects language-specific instructions from `prompts.json`. Course metadata includes names, descriptions, video counts, and a page of video IDs/titles/statuses. The tool explicitly omits share tokens, owner IDs, and file URLs. Descriptions can be truncated: course descriptions at 2,000 characters and video descriptions at 500, with flags indicating truncation. A missing page or truncated field must not be treated as proof that information does not exist.

Showing older chat messages in the UI does not change this Q&A input contract. Follow-up questions need enough context in their latest message.

### Client and API contract

Q&A deliberately remains a single-question feature so each request specifies its own subject and retrieves evidence without inheriting earlier answers. This applies to authenticated chats, shared-link chats, and Q&A without a course. The browser sends one `user` message. The streaming endpoint (`/api/chat/messages/stream`) and `chat.send` still accept a `messages` array for compatibility, but Q&A selects only its latest `user` entry; older entries do not provide context.

For “What is the dot product?” → “Give me an example”, the second request is independent. It must not inherit “dot product” from the first request. A particular clarification response is not guaranteed by code; include the subject in the question, as in “Give me an example of the dot product.” Tests assert the actual model input for both streaming and non-streaming Q&A.

## Selecting information for Q&A

Q&A retrieves information through tools as needed, then composes an answer. Different questions do not necessarily use the same search.

| Example question | Primary information source |
|---|---|
| “How many videos are in this course?” | Registered course and video metadata |
| “Summarize this lesson.” | Relevant subtitle scenes |
| “Show me this video's description.” | The saved description |

Two tools are available:

- `get_course_info`: Course name, description, video list, and related metadata. Up to 20 videos per page and 5 calls per answer.
- `search_scenes`: Semantic subtitle search across a course or a specified video within it. Up to 3 calls per answer.

The model can make up to 8 tool-enabled turns, after which tools are removed and it generates a final answer. The API validates arguments and access scope rather than executing model requests unchecked.

For course Q&A, the streaming API sends search progress immediately and sends the final answer once the agent finishes. Tool-call preambles are not sent as answers. Client cancellation or interrupted delivery cancels outstanding model and embedding requests.

## Citations and permissions

The model is instructed to attach `[N]` to claims supported by retrieved scenes. The API assigns the scene numbers and returns each scene's video and timestamps to the UI. Metadata such as course names and video counts does not receive scene citation numbers or timestamps.

The collector retains the retrieved scenes, not just those cited in the final prose. Citation data therefore describes the evidence made available; it is not an automatic proof of every sentence's correctness.

Search filters enforce the course access scope established by the API. Separately, prompt instructions tell the model to treat subtitles as reference material and ignore instructions embedded in them. The latter is model guidance, not a guarantee that prompt injection or unsupported claims are impossible.

## When evidence or services are unavailable

| Situation | Current behavior |
|---|---|
| A scene search returns no hits | The tool reports no matching scenes. The model can try another query within its allowance |
| Three scene searches have already run | Further searches return a limit message; the model is instructed to answer from acquired evidence or explain the missing support |
| A selected video ID is outside the course | The tool rejects that search without consuming a search attempt and tells the model to use valid IDs |
| Retrieved scenes only partly answer the question | The prompt asks for a supported partial answer with an explanation of its limits |
| Database or embedding execution fails | The exception propagates; it is not presented to the model as “no evidence,” and reserved answer usage is released by the chat flow |
| The answer provider fails or times out | The request follows the error path; the chat-model wrapper does not automatically retry provider calls |
| The final model response is blank or still contains tool calls | The request fails and releases reserved answer usage; an earlier preamble is never substituted as the answer |

Weak search matches can still be returned because the application currently has no minimum similarity cutoff. See [scene search](transcription-and-search.md). Prompt wording alone cannot fix missing transcript content or a mismatched embedding index.

## Answer quality is evaluated separately

For course chats, the API saves the question, answer, citations, and retrieved context. An asynchronous worker job evaluates the saved answer with RAGAS. The generation request does not wait for that evaluation to approve or rewrite the response.

| Stored metric | What it examines |
|---|---|
| `faithfulness` | Whether the answer's claims are supported by the retrieved material |
| `answer_relevancy` | Whether the answer addresses the question |
| `context_precision` | Whether the retrieved material is useful for the answer |

These are automated estimates, not verified grades or probabilities of correctness. The implementation uses reference-free metrics; it does not compare every response with a human-written correct answer. Context precision is skipped when no retrieved context exists. Individual metric failures can leave a value unset, while failure of the evaluation job is recorded as `failed`.

## Where to make changes

| Location | Role |
|---|---|
| [prompts/](https://github.com/yukiharada1228/videoq/tree/main/apps/api/src/lib/prompts) | Instructions and settings |
| [rag.ts](https://github.com/yukiharada1228/videoq/blob/main/apps/api/src/lib/rag.ts) | Q&A tool calls and answer generation |
| [rag-course-info.ts](https://github.com/yukiharada1228/videoq/blob/main/apps/api/src/lib/rag-course-info.ts) | Registered course and video metadata |

## What to check after a change

Test metadata-only questions, lesson-content questions, and questions requiring both, in English and Japanese. Check the selected tools and citations as well as the answer, and verify that information outside the course is not included.

`LLM_MODEL` is used for answers and generation; `EMBEDDING_MODEL` is used for search. Embeddings are fixed at 1536 dimensions, and the API and worker must also use the same model. Changing models requires regenerating existing vectors. See [embedding configuration and limitations](../guides/embeddings.md).

See [tests and verification commands](../guides/testing.md) for live-model tests and when they incur charges.
