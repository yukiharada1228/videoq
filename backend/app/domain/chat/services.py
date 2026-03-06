"""
Domain services for the chat domain.
Pure business logic: scene aggregation and filtering.
Keyword extraction has been moved to infrastructure (app.infrastructure.chat.keyword_extractor)
and injected via the KeywordExtractor port (app.domain.chat.ports.KeywordExtractor).
"""

from collections import Counter
from typing import Dict, List, Optional, Tuple

from app.domain.chat.value_objects import ChatSceneLog


def aggregate_scenes(
    chat_logs: List[ChatSceneLog],
) -> Tuple[Counter, Dict, Dict]:
    """
    Aggregate scene references from chat logs.

    Returns:
        (scene_counter, scene_info, scene_questions)
    """
    scene_counter: Counter = Counter()
    scene_info: Dict = {}
    scene_questions: Dict = {}

    for log in chat_logs:
        question = log.question
        if not log.related_videos:
            continue
        for rv in log.related_videos:
            video_id = rv.video_id
            start_time = rv.start_time
            if not video_id or not start_time:
                continue

            key = (video_id, start_time)
            scene_counter[key] += 1

            if key not in scene_info:
                scene_info[key] = {
                    "video_id": rv.video_id,
                    "title": rv.title,
                    "start_time": rv.start_time,
                    "end_time": rv.end_time or rv.start_time,
                }

            if question:
                if key not in scene_questions:
                    scene_questions[key] = []
                if (
                    len(scene_questions[key]) < 3
                    and question not in scene_questions[key]
                ):
                    scene_questions[key].append(question)

    return scene_counter, scene_info, scene_questions


def filter_group_scenes(
    scene_counter: Counter,
    valid_video_ids: set,
    limit: Optional[int] = None,
) -> List[Tuple]:
    """Keep only scenes that belong to videos in valid_video_ids."""
    scenes = [
        (key, count)
        for key, count in scene_counter.most_common()
        if key[0] in valid_video_ids
    ]
    return scenes[:limit] if limit is not None else scenes
