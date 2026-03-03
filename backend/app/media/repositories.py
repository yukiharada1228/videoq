from app.models import Video, VideoGroupMember


def get_video_by_file(*, file_path: str):
    return Video.objects.filter(file=file_path).first()


def group_has_video(*, group, video) -> bool:
    return VideoGroupMember.objects.filter(group=group, video=video).exists()
