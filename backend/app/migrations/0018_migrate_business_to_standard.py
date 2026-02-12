"""Data migration: move existing 'business' subscriptions to 'standard'."""

from django.db import migrations


def migrate_business_to_standard(apps, schema_editor):
    Subscription = apps.get_model("app", "Subscription")
    Subscription.objects.filter(plan="business").update(plan="standard")


def reverse_migration(apps, schema_editor):
    # No reliable reverse; business plan no longer exists.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0017_add_usage_record"),
    ]

    operations = [
        migrations.RunPython(migrate_business_to_standard, reverse_migration),
    ]
