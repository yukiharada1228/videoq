"""
Aurora PostgreSQL 上で pgvector 拡張を有効化し、
Django DatabaseCache 用テーブルを作成するマイグレーション。

- pgvector: Aurora PostgreSQL 15.4+ に標準搭載。
  既存の ChatLog モデルのベクトル埋め込みに使用済みだが、
  CREATE EXTENSION を明示的に実行することで Lambda 環境でも確実に有効化する。

- django_cache: USE_DATABASE_CACHE=true 時に DRF スロットリング等が使用する
  DatabaseCache バックエンドのテーブル。
  manage.py createcachetable の代わりにマイグレーションで管理する。
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0019_add_video_indexing_status"),
    ]

    operations = [
        # pgvector 拡張の有効化 (冪等)
        migrations.RunSQL(
            sql="CREATE EXTENSION IF NOT EXISTS vector;",
            reverse_sql="-- pgvector を削除するとデータが失われるため逆適用しない",
        ),
        # Django DatabaseCache テーブルの作成 (冪等)
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
