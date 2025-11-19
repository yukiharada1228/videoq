"""
Tests for prompts/loader module
"""

import json
import tempfile
from pathlib import Path
from unittest.mock import patch

from app.chat.prompts.loader import (PromptConfigurationError,
                                     build_system_prompt)
from django.test import TestCase


class PromptLoaderTests(TestCase):
    """Tests for prompt loader functions"""

    def setUp(self):
        """Set up test data"""
        # Create a temporary prompts.json file
        self.temp_dir = tempfile.mkdtemp()
        self.prompts_path = Path(self.temp_dir) / "prompts.json"

        # Default valid prompt configuration
        self.valid_config = {
            "rag": {
                "default": {
                    "header": "Role: {role}\nBackground: {background}\nRequest: {request}\nFormat: {format_instruction}",
                    "role": "You are a helpful assistant",
                    "background": "You help users with questions",
                    "request": "Answer questions based on provided context",
                    "format_instruction": "Provide clear and concise answers",
                    "rules": ["Be helpful", "Be accurate"],
                    "section_titles": {
                        "rules": "# Rules",
                        "format": "# Format",
                        "reference": "# Reference Materials",
                    },
                    "reference": {
                        "lead": "Reference materials:",
                        "footer": "End of references",
                        "empty": "No references available",
                    },
                }
            }
        }

    def _write_config(self, config):
        """Helper to write config to temp file"""
        with self.prompts_path.open("w", encoding="utf-8") as f:
            json.dump(config, f)

    def test_build_system_prompt_default_locale(self):
        """Test build_system_prompt with default locale"""
        with patch("app.chat.prompts.loader.PROMPTS_PATH", self.prompts_path):
            self._write_config(self.valid_config)
            # Clear cache
            from app.chat.prompts.loader import _load_prompt_config

            _load_prompt_config.cache_clear()

            prompt = build_system_prompt()

            self.assertIn("Role: You are a helpful assistant", prompt)
            self.assertIn("Background: You help users with questions", prompt)
            self.assertIn("# Rules", prompt)
            self.assertIn("1. Be helpful", prompt)
            self.assertIn("2. Be accurate", prompt)
            self.assertIn("# Format", prompt)
            self.assertIn("# Reference Materials", prompt)

    def test_build_system_prompt_with_references(self):
        """Test build_system_prompt with references"""
        with patch("app.chat.prompts.loader.PROMPTS_PATH", self.prompts_path):
            self._write_config(self.valid_config)
            from app.chat.prompts.loader import _load_prompt_config

            _load_prompt_config.cache_clear()

            references = ["Reference 1", "Reference 2"]
            prompt = build_system_prompt(references=references)

            self.assertIn("Reference materials:", prompt)
            self.assertIn("Reference 1", prompt)
            self.assertIn("Reference 2", prompt)
            self.assertIn("End of references", prompt)

    def test_build_system_prompt_without_references(self):
        """Test build_system_prompt without references"""
        with patch("app.chat.prompts.loader.PROMPTS_PATH", self.prompts_path):
            self._write_config(self.valid_config)
            from app.chat.prompts.loader import _load_prompt_config

            _load_prompt_config.cache_clear()

            prompt = build_system_prompt(references=None)

            self.assertIn("No references available", prompt)

    def test_build_system_prompt_with_empty_references(self):
        """Test build_system_prompt with empty references list"""
        with patch("app.chat.prompts.loader.PROMPTS_PATH", self.prompts_path):
            self._write_config(self.valid_config)
            from app.chat.prompts.loader import _load_prompt_config

            _load_prompt_config.cache_clear()

            prompt = build_system_prompt(references=[])

            self.assertIn("No references available", prompt)

    def test_build_system_prompt_with_locale(self):
        """Test build_system_prompt with specific locale"""
        config = {
            "rag": {
                "default": self.valid_config["rag"]["default"],
                "ja": {
                    "role": "あなたは親切なアシスタントです",
                },
            }
        }

        with patch("app.chat.prompts.loader.PROMPTS_PATH", self.prompts_path):
            self._write_config(config)
            from app.chat.prompts.loader import _load_prompt_config

            _load_prompt_config.cache_clear()

            prompt = build_system_prompt(locale="ja")

            self.assertIn("あなたは親切なアシスタントです", prompt)

    def test_build_system_prompt_missing_file(self):
        """Test build_system_prompt when prompts.json is missing"""
        with patch(
            "app.chat.prompts.loader.PROMPTS_PATH", Path("/nonexistent/prompts.json")
        ):
            from app.chat.prompts.loader import _load_prompt_config

            _load_prompt_config.cache_clear()

            with self.assertRaises(PromptConfigurationError):
                build_system_prompt()

    def test_build_system_prompt_missing_default_locale(self):
        """Test build_system_prompt when default locale is missing"""
        config = {"rag": {}}

        with patch("app.chat.prompts.loader.PROMPTS_PATH", self.prompts_path):
            self._write_config(config)
            from app.chat.prompts.loader import _load_prompt_config

            _load_prompt_config.cache_clear()

            with self.assertRaises(PromptConfigurationError):
                build_system_prompt()

    def test_build_system_prompt_missing_required_fields(self):
        """Test build_system_prompt when required fields are missing"""
        config = {
            "rag": {
                "default": {
                    "role": "You are a helpful assistant",
                    # Missing other required fields
                }
            }
        }

        with patch("app.chat.prompts.loader.PROMPTS_PATH", self.prompts_path):
            self._write_config(config)
            from app.chat.prompts.loader import _load_prompt_config

            _load_prompt_config.cache_clear()

            with self.assertRaises(PromptConfigurationError):
                build_system_prompt()

    def test_build_system_prompt_invalid_rules(self):
        """Test build_system_prompt when rules is not a list"""
        config = {
            "rag": {
                "default": {
                    **self.valid_config["rag"]["default"],
                    "rules": "not a list",
                }
            }
        }

        with patch("app.chat.prompts.loader.PROMPTS_PATH", self.prompts_path):
            self._write_config(config)
            from app.chat.prompts.loader import _load_prompt_config

            _load_prompt_config.cache_clear()

            with self.assertRaises(PromptConfigurationError):
                build_system_prompt()

    def test_build_system_prompt_empty_rules(self):
        """Test build_system_prompt with empty rules list"""
        config = {
            "rag": {
                "default": {
                    **self.valid_config["rag"]["default"],
                    "rules": [],
                }
            }
        }

        with patch("app.chat.prompts.loader.PROMPTS_PATH", self.prompts_path):
            self._write_config(config)
            from app.chat.prompts.loader import _load_prompt_config

            _load_prompt_config.cache_clear()

            prompt = build_system_prompt()
            # Should use default rule
            self.assertIn("1. Follow common-sense safety best practices.", prompt)
