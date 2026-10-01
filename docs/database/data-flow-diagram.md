---
title: Where data is stored
description: Storage locations for video files, search data, questions and answers, and authentication data.
---

# Where data is stored

Video files and information about those videos are stored separately. When investigating a problem, first identify which kind of data you need to inspect.

## From video to search data

```mermaid
flowchart LR
    File[Video file] --> Store[(R2 / MinIO)]
    Store --> Worker[Python worker]
    Worker --> Transcript[(Transcript in videos)]
    Transcript --> Index[Generate embeddings]
    Index --> Scenes[(scene_embeddings)]
```

`videos` stores the title, owner, file reference, transcript, processing state, and related metadata. The file itself is not stored in a DB row.

`scene_embeddings` enables semantic search of transcript segments. The API converts questions into numeric search vectors and finds similar scenes within permitted videos.

## Questions and answers

```mermaid
flowchart LR
    Question[Question] --> Access[Check course access]
    Access --> Context[Retrieve metadata and subtitles]
    Context --> Answer[Structured answer and citations]
    Answer --> Browser[Stream text and validated citations]
    Answer --> Validate[Validate completed answer]
    Validate --> Logs[(chat_logs.response)]
    Validate --> Outbox[(external_tasks)]
    Outbox --> Evaluation[Asynchronous RAGAS evaluation]
    Logs --> Evaluation
    Evaluation --> Scores[(chat_log_evaluations)]
```

`chat_logs.response` stores `segments` and server-owned `sources` together. `retrieved_contexts` stores the deduplicated scene texts and returned course metadata for evaluation. The question, response, contexts, and evaluation delivery intent are saved in one transaction; the worker reads the completed record later. Partial stream events are not stored as separate chat records.

Chat records and answer evaluations use separate tables. The stream's `done` follows saving; it does not wait for RAGAS scoring. Responses without a course are not saved or evaluated.

## Other storage locations

| Data | Storage or management |
|---|---|
| Browser login state | Better Auth `session` and browser cookies |
| External API keys saved by users | Encrypted in the database |
| MCP API keys and OAuth | `apikey`, `oauth_*`, and related tables |
| Undelivered jobs | `external_tasks` |
| Worker execution records | `job_executions` |

**Related:** [Data dictionary](data-dictionary.md), [ER diagrams](er-diagram.md), [Job delivery and recovery](../architecture/flowchart.md).
