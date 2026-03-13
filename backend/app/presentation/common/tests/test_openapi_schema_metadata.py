from django.test import SimpleTestCase

from app.presentation.chat.serializers import ChatLogSerializer
from app.presentation.chat.views import ChatHistoryView
from app.presentation.video.serializers import (
    TagDetailSerializer,
    VideoGroupDetailSerializer,
    VideoSerializer,
)
from app.presentation.video.views import TagDetailView, VideoDetailView, VideoGroupDetailView


class OpenApiSchemaMetadataTests(SimpleTestCase):
    def test_issue_429_views_have_explicit_serializer_metadata(self):
        """APIView classes referenced in issue #429 must expose serializer metadata."""
        expectations = [
            (ChatHistoryView, ChatLogSerializer),
            (VideoDetailView, VideoSerializer),
            (VideoGroupDetailView, VideoGroupDetailSerializer),
            (TagDetailView, TagDetailSerializer),
        ]
        for view_class, expected_serializer in expectations:
            with self.subTest(view=view_class.__name__):
                self.assertIs(
                    getattr(view_class, "serializer_class", None),
                    expected_serializer,
                )
