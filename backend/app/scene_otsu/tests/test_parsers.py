"""
Tests for scene_otsu parser functions
"""

from django.test import TestCase

from app.scene_otsu.parsers import SubtitleParser, scenes_to_srt_string
from app.scene_otsu.types import SceneSegment


class SubtitleParserParseSrtStringTests(TestCase):
    """Tests for SubtitleParser.parse_srt_string"""

    def test_parse_single_subtitle(self):
        """Test parsing single subtitle"""
        srt_content = """1
00:00:00,000 --> 00:00:05,000
Hello world"""

        result = SubtitleParser.parse_srt_string(srt_content)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0][0], "00:00:00,000")  # start
        self.assertEqual(result[0][1], "00:00:05,000")  # end
        self.assertEqual(result[0][2], "Hello world")  # text

    def test_parse_multiple_subtitles(self):
        """Test parsing multiple subtitles"""
        srt_content = """1
00:00:00,000 --> 00:00:05,000
Hello

2
00:00:05,000 --> 00:00:10,000
World"""

        result = SubtitleParser.parse_srt_string(srt_content)

        self.assertEqual(len(result), 2)
        self.assertEqual(result[0][2], "Hello")
        self.assertEqual(result[1][2], "World")

    def test_parse_multiline_text(self):
        """Test parsing multiline subtitle text"""
        srt_content = """1
00:00:00,000 --> 00:00:05,000
Hello
World
Test"""

        result = SubtitleParser.parse_srt_string(srt_content)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0][2], "Hello World Test")

    def test_parse_empty_string(self):
        """Test parsing empty string"""
        result = SubtitleParser.parse_srt_string("")
        self.assertEqual(result, [])

    def test_skip_invalid_blocks(self):
        """Test that invalid blocks are skipped"""
        srt_content = """1
00:00:00,000 --> 00:00:05,000
Valid

2
Invalid timing line
Should be skipped

3
00:00:10,000 --> 00:00:15,000
Also valid"""

        result = SubtitleParser.parse_srt_string(srt_content)

        self.assertEqual(len(result), 2)
        self.assertEqual(result[0][2], "Valid")
        self.assertEqual(result[1][2], "Also valid")

    def test_strip_whitespace(self):
        """Test that whitespace is handled properly"""
        srt_content = """1
  00:00:00,000 --> 00:00:05,000
  Hello world  """

        result = SubtitleParser.parse_srt_string(srt_content)

        self.assertEqual(len(result), 1)


class SubtitleParserParseSrtToItemsTests(TestCase):
    """Tests for SubtitleParser.parse_srt_to_items"""

    def test_returns_subtitle_items(self):
        """Test that SubtitleItems are returned"""
        srt_content = """1
00:00:00,000 --> 00:00:05,000
Hello world"""

        result = SubtitleParser.parse_srt_to_items(srt_content)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].index, 1)
        self.assertEqual(result[0].start_time, "00:00:00,000")
        self.assertEqual(result[0].end_time, "00:00:05,000")
        self.assertEqual(result[0].text, "Hello world")

    def test_calculates_seconds(self):
        """Test that start_sec and end_sec are calculated"""
        srt_content = """1
00:01:30,500 --> 00:02:00,000
Test"""

        result = SubtitleParser.parse_srt_to_items(srt_content)

        self.assertEqual(result[0].start_sec, 90.5)
        self.assertEqual(result[0].end_sec, 120.0)


class SubtitleParserParseSrtScenesTests(TestCase):
    """Tests for SubtitleParser.parse_srt_scenes"""

    def test_returns_dict_format(self):
        """Test that dict format is returned"""
        srt_content = """1
00:00:00,000 --> 00:00:05,000
Hello world"""

        result = SubtitleParser.parse_srt_scenes(srt_content)

        self.assertEqual(len(result), 1)
        self.assertIsInstance(result[0], dict)
        self.assertIn("index", result[0])
        self.assertIn("start_time", result[0])
        self.assertIn("end_time", result[0])
        self.assertIn("start_sec", result[0])
        self.assertIn("end_sec", result[0])
        self.assertIn("text", result[0])

    def test_multiple_scenes(self):
        """Test parsing multiple scenes"""
        srt_content = """1
00:00:00,000 --> 00:00:05,000
Scene one

2
00:00:05,000 --> 00:00:10,000
Scene two

3
00:00:10,000 --> 00:00:15,000
Scene three"""

        result = SubtitleParser.parse_srt_scenes(srt_content)

        self.assertEqual(len(result), 3)
        self.assertEqual(result[0]["text"], "Scene one")
        self.assertEqual(result[1]["text"], "Scene two")
        self.assertEqual(result[2]["text"], "Scene three")


class ScenesToSrtStringTests(TestCase):
    """Tests for scenes_to_srt_string function"""

    def test_single_scene(self):
        """Test converting single scene to SRT"""
        scenes = [
            SceneSegment(
                start_time="00:00:00,000",
                end_time="00:00:05,000",
                subtitles=["Hello world"],
            )
        ]

        result = scenes_to_srt_string(scenes)

        self.assertIn("1", result)
        self.assertIn("00:00:00,000 --> 00:00:05,000", result)
        self.assertIn("Hello world", result)

    def test_multiple_scenes(self):
        """Test converting multiple scenes to SRT"""
        scenes = [
            SceneSegment(
                start_time="00:00:00,000",
                end_time="00:00:05,000",
                subtitles=["Hello"],
            ),
            SceneSegment(
                start_time="00:00:05,000",
                end_time="00:00:10,000",
                subtitles=["World"],
            ),
        ]

        result = scenes_to_srt_string(scenes)

        self.assertIn("1", result)
        self.assertIn("2", result)
        self.assertIn("Hello", result)
        self.assertIn("World", result)

    def test_multiple_subtitles_in_scene(self):
        """Test scene with multiple subtitles"""
        scenes = [
            SceneSegment(
                start_time="00:00:00,000",
                end_time="00:00:05,000",
                subtitles=["Hello", "World", "Test"],
            )
        ]

        result = scenes_to_srt_string(scenes)

        self.assertIn("Hello World Test", result)

    def test_empty_scenes_list(self):
        """Test empty scenes list"""
        result = scenes_to_srt_string([])
        self.assertEqual(result, "")
