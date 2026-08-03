"""VideoQ API と worker が共有する SQS job type contracts."""

JOB_TRANSCRIBE_VIDEO = "transcribe_video"
JOB_DELETE_ACCOUNT_DATA = "delete_account_data"
JOB_REINDEX_ALL_VIDEOS_EMBEDDINGS = "reindex_all_videos_embeddings"
JOB_INDEX_VIDEO_TRANSCRIPT = "index_video_transcript"
JOB_EVALUATE_CHAT_LOG = "evaluate_chat_log"
JOB_REINDEX_VIDEO_TRANSCRIPT = "reindex_video_transcript"
JOB_BUILD_PLOG = "build_plog"
