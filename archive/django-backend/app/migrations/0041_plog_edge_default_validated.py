from django.db import migrations, models


def accept_pending_edges(apps, schema_editor):
    PlogEdge = apps.get_model("app", "PlogEdge")
    PlogEdge.objects.filter(validation_status="pending").update(
        validation_status="validated"
    )


def revert_accepted_to_pending(apps, schema_editor):
    # Irreversible in spirit; leave accepted edges as-is on reverse.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0040_plog_models"),
    ]

    operations = [
        migrations.AlterField(
            model_name="plogedge",
            name="validation_status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("validated", "Validated"),
                    ("rejected", "Rejected"),
                ],
                db_index=True,
                default="validated",
                max_length=20,
            ),
        ),
        migrations.RunPython(accept_pending_edges, revert_accepted_to_pending),
    ]
