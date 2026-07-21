"""ORM models for PLOG (Prerequisite-aware Learning-Object Graph)."""

from django.conf import settings
from django.db import models


class PlogBuildJob(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        RUNNING = "running", "Running"
        READY = "ready", "Ready"
        FAILED = "failed", "Failed"

    video = models.ForeignKey(
        "Video",
        on_delete=models.CASCADE,
        related_name="plog_build_jobs",
        db_index=True,
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    error_message = models.TextField(blank=True, default="")
    input_tokens = models.PositiveIntegerField(default=0)
    output_tokens = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["video", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"PlogBuildJob(video={self.video_id}, status={self.status})"


class PlogSummaryNode(models.Model):
    """L1 hierarchical summary node (RAPTOR-style)."""

    video = models.ForeignKey(
        "Video",
        on_delete=models.CASCADE,
        related_name="plog_summary_nodes",
        db_index=True,
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
    )
    level = models.PositiveSmallIntegerField(default=0, db_index=True)
    text = models.TextField()
    start_sec = models.FloatField(default=0.0)
    end_sec = models.FloatField(default=0.0)
    scene_indices = models.JSONField(default=list, blank=True)
    embedding = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["level", "start_sec"]
        indexes = [
            models.Index(fields=["video", "level"]),
        ]

    def __str__(self) -> str:
        return f"PlogSummaryNode(video={self.video_id}, level={self.level})"


class PlogConcept(models.Model):
    class NodeType(models.TextChoices):
        OBJECT = "object", "Object"
        PROPERTY = "property", "Property"
        LIMITATION = "limitation", "Limitation"

    video = models.ForeignKey(
        "Video",
        on_delete=models.CASCADE,
        related_name="plog_concepts",
        db_index=True,
    )
    label = models.CharField(max_length=255)
    node_type = models.CharField(
        max_length=20,
        choices=NodeType.choices,
        default=NodeType.OBJECT,
    )
    intro_sec = models.FloatField(default=0.0)
    source_quote = models.TextField(blank=True, default="")
    embedding = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["intro_sec", "id"]
        indexes = [
            models.Index(fields=["video", "intro_sec"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["video", "label"],
                name="plog_concept_unique_label_per_video",
            ),
        ]

    def __str__(self) -> str:
        return f"PlogConcept({self.label})"


class PlogEdge(models.Model):
    class EdgeType(models.TextChoices):
        PREREQUISITE_OF = "prerequisite_of", "Prerequisite of"
        BUILDS_ON = "builds_on", "Builds on"
        ANALOGY_FOR = "analogy_for", "Analogy for"
        EXAMPLE_OF = "example_of", "Example of"
        CONTRASTS_WITH = "contrasts_with", "Contrasts with"

    class ValidationStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        VALIDATED = "validated", "Validated"
        REJECTED = "rejected", "Rejected"

    ORDERING_TYPES = frozenset({EdgeType.PREREQUISITE_OF, EdgeType.BUILDS_ON})

    video = models.ForeignKey(
        "Video",
        on_delete=models.CASCADE,
        related_name="plog_edges",
        db_index=True,
    )
    source = models.ForeignKey(
        PlogConcept,
        on_delete=models.CASCADE,
        related_name="outgoing_edges",
    )
    target = models.ForeignKey(
        PlogConcept,
        on_delete=models.CASCADE,
        related_name="incoming_edges",
    )
    edge_type = models.CharField(max_length=32, choices=EdgeType.choices)
    quote = models.TextField(blank=True, default="")
    # Legacy column (paper accept/reject). Product ignores it: edges are used
    # while they exist; operators edit or delete.
    validation_status = models.CharField(
        max_length=20,
        choices=ValidationStatus.choices,
        default=ValidationStatus.VALIDATED,
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]
        indexes = [
            models.Index(fields=["video", "edge_type"]),
            models.Index(fields=["video", "validation_status"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["video", "source", "target", "edge_type"],
                name="plog_edge_unique_typed_pair",
            ),
        ]

    def __str__(self) -> str:
        return f"PlogEdge({self.source_id}->{self.target_id}:{self.edge_type})"


class PlogLearningObject(models.Model):
    concept = models.OneToOneField(
        PlogConcept,
        on_delete=models.CASCADE,
        related_name="learning_object",
    )
    opening_question = models.TextField(blank=True, default="")
    hint_ladder = models.JSONField(default=list, blank=True)
    misconceptions = models.JSONField(default=list, blank=True)
    canonical_order = models.JSONField(default=list, blank=True)
    worked_examples = models.JSONField(default=list, blank=True)
    waypoints = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"PlogLearningObject(concept={self.concept_id})"


class LearnerConceptState(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="learner_concept_states",
        db_index=True,
    )
    concept = models.ForeignKey(
        PlogConcept,
        on_delete=models.CASCADE,
        related_name="learner_states",
    )
    reached = models.BooleanField(default=False, db_index=True)
    hint_index = models.PositiveSmallIntegerField(default=0)
    last_grade = models.CharField(max_length=32, blank=True, default="")
    active = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "concept"],
                name="learner_concept_state_unique",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "reached"]),
        ]

    def __str__(self) -> str:
        return f"LearnerConceptState(user={self.user_id}, concept={self.concept_id})"
