---
title: Prompt design for Q&A and study mode
description: Selecting information for answers, citations, study mode, and evaluating changes.
---

# Prompt design for Q&A and study mode

Prompts contain instructions and reference material for AI. VideoQ answers using the user's question together with accessible course information and subtitles.

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

## Citations and permissions

Content answers include citation numbers and timestamps from retrieved subtitles. Metadata such as course names and video counts does not receive scene citation numbers or timestamps.

Search is restricted to a course whose access has already been verified. Instructions appearing in subtitles are treated as reference material and never take priority over system instructions.

## Study mode

Study mode uses [PLOG](../plog/README.md) concepts, prerequisite relationships, questions, and hints. It selects a target concept and unmastered prerequisites, evaluates the learner's answers, and updates progress.

The first question uses saved text. Subsequent support and evaluation use an LLM, with temporary state stored in `STUDY_SESSION`.

## Where to make changes

| Location | Role |
|---|---|
| [prompts/](https://github.com/yukiharada1228/videoq/tree/main/apps/api/src/lib/prompts) | Instructions and settings |
| [rag.ts](https://github.com/yukiharada1228/videoq/blob/main/apps/api/src/lib/rag.ts) | Q&A tool calls and answer generation |
| [rag-course-info.ts](https://github.com/yukiharada1228/videoq/blob/main/apps/api/src/lib/rag-course-info.ts) | Registered course and video metadata |
| [plog-study.ts](https://github.com/yukiharada1228/videoq/blob/main/apps/api/src/lib/plog-study.ts) | Study mode responses and evaluation |
| [plog_build.py](https://github.com/yukiharada1228/videoq/blob/main/apps/worker/worker_python/pipeline/plog_build.py) | Generating learning concepts, questions, and hints |

## What to check after a change

Test metadata-only questions, lesson-content questions, and questions requiring both, in English and Japanese. Check the selected tools and citations as well as the answer, and verify that information outside the course is not included.

`LLM_MODEL` is used for answers and generation; `EMBEDDING_MODEL` is used for search. Embeddings are fixed at 1536 dimensions, and the API and worker must also use the same model. Changing models requires regenerating existing vectors. See [embedding configuration and limitations](../guides/embeddings.md).

See [tests and verification commands](../guides/testing.md) for live-model tests and when they incur charges.
