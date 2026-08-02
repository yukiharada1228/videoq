"""Gateway ports for PLOG construction and guided generation helpers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence
from dataclasses import dataclass, field


@dataclass
class TokenUsage:
    input_tokens: int = 0
    output_tokens: int = 0

    def add(self, other: TokenUsage) -> TokenUsage:
        return TokenUsage(
            input_tokens=self.input_tokens + other.input_tokens,
            output_tokens=self.output_tokens + other.output_tokens,
        )


@dataclass
class ExtractedConcept:
    label: str
    timestamp_sec: float
    node_type: str = "object"
    source_quote: str = ""


@dataclass
class ExtractedEdge:
    source_label: str
    target_label: str
    edge_type: str
    quote: str = ""


@dataclass
class ExtractedLearningObject:
    concept_label: str
    opening_question: str = ""
    hint_ladder: list[str] = field(default_factory=list)
    misconceptions: list[str] = field(default_factory=list)
    canonical_order: list[str] = field(default_factory=list)
    worked_examples: list[str] = field(default_factory=list)
    waypoints: list[dict] = field(default_factory=list)


@dataclass
class Stage1Result:
    concepts: list[ExtractedConcept]
    usage: TokenUsage = field(default_factory=TokenUsage)


@dataclass
class Stage2Result:
    edges: list[ExtractedEdge]
    learning_objects: list[ExtractedLearningObject]
    usage: TokenUsage = field(default_factory=TokenUsage)


@dataclass
class HierarchyBuildResult:
    nodes: list[dict]
    usage: TokenUsage = field(default_factory=TokenUsage)


class PlogHierarchyBuilder(ABC):
    @abstractmethod
    def build(self, scenes: Sequence[dict], api_key: str | None = None) -> HierarchyBuildResult:
        ...


class PlogConceptExtractor(ABC):
    @abstractmethod
    def extract_inventory(
        self, transcript_text: str, scenes: Sequence[dict], api_key: str | None = None
    ) -> Stage1Result:
        ...

    @abstractmethod
    def extract_edges_and_objects(
        self,
        transcript_text: str,
        concepts: Sequence[ExtractedConcept],
        scenes: Sequence[dict],
        api_key: str | None = None,
    ) -> Stage2Result:
        ...


class PlogEmbeddingGateway(ABC):
    @abstractmethod
    def embed_texts(
        self, texts: Sequence[str], api_key: str | None = None
    ) -> list[list[float]]:
        ...
