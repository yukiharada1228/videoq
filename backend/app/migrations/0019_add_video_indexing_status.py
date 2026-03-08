# Generated manually on 2026-03-06

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0018_alter_userapikey_access_level'),
    ]

    operations = [
        migrations.AlterField(
            model_name='video',
            name='status',
            field=models.CharField(
                choices=[
                    ('pending', 'Pending'),
                    ('processing', 'Processing'),
                    ('indexing', 'Indexing'),
                    ('completed', 'Completed'),
                    ('error', 'Error'),
                ],
                default='pending',
                max_length=20,
                db_index=True,
            ),
        ),
    ]
