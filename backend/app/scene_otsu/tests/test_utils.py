"""
Tests for scene_otsu utility functions
"""

from django.test import TestCase

from app.scene_otsu.utils import TimestampConverter


class TimestampConverterSecondsToTimestampTests(TestCase):
    """Tests for TimestampConverter.seconds_to_timestamp"""

    def test_zero_seconds(self):
        """Test conversion of zero seconds"""
        result = TimestampConverter.seconds_to_timestamp(0)
        self.assertEqual(result, "00:00:00,000")

    def test_seconds_only(self):
        """Test conversion of seconds only"""
        result = TimestampConverter.seconds_to_timestamp(45)
        self.assertEqual(result, "00:00:45,000")

    def test_with_milliseconds(self):
        """Test conversion with milliseconds"""
        result = TimestampConverter.seconds_to_timestamp(45.123)
        self.assertEqual(result, "00:00:45,123")

    def test_minutes_and_seconds(self):
        """Test conversion of minutes and seconds"""
        result = TimestampConverter.seconds_to_timestamp(125)  # 2:05
        self.assertEqual(result, "00:02:05,000")

    def test_hours(self):
        """Test conversion with hours"""
        result = TimestampConverter.seconds_to_timestamp(3661.5)  # 1:01:01.5
        self.assertEqual(result, "01:01:01,500")

    def test_large_hours(self):
        """Test conversion with large hour values"""
        result = TimestampConverter.seconds_to_timestamp(36000)  # 10 hours
        self.assertEqual(result, "10:00:00,000")


class TimestampConverterParseTimestampTests(TestCase):
    """Tests for TimestampConverter.parse_timestamp"""

    def test_parse_zero_timestamp(self):
        """Test parsing zero timestamp"""
        result = TimestampConverter.parse_timestamp("00:00:00,000")
        self.assertEqual(result, 0.0)

    def test_parse_with_milliseconds(self):
        """Test parsing with milliseconds"""
        result = TimestampConverter.parse_timestamp("00:00:45,500")
        self.assertEqual(result, 45.5)

    def test_parse_minutes_and_seconds(self):
        """Test parsing minutes and seconds"""
        result = TimestampConverter.parse_timestamp("00:02:30,000")
        self.assertEqual(result, 150.0)

    def test_parse_hours(self):
        """Test parsing with hours"""
        result = TimestampConverter.parse_timestamp("01:30:00,000")
        self.assertEqual(result, 5400.0)

    def test_parse_with_dot_separator(self):
        """Test parsing with dot instead of comma"""
        result = TimestampConverter.parse_timestamp("00:00:45.500")
        self.assertEqual(result, 45.5)

    def test_parse_without_milliseconds(self):
        """Test parsing without milliseconds"""
        result = TimestampConverter.parse_timestamp("00:01:30")
        self.assertEqual(result, 90.0)


class TimestampConverterCalculateDurationTests(TestCase):
    """Tests for TimestampConverter.calculate_duration"""

    def test_calculate_simple_duration(self):
        """Test calculating simple duration"""
        result = TimestampConverter.calculate_duration("00:00:00,000", "00:00:10,000")
        self.assertEqual(result, 10.0)

    def test_calculate_duration_with_milliseconds(self):
        """Test calculating duration with milliseconds"""
        result = TimestampConverter.calculate_duration("00:00:05,500", "00:00:15,750")
        self.assertEqual(result, 10.25)

    def test_calculate_duration_spanning_minutes(self):
        """Test calculating duration spanning minutes"""
        result = TimestampConverter.calculate_duration("00:00:50,000", "00:01:10,000")
        self.assertEqual(result, 20.0)

    def test_calculate_duration_spanning_hours(self):
        """Test calculating duration spanning hours"""
        result = TimestampConverter.calculate_duration("00:59:30,000", "01:00:30,000")
        self.assertEqual(result, 60.0)
