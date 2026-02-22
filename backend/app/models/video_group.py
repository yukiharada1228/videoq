from django.conf import settings
from django.db import models


class VideoGroup(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="video_groups",
        db_index=True,
    )
    name = models.CharField(max_length=255, help_text="Group name")
    description = models.TextField(blank=True, help_text="Group description")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Share token (for external sharing URLs)
    share_token = models.CharField(
        max_length=64,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        help_text="Share token",
    )

    # Define relationship with videos using ManyToManyField
    videos = models.ManyToManyField(
        "Video", through="VideoGroupMember", related_name="video_groups_through"
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(
                fields=["share_token"],
                condition=models.Q(share_token__isnull=False),
                name="videogroup_share_token_idx",
            ),
        ]

    def __str__(self):
        """
        Return a human-readable representation of the VideoGroup including its name and owner's identifier.

        If the related user has a `username` attribute that can be accessed, that username is shown; otherwise the owner's numeric ID is used in the form `user_<id>`.

        Returns:
            str: Formatted as "<name> (by <username>)" where `<username>` is the owner's username or "user_<user_id>" if username is not available.
        """
        try:
            username = self.user.username
        except AttributeError:
            username = f"user_{self.user_id}"
        return f"{self.name} (by {username})"


class VideoGroupMember(models.Model):
    group = models.ForeignKey(
        VideoGroup, on_delete=models.CASCADE, related_name="members", db_index=True
    )
    video = models.ForeignKey(
        "Video", on_delete=models.CASCADE, related_name="groups", db_index=True
    )
    added_at = models.DateTimeField(auto_now_add=True, db_index=True)
    order = models.IntegerField(
        default=0, db_index=True, help_text="Order within the group"
    )

    class Meta:
        ordering = ["order", "added_at"]
        unique_together = [
            "group",
            "video",
        ]  # Cannot add the same video to the same group multiple times
        indexes = [
            models.Index(fields=["group", "order"]),
            models.Index(fields=["video", "group"]),
        ]

    def __str__(self):
        """
        Provide a human-readable representation of the membership showing the video title and group name.

        The string is formatted as "<video_title> in <group_name>". If the related Video or VideoGroup is unavailable or lacks a title/name, the method falls back to "video_{video_id}" or "group_{group_id}" respectively.

        Returns:
            str: The formatted membership representation.
        """
        try:
            video_title = self.video.title
        except AttributeError:
            video_title = f"video_{self.video_id}"

        try:
            group_name = self.group.name
        except AttributeError:
            group_name = f"group_{self.group_id}"

        return f"{video_title} in {group_name}"
