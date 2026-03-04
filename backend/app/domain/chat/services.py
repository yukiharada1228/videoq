"""
Domain services for the chat domain.
Pure business logic: keyword extraction and scene aggregation.
"""

import re
from collections import Counter
from typing import Dict, List, Optional, Tuple

# Japanese: janome noun filtering
_JA_NOUN_POS = ("名詞",)
_JA_NOUN_EXCLUDE_SUBTYPES = ("非自立", "代名詞", "数", "接尾")
_JA_CHAR_RE = re.compile(r"[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]")

# English: NLTK POS tags for content words (nouns + adjectives)
_EN_CONTENT_TAGS = {"NN", "NNS", "NNP", "NNPS", "JJ", "JJR", "JJS"}

_janome_tokenizer = None


def _get_janome_tokenizer():
    global _janome_tokenizer
    if _janome_tokenizer is None:
        from janome.tokenizer import Tokenizer

        _janome_tokenizer = Tokenizer()
    return _janome_tokenizer


def _extract_ja_nouns(text: str, tokenizer) -> List[str]:
    """Extract Japanese nouns using janome."""
    nouns = []
    for token in tokenizer.tokenize(text):
        pos = token.part_of_speech.split(",")
        if pos[0] in _JA_NOUN_POS and pos[1] not in _JA_NOUN_EXCLUDE_SUBTYPES:
            if len(token.surface) >= 2:
                nouns.append(token.surface)
    return nouns


def _extract_en_keywords(text: str) -> List[str]:
    """Extract English content words (nouns + adjectives) using NLTK POS tagging."""
    import nltk

    tokens = nltk.word_tokenize(text.lower())
    tagged = nltk.pos_tag(tokens)
    return [
        word
        for word, tag in tagged
        if tag in _EN_CONTENT_TAGS and len(word) >= 2 and word.isalpha()
    ]


def extract_keywords(questions: List[str], limit: int = 30) -> List[Dict]:
    """Extract top keywords using janome (Japanese) and NLTK (English)."""
    counter: Counter = Counter()
    tokenizer = _get_janome_tokenizer()

    for q in questions:
        if _JA_CHAR_RE.search(q):
            words = _extract_ja_nouns(q, tokenizer)
        else:
            words = _extract_en_keywords(q)
        for word in words:
            counter[word] += 1

    return [{"word": word, "count": count} for word, count in counter.most_common(limit)]


def aggregate_scenes(
    chat_logs,
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
        related_videos = log.get("related_videos")
        question = log.get("question", "")
        if not related_videos:
            continue
        for rv in related_videos:
            video_id = rv.get("video_id")
            start_time = rv.get("start_time")
            if not video_id or not start_time:
                continue

            key = (video_id, start_time)
            scene_counter[key] += 1

            if key not in scene_info:
                scene_info[key] = {
                    "video_id": video_id,
                    "title": rv.get("title", ""),
                    "start_time": start_time,
                    "end_time": rv.get("end_time") or start_time,
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
