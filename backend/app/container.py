"""
Dependency injection container.
Wraps factories.py in an instance-based pattern that can be replaced in tests.

Usage (production):
    from app.container import get_container
    use_case = get_container().get_create_video_use_case()

Usage (tests):
    from app.container import set_container, AppContainer
    class TestContainer(AppContainer):
        def get_create_video_use_case(self):
            return MockCreateVideoUseCase()
    set_container(TestContainer())
"""

from __future__ import annotations

from app import factories


class AppContainer:
    """Injectable DI container. Subclass or replace in tests via set_container()."""

    # ---------------------------------------------------------------------------
    # Video use cases
    # ---------------------------------------------------------------------------

    def get_list_videos_use_case(self):
        return factories.get_list_videos_use_case()

    def get_create_video_use_case(self):
        return factories.get_create_video_use_case()

    def get_video_detail_use_case(self):
        return factories.get_video_detail_use_case()

    def get_update_video_use_case(self):
        return factories.get_update_video_use_case()

    def get_delete_video_use_case(self):
        return factories.get_delete_video_use_case()

    # Video group use cases

    def get_list_groups_use_case(self):
        return factories.get_list_groups_use_case()

    def get_create_group_use_case(self):
        return factories.get_create_group_use_case()

    def get_video_group_use_case(self):
        return factories.get_video_group_use_case()

    def get_update_group_use_case(self):
        return factories.get_update_group_use_case()

    def get_delete_group_use_case(self):
        return factories.get_delete_group_use_case()

    def get_shared_group_use_case(self):
        return factories.get_shared_group_use_case()

    def get_add_video_to_group_use_case(self):
        return factories.get_add_video_to_group_use_case()

    def get_add_videos_to_group_use_case(self):
        return factories.get_add_videos_to_group_use_case()

    def get_remove_video_from_group_use_case(self):
        return factories.get_remove_video_from_group_use_case()

    def get_reorder_videos_use_case(self):
        return factories.get_reorder_videos_use_case()

    def get_create_share_link_use_case(self):
        return factories.get_create_share_link_use_case()

    def get_delete_share_link_use_case(self):
        return factories.get_delete_share_link_use_case()

    # Tag use cases

    def get_list_tags_use_case(self):
        return factories.get_list_tags_use_case()

    def get_create_tag_use_case(self):
        return factories.get_create_tag_use_case()

    def get_tag_detail_use_case(self):
        return factories.get_tag_detail_use_case()

    def get_update_tag_use_case(self):
        return factories.get_update_tag_use_case()

    def get_delete_tag_use_case(self):
        return factories.get_delete_tag_use_case()

    def get_add_tags_to_video_use_case(self):
        return factories.get_add_tags_to_video_use_case()

    def get_remove_tag_from_video_use_case(self):
        return factories.get_remove_tag_from_video_use_case()

    # ---------------------------------------------------------------------------
    # Chat use cases
    # ---------------------------------------------------------------------------

    def get_send_message_use_case(self):
        return factories.get_send_message_use_case()

    def get_submit_feedback_use_case(self):
        return factories.get_submit_feedback_use_case()

    def get_chat_history_use_case(self):
        return factories.get_chat_history_use_case()

    def get_export_history_use_case(self):
        return factories.get_export_history_use_case()

    def get_popular_scenes_use_case(self):
        return factories.get_popular_scenes_use_case()

    def get_chat_analytics_use_case(self):
        return factories.get_chat_analytics_use_case()

    # ---------------------------------------------------------------------------
    # Task use cases
    # ---------------------------------------------------------------------------

    def get_run_transcription_use_case(self):
        return factories.get_run_transcription_use_case()

    def get_delete_account_data_use_case(self):
        return factories.get_delete_account_data_use_case()

    def get_reindex_all_videos_use_case(self):
        return factories.get_reindex_all_videos_use_case()

    # ---------------------------------------------------------------------------
    # Infrastructure utilities
    # ---------------------------------------------------------------------------

    def get_file_url_resolver(self):
        return factories.get_file_url_resolver()


_container: AppContainer | None = None


def get_container() -> AppContainer:
    """Return the global application container (lazy singleton)."""
    global _container
    if _container is None:
        _container = AppContainer()
    return _container


def set_container(container: AppContainer) -> None:
    """Override the global container. Use in tests to inject mock dependencies."""
    global _container
    _container = container
