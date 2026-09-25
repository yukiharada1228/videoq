-- Minimal columns with the deletion relationships from 0001_new_schema.sql
-- and the subsequent group-to-course rename. Shared by API and Python tests.
CREATE TABLE videos (id integer PRIMARY KEY, user_id text NOT NULL, status text NOT NULL DEFAULT 'completed', file text NOT NULL DEFAULT '');
CREATE TABLE video_tags (id integer PRIMARY KEY, video_id integer REFERENCES videos ON DELETE CASCADE);
CREATE TABLE video_course_members (id integer PRIMARY KEY, video_id integer REFERENCES videos ON DELETE CASCADE);
-- These two tables deliberately have no FK to videos and require explicit cleanup.
CREATE TABLE scene_embeddings (id integer PRIMARY KEY, video_id integer);
CREATE TABLE mcp_idempotency_records (id integer PRIMARY KEY, user_id text, resource_id bigint, action text);

INSERT INTO videos (id, user_id) VALUES (10, 'owner'), (20, 'outsider');
INSERT INTO video_tags VALUES (1, 10), (2, 20);
INSERT INTO video_course_members VALUES (1, 10), (2, 20);
INSERT INTO scene_embeddings VALUES (1, 10), (2, 20);
INSERT INTO mcp_idempotency_records VALUES (1, 'owner', 10, 'request_video_upload'), (2, 'outsider', 20, 'create_youtube_video');
