from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from app.models import Video, Tag, VideoTag, VideoGroup, VideoGroupMember

User = get_user_model()

class NPlusOneTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="test", password="password")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        
        # Create tags
        self.tag1 = Tag.objects.create(user=self.user, name="Tag1", color="#000000")
        self.tag2 = Tag.objects.create(user=self.user, name="Tag2", color="#ffffff")

        # Create 5 videos with tags
        for i in range(5):
            video = Video.objects.create(
                user=self.user,
                title=f"Video {i}",
                status="completed"
            )
            VideoTag.objects.create(video=video, tag=self.tag1)
            VideoTag.objects.create(video=video, tag=self.tag2)

    def test_video_list_n_plus_one(self):
        url = reverse("video-list")
        
        # 1. Main Video Query (includes User join)
        # 2. VideoTag Query (includes Tag join) - Prefetch
        with self.assertNumQueries(2): 
            response = self.client.get(url)
            self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_video_group_detail_n_plus_one(self):
        # Create a group with videos
        group = VideoGroup.objects.create(user=self.user, name="Group 1")
        videos = Video.objects.all()
        for i, video in enumerate(videos):
            VideoGroupMember.objects.create(group=group, video=video, order=i)
            
        url = reverse("video-group-detail", kwargs={"pk": group.pk})
        
        # Expected queries:
        # 1. VideoGroup Query (includes User join)
        # 2. VideoGroupMember Query (prefetch 'members', joins 'video')
        # 3. VideoTag Query (nested prefetch 'video__video_tags', joins 'tag')
        with self.assertNumQueries(3):
            response = self.client.get(url)
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(len(response.data["videos"]), 5)
            self.assertTrue(len(response.data["videos"][0]["tags"]) > 0)

    def test_tag_detail_n_plus_one(self):
        # Use existing tag
        url = reverse("tag-detail", kwargs={"pk": self.tag1.pk})
        
        # Expected queries:
        # 1. Tag Query (includes video_count, no join needed for user as it is filtered by user?)
        # NOTE: TagDetailView.get_queryset uses:
        # Tag.objects.filter(user=...).annotate(...).prefetch_related(...)
        #
        # Queries:
        # 1. Tag query
        # 2. VideoTag query (prefetch 'video_tags', joins 'video')
        # 3. VideoTag query (nested prefetch 'video__video_tags', joins 'tag')
        with self.assertNumQueries(3):
            response = self.client.get(url)
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(len(response.data["videos"]), 5)

