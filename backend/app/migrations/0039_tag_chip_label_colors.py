from django.db import migrations, models

# Legacy hex → Digital Agency ChipLabel palette
_HEX_TO_PALETTE = {
    "#3b82f6": "blue",
    "#10b981": "green",
    "#f59e0b": "yellow",
    "#ef4444": "red",
    "#8b5cf6": "purple",
    "#ec4899": "magenta",
    "#6366f1": "purple",
    "#14b8a6": "cyan",
    "#ff0000": "red",
    "#00ff00": "green",
    "#0000ff": "blue",
    "#111111": "gray",
    "#222222": "gray",
    "#ffffff": "gray",
    "#ab12f0": "purple",
}

_ALLOWED = frozenset(
    {
        "gray",
        "blue",
        "light-blue",
        "cyan",
        "green",
        "lime",
        "yellow",
        "orange",
        "red",
        "magenta",
        "purple",
    }
)


def forwards_map_colors(apps, schema_editor):
    Tag = apps.get_model("app", "Tag")
    for tag in Tag.objects.all().iterator():
        color = (tag.color or "").strip()
        if color in _ALLOWED:
            continue
        mapped = _HEX_TO_PALETTE.get(color.lower(), "blue")
        if tag.color != mapped:
            tag.color = mapped
            tag.save(update_fields=["color"])


def backwards_noop(apps, schema_editor):
    # Palette names cannot be losslessly restored to the original hex values.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("app", "0038_backfill_videogroup_display_order"),
    ]

    operations = [
        migrations.AlterField(
            model_name="tag",
            name="color",
            field=models.CharField(
                default="blue",
                help_text=(
                    "Digital Agency ChipLabel palette name "
                    "(gray, blue, light-blue, cyan, green, lime, yellow, orange, "
                    "red, magenta, purple)"
                ),
                max_length=20,
            ),
        ),
        migrations.RunPython(forwards_map_colors, backwards_noop),
    ]
