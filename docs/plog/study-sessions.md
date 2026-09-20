---
title: Resuming study and starting over
description: When temporary Study progress continues, expires, or starts again, and how it differs from chat history.
---

# Resuming study and starting over

Study keeps temporary progress for **12 hours after each successful progress save**. Opening the page, reading an answer, switching modes, and sending ordinary Q&A do not extend that deadline. This is not a permanent account-wide learning record: tomorrow's continuation depends on the remaining time and the browser session.

## Three different kinds of data

| Data | What it contains | What clears or replaces it |
|---|---|---|
| Displayed conversation | Messages in the current chat panel, including the previous tutor question | Reloading or leaving the panel, switching Q&A/Study, or **Start over** |
| Saved course chat history | Persisted questions and answers, including Study exchanges; available through owner-only history and CSV | The separate course-history deletion action; starting over does not delete it |
| Temporary Study progress | Active concept, reached concepts, hint position, and last progression grade | Expiry; **Start over** selects a new, empty progress session for this tab and route |

The displayed conversation is not restored from saved history. After a reload or mode switch, sending a reply can still continue an active concept. The grader uses the previous tutor message sent by the client, falling back to the concept's saved opening question if it is absent. If you no longer know what you were answering, use **Start over**. Sending “continue” is a study turn and can affect the hint/grade; it is not a read-only progress check.

## What continues?

Continuing requires the same browser-held identifier, server actor, course, and unexpired progress. The app stores the identifier per course or share link in `sessionStorage`; it does not store answers or grades there.

| Situation | Displayed conversation | Temporary progress |
|---|---|---|
| Reload in the same tab | Cleared | Continues on the next Study request if the identifier remains and progress has not expired |
| Switch Study → Q&A → Study | Cleared at each mode switch | Kept; Q&A does not renew its deadline |
| Leave the course and return in the same tab | A new panel is shown | Can continue for that course under the same conditions |
| Open a fresh tab without copied storage, another browser, or another device | New | New; signing in does not synchronize it |
| Duplicate a tab, or open one that copies its opener's storage | New panel | May share the original identifier and therefore the same server progress; the tabs can advance each other's progress |
| Use the public share page instead of the signed-in course page | New panel | Separate browser storage key; signing in while using the share page does not select the signed-in route's progress |
| Change the account on the signed-in course route | New account's access rules apply | Server actor changes, so the same browser identifier does not resume the previous account's progress |
| Reach the saved deadline without another successful Study save | Already displayed messages can remain | Expired; the next successful turn starts from empty progress |
| Close the tab or browser | Panel is gone | Continuation is not guaranteed; browser session restoration can retain the identifier, but cannot extend server expiry |

Browser behavior around opening and restoring tabs varies. See [MDN's sessionStorage lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage). Duplicated storage is an initial copy, not continuous synchronization. Starting over in one already-open tab does not update another tab's copied identifier.

If browser storage is blocked or full, the app keeps an identifier in the mounted panel and shows a warning. Replies can continue while that panel remains open; a reload can lose that continuation or return to an older stored identifier if writing the new one failed.

## Read the status and start over

1. Open a usable course and select **Study**. The notice says progress will be checked when you send; it does not infer saved progress merely from a locally stored identifier.
2. After a successful turn, the notice reports **new progress** or **continued progress**, and the server-confirmed expiry in your browser's local time. New progress includes first use and an earlier session that is no longer available.
3. When the last confirmed deadline passes, the notice asks you to check on the next message. Another copied tab may have saved more recently, so the server remains authoritative. A disconnected or failed turn leaves status unconfirmed; the server may already have saved progress before delivery failed.
4. To restart, select **Start over**, read the confirmation, and confirm. This clears this panel's messages and draft and changes the identifier for this course/access route. Cancelling preserves them. The action itself sends no chat request and consumes no AI answer allowance.
5. Send what you want to study. The next turn uses empty progress, without grading the old reply or carrying over its hint position. It can begin with a prerequisite of the requested concept; “start over” does not force the first concept of every video.

The restart control is disabled while a response is in progress. It does not delete saved chat history, other courses' progress, another tab's progress, or PLOG content. The abandoned session remains subject to its existing expiry; another tab holding its identifier may continue and renew it. History deletion is a separate operation.

## API and storage boundaries

`chat.send` accepts `studySessionId`; the SSE request accepts `study_session_id`. Both successful Study responses can include `study_session: { status: "started" | "continued", expires_at: <Unix milliseconds> }`; for SSE this is on `done`. Metadata is returned only after a successful progress commit and chat response persistence. Without a session identifier, Study runs with empty state for that request and returns no persistent-session metadata. Q&A also has no Study metadata. Older API responses without metadata are displayed as unconfirmed.

The server scopes the identifier to its actor and course. Signed-in course requests use the requesting user as actor; shared-origin requests use the course owner even when the visitor is signed in. Session identifiers are not authorization: every request still needs course access. Leases and revisions serialize turns for one identifier, and lazy expiry checks enforce the deadline even if cleanup alarms are delayed. See [Study processing](https://github.com/yukiharada1228/videoq/blob/main/apps/api/src/lib/plog-study.ts) and [StudySession storage](https://github.com/yukiharada1228/videoq/blob/main/apps/api/src/durable-objects/study-session.ts).

`plog.resetLearnerState` is a separate owner-only API for deleting that owner's `learner_concept_states` DB rows for a video and reporting a count. It neither reads nor resets the current Study Durable Object. Do not use it as a replacement for **Start over**, and do not interpret `deleted: 0` as evidence that Study has no progress. See [resetLearnerStates](https://github.com/yukiharada1228/videoq/blob/main/apps/api/src/repositories/plog-repository.ts).

**Related:** [PLOG and study mode](README.md), [Troubleshooting](../guides/troubleshooting.md).
