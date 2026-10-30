-- Instructor (B2B2C) funnel, stages 3–5, counted from the database.
--
-- The landing funnel logs only link events that happen in the same tab within
-- 30 minutes. Sharing, student questions and paid plans usually happen later,
-- so they are counted here instead. Read-only; run against a replica or with a
-- read-only role:
--
--   psql "$DATABASE_URL" -v since=2026-11-01 -f apps/api/scripts/analytics/instructor-funnel.sql
--
-- `since` is the landing launch date. The cohort is every non-admin account
-- created on or after it, except students who only joined someone else's
-- course by invitation. The database does not know the acquisition source,
-- so compare this with the `audience=creator` landing events for the same
-- period.
--
-- Definitions
--   shared course    : share link set now, or any member invitation, or any
--                      chat that arrived through the share link. A share link
--                      that was later disabled leaves no trace unless a
--                      student used it.
--   student question : a chat in the course asked through the share link, or
--                      by anyone other than the course owner.
--   paid             : plan basic/pro with a Stripe status the billing code
--                      treats as active (active, trialing, past_due).

\set ON_ERROR_STOP on

WITH cohort AS (
  SELECT id, plan_code, subscription_status, created_at
  FROM users
  WHERE created_at >= :'since'::date
    AND role <> 'admin'
    AND NOT (EXISTS (SELECT 1 FROM video_course_memberships s WHERE s.user_id = users.id)
             AND NOT EXISTS (SELECT 1 FROM video_courses c WHERE c.user_id = users.id))
),
courses AS (
  SELECT c.id, c.user_id AS owner_id, c.created_at,
         c.share_slug IS NOT NULL AS has_link,
         EXISTS (SELECT 1 FROM video_course_members m WHERE m.course_id = c.id) AS has_video
  FROM video_courses c
  JOIN cohort u ON u.id = c.user_id
),
student_questions AS (
  SELECT l.course_id, count(*) AS questions, min(l.created_at) AS first_at
  FROM chat_logs l
  JOIN courses c ON c.id = l.course_id
  WHERE l.is_shared_origin OR l.user_id <> c.owner_id
  GROUP BY l.course_id
),
invites AS (
  SELECT course_id, count(*) AS invitations, min(created_at) AS first_at,
         count(*) FILTER (WHERE status = 'accepted') AS accepted
  FROM video_course_invitations
  WHERE course_id IN (SELECT id FROM courses)
  GROUP BY course_id
),
course_funnel AS (
  SELECT c.*,
         (c.has_link OR i.course_id IS NOT NULL OR q.course_id IS NOT NULL) AS shared,
         q.course_id IS NOT NULL AS has_student_question,
         coalesce(q.questions, 0) AS student_questions,
         q.first_at AS first_student_question_at
  FROM courses c
  LEFT JOIN invites i ON i.course_id = c.id
  LEFT JOIN student_questions q ON q.course_id = c.id
),
owner_funnel AS (
  SELECT u.id,
         u.plan_code IN ('basic', 'pro')
           AND u.subscription_status IN ('active', 'trialing', 'past_due') AS paid,
         bool_or(f.has_video) AS has_course_with_video,
         bool_or(f.shared) AS shared,
         bool_or(f.has_student_question) AS has_student_question
  FROM cohort u
  LEFT JOIN course_funnel f ON f.owner_id = u.id
  GROUP BY u.id, u.plan_code, u.subscription_status
)
SELECT 'owners: signed up'                       AS metric, count(*)                                          AS value FROM owner_funnel
UNION ALL SELECT 'owners: course with a video',     count(*) FILTER (WHERE has_course_with_video)                      FROM owner_funnel
UNION ALL SELECT 'owners: shared (stage 3)',        count(*) FILTER (WHERE shared)                                     FROM owner_funnel
UNION ALL SELECT 'owners: got a student question (stage 4)', count(*) FILTER (WHERE has_student_question)              FROM owner_funnel
UNION ALL SELECT 'owners: paid (stage 5)',          count(*) FILTER (WHERE paid)                                       FROM owner_funnel
UNION ALL SELECT 'owners: paid among sharers',      count(*) FILTER (WHERE paid AND shared)                            FROM owner_funnel
UNION ALL SELECT 'owners: paid among non-sharers',  count(*) FILTER (WHERE paid AND NOT coalesce(shared, false))        FROM owner_funnel
UNION ALL SELECT 'courses: shared',                 count(*) FILTER (WHERE shared)                                     FROM course_funnel
UNION ALL SELECT 'courses: shared with a student question', count(*) FILTER (WHERE shared AND has_student_question)     FROM course_funnel
UNION ALL SELECT 'courses: first student question within 14 days of creation',
                 count(*) FILTER (WHERE first_student_question_at < created_at + interval '14 days')                  FROM course_funnel
UNION ALL SELECT 'student questions: total',        coalesce(sum(student_questions), 0)                                FROM course_funnel;

-- Per shared course, for spot checks (newest first). No names, emails or
-- question text are selected.
WITH cohort AS (
  SELECT id FROM users WHERE created_at >= :'since'::date AND role <> 'admin'
)
SELECT c.id AS course_id,
       c.created_at::date AS created,
       c.share_slug IS NOT NULL AS has_link,
       (SELECT count(*) FROM video_course_members m WHERE m.course_id = c.id) AS videos,
       (SELECT count(*) FROM video_course_invitations i WHERE i.course_id = c.id) AS invitations,
       (SELECT count(*) FROM video_course_memberships s WHERE s.course_id = c.id) AS members,
       count(l.id) FILTER (WHERE l.is_shared_origin OR l.user_id <> c.user_id) AS student_questions,
       count(l.id) FILTER (WHERE NOT l.is_shared_origin AND l.user_id = c.user_id) AS owner_questions,
       min(l.created_at) FILTER (WHERE l.is_shared_origin OR l.user_id <> c.user_id)::date AS first_student_question
FROM video_courses c
JOIN cohort u ON u.id = c.user_id
LEFT JOIN chat_logs l ON l.course_id = c.id
GROUP BY c.id
HAVING c.share_slug IS NOT NULL
    OR EXISTS (SELECT 1 FROM video_course_invitations i WHERE i.course_id = c.id)
    OR count(l.id) FILTER (WHERE l.is_shared_origin) > 0
ORDER BY c.created_at DESC;
