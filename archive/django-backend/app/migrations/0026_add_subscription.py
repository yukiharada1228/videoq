# Generated migration for Subscription model

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0025_rename_chatlog_related_videos_to_citations'),
    ]

    operations = [
        migrations.CreateModel(
            name='Subscription',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('plan', models.CharField(
                    choices=[
                        ('free', 'Free'),
                        ('lite', 'Lite'),
                        ('standard', 'Standard'),
                        ('enterprise', 'Enterprise'),
                    ],
                    default='free',
                    max_length=20,
                )),
                ('stripe_customer_id', models.CharField(blank=True, max_length=255, null=True, unique=True)),
                ('stripe_subscription_id', models.CharField(blank=True, max_length=255, null=True, unique=True)),
                ('stripe_status', models.CharField(blank=True, default='', max_length=50)),
                ('current_period_end', models.DateTimeField(blank=True, null=True)),
                ('cancel_at_period_end', models.BooleanField(default=False)),
                ('used_storage_bytes', models.BigIntegerField(default=0)),
                ('used_processing_seconds', models.IntegerField(default=0)),
                ('used_ai_answers', models.IntegerField(default=0)),
                ('usage_period_start', models.DateTimeField(blank=True, null=True)),
                ('custom_storage_gb', models.FloatField(blank=True, null=True)),
                ('custom_processing_minutes', models.IntegerField(blank=True, null=True)),
                ('custom_ai_answers', models.IntegerField(blank=True, null=True)),
                ('unlimited_processing_minutes', models.BooleanField(default=False)),
                ('unlimited_ai_answers', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='subscription',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'db_table': 'app_subscription',
            },
        ),
    ]
