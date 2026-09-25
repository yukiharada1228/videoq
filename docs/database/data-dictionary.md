---
title: Data dictionary
description: Find tables by purpose and follow links to the actual column definitions.
---

# Data dictionary

Use this list to find the table containing the data you need. For complete column types, defaults, and constraints, see [modern.ts](https://github.com/yukiharada1228/videoq/blob/main/apps/api/src/db/schema/modern.ts) and [better-auth.ts](https://github.com/yukiharada1228/videoq/blob/main/apps/api/src/db/schema/better-auth.ts).

## Users and authentication

| Table | Stores |
|---|---|
| `users` | Users, quotas, billing relationships, and encrypted external API keys |
| `session` | Better Auth login sessions and expiration |
| `account` | Password credentials and identity-provider connections such as Google |
| `verification` | Verification data for email confirmation, password resets, and related flows |
| `apikey` | MCP API keys and access scopes |
| `jwks` | Keys used to sign OAuth tokens |
| `account_deletion_requests` | Account deletion requests |

## Videos, courses, and tags

| Table | Stores |
|---|---|
| `videos` | Video title, owner, file reference, transcript, and processing state |
| `video_courses` | Courses, owners, and sharing settings |
| `video_course_members` | **Videos** included in a course and their display order |
| `video_course_memberships` | Membership information for **people** using a course |
| `video_course_invitations` | Course invitations and their state |
| `tags` / `video_tags` | User tags / their associations with videos |

## Questions, answers, and evaluations

| Table | Stores |
|---|---|
| `chat_logs` | Questions, answers, citations, and user feedback |
| `chat_log_evaluations` | Evaluation results for each answer |
| `course_evaluation_snapshots` | Course-level evaluation aggregates |

## Search and PLOG

| Table | Stores and caveats |
|---|---|
| `scene_embeddings` | Subtitle segments and search embeddings; currently 1536 dimensions |
| `plog_build_jobs` | Learning data generation status |
| `plog_concepts` | Concepts extracted from videos |
| `plog_edges` | Prerequisites and other relationships between concepts |
| `plog_learning_objects` | Initial questions, hints, example misconceptions, and related content |
| `plog_summary_nodes` | Defined for hierarchical summaries; the current simplified generator does not populate it |
| `learner_concept_states` | Defined for learning state; current Study temporary state is stored separately in a Durable Object |

A table's existence does not mean the current pipeline writes to it. See the [current PLOG implementation](../plog/README.md).

## Delivery, duplicate protection, and billing

| Table | Stores |
|---|---|
| `external_tasks` | Work to dispatch externally and its delivery state |
| `job_executions` | Execution state of jobs received by the worker |
| `mcp_idempotency_records` | Records preventing duplicate effects from repeated MCP operations |
| `stripe_events` | Records preventing duplicate processing of received Stripe events |

## OAuth

| Table | Stores |
|---|---|
| `oauth_client` | Registered external clients |
| `oauth_resource` / `oauth_client_resource` | Target APIs and permitted client associations |
| `oauth_access_token` / `oauth_refresh_token` | Issued tokens and refresh information |
| `oauth_consent` | Scopes authorized by users for clients |
| `oauth_client_assertion` | Information preventing reuse of client authentication assertions |

## Common conventions

User IDs are UUIDs stored as text; videos, courses, and similar entities use numeric IDs. Timestamps are mostly stored with time zones and exposed by the API as UTC ISO-8601 values. Check each table's foreign keys and unique constraints for related-row deletion and duplicate prevention.

**Related:** [ER diagrams](er-diagram.md), [Change the database](../guides/database.md).
