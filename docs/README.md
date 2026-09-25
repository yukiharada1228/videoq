---
slug: /
sidebar_label: Introduction
description: Setup, core concepts, and development guides for new VideoQ contributors.
---

# VideoQ developer documentation

VideoQ is a **learning app that lets you ask questions about videos and jump straight to the scenes that support the answers**. Organize videos into courses, share them, and learn through Q&A or guided questions and hints.

This site helps new contributors run the app and make their first small change. You do not need to read every design diagram before getting started.

## Understand the AI

Start with [How AI builds an answer](concepts/how-ai-works.md) to follow one question through search, evidence, an answer, and a playable citation. It also explains what the AI reads and how much conversation context it receives.

Then explore [transcription and scene search](architecture/transcription-and-search.md), [Q&A prompts and answer evaluation](architecture/prompt-engineering.md), or [study-mode grading and hints](plog/README.md). The **AI behavior** menu groups these explanations together.

## New to the project?

Follow these steps to connect the user experience with the implementation.

| Step | Page | Ready to move on when… |
|---|---|---|
| 1 | [Run the development environment](getting-started/local-setup.md) | You can log in locally |
| 2 | [Add a video and ask questions](getting-started/first-walkthrough.md) | You can follow an answer's citation to a scene in the video |
| 3 | [Find your way around the code](getting-started/codebase.md) | You know where the UI, API, and video processing live |
| 4 | [Make your first change](getting-started/first-change.md) | You can submit a small change with verification results for review |

For documentation-only changes, start with [Update the documentation](guides/documentation.md).

## What to know first

- A **video** is one learning resource; a **course** groups videos for questions and sharing. [See the data model](concepts/domain-model.md)
- React handles the UI, Hono handles the API, and Python handles time-consuming video processing. [See the architecture](architecture/system-configuration-diagram.md)
- Transcription, search preparation, and learning data generation happen in sequence. Not every feature is ready immediately after upload. [Understand the states](design/state-diagram.md)

## Find the guide for your task

| What you want to do | Guide |
|---|---|
| Change screens, copy, or forms | [Change the frontend](guides/frontend.md) |
| Add data or operations to the API | [Change the API](guides/api.md) |
| Change tables or columns | [Change the database](guides/database.md) |
| Change transcription, indexing, or learning data | [Change asynchronous video processing](guides/worker.md) |
| Verify a change | [Tests and verification commands](guides/testing.md) |
| Troubleshoot startup or video processing | [Troubleshooting](guides/troubleshooting.md) |

## Explore the details

Use **Design reference** in the sidebar when you need a diagram or specification. Look up database names in the [data dictionary](database/data-dictionary.md) and abbreviations in the [glossary](reference/glossary.md).
