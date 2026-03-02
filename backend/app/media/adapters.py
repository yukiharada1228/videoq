from app.media.use_cases import GetProtectedMediaQuery


class GetProtectedMediaAdapter:
    def __init__(self, *, protected_media_resolver, video_access_authorizer):
        self._protected_media_resolver = protected_media_resolver
        self._video_access_authorizer = video_access_authorizer

    def __call__(self, query: GetProtectedMediaQuery):
        file_path, video = self._protected_media_resolver(query.path)
        self._video_access_authorizer(
            video=video,
            request_user=query.request_user,
            share_group=query.share_group,
        )
        return file_path, video
