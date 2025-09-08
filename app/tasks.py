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


def count_tokens(text: str, model: str = "text-embedding-3-small") -> int:
    """
    テキストのトークン数をカウントする
    """
    try:
        encoding = tiktoken.encoding_for_model(model)
        return len(encoding.encode(text))
    except Exception as e:
        print(f"Error counting tokens: {e}")
        # フォールバック: 概算（英語なら4文字=1トークン、日本語なら1文字=1トークン）
        return len(text) // 4


def truncate_text_to_token_limit(
    text: str, max_tokens: int = 8000, model: str = "text-embedding-3-small"
) -> str:
    """
    テキストをトークン制限内に収める（改善版）
    """
    if count_tokens(text, model) <= max_tokens:
        return text

    # トークン数を超えている場合、テキストを短縮
    encoding = tiktoken.encoding_for_model(model)
    tokens = encoding.encode(text)

    if len(tokens) > max_tokens:
        # より良い短縮方法：先頭と末尾の両方を保持
        front_tokens = tokens[: max_tokens // 2]  # 前半部分
        back_tokens = tokens[-(max_tokens // 2) :]  # 後半部分

        # 重複を避けて結合
        if len(front_tokens) + len(back_tokens) > max_tokens:
            # 重複が大きい場合は先頭部分のみ使用
            truncated_tokens = tokens[:max_tokens]
            truncated_text = encoding.decode(truncated_tokens)
        else:
            # 先頭と末尾を結合
            truncated_text = (
                encoding.decode(front_tokens) + "..." + encoding.decode(back_tokens)
            )

        print(
            f"Text truncated from {len(tokens)} to {count_tokens(truncated_text)} tokens"
        )
        return truncated_text

    return text


def extract_and_split_audio(input_path, max_size_mb=24):
    """
    動画から音声を抽出し、ファイルサイズに基づいて適切に分割する
    max_size_mb: 各セグメントの最大サイズ（MB）
    """
    try:
        # 動画の情報を取得
        probe = ffmpeg.probe(input_path)
        duration = float(probe["format"]["duration"])

        print(f"Video duration: {duration:.2f} seconds")

        # 一時ディレクトリを作成
        temp_dir = tempfile.gettempdir()
        audio_segments = []

        # まず全体の音声を抽出してサイズを確認
        temp_audio_path = os.path.join(
            temp_dir, f"temp_audio_{os.path.basename(input_path)}.mp3"
        )

        stream = ffmpeg.input(input_path)
        stream = ffmpeg.output(
            stream, temp_audio_path, acodec="mp3", audio_bitrate="128k"
        )
        ffmpeg.run(stream, overwrite_output=True, quiet=True)

        # 音声ファイルのサイズを確認
        audio_size_mb = os.path.getsize(temp_audio_path) / (1024 * 1024)
        print(f"Extracted audio size: {audio_size_mb:.2f} MB")

        if audio_size_mb <= max_size_mb:
            # サイズが制限内の場合は分割不要
            audio_segments.append(
                {"path": temp_audio_path, "start_time": 0, "end_time": duration}
            )
            print(f"Audio is within size limit, no splitting needed")

        else:
            # サイズが大きい場合は分割が必要
            # 音声ファイルを削除して、動画を時間で分割
            os.remove(temp_audio_path)

            # 分割数を計算（余裕を持って少し小さめに）
            safe_size_mb = max_size_mb * 0.8  # 20%の余裕
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

                # 音声を抽出
                stream = ffmpeg.input(
                    input_path, ss=start_time, t=end_time - start_time
                )
                stream = ffmpeg.output(
                    stream, audio_path, acodec="mp3", audio_bitrate="128k"
                )
                ffmpeg.run(stream, overwrite_output=True, quiet=True)

                # セグメントのサイズを確認
                segment_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
                print(
                    f"Segment {i+1} size: {segment_size_mb:.2f} MB ({start_time:.2f}s - {end_time:.2f}s)"
                )

                # まだ大きい場合は、さらに小さく分割
                if segment_size_mb > max_size_mb:
                    print(f"Segment {i+1} is still too large, subdividing...")
                    os.remove(audio_path)

                    # このセグメントをさらに分割
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
    セグメントからRAG用のチャンクを作成する（トークン数ベース）
    max_tokens_per_chunk: 各チャンクの最大トークン数
    overlap_tokens: チャンク間の重複トークン数
    """
    if not all_segments:
        return []

    # 全テキストを結合
    full_text = " ".join([seg["text"] for seg in all_segments])

    # トークン数ベースで分割
    encoding = tiktoken.encoding_for_model("text-embedding-3-small")
    tokens = encoding.encode(full_text)

    print(f"Total tokens in full text: {len(tokens)}")

    chunks = []
    chunk_index = 0

    # トークン数が制限内の場合は1つのチャンクとして扱う
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

    # トークン数ベースで分割
    i = 0
    while i < len(tokens):
        # チャンクの終了位置を決定
        end_pos = min(i + max_tokens_per_chunk, len(tokens))

        # チャンクのトークンを取得
        chunk_tokens = tokens[i:end_pos]
        chunk_text = encoding.decode(chunk_tokens)

        if not chunk_text.strip():
            i += max_tokens_per_chunk - overlap_tokens
            continue

        # このチャンクの時間範囲を計算
        # トークン位置に基づいて時間を推定
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

        # 次のチャンクの開始位置（重複を考慮）
        i += max_tokens_per_chunk - overlap_tokens

        # 無限ループ防止
        if i >= len(tokens):
            break

    print(f"Created {len(chunks)} chunks with max {max_tokens_per_chunk} tokens each")
    return chunks


def create_token_based_segments(all_segments, max_tokens_per_segment=7500):
    """
    セグメントをトークン数ベースで再分割する
    max_tokens_per_segment: 各セグメントの最大トークン数
    """
    if not all_segments:
        return []

    new_segments = []
    encoding = tiktoken.encoding_for_model("text-embedding-3-small")

    for segment in all_segments:
        text = segment["text"]
        tokens = encoding.encode(text)

        # トークン数が制限内の場合はそのまま使用
        if len(tokens) <= max_tokens_per_segment:
            new_segments.append(segment)
            continue

        # トークン数が制限を超えている場合は分割
        print(f"Splitting segment with {len(tokens)} tokens into smaller parts")

        # トークン数ベースで分割
        i = 0
        segment_index = 0
        while i < len(tokens):
            end_pos = min(i + max_tokens_per_segment, len(tokens))
            chunk_tokens = tokens[i:end_pos]
            chunk_text = encoding.decode(chunk_tokens)

            if not chunk_text.strip():
                i += max_tokens_per_segment
                continue

            # 時間範囲を推定
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
    try:
        video = Video.objects.get(id=video_id)
        video.status = "processing"
        video.save()
    except Video.DoesNotExist:
        print(f"Video with id {video_id} does not exist")
        return

    # ユーザーごとのAPIキーを取得
    user = video.user
    if not user.encrypted_openai_api_key:
        error_msg = "OpenAI API key not registered for this user"
        print(error_msg)
        video.status = "error"
        video.error_message = error_msg
        video.save()
        return

    try:
        api_key = decrypt_api_key(user.encrypted_openai_api_key)
    except Exception as e:
        error_msg = f"Failed to decrypt API key: {e}"
        print(error_msg)
        video.status = "error"
        video.error_message = error_msg
        video.save()
        return

    # Initialize OpenAI client
    try:
        client = OpenAI(api_key=api_key)
    except Exception as e:
        error_msg = f"Failed to initialize OpenAI client: {e}"
        print(error_msg)
        video.status = "error"
        video.error_message = error_msg
        video.save()
        return

    video_file_path = None
    audio_segments = []

    try:
        print(f"Starting transcription for video {video_id}")

        # S3対応: ファイルを一時ディレクトリにダウンロード
        # 一時ファイルを作成
        with tempfile.NamedTemporaryFile(
            delete=False, suffix=os.path.splitext(video.file.name)[1]
        ) as temp_file:
            # S3からファイルをダウンロード
            with video.file.open("rb") as source_file:
                shutil.copyfileobj(source_file, temp_file)
            video_file_path = temp_file.name

        # 音声を抽出・分割
        audio_segments = extract_and_split_audio(video_file_path)

        if not audio_segments:
            error_msg = "Failed to extract audio from video"
            print(error_msg)
            video.status = "error"
            video.error_message = error_msg
            video.save()
            return

        # 各セグメントを処理
        full_transcript = ""
        all_segments = []

        for i, segment_info in enumerate(audio_segments):
            print(f"Processing audio segment {i+1}/{len(audio_segments)}")

            # セグメントのサイズを確認
            segment_size = os.path.getsize(segment_info["path"]) / (1024 * 1024)
            print(f"Segment {i+1} size: {segment_size:.2f} MB")

            if segment_size > 25:
                print(
                    f"Warning: Segment {i+1} is still too large ({segment_size:.2f} MB)"
                )

            # Whisperで音声を文字起こし
            with open(segment_info["path"], "rb") as audio_file:
                transcription = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    response_format="verbose_json",
                    timestamp_granularities=["segment"],
                )

            # 文字起こし結果を保存
            segment_text = transcription.text
            full_transcript += segment_text + " "

            # 各セグメントのタイムスタンプを調整
            for whisper_segment in transcription.segments:
                # 元の動画の時間に調整
                adjusted_start = whisper_segment.start + segment_info["start_time"]
                adjusted_end = whisper_segment.end + segment_info["start_time"]

                all_segments.append(
                    {
                        "start": adjusted_start,
                        "end": adjusted_end,
                        "text": whisper_segment.text,
                    }
                )

        # トークン数ベースでセグメントを再分割
        print("Creating token-based segments for timestamp search...")
        token_based_segments = create_token_based_segments(
            all_segments, max_tokens_per_segment=7500
        )

        # タイムスタンプ検索用の細かいセグメントを作成
        print(
            f"Creating embeddings for {len(token_based_segments)} token-based segments..."
        )
        for i, segment in enumerate(token_based_segments):
            print(f"Creating embedding for segment {i+1}/{len(token_based_segments)}")

            # トークン数を確認（既に制限内に収まっているはず）
            segment_text = segment["text"]
            token_count = count_tokens(segment_text)
            print(f"Segment {i+1} token count: {token_count}")

            # 念のためチェック（通常は不要だが安全のため）
            if token_count > 8000:
                print(f"Warning: Segment {i+1} still exceeds limit, truncating...")
                segment_text = truncate_text_to_token_limit(segment_text)
                print(f"Segment {i+1} truncated to {count_tokens(segment_text)} tokens")

            # テキストの埋め込みを取得
            embedding_response = client.embeddings.create(
                model="text-embedding-3-small",
                input=segment_text,
                encoding_format="float",
            )

            # ベクトル検索サービスに保存（タイムスタンプ検索用セグメント）
            try:
                search_service = VectorSearchFactory.create_search_service(
                    user_id=video.user.id, openai_api_key=api_key
                )

                # タイムスタンプ検索用のメタデータを準備
                feature_document = {
                    "vector": embedding_response.data[0].embedding,
                    "video_id": str(video.id),
                    "video_title": video.title,
                    "timestamp": segment["start"],
                    "text": segment_text,
                    "type": "feature",
                }

                # ベクトル検索サービスに保存
                if VectorSearchFactory.is_opensearch_enabled():
                    search_service.opensearch.index(
                        index=search_service.features_index_name,
                        body=feature_document,
                        id=f"feature_{video.id}_{i}",
                        routing=str(video.user.id),
                    )
                elif VectorSearchFactory.is_pinecone_enabled():
                    # Pinecone用のデータ形式に変換
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

        # RAG用の大きなチャンクを作成（トークン数ベース）
        print("Creating RAG chunks with token-based splitting...")
        chunks = create_chunks_from_segments(
            all_segments, max_tokens_per_chunk=7500, overlap_tokens=500
        )

        for i, chunk in enumerate(chunks):
            print(f"Creating RAG chunk {i+1}/{len(chunks)}")

            # トークン数を確認（既に制限内に収まっているはず）
            chunk_text = chunk["text"]
            token_count = count_tokens(chunk_text)
            print(f"RAG chunk {i+1} token count: {token_count}")

            # 念のためチェック（通常は不要だが安全のため）
            if token_count > 8000:
                print(f"Warning: RAG chunk {i+1} still exceeds limit, truncating...")
                chunk_text = truncate_text_to_token_limit(chunk_text)
                print(f"RAG chunk {i+1} truncated to {count_tokens(chunk_text)} tokens")

            # チャンクの埋め込みを取得
            embedding_response = client.embeddings.create(
                model="text-embedding-3-small",
                input=chunk_text,
                encoding_format="float",
            )

            # ベクトル検索サービスに直接保存（RAG用チャンク）
            try:
                search_service = VectorSearchFactory.create_search_service(
                    user_id=video.user.id, openai_api_key=api_key
                )

                # チャンク用のメタデータを準備
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

                # ベクトル検索サービスに保存
                if VectorSearchFactory.is_opensearch_enabled():
                    search_service.opensearch.index(
                        index=search_service.chunks_index_name,
                        body=chunk_document,
                        id=f"chunk_{video.id}_{chunk['chunk_index']}",
                        routing=str(video.user.id),
                    )
                elif VectorSearchFactory.is_pinecone_enabled():
                    # Pinecone用のデータ形式に変換
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
                print(f"Warning: Failed to save chunk to vector search service: {e}")

        video.status = "completed"
        video.save()

        print(f"Successfully processed video {video_id}")
        print(f"Total fine-grained segments: {len(all_segments)}")
        print(f"Total RAG chunks: {len(chunks)}")

    except Exception as e:
        # Handle exceptions from the API or other processing
        error_msg = f"Error processing video {video_id}: {e}"
        print(error_msg)
        video.status = "error"
        video.error_message = str(e)
        video.save()
        return
    finally:
        # 一時ファイルを削除
        for segment_info in audio_segments:
            try:
                os.remove(segment_info["path"])
                print(f"Cleaned up temporary audio file: {segment_info['path']}")
            except Exception as e:
                print(f"Error cleaning up temporary file: {e}")

        # メインの一時ファイルも削除
        if video_file_path and os.path.exists(video_file_path):
            try:
                os.remove(video_file_path)
                print(f"Cleaned up temporary video file: {video_file_path}")
            except Exception as e:
                print(f"Error cleaning up temporary video file: {e}")
