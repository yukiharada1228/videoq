from __future__ import annotations

from urllib.parse import parse_qs, urlparse

from app.use_cases.video.exceptions import InvalidYoutubeUrl


_VALID_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
    "www.youtu.be",
}


def extract_youtube_video_id(url: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"} or parsed.netloc.lower() not in _VALID_HOSTS:
        raise InvalidYoutubeUrl("Invalid YouTube URL.")

    host = parsed.netloc.lower()
    if host.endswith("youtu.be"):
        candidate = parsed.path.strip("/").split("/")[0]
    elif parsed.path == "/watch":
        candidate = parse_qs(parsed.query).get("v", [""])[0]
    elif parsed.path.startswith("/embed/") or parsed.path.startswith("/shorts/"):
        candidate = parsed.path.strip("/").split("/")[1]
    else:
        candidate = ""

    if len(candidate) != 11 or not candidate.replace("-", "").replace("_", "").isalnum():
        raise InvalidYoutubeUrl("Invalid YouTube URL.")
    return candidate


def build_youtube_embed_url(video_id: str) -> str:
    return f"https://www.youtube.com/embed/{video_id}"
