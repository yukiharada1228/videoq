import re
from collections import Counter

from app.chat import repositories

# Japanese: janome noun filtering
_JA_NOUN_POS = ("名詞",)
_JA_NOUN_EXCLUDE_SUBTYPES = ("非自立", "代名詞", "数", "接尾")
_JA_CHAR_RE = re.compile(r"[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]")

# English: NLTK POS tags for content words (nouns + adjectives)
_EN_CONTENT_TAGS = {"NN", "NNS", "NNP", "NNPS", "JJ", "JJR", "JJS"}

_janome_tokenizer = None


def aggregate_scenes(chat_logs):
    """Aggregate scene references from chat logs."""
    scene_counter: Counter = Counter()
    scene_info: dict = {}
    scene_questions: dict = {}

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


def build_video_file_map(video_ids, owner_user):
    """Build video_id -> file URL mapping."""
    video_file_map = {}
    for video in repositories.get_video_file_records(
        video_ids=video_ids,
        owner_user=owner_user,
    ):
        if video.file:
            try:
                video_file_map[video.id] = video.file.url
            except ValueError:
                video_file_map[video.id] = None
        else:
            video_file_map[video.id] = None
    return video_file_map


def filter_group_scenes(scene_counter, group, limit=None):
    """Keep only scenes that belong to videos currently in the group."""
    valid_video_ids = {member.video_id for member in group.members.all()}
    scenes = [
        (key, count)
        for key, count in scene_counter.most_common()
        if key[0] in valid_video_ids
    ]
    return scenes[:limit] if limit is not None else scenes


def build_popular_scenes(group, limit=None):
    """Return popular scenes derived from chat logs for a group."""
    chat_logs = repositories.get_group_chat_log_values(group, "question", "related_videos")
    scene_counter, scene_info, scene_questions = aggregate_scenes(chat_logs)
    top_scenes = filter_group_scenes(scene_counter, group, limit)
    video_ids = [key[0] for key, _ in top_scenes]
    video_file_map = build_video_file_map(video_ids, group.user)

    return [
        {
            "video_id": scene_info[key]["video_id"],
            "title": scene_info[key]["title"],
            "start_time": scene_info[key]["start_time"],
            "end_time": scene_info[key]["end_time"],
            "reference_count": count,
            "file": video_file_map.get(key[0]),
            "questions": scene_questions.get(key, []),
        }
        for key, count in top_scenes
    ]


def _get_janome_tokenizer():
    global _janome_tokenizer
    if _janome_tokenizer is None:
        from janome.tokenizer import Tokenizer

        _janome_tokenizer = Tokenizer()
    return _janome_tokenizer


def _extract_ja_nouns(text, tokenizer):
    nouns = []
    for token in tokenizer.tokenize(text):
        pos = token.part_of_speech.split(",")
        if pos[0] in _JA_NOUN_POS and pos[1] not in _JA_NOUN_EXCLUDE_SUBTYPES:
            if len(token.surface) >= 2:
                nouns.append(token.surface)
    return nouns


def _extract_en_keywords(text):
    import nltk

    tokens = nltk.word_tokenize(text.lower())
    tagged = nltk.pos_tag(tokens)
    return [
        word
        for word, tag in tagged
        if tag in _EN_CONTENT_TAGS and len(word) >= 2 and word.isalpha()
    ]


def extract_keywords(questions, limit=30):
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


def build_chat_analytics(group):
    """Return analytics payload for a group's chat logs."""
    total, date_range = repositories.get_group_chat_date_range(group=group)

    logs_for_scenes = repositories.get_group_chat_log_values(
        group,
        "question",
        "related_videos",
    )
    scene_counter, scene_info, _ = aggregate_scenes(logs_for_scenes)
    top_scenes = filter_group_scenes(scene_counter, group)
    scene_distribution = [
        {
            "video_id": scene_info[key]["video_id"],
            "title": scene_info[key]["title"],
            "start_time": scene_info[key]["start_time"],
            "end_time": scene_info[key]["end_time"],
            "question_count": count,
        }
        for key, count in top_scenes
    ]

    time_series = repositories.get_group_time_series(group=group)
    feedback_agg = repositories.get_group_feedback_aggregate(group=group)
    questions = repositories.get_group_questions(group=group)
    keywords = extract_keywords(questions)

    return {
        "summary": {
            "total_questions": total,
            "date_range": date_range,
        },
        "scene_distribution": scene_distribution,
        "time_series": time_series,
        "feedback": feedback_agg,
        "keywords": keywords,
    }
