"""PLOG composition-root DI wiring."""

from functools import lru_cache

from app.infrastructure.external.plog.checks import apply_deterministic_checks
from app.infrastructure.external.plog.embeddings import LangchainPlogEmbeddingGateway
from app.infrastructure.external.plog.extractor import LlmPlogConceptExtractor
from app.infrastructure.external.plog.guided_gateway import PlogGuidedChatGateway
from app.infrastructure.external.plog.hierarchy import RaptorHierarchyBuilder
from app.infrastructure.external.plog.runtime import merge_near_duplicate_concepts
from app.infrastructure.repositories.django_plog_repository import DjangoPlogRepository
from app.infrastructure.repositories.django_video_repository import DjangoVideoRepository
from app.infrastructure.scene_otsu.parsers import SubtitleParser
from app.infrastructure.tasks.task_gateway import CeleryVideoTaskGateway
from app.use_cases.plog.build_artifacts import BuildPlogArtifactsUseCase
from app.use_cases.plog.edit_graph import EditPlogGraphUseCase
from app.use_cases.plog.get_graph import GetPlogGraphUseCase
from app.use_cases.plog.manage_learner_state import (
    GetLearnerStateUseCase,
    ResetLearnerStateUseCase,
)
from app.use_cases.plog.rebuild import RebuildPlogUseCase


def _new_plog_repo() -> DjangoPlogRepository:
    return DjangoPlogRepository()


def _new_video_repo() -> DjangoVideoRepository:
    return DjangoVideoRepository()


@lru_cache(maxsize=1)
def _get_hierarchy_builder() -> RaptorHierarchyBuilder:
    return RaptorHierarchyBuilder()


@lru_cache(maxsize=1)
def _get_concept_extractor() -> LlmPlogConceptExtractor:
    return LlmPlogConceptExtractor()


@lru_cache(maxsize=1)
def _get_embedding_gateway() -> LangchainPlogEmbeddingGateway:
    return LangchainPlogEmbeddingGateway()


def get_build_plog_use_case() -> BuildPlogArtifactsUseCase:
    return BuildPlogArtifactsUseCase(
        video_repo=_new_video_repo(),
        plog_repo=_new_plog_repo(),
        hierarchy_builder=_get_hierarchy_builder(),
        concept_extractor=_get_concept_extractor(),
        embedding_gateway=_get_embedding_gateway(),
        parse_scenes=SubtitleParser.parse_srt_scenes,
        merge_concepts=merge_near_duplicate_concepts,
        apply_checks=apply_deterministic_checks,
    )


def get_plog_graph_use_case() -> GetPlogGraphUseCase:
    return GetPlogGraphUseCase(plog_repo=_new_plog_repo(), video_repo=_new_video_repo())


def get_rebuild_plog_use_case() -> RebuildPlogUseCase:
    return RebuildPlogUseCase(
        video_repo=_new_video_repo(),
        plog_repo=_new_plog_repo(),
        task_gateway=CeleryVideoTaskGateway(),
    )


def get_edit_plog_graph_use_case() -> EditPlogGraphUseCase:
    return EditPlogGraphUseCase(
        plog_repo=_new_plog_repo(),
        video_repo=_new_video_repo(),
        embedding_gateway=_get_embedding_gateway(),
    )


def get_learner_state_use_case() -> GetLearnerStateUseCase:
    return GetLearnerStateUseCase(plog_repo=_new_plog_repo(), video_repo=_new_video_repo())


def get_reset_learner_state_use_case() -> ResetLearnerStateUseCase:
    return ResetLearnerStateUseCase(plog_repo=_new_plog_repo(), video_repo=_new_video_repo())


def get_plog_guided_gateway() -> PlogGuidedChatGateway:
    return PlogGuidedChatGateway(plog_repo=_new_plog_repo())


def build_plog_artifacts(video_id: int) -> None:
    get_build_plog_use_case().execute(video_id)
