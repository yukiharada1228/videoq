# Generated manually for PLOG models

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0039_tag_chip_label_colors"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PlogBuildJob",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("status", models.CharField(choices=[("pending", "Pending"), ("running", "Running"), ("ready", "Ready"), ("failed", "Failed")], db_index=True, default="pending", max_length=20)),
                ("error_message", models.TextField(blank=True, default="")),
                ("input_tokens", models.PositiveIntegerField(default=0)),
                ("output_tokens", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("finished_at", models.DateTimeField(blank=True, null=True)),
                ("video", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="plog_build_jobs", to="app.video")),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="PlogSummaryNode",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("level", models.PositiveSmallIntegerField(db_index=True, default=0)),
                ("text", models.TextField()),
                ("start_sec", models.FloatField(default=0.0)),
                ("end_sec", models.FloatField(default=0.0)),
                ("scene_indices", models.JSONField(blank=True, default=list)),
                ("embedding", models.JSONField(blank=True, default=list)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("parent", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="children", to="app.plogsummarynode")),
                ("video", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="plog_summary_nodes", to="app.video")),
            ],
            options={
                "ordering": ["level", "start_sec"],
            },
        ),
        migrations.CreateModel(
            name="PlogConcept",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("label", models.CharField(max_length=255)),
                ("node_type", models.CharField(choices=[("object", "Object"), ("property", "Property"), ("limitation", "Limitation")], default="object", max_length=20)),
                ("intro_sec", models.FloatField(default=0.0)),
                ("source_quote", models.TextField(blank=True, default="")),
                ("embedding", models.JSONField(blank=True, default=list)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("video", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="plog_concepts", to="app.video")),
            ],
            options={
                "ordering": ["intro_sec", "id"],
            },
        ),
        migrations.CreateModel(
            name="PlogEdge",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("edge_type", models.CharField(choices=[("prerequisite_of", "Prerequisite of"), ("builds_on", "Builds on"), ("analogy_for", "Analogy for"), ("example_of", "Example of"), ("contrasts_with", "Contrasts with")], max_length=32)),
                ("quote", models.TextField(blank=True, default="")),
                ("validation_status", models.CharField(choices=[("pending", "Pending"), ("validated", "Validated"), ("rejected", "Rejected")], db_index=True, default="pending", max_length=20)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("source", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="outgoing_edges", to="app.plogconcept")),
                ("target", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="incoming_edges", to="app.plogconcept")),
                ("video", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="plog_edges", to="app.video")),
            ],
            options={
                "ordering": ["id"],
            },
        ),
        migrations.CreateModel(
            name="PlogLearningObject",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("opening_question", models.TextField(blank=True, default="")),
                ("hint_ladder", models.JSONField(blank=True, default=list)),
                ("misconceptions", models.JSONField(blank=True, default=list)),
                ("canonical_order", models.JSONField(blank=True, default=list)),
                ("worked_examples", models.JSONField(blank=True, default=list)),
                ("waypoints", models.JSONField(blank=True, default=list)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("concept", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="learning_object", to="app.plogconcept")),
            ],
        ),
        migrations.CreateModel(
            name="LearnerConceptState",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("reached", models.BooleanField(db_index=True, default=False)),
                ("hint_index", models.PositiveSmallIntegerField(default=0)),
                ("last_grade", models.CharField(blank=True, default="", max_length=32)),
                ("active", models.BooleanField(default=False)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("concept", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="learner_states", to="app.plogconcept")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="learner_concept_states", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddIndex(
            model_name="plogbuildjob",
            index=models.Index(fields=["video", "-created_at"], name="app_plogbui_video_i_idx"),
        ),
        migrations.AddIndex(
            model_name="plogsummarynode",
            index=models.Index(fields=["video", "level"], name="app_plogsum_video_i_idx"),
        ),
        migrations.AddIndex(
            model_name="plogconcept",
            index=models.Index(fields=["video", "intro_sec"], name="app_plogcon_video_i_idx"),
        ),
        migrations.AddConstraint(
            model_name="plogconcept",
            constraint=models.UniqueConstraint(fields=("video", "label"), name="plog_concept_unique_label_per_video"),
        ),
        migrations.AddIndex(
            model_name="plogedge",
            index=models.Index(fields=["video", "edge_type"], name="app_plogedg_video_i_idx"),
        ),
        migrations.AddIndex(
            model_name="plogedge",
            index=models.Index(fields=["video", "validation_status"], name="app_plogedg_video_i_idx2"),
        ),
        migrations.AddConstraint(
            model_name="plogedge",
            constraint=models.UniqueConstraint(fields=("video", "source", "target", "edge_type"), name="plog_edge_unique_typed_pair"),
        ),
        migrations.AddConstraint(
            model_name="learnerconceptstate",
            constraint=models.UniqueConstraint(fields=("user", "concept"), name="learner_concept_state_unique"),
        ),
        migrations.AddIndex(
            model_name="learnerconceptstate",
            index=models.Index(fields=["user", "reached"], name="app_learner_user_id_idx"),
        ),
    ]
