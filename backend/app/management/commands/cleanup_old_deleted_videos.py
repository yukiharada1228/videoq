"""
Django management command to cleanup old soft-deleted video records.

This command deletes video records that were soft-deleted before the current month.
This is safe to run after monthly usage tracking is complete, as deleted videos
from previous months are no longer needed for usage calculations.

Usage:
    python manage.py cleanup_old_deleted_videos
    python manage.py cleanup_old_deleted_videos --dry-run  # Preview what would be deleted
"""

import logging
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from app.models import Video

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Delete video records that were soft-deleted before the current month"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview what would be deleted without actually deleting",
        )
        parser.add_argument(
            "--months",
            type=int,
            default=1,
            help="Number of months to keep deleted records (default: 1, meaning delete records from before current month)",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        months_to_keep = options["months"]

        # Calculate cutoff date: records deleted before this date will be removed
        now = timezone.now()
        first_day_of_current_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        # Subtract months_to_keep months to get the cutoff date
        # For months_to_keep=1, we delete records deleted before the current month
        if months_to_keep == 1:
            cutoff_date = first_day_of_current_month
        else:
            # Calculate the cutoff date by subtracting months
            cutoff_date = first_day_of_current_month
            for _ in range(months_to_keep - 1):
                # Go back one month
                if cutoff_date.month == 1:
                    cutoff_date = cutoff_date.replace(year=cutoff_date.year - 1, month=12)
                else:
                    cutoff_date = cutoff_date.replace(month=cutoff_date.month - 1)

        # Find videos that were soft-deleted before the cutoff date
        old_deleted_videos = Video.objects.filter(
            deleted_at__isnull=False,  # Only soft-deleted videos
            deleted_at__lt=cutoff_date,  # Deleted before cutoff date
        )

        count = old_deleted_videos.count()

        if count == 0:
            self.stdout.write(
                self.style.SUCCESS(
                    f"No old deleted videos found (cutoff date: {cutoff_date.strftime('%Y-%m-%d')})"
                )
            )
            return

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"DRY RUN: Would delete {count} video record(s) deleted before {cutoff_date.strftime('%Y-%m-%d %H:%M:%S')}"
                )
            )
            # Show some examples
            sample_videos = old_deleted_videos[:5]
            for video in sample_videos:
                self.stdout.write(
                    f"  - Video ID {video.id}: '{video.title}' (deleted at {video.deleted_at})"
                )
            if count > 5:
                self.stdout.write(f"  ... and {count - 5} more")
            return

        # Actually delete the records
        self.stdout.write(
            f"Deleting {count} video record(s) deleted before {cutoff_date.strftime('%Y-%m-%d %H:%M:%S')}..."
        )

        deleted_count = 0
        for video in old_deleted_videos.iterator(chunk_size=100):
            try:
                video_id = video.id
                video.delete()  # This will trigger post_delete signal and delete vectors
                deleted_count += 1
                if deleted_count % 100 == 0:
                    self.stdout.write(f"  Deleted {deleted_count}/{count} records...")
            except Exception as e:
                logger.error(f"Failed to delete video {video.id}: {e}", exc_info=True)
                self.stdout.write(
                    self.style.ERROR(f"  Failed to delete video {video.id}: {e}")
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully deleted {deleted_count} old deleted video record(s)"
            )
        )

