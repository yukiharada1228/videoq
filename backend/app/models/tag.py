from django.conf import settings
from django.db import models


class Tag(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="tags",
        db_index=True,
    )
    name = models.CharField(max_length=50, db_index=True, help_text="Tag name")
    color = models.CharField(
        max_length=7,
        default="#3B82F6",
        help_text="Tag color in hex format (#RRGGBB)",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["name"]
        unique_together = ["user", "name"]
        indexes = [
            models.Index(fields=["user", "name"]),
        ]

    def __str__(self):
        """
        Return a human-readable representation of the tag including its creator.
        
        Returns:
            str: Formatted string "<name> (by <username>)" where <username> is the related user's
            username or "user_<user_id>" if the related user object lacks a `username` attribute.
        """
        try:
            username = self.user.username
        except AttributeError:
            username = f"user_{self.user_id}"
        return f"{self.name} (by {username})"


class VideoTag(models.Model):
    video = models.ForeignKey(
        "Video", on_delete=models.CASCADE, related_name="video_tags", db_index=True
    )
    tag = models.ForeignKey(
        Tag, on_delete=models.CASCADE, related_name="video_tags", db_index=True
    )
    added_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["tag__name"]
        unique_together = ["video", "tag"]
        indexes = [
            models.Index(fields=["video", "tag"]),
            models.Index(fields=["tag", "-added_at"]),
        ]

    def __str__(self):
        """
        Provide a human-readable representation of this VideoTag combining the tag name and video title.
        
        Returns:
            str: A string in the format "<tag_name> on <video_title>". If the related Tag or Video is missing, `tag_<tag_id>` or `video_<video_id>` is used respectively.
        """
        try:
            tag_name = self.tag.name
        except AttributeError:
            tag_name = f"tag_{self.tag_id}"

        try:
            video_title = self.video.title
        except AttributeError:
            video_title = f"video_{self.video_id}"

        return f"{tag_name} on {video_title}"