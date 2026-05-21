"""Integration tests for DjangoVideoRepository transcript defer behaviour."""

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext

from app.infrastructure.models import Video, VideoGroup, VideoGroupMember
from app.infrastructure.repositories.django_video_repository import (
    DjangoVideoGroupRepository,
    DjangoVideoRepository,
)

User = get_user_model()


def _sql_selects_transcript(queries) -> bool:
    return any('"transcript"' in q["sql"] or "`transcript`" in q["sql"] for q in queries)


class DjangoVideoRepositoryListForUserTranscriptTests(TestCase):
    """list_for_user must not load the transcript column."""

    def setUp(self):
        self.repo = DjangoVideoRepository()
        self.user = User.objects.create_user(
            username="listuser",
            email="list@example.com",
            password="pass",
        )
        Video.objects.create(
            user=self.user,
            title="Video A",
            status="completed",
            transcript="some long transcript",
        )

    def test_list_for_user_does_not_select_transcript_column(self):
        with CaptureQueriesContext(connection) as ctx:
            self.repo.list_for_user(self.user.id)

        self.assertFalse(
            _sql_selects_transcript(ctx.captured_queries),
            "list_for_user should not SELECT transcript",
        )


class DjangoVideoGroupRepositoryTranscriptTests(TestCase):
    """Group detail nested videos must not load the transcript column."""

    def setUp(self):
        self.repo = DjangoVideoGroupRepository()
        self.user = User.objects.create_user(
            username="groupuser",
            email="group@example.com",
            password="pass",
        )
        self.video = Video.objects.create(
            user=self.user,
            title="Video B",
            status="completed",
            transcript="another long transcript",
        )
        self.group = VideoGroup.objects.create(
            user=self.user, name="G", description=""
        )
        VideoGroupMember.objects.create(group=self.group, video=self.video, order=0)

    def test_get_by_id_with_videos_does_not_select_transcript_column(self):
        with CaptureQueriesContext(connection) as ctx:
            self.repo.get_by_id(self.group.id, self.user.id, include_videos=True)

        self.assertFalse(
            _sql_selects_transcript(ctx.captured_queries),
            "group detail nested videos should not SELECT transcript",
        )
