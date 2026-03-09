"""Unit tests for video domain value objects."""

from unittest import TestCase

from app.domain.video.exceptions import (
    InvalidGroupName,
    InvalidShareToken,
    InvalidTagColor,
    InvalidTagName,
)
from app.domain.video.services import ShareLinkService
from app.domain.video.value_objects import GroupName, ShareToken, TagColor, TagName


class TagNameTests(TestCase):
    def test_from_raw_trims(self):
        self.assertEqual(TagName.from_raw("  urgent ").value, "urgent")

    def test_from_raw_rejects_blank(self):
        with self.assertRaises(InvalidTagName):
            TagName.from_raw("   ")


class TagColorTests(TestCase):
    def test_from_raw_accepts_hex(self):
        self.assertEqual(TagColor.from_raw("#12AbEf").value, "#12AbEf")

    def test_from_raw_rejects_invalid(self):
        with self.assertRaises(InvalidTagColor):
            TagColor.from_raw("red")


class GroupNameTests(TestCase):
    def test_from_raw_trims(self):
        self.assertEqual(GroupName.from_raw("  my-group  ").value, "my-group")

    def test_from_raw_rejects_blank(self):
        with self.assertRaises(InvalidGroupName):
            GroupName.from_raw(" ")


class ShareTokenTests(TestCase):
    def test_from_raw_trims(self):
        self.assertEqual(ShareToken.from_raw(" token ").value, "token")

    def test_from_raw_rejects_blank(self):
        with self.assertRaises(InvalidShareToken):
            ShareToken.from_raw(" ")

    def test_share_link_service_generates_non_blank_token(self):
        token = ShareLinkService.generate_token()
        self.assertTrue(token)
        self.assertEqual(token, token.strip())

