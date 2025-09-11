import os
import tempfile
import shutil
import ffmpeg
from celery import shared_task
from openai import OpenAI
from .models import Video
from app.crypto_utils import decrypt_api_key
from app.vector_search_factory import VectorSearchFactory
import tiktoken
import logging
from .exceptions import (
    VideoProcessingError,
    VectorSearchError,
    OpenAIAPIError,
    FileStorageError,
)
from .utils import log_operation, log_error

# Logger configuration
logger = logging.getLogger("app.tasks")


def count_tokens(text: str, model: str = "text-embedding-3-small") -> int:
    """
    Count tokens in text
    """
    try:
        encoding = tiktoken.encoding_for_model(model)
        return len(encoding.encode(text))
    except Exception as e:
        logger.warning(f"Error counting tokens: {e}")
        # Fallback: rough estimate (4 characters = 1 token for English, 1 character = 1 token for Japanese)
        return len(text) // 4


def truncate_text_to_token_limit(
    text: str, max_tokens: int = 8000, model: str = "text-embedding-3-small"
) -> str:
    """
    Keep text within token limits (improved version)
    """
    if count_tokens(text, model) <= max_tokens:
        return text

    # If token count exceeds limit, truncate text
    encoding = tiktoken.encoding_for_model(model)
    tokens = encoding.encode(text)

    if len(tokens) > max_tokens:
        # Better truncation method: keep both beginning and end
        front_tokens = tokens[: max_tokens // 2]  # First half
        back_tokens = tokens[-(max_tokens // 2) :]  # Second half

        # Combine avoiding overlap
        if len(front_tokens) + len(back_tokens) > max_tokens:
            # If overlap is large, use only the beginning part
            truncated_tokens = tokens[:max_tokens]
            truncated_text = encoding.decode(truncated_tokens)
        else:
            # Combine beginning and end
            truncated_text = (
                encoding.decode(front_tokens) + "..." + encoding.decode(back_tokens)
            )

        logger.info(
            f"Text truncated from {len(tokens)} to {count_tokens(truncated_text)} tokens"
        )
        return truncated_text

    return text


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
        logger.info(f"Extracted audio size: {audio_size_mb:.2f} MB")

        if audio_size_mb <= max_size_mb:
            # No splitting needed if size is within limit
            audio_segments.append(
                {"path": temp_audio_path, "start_time": 0, "end_time": duration}
            )
            logger.info(f"Audio is within size limit, no splitting needed")

        else:
            # Splitting needed if size is large
            # Delete audio file and split video by time
            os.remove(temp_audio_path)

            # Calculate number of segments (with some margin)
            safe_size_mb = max_size_mb * 0.8  # 20% margin
            num_segments = int(audio_size_mb / safe_size_mb) + 1
            segment_duration = duration / num_segments

            print(
                f"Splitting into {num_segments} segments of ~{segment_duration:.2f} seconds each"
            )
            print(f"Target size per segment: ~{safe_size_mb:.2f} MB")

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

                # Check segment size
                segment_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
                print(
                    f"Segment {i+1} size: {segment_size_mb:.2f} MB ({start_time:.2f}s - {end_time:.2f}s)"
                )

                # If still too large, split further into smaller pieces
                if segment_size_mb > max_size_mb:
                    print(f"Segment {i+1} is still too large, subdividing...")
                    os.remove(audio_path)

                    # Split this segment further
                    sub_segments = int(segment_size_mb / safe_size_mb) + 1
                    sub_duration = (end_time - start_time) / sub_segments

                    for j in range(sub_segments):
                        sub_start = start_time + (j * sub_duration)
                        sub_end = min(start_time + ((j + 1) * sub_duration), end_time)

                        sub_audio_path = os.path.join(
                            temp_dir,
                            f"audio_segment_{i}_{j}_{os.path.basename(input_path)}.mp3",
                        )

                        stream = ffmpeg.input(
                            input_path, ss=sub_start, t=sub_end - sub_start
                        )
                        stream = ffmpeg.output(
                            stream, sub_audio_path, acodec="mp3", audio_bitrate="128k"
                        )
                        ffmpeg.run(stream, overwrite_output=True, quiet=True)

                        sub_size_mb = os.path.getsize(sub_audio_path) / (1024 * 1024)
                        print(
                            f"  Sub-segment {i+1}.{j+1} size: {sub_size_mb:.2f} MB ({sub_start:.2f}s - {sub_end:.2f}s)"
                        )

                        audio_segments.append(
                            {
                                "path": sub_audio_path,
                                "start_time": sub_start,
                                "end_time": sub_end,
                            }
                        )
                else:
                    audio_segments.append(
                        {
                            "path": audio_path,
                            "start_time": start_time,
                            "end_time": end_time,
                        }
                    )

        return audio_segments

    except Exception as e:
        print(f"Error extracting/splitting audio: {e}")
        return []


def create_chunks_from_segments(
    all_segments, max_tokens_per_chunk=7500, overlap_tokens=500
):
    """
    Create RAG chunks from segments (token-based)
    max_tokens_per_chunk: Maximum tokens per chunk
    overlap_tokens: Overlapping tokens between chunks
    """
    if not all_segments:
        return []

    # Combine all text
    full_text = " ".join([seg["text"] for seg in all_segments])

    # Split based on token count
    encoding = tiktoken.encoding_for_model("text-embedding-3-small")
    tokens = encoding.encode(full_text)

    print(f"Total tokens in full text: {len(tokens)}")

    chunks = []
    chunk_index = 0

    # If token count is within limit, treat as single chunk
    if len(tokens) <= max_tokens_per_chunk:
        chunks.append(
            {
                "text": full_text,
                "start_time": all_segments[0]["start"],
                "end_time": all_segments[-1]["end"],
                "chunk_index": chunk_index,
            }
        )
        return chunks

    # Split based on token count
    i = 0
    while i < len(tokens):
        # Determine chunk end position
        end_pos = min(i + max_tokens_per_chunk, len(tokens))

        # Get chunk tokens
        chunk_tokens = tokens[i:end_pos]
        chunk_text = encoding.decode(chunk_tokens)

        if not chunk_text.strip():
            i += max_tokens_per_chunk - overlap_tokens
            continue

        # Calculate time range for this chunk
        # Estimate time based on token position
        token_ratio_start = i / len(tokens)
        token_ratio_end = end_pos / len(tokens)

        total_duration = all_segments[-1]["end"] - all_segments[0]["start"]
        start_time = all_segments[0]["start"] + (token_ratio_start * total_duration)
        end_time = all_segments[0]["start"] + (token_ratio_end * total_duration)

        chunks.append(
            {
                "text": chunk_text,
                "start_time": start_time,
                "end_time": end_time,
                "chunk_index": chunk_index,
            }
        )

        chunk_index += 1

        # Next chunk start position (considering overlap)
        i += max_tokens_per_chunk - overlap_tokens

        # Prevent infinite loop
        if i >= len(tokens):
            break

    print(f"Created {len(chunks)} chunks with max {max_tokens_per_chunk} tokens each")
    return chunks


def create_token_based_segments(all_segments, max_tokens_per_segment=7500):
    """
    Re-split segments based on token count
    max_tokens_per_segment: Maximum tokens per segment
    """
    if not all_segments:
        return []

    new_segments = []
    encoding = tiktoken.encoding_for_model("text-embedding-3-small")

    for segment in all_segments:
        text = segment["text"]
        tokens = encoding.encode(text)

        # If token count is within limit, use as is
        if len(tokens) <= max_tokens_per_segment:
            new_segments.append(segment)
            continue

        # Split if token count exceeds limit
        print(f"Splitting segment with {len(tokens)} tokens into smaller parts")

        # Split based on token count
        i = 0
        segment_index = 0
        while i < len(tokens):
            end_pos = min(i + max_tokens_per_segment, len(tokens))
            chunk_tokens = tokens[i:end_pos]
            chunk_text = encoding.decode(chunk_tokens)

            if not chunk_text.strip():
                i += max_tokens_per_segment
                continue

            # Estimate time range
            token_ratio_start = i / len(tokens)
            token_ratio_end = end_pos / len(tokens)

            segment_duration = segment["end"] - segment["start"]
            new_start = segment["start"] + (token_ratio_start * segment_duration)
            new_end = segment["start"] + (token_ratio_end * segment_duration)

            new_segments.append(
                {
                    "start": new_start,
                    "end": new_end,
                    "text": chunk_text,
                }
            )

            segment_index += 1
            i += max_tokens_per_segment

    print(
        f"Created {len(new_segments)} token-based segments from {len(all_segments)} original segments"
    )
    return new_segments


@shared_task
def process_video(video_id):
    """
    Video processing task
    Perform audio extraction, transcription, vectorization, and index saving
    """
    log_operation("process_video_started", video_id=video_id)

    try:
        video = Video.objects.select_related("user").get(id=video_id)
        video.status = "processing"
        video.save()
    except Video.DoesNotExist:
        log_error(f"Video with id {video_id} does not exist", video_id=video_id)
        raise VideoProcessingError(
            f"Video with id {video_id} does not exist", video_id=video_id
        )

    # Get API key for each user
    user = video.user
    if not user.encrypted_openai_api_key:
        error_msg = "OpenAI API key not registered for this user"
        log_error(error_msg, user_id=user.id, video_id=video_id)
        video.status = "error"
        video.error_message = error_msg
        video.save()
        raise VideoProcessingError(error_msg, video_id=video_id)

    try:
        api_key = decrypt_api_key(user.encrypted_openai_api_key)
    except Exception as e:
        error_msg = f"Failed to decrypt API key: {e}"
        log_error(error_msg, user_id=user.id, video_id=video_id)
        video.status = "error"
        video.error_message = error_msg
        video.save()
        raise VideoProcessingError(error_msg, video_id=video_id)

    # Initialize OpenAI client
    try:
        client = OpenAI(api_key=api_key)
    except Exception as e:
        error_msg = f"Failed to initialize OpenAI client: {e}"
        log_error(error_msg, user_id=user.id, video_id=video_id)
        video.status = "error"
        video.error_message = error_msg
        video.save()
        raise VideoProcessingError(error_msg, video_id=video_id)

    video_file_path = None
    audio_segments = []

    try:
        print(f"Starting transcription for video {video_id}")

        # S3 support: Download file to temporary directory
        # Create temporary file
        with tempfile.NamedTemporaryFile(
            delete=False, suffix=os.path.splitext(video.file.name)[1]
        ) as temp_file:
            # Download file from S3
            with video.file.open("rb") as source_file:
                shutil.copyfileobj(source_file, temp_file)
            video_file_path = temp_file.name

        # Extract and split audio
        audio_segments = extract_and_split_audio(video_file_path)

        if not audio_segments:
            error_msg = "Failed to extract audio from video"
            print(error_msg)
            video.status = "error"
            video.error_message = error_msg
            video.save()
            return

        # Process each segment
        full_transcript = ""
        all_segments = []

        for i, segment_info in enumerate(audio_segments):
            print(f"Processing audio segment {i+1}/{len(audio_segments)}")

            # Check segment size
            segment_size = os.path.getsize(segment_info["path"]) / (1024 * 1024)
            print(f"Segment {i+1} size: {segment_size:.2f} MB")

            if segment_size > 25:
                print(
                    f"Warning: Segment {i+1} is still too large ({segment_size:.2f} MB)"
                )

            # Transcribe audio with Whisper
            with open(segment_info["path"], "rb") as audio_file:
                transcription = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    response_format="verbose_json",
                    timestamp_granularities=["segment"],
                )

            # Save transcription results
            segment_text = transcription.text
            full_transcript += segment_text + " "

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

        # Re-split segments based on token count
        print("Creating token-based segments for timestamp search...")
        token_based_segments = create_token_based_segments(
            all_segments, max_tokens_per_segment=7500
        )

        # Create fine segments for timestamp search
        print(
            f"Creating embeddings for {len(token_based_segments)} token-based segments..."
        )
        for i, segment in enumerate(token_based_segments):
            print(f"Creating embedding for segment {i+1}/{len(token_based_segments)}")

            # Check token count (should already be within limits)
            segment_text = segment["text"]
            token_count = count_tokens(segment_text)
            print(f"Segment {i+1} token count: {token_count}")

            # Safety check (usually not needed but for safety)
            if token_count > 8000:
                print(f"Warning: Segment {i+1} still exceeds limit, truncating...")
                segment_text = truncate_text_to_token_limit(segment_text)
                print(f"Segment {i+1} truncated to {count_tokens(segment_text)} tokens")

            # Get text embedding
            embedding_response = client.embeddings.create(
                model="text-embedding-3-small",
                input=segment_text,
                encoding_format="float",
            )

            # Save to vector search service (timestamp search segments)
            try:
                search_service = VectorSearchFactory.create_search_service(
                    user_id=video.user.id, openai_api_key=api_key
                )

                # Prepare metadata for timestamp search
                feature_document = {
                    "vector": embedding_response.data[0].embedding,
                    "video_id": str(video.id),
                    "video_title": video.title,
                    "timestamp": segment["start"],
                    "text": segment_text,
                    "type": "feature",
                }

                # Save to vector search service
                if VectorSearchFactory.is_opensearch_enabled():
                    search_service.opensearch.index(
                        index=search_service.features_index_name,
                        body=feature_document,
                        id=f"feature_{video.id}_{i}",
                        routing=str(video.user.id),
                    )
                elif VectorSearchFactory.is_pinecone_enabled():
                    # Convert to Pinecone data format
                    feature_data = [
                        {
                            "vector": feature_document["vector"],
                            "video_id": feature_document["video_id"],
                            "video_title": feature_document["video_title"],
                            "timestamp": feature_document["timestamp"],
                            "text": feature_document["text"],
                            "type": feature_document["type"],
                        }
                    ]
                    search_service.upsert_features(feature_data)
            except Exception as e:
                print(f"Warning: Failed to save feature to vector search service: {e}")

        # Create large chunks for RAG (token-based)
        print("Creating RAG chunks with token-based splitting...")
        chunks = create_chunks_from_segments(
            all_segments, max_tokens_per_chunk=7500, overlap_tokens=500
        )

        for i, chunk in enumerate(chunks):
            print(f"Creating RAG chunk {i+1}/{len(chunks)}")

            # Check token count (should already be within limits)
            chunk_text = chunk["text"]
            token_count = count_tokens(chunk_text)
            print(f"RAG chunk {i+1} token count: {token_count}")

            # Safety check (usually not needed but for safety)
            if token_count > 8000:
                print(f"Warning: RAG chunk {i+1} still exceeds limit, truncating...")
                chunk_text = truncate_text_to_token_limit(chunk_text)
                print(f"RAG chunk {i+1} truncated to {count_tokens(chunk_text)} tokens")

            # Get chunk embedding
            embedding_response = client.embeddings.create(
                model="text-embedding-3-small",
                input=chunk_text,
                encoding_format="float",
            )

            # Save directly to vector search service (RAG chunks)
            try:
                search_service = VectorSearchFactory.create_search_service(
                    user_id=video.user.id, openai_api_key=api_key
                )

                # Prepare metadata for chunks
                chunk_document = {
                    "vector": embedding_response.data[0].embedding,
                    "video_id": str(video.id),
                    "video_title": video.title,
                    "start_time": chunk["start_time"],
                    "end_time": chunk["end_time"],
                    "chunk_index": chunk["chunk_index"],
                    "text": chunk_text,
                    "type": "chunk",
                }

                # Save to vector search service
                if VectorSearchFactory.is_opensearch_enabled():
                    search_service.opensearch.index(
                        index=search_service.chunks_index_name,
                        body=chunk_document,
                        id=f"chunk_{video.id}_{chunk['chunk_index']}",
                        routing=str(video.user.id),
                    )
                elif VectorSearchFactory.is_pinecone_enabled():
                    # Convert to Pinecone data format
                    chunk_data = [
                        {
                            "vector": chunk_document["vector"],
                            "video_id": chunk_document["video_id"],
                            "video_title": chunk_document["video_title"],
                            "start_time": chunk_document["start_time"],
                            "end_time": chunk_document["end_time"],
                            "chunk_index": chunk_document["chunk_index"],
                            "text": chunk_document["text"],
                            "type": chunk_document["type"],
                        }
                    ]
                    search_service.upsert_chunks(chunk_data)
            except Exception as e:
                logger.warning(f"Failed to save chunk to vector search service: {e}")

        video.status = "completed"
        video.save()

        log_operation(
            "process_video_completed",
            video_id=video_id,
            segments_count=len(all_segments),
            chunks_count=len(chunks),
        )
        logger.info(f"Successfully processed video {video_id}")
        logger.info(f"Total fine-grained segments: {len(all_segments)}")
        logger.info(f"Total RAG chunks: {len(chunks)}")

    except VideoQException as e:
        # For VideoQException, re-raise as is
        log_error(
            f"VideoQ error processing video {video_id}: {e.message}",
            user_id=user.id,
            video_id=video_id,
        )
        video.status = "error"
        video.error_message = str(e)
        video.save()
        raise
    except Exception as e:
        # Other exceptions
        error_msg = f"Error processing video {video_id}: {e}"
        log_error(error_msg, user_id=user.id, video_id=video_id)
        video.status = "error"
        video.error_message = str(e)
        video.save()
        raise VideoProcessingError(error_msg, video_id=video_id)
    finally:
        # Delete temporary files
        for segment_info in audio_segments:
            try:
                os.remove(segment_info["path"])
                logger.debug(f"Cleaned up temporary audio file: {segment_info['path']}")
            except Exception as e:
                logger.warning(f"Error cleaning up temporary file: {e}")

        # Also delete main temporary file
        if video_file_path and os.path.exists(video_file_path):
            try:
                os.remove(video_file_path)
                logger.debug(f"Cleaned up temporary video file: {video_file_path}")
            except Exception as e:
                logger.warning(f"Error cleaning up temporary video file: {e}")
