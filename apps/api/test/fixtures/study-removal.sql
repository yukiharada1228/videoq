-- Populated pre-0023 schema: retained Q&A data and all six retired tables.
INSERT INTO users (id, email, username, max_video_upload_size_mb, is_over_quota,
                   used_ai_answers, used_processing_seconds, used_storage_bytes)
VALUES ('removal-owner', 'removal@example.test', 'removal-owner', 500, false, 1, 60, 100);

INSERT INTO videos (id, file, title, description, uploaded_at, transcript, status,
                    error_message, user_id, source_type, source_url, youtube_video_id)
VALUES (101, 'preserved.mp4', 'Preserved video', '', now(), 'Preserved transcript',
        'completed', '', 'removal-owner', 'uploaded', '', '');
INSERT INTO video_courses (id, name, description, created_at, updated_at, user_id, display_order)
VALUES (101, 'Preserved course', '', now(), now(), 'removal-owner', 0);
INSERT INTO video_course_members (added_at, "order", course_id, video_id)
VALUES (now(), 0, 101, 101);
INSERT INTO chat_logs (id, question, answer, citations, is_shared_origin, created_at,
                      user_id, course_id, retrieved_contexts)
VALUES (101, 'Preserved question', 'Preserved answer', '[]', false, now(),
        'removal-owner', 101, '["Preserved transcript"]');
INSERT INTO chat_log_evaluations (status, error_message, created_at, chat_log_id)
VALUES ('completed', '', now(), 101);
INSERT INTO scene_embeddings (langchain_id, content, embedding, user_id, video_id, langchain_metadata)
VALUES ('00000000-0000-4000-8000-000000000101', 'Preserved transcript',
        array_fill(0.25::real, ARRAY[1536])::vector, 'removal-owner', 101, '{}');

INSERT INTO plog_build_jobs (status, error_message, input_tokens, output_tokens,
                             created_at, updated_at, video_id)
VALUES ('completed', '', 10, 20, now(), now(), 101);
INSERT INTO plog_summary_nodes (level, text, start_sec, end_sec, scene_indices, embedding, created_at, video_id)
VALUES (0, 'Retired summary', 0, 10, '[]', '[]', now(), 101);
INSERT INTO plog_concepts (id, label, node_type, intro_sec, source_quote, embedding, created_at, video_id)
VALUES (101, 'Retired concept A', 'concept', 0, '', '[]', now(), 101),
       (102, 'Retired concept B', 'concept', 5, '', '[]', now(), 101);
INSERT INTO plog_edges (edge_type, quote, validation_status, created_at, source_id, target_id, video_id)
VALUES ('presentation_order', '', 'generated', now(), 101, 102, 101);
INSERT INTO plog_learning_objects (opening_question, hint_ladder, misconceptions,
                                   canonical_order, worked_examples, waypoints, created_at, concept_id)
VALUES ('Retired question', '[]', '[]', '[]', '[]', '[]', now(), 101);
INSERT INTO learner_concept_states (reached, hint_index, last_grade, active,
                                    updated_at, created_at, concept_id, user_id)
VALUES (true, 0, 'correct', true, now(), now(), 101, 'removal-owner');
