"""
Celeryタスク - Whisper文字起こし処理
"""

import logging
import os
import tempfile
from concurrent.futures import ThreadPoolExecutor

import ffmpeg
from app.models import Video
from app.utils.encryption import decrypt_api_key
from celery import shared_task
from openai import OpenAI

from .scene_otsu import SceneSplitter

logger = logging.getLogger(__name__)

# Whisper APIがサポートしている形式
SUPPORTED_FORMATS = {
    ".flac",
    ".m4a",
    ".mp3",
    ".mp4",
    ".mpeg",
    ".mpga",
    ".oga",
    ".ogg",
    ".wav",
    ".webm",
}


def format_time_for_srt(seconds):
    """
    Convert seconds to SRT time format (HH:MM:SS,mmm)
    """
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    whole_secs = int(secs)
    millis = int((secs - whole_secs) * 1000)
    return f"{hours:02d}:{minutes:02d}:{whole_secs:02d},{millis:03d}"


def create_srt_content(segments):
    """
    Create SRT subtitle content from segments
    """
    srt_lines = []
    for i, segment in enumerate(segments, 1):
        start_time = format_time_for_srt(segment["start"])
        end_time = format_time_for_srt(segment["end"])
        text = segment["text"].strip()

        # SRT形式に整形
        srt_lines.append(f"{i}")
        srt_lines.append(f"{start_time} --> {end_time}")
        srt_lines.append(text)
        srt_lines.append("")  # 空行で区切る

    return "\n".join(srt_lines)


def _count_scenes(srt_content):
    """
    Count the number of scenes in an SRT file
    """
    return len(
        [
            line
            for line in srt_content.split("\n")
            if line.strip() and line.strip().isdigit()
        ]
    )


def extract_and_split_audio(input_path, max_size_mb=24):
    """
    Extract audio from video and split appropriately based on file size
    max_size_mb: Maximum size of each segment (MB)
    """
    try:
        # Get video information
        probe = ffmpeg.probe(input_path)
        duration = float(probe["format"]["duration"])

        logger.info(f"Video duration: {duration:.2f} seconds")

        # Create temporary directory
        temp_dir = tempfile.gettempdir()
        audio_segments = []

        # First extract entire audio and check size
        temp_audio_path = os.path.join(
            temp_dir, f"temp_audio_{os.path.basename(input_path)}.mp3"
        )

        stream = ffmpeg.input(input_path)
        stream = ffmpeg.output(
            stream, temp_audio_path, acodec="mp3", audio_bitrate="128k"
        )
        ffmpeg.run(stream, overwrite_output=True, quiet=True)

        # Check audio file size
        audio_size_mb = os.path.getsize(temp_audio_path) / (1024 * 1024)
        logger.debug(f"Extracted audio size: {audio_size_mb:.2f} MB")

        if audio_size_mb <= max_size_mb:
            # No splitting needed if size is within limit
            audio_segments.append(
                {"path": temp_audio_path, "start_time": 0, "end_time": duration}
            )
            logger.debug(f"Audio is within size limit, no splitting needed")

        else:
            # Splitting needed if size is large
            # Delete audio file and split video by time
            os.remove(temp_audio_path)

            # Calculate number of segments (with some margin)
            safe_size_mb = max_size_mb * 0.8  # 20% margin
            num_segments = int(audio_size_mb / safe_size_mb) + 1
            segment_duration = duration / num_segments

            logger.info(
                f"Splitting into {num_segments} segments of ~{segment_duration:.2f} seconds each"
            )

            for i in range(num_segments):
                start_time = i * segment_duration
                end_time = min((i + 1) * segment_duration, duration)

                audio_path = os.path.join(
                    temp_dir, f"audio_segment_{i}_{os.path.basename(input_path)}.mp3"
                )

                # Extract audio
                stream = ffmpeg.input(
                    input_path, ss=start_time, t=end_time - start_time
                )
                stream = ffmpeg.output(
                    stream, audio_path, acodec="mp3", audio_bitrate="128k"
                )
                ffmpeg.run(stream, overwrite_output=True, quiet=True)

                audio_segments.append(
                    {"path": audio_path, "start_time": start_time, "end_time": end_time}
                )

        return audio_segments

    except Exception as e:
        logger.error(f"Error extracting/splitting audio: {e}")
        return []


def transcribe_audio_segment(client, segment_info):
    """
    Transcribe a single audio segment
    """
    try:
        with open(segment_info["path"], "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                response_format="verbose_json",
                timestamp_granularities=["segment"],
            )
        return transcription, None
    except Exception as e:
        logger.error(f"Error transcribing segment: {e}")
        return None, e


@shared_task(bind=True, max_retries=3)
def transcribe_video(self, video_id):
    """
    Whisper APIを使用して動画の文字起こしを実行
    ffmpegで変換が必要な場合は自動的にMP3に変換

    Args:
        video_id: 文字起こし対象のVideoインスタンスのID

    Returns:
        str: 文字起こしされたテキスト
    """
    logger.info(f"Transcription task started for video ID: {video_id}")
    video_file_path = None
    audio_segments = []

    try:
        # Videoインスタンスを取得
        video = Video.objects.select_related("user").get(id=video_id)
        logger.info(f"Video found: {video.title}")

        # 状態を処理中に更新
        video.status = "processing"
        video.save()

        # ユーザーのOpenAI APIキーを取得
        if not video.user.encrypted_openai_api_key:
            raise ValueError("OpenAI API key is not configured")

        # APIキーを復号化
        api_key = decrypt_api_key(video.user.encrypted_openai_api_key)

        # OpenAIクライアントを初期化
        client = OpenAI(api_key=api_key)

        # 動画ファイルのパスを取得
        if not video.file:
            raise ValueError("Video file is not available")

        video_file_path = video.file.path

        # ファイルが存在するか確認
        if not os.path.exists(video_file_path):
            raise FileNotFoundError(f"Video file not found: {video_file_path}")

        logger.info(f"Starting transcription for video {video_id}")

        # Extract and split audio
        audio_segments = extract_and_split_audio(video_file_path)

        if not audio_segments:
            error_msg = "Failed to extract audio from video"
            logger.error(error_msg)
            video.status = "error"
            video.error_message = error_msg
            video.save()
            return

        # Process segments in parallel for better performance
        all_segments = []

        # Use ThreadPoolExecutor for parallel processing
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = []
            for i, segment_info in enumerate(audio_segments):
                future = executor.submit(transcribe_audio_segment, client, segment_info)
                futures.append((i, segment_info, future))

            for i, segment_info, future in futures:
                transcription, error = future.result()

                if error:
                    logger.error(f"Error in segment {i}: {error}")
                    continue

                # Adjust timestamps for each segment
                for whisper_segment in transcription.segments:
                    # Adjust to original video time
                    adjusted_start = whisper_segment.start + segment_info["start_time"]
                    adjusted_end = whisper_segment.end + segment_info["start_time"]

                    all_segments.append(
                        {
                            "start": adjusted_start,
                            "end": adjusted_end,
                            "text": whisper_segment.text,
                        }
                    )

        # Create SRT content
        srt_content = create_srt_content(all_segments)

        # Apply scene splitting using SceneSplitter
        logger.info("Applying scene splitting...")
        try:
            splitter = SceneSplitter(api_key=api_key)
            scene_split_srt = splitter.process(srt_content, max_tokens=512)
            scene_count = _count_scenes(scene_split_srt)
            logger.info(
                f"Scene splitting completed. Original: {len(all_segments)} segments, Scenes: {scene_count} scenes"
            )
        except Exception as e:
            logger.warning(f"Scene splitting failed: {e}. Using original SRT content.")
            scene_split_srt = srt_content

        # Save processed SRT
        video.transcript = scene_split_srt
        video.status = "completed"
        video.error_message = ""
        video.save()

        logger.info(f"Successfully processed video {video_id}")

        return scene_split_srt

    except Video.DoesNotExist:
        error_msg = f"Video with id {video_id} not found"
        logger.error(error_msg)
        self.retry(exc=Exception(error_msg), countdown=60)
        return None
    except Exception as e:
        # エラーを記録
        logger.error(f"Error in transcription task: {e}", exc_info=True)
        try:
            video = Video.objects.get(id=video_id)
            video.status = "error"
            video.error_message = str(e)
            video.save()
        except:
            pass

        # 最大リトライ回数に達していない場合、再試行
        if self.request.retries < self.max_retries:
            logger.info(
                f"Retrying transcription task (attempt {self.request.retries + 1}/{self.max_retries})"
            )
            self.retry(exc=e, countdown=60 * (self.request.retries + 1))

        raise e
    finally:
        # Delete temporary audio files only (not the original video file)
        for segment_info in audio_segments:
            try:
                if os.path.exists(segment_info["path"]):
                    os.remove(segment_info["path"])
            except Exception as e:
                logger.warning(f"Error cleaning up temporary audio file: {e}")
