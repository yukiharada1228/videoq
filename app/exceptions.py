"""
VideoQアプリケーション用のカスタム例外クラス
"""


class VideoQException(Exception):
    """VideoQアプリケーションの基底例外クラス"""

    def __init__(self, message, error_code=None, details=None):
        self.message = message
        self.error_code = error_code
        self.details = details or {}
        super().__init__(self.message)


class VideoProcessingError(VideoQException):
    """動画処理エラー"""

    def __init__(self, message, video_id=None, details=None):
        self.video_id = video_id
        super().__init__(
            message=message, error_code="VIDEO_PROCESSING_ERROR", details=details or {}
        )


class VectorSearchError(VideoQException):
    """ベクトル検索エラー"""

    def __init__(self, message, user_id=None, details=None):
        self.user_id = user_id
        super().__init__(
            message=message, error_code="VECTOR_SEARCH_ERROR", details=details or {}
        )


class OpenAIAPIError(VideoQException):
    """OpenAI APIエラー"""

    def __init__(self, message, api_type=None, details=None):
        self.api_type = api_type
        super().__init__(
            message=message, error_code="OPENAI_API_ERROR", details=details or {}
        )


class FileStorageError(VideoQException):
    """ファイルストレージエラー"""

    def __init__(self, message, file_path=None, details=None):
        self.file_path = file_path
        super().__init__(
            message=message, error_code="FILE_STORAGE_ERROR", details=details or {}
        )


class ShareAccessError(VideoQException):
    """共有アクセスエラー"""

    def __init__(self, message, share_token=None, details=None):
        self.share_token = share_token
        super().__init__(
            message=message, error_code="SHARE_ACCESS_ERROR", details=details or {}
        )


class ValidationError(VideoQException):
    """バリデーションエラー"""

    def __init__(self, message, field=None, details=None):
        self.field = field
        super().__init__(
            message=message, error_code="VALIDATION_ERROR", details=details or {}
        )
