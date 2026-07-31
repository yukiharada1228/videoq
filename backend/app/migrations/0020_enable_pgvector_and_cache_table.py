"""
Enable the pgvector extension on Aurora PostgreSQL and create the table used by
Django's DatabaseCache backend.

- pgvector: Included with Aurora PostgreSQL 15.4 and later. ChatLog already uses
  it for vector embeddings, but explicitly running CREATE EXTENSION ensures it
  is available in the Lambda environment.

- django_cache: The DatabaseCache backend table used by DRF throttling and
  related features when USE_DATABASE_CACHE=true. Manage it through this
  migration instead of manage.py createcachetable.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0019_add_video_indexing_status"),
    ]

    operations = [
        # Enable the pgvector extension (idempotent).
        migrations.RunSQL(
            sql="CREATE EXTENSION IF NOT EXISTS vector;",
            reverse_sql="-- No reverse operation: removing pgvector would lose data.",
        ),
        # Create the Django DatabaseCache table (idempotent).
        migrations.RunSQL(
            sql="""
            CREATE TABLE IF NOT EXISTS django_cache (
                cache_key VARCHAR(255) NOT NULL PRIMARY KEY,
                value TEXT NOT NULL,
                expires TIMESTAMP WITH TIME ZONE NOT NULL
            );
            CREATE INDEX IF NOT EXISTS django_cache_expires_idx
                ON django_cache (expires);
            """,
            reverse_sql="DROP TABLE IF EXISTS django_cache;",
        ),
    ]
