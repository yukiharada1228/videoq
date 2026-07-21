"""Gateway ports for PLOG construction and guided generation helpers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Optional, Sequence


@dataclass
class TokenUsage:
    input_tokens: int = 0
    output_tokens: int = 0

    def add(self, other: "TokenUsage") -> "TokenUsage":
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
    hint_ladder: List[str] = field(default_factory=list)
    misconceptions: List[str] = field(default_factory=list)
    canonical_order: List[str] = field(default_factory=list)
    worked_examples: List[str] = field(default_factory=list)
    waypoints: List[dict] = field(default_factory=list)


@dataclass
class Stage1Result:
    concepts: List[ExtractedConcept]
    usage: TokenUsage = field(default_factory=TokenUsage)


@dataclass
class Stage2Result:
    edges: List[ExtractedEdge]
    learning_objects: List[ExtractedLearningObject]
    usage: TokenUsage = field(default_factory=TokenUsage)


@dataclass
class HierarchyBuildResult:
    nodes: List[dict]
    usage: TokenUsage = field(default_factory=TokenUsage)


class PlogHierarchyBuilder(ABC):
    @abstractmethod
    def build(self, scenes: Sequence[dict], api_key: Optional[str] = None) -> HierarchyBuildResult:
        ...


class PlogConceptExtractor(ABC):
    @abstractmethod
    def extract_inventory(
        self, transcript_text: str, scenes: Sequence[dict], api_key: Optional[str] = None
    ) -> Stage1Result:
        ...

    @abstractmethod
    def extract_edges_and_objects(
        self,
        transcript_text: str,
        concepts: Sequence[ExtractedConcept],
        scenes: Sequence[dict],
        api_key: Optional[str] = None,
    ) -> Stage2Result:
        ...


class PlogEmbeddingGateway(ABC):
    @abstractmethod
    def embed_texts(
        self, texts: Sequence[str], api_key: Optional[str] = None
    ) -> List[List[float]]:
        ...
