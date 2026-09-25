---
title: Sharing, invitations, and chat history
description: Compare course permissions, who uses the AI answer allowance, and what happens when access is removed.
---

# Sharing, invitations, and chat history

Choose **invitations** for access tied to named accounts, or a **share link** when anyone holding the URL may use the course without signing in. Both let learners watch course videos and use Q&A. **Their questions use the course owner's AI answer allowance, and the owner can read and export the saved conversations.**

An invitation must be accepted while signed in to an account whose verified email matches the recipient. Sending an invitation alone does not grant membership. A share link can be forwarded; it is not limited to the people the owner originally sent it to.

## Permissions by access route {#permissions}

This table covers ordinary course access through the app and its API. “Participant” means an account that has accepted an invitation. A person can have both membership and a share link; the route used for each request matters.

| Operation | Course owner | Invited participant | Share-link user |
|---|---|---|---|
| Open the course and play its videos | Yes, signed in | Yes, signed in | Yes, with the current link; login is optional |
| Ask Q&A questions | Yes | Yes | Yes |
| Edit/delete the course, change its videos or their order | Yes | No | No |
| Edit the source video or transcript | Video owner only | No permission granted by membership | No permission granted by the link |
| Manage invitations, participants, and the share link | Yes | No | No |
| Read saved course chat history, including other people's questions | Yes | No | No |
| Export course chat history as CSV or delete it | Yes | No | No |
| Leave an invited course | Remove a participant through member management | Yes, leave their own membership | No membership to leave |

Playback access applies to videos in the course. It does not grant access to the owner's whole video library or the source video's editing screen.

Participants and link users can see answers in their current chat panel, but cannot load saved course history or export even just their own past questions through the history API. The owner-only history includes Q&A exchanges. Visible messages and saved chat logs are different data.

## Example: teacher A and learner B {#usage-and-history}

Teacher A owns a course. Learner B accepts an invitation and asks from the signed-in course page:

1. The API checks B's access and reserves one response from **A's** AI answer allowance before answering. B's own allowance is not charged.
2. A can read the saved question and answer in **History**, export them as CSV, and see B's user ID, username, and email address as the questioner. Other participants cannot retrieve those logs.
3. If B instead uses the public share URL, the allowance is still A's, but the log is marked as shared-origin and its questioner fields are empty in history and CSV—even if B is signed in. It does not identify which link visitor asked. Information B puts in the question text is still saved and visible to A.

The allowance is shared across requests charged to A's account, not allocated separately per learner or course. At A's AI answer limit, new Q&A requests charged to A are refused, including requests from A, invited participants, and link users. If A's account is blocked for excess storage, these chat requests are also refused. These checks do not themselves revoke membership or prevent opening the course and playing available videos.

The API reserves usage before generation and attempts to return the reservation when it cannot complete the answer. Reading a course or an existing answer does not reserve another AI answer. Separate rate limits can temporarily reject requests even when the owner still has allowance. See [the quota repository](https://github.com/yukiharada1228/videoq/blob/main/apps/api/src/repositories/quota-repository.ts) and [chat request handling](https://github.com/yukiharada1228/videoq/blob/main/apps/api/src/features/chat/message-service.ts).

## Removing access and keeping history {#removing-access}

| Owner action | What stops working | What remains |
|---|---|---|
| Revoke a pending invitation | That invitation can no longer be accepted | Other memberships and the share link; existing chat history |
| Remove an accepted participant | New course reads and chat requests through that membership | A valid public link can still be used; previous questions remain in owner history/CSV |
| Disable the share link | New course reads and chat requests using that link | Owner and invited-member access; previous shared-origin questions |
| Save a different share-link slug | The old URL no longer matches this course | The new URL works; memberships and history remain |
| Delete course chat history | Saved questions, answers, feedback, and their evaluations are deleted | Course access and membership |

Revoking an invitation applies to a **pending** invitation. After acceptance, remove the participant instead. Removing membership does not revoke a separate share link, and disabling a link does not remove participants. To stop both routes for someone who knows the link, remove their membership and disable or change the link as appropriate.

Access changes are checked on new requests. They do not recall copies, exported CSVs, or messages already displayed, and an already-authorized response may finish. Issued video playback URLs may remain usable: S3-compatible playback URLs are signed for one hour from issuance, and external video URLs have their own access rules. Changing the share slug does not permanently reserve the old slug; reusing it can make that URL work again. See [media URL handling](https://github.com/yukiharada1228/videoq/blob/main/apps/api/src/integrations/media.ts).

Removing a participant or disabling a link does **not** delete chat logs. To remove saved conversations, the owner uses the separate course chat-history deletion action. This removes the whole course history, not just one participant's questions, and does not erase exported copies.

## Choose, share, and verify {#walkthrough}

1. Open a course you own. Check its included videos and explain to learners that you can read their questions and answers.
2. For named participants, open **Manage members**, enter their email addresses, and send invitations. The recipient opens the email link, signs in with the matching verified email, and chooses **Accept and join**. Check the member list. For public access, open **Share**, save a share slug, then copy the URL.
3. Verify with a separate learner account or a signed-out browser, according to the chosen route. Check playback and chat, and the absence of course-editing and saved-history controls. A new Q&A response uses the owner's allowance.
4. As the owner, open **History** and export CSV if needed. Invited participants' questions have questioner details; link questions are marked as shared-origin. Use test questions suitable for the owner to read.
5. Test revocation through the same route: remove the participant or disable the link, then reload and make a new request. An already-open video or chat panel does not prove access is still authorized. Check the table above if a second route remains.

## Implementation references

| Responsibility | Source |
|---|---|
| Owner/member course reads, public link reads, owner-only edits and link changes | [course-repository.ts](https://github.com/yukiharada1228/videoq/blob/main/apps/api/src/repositories/course-repository.ts) |
| Verified-email acceptance, invitation revocation, member removal | [course-invitation-repository.ts](https://github.com/yukiharada1228/videoq/blob/main/apps/api/src/repositories/course-invitation-repository.ts) |
| Chat access, allowance owner, actor, and persistence | [message-service.ts](https://github.com/yukiharada1228/videoq/blob/main/apps/api/src/features/chat/message-service.ts) |
| Owner-only history/CSV and shared-origin questioner fields | [chat-repository.ts](https://github.com/yukiharada1228/videoq/blob/main/apps/api/src/repositories/chat-repository.ts) |

**Related:** [Authentication and access control](auth.md), [Videos, courses, and scenes](domain-model.md).
