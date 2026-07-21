"""Study-mode prompt shape: paper §3.3 fresh = latest learner turn only."""

from django.test import SimpleTestCase

from app.infrastructure.external.plog.guided_gateway import _STUDY_PROMPT


class PlogPromptCacheShapeTests(SimpleTestCase):
    def test_study_prompt_has_no_history_placeholder(self):
        """Static prefix is cached; generative call must not re-send chat history."""
        template_vars = {v for msg in _STUDY_PROMPT.messages for v in getattr(msg, "input_variables", [])}
        # Flatten via .format messages
        names = set(_STUDY_PROMPT.input_variables)
        self.assertEqual(names, {"system_prompt", "input"})
        self.assertNotIn("chat_history", names)
        del template_vars
