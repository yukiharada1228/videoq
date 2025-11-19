"""
Tests for response_utils module
"""

from app.utils.response_utils import (CacheHelper, ResponseBuilder,
                                      ValidationHelper)
from django.test import TestCase
from rest_framework import status
from rest_framework.response import Response


class ResponseBuilderTests(TestCase):
    """Tests for ResponseBuilder class"""

    def test_success_response_with_data(self):
        """Test success response with data"""
        response = ResponseBuilder.success(
            data={"key": "value"},
            message="Test message",
            status_code=status.HTTP_200_OK,
        )

        self.assertIsInstance(response, Response)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["success"], True)
        self.assertEqual(response.data["message"], "Test message")
        self.assertEqual(response.data["data"], {"key": "value"})

    def test_success_response_without_data(self):
        """Test success response without data"""
        response = ResponseBuilder.success()

        self.assertIsInstance(response, Response)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["success"], True)
        self.assertIn("message", response.data)

    def test_success_response_with_meta(self):
        """Test success response with metadata"""
        meta = {"count": 10, "page": 1}
        response = ResponseBuilder.success(data=[], meta=meta)

        self.assertEqual(response.data["meta"], meta)

    def test_error_response_basic(self):
        """Test basic error response"""
        response = ResponseBuilder.error(
            message="Error message",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

        self.assertIsInstance(response, Response)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["success"], False)
        self.assertEqual(response.data["message"], "Error message")

    def test_error_response_with_errors(self):
        """Test error response with validation errors"""
        errors = {"field1": ["Error 1"], "field2": ["Error 2"]}
        response = ResponseBuilder.error(
            message="Validation failed",
            errors=errors,
        )

        self.assertEqual(response.data["errors"], errors)

    def test_error_response_with_details(self):
        """Test error response with details"""
        details = {"code": "ERR001", "timestamp": "2024-01-01"}
        response = ResponseBuilder.error(
            message="Error occurred",
            details=details,
        )

        self.assertEqual(response.data["details"], details)

    def test_paginated_response(self):
        """Test paginated response"""
        data = [1, 2, 3, 4, 5]
        response = ResponseBuilder.paginated(
            data=data,
            page=1,
            page_size=2,
            total_count=5,
            message="Data retrieved",
        )

        self.assertEqual(response.data["success"], True)
        self.assertEqual(response.data["data"], data)
        self.assertIn("meta", response.data)
        self.assertIn("pagination", response.data["meta"])
        pagination = response.data["meta"]["pagination"]
        self.assertEqual(pagination["page"], 1)
        self.assertEqual(pagination["page_size"], 2)
        self.assertEqual(pagination["total_count"], 5)
        self.assertEqual(pagination["total_pages"], 3)
        self.assertTrue(pagination["has_next"])
        self.assertFalse(pagination["has_previous"])

    def test_paginated_response_last_page(self):
        """Test paginated response on last page"""
        data = [9, 10]
        response = ResponseBuilder.paginated(
            data=data,
            page=3,
            page_size=4,
            total_count=10,
        )

        pagination = response.data["meta"]["pagination"]
        self.assertFalse(pagination["has_next"])
        self.assertTrue(pagination["has_previous"])


class ValidationHelperTests(TestCase):
    """Tests for ValidationHelper class"""

    def test_validate_required_fields_all_present(self):
        """Test validate_required_fields when all fields are present"""
        data = {"field1": "value1", "field2": "value2"}
        required_fields = ["field1", "field2"]

        is_valid, errors = ValidationHelper.validate_required_fields(
            data, required_fields
        )

        self.assertTrue(is_valid)
        self.assertIsNone(errors)

    def test_validate_required_fields_missing(self):
        """Test validate_required_fields when fields are missing"""
        data = {"field1": "value1"}
        required_fields = ["field1", "field2", "field3"]

        is_valid, errors = ValidationHelper.validate_required_fields(
            data, required_fields
        )

        self.assertFalse(is_valid)
        self.assertIsNotNone(errors)
        self.assertIn("field2", errors)
        self.assertIn("field3", errors)
        self.assertNotIn("field1", errors)

    def test_validate_required_fields_empty_value(self):
        """Test validate_required_fields when field value is empty"""
        data = {"field1": "", "field2": None}
        required_fields = ["field1", "field2"]

        is_valid, errors = ValidationHelper.validate_required_fields(
            data, required_fields
        )

        self.assertFalse(is_valid)
        self.assertIn("field1", errors)
        self.assertIn("field2", errors)

    def test_validate_field_length_valid(self):
        """Test validate_field_length with valid length"""
        data = {"field": "valid"}
        error = ValidationHelper.validate_field_length(
            data, "field", min_length=3, max_length=10
        )

        self.assertIsNone(error)

    def test_validate_field_length_too_short(self):
        """Test validate_field_length when too short"""
        data = {"field": "ab"}
        error = ValidationHelper.validate_field_length(data, "field", min_length=3)

        self.assertIsNotNone(error)
        self.assertIn("at least 3 characters", error)

    def test_validate_field_length_too_long(self):
        """Test validate_field_length when too long"""
        data = {"field": "very long string"}
        error = ValidationHelper.validate_field_length(data, "field", max_length=5)

        self.assertIsNotNone(error)
        self.assertIn("at most 5 characters", error)

    def test_validate_field_length_missing_field(self):
        """Test validate_field_length when field is missing"""
        data = {}
        error = ValidationHelper.validate_field_length(data, "field", min_length=3)

        self.assertIsNone(error)

    def test_validate_email_format_valid(self):
        """Test validate_email_format with valid email"""
        valid_emails = [
            "test@example.com",
            "user.name@example.co.uk",
            "test+tag@example.com",
        ]

        for email in valid_emails:
            self.assertTrue(ValidationHelper.validate_email_format(email))

    def test_validate_email_format_invalid(self):
        """Test validate_email_format with invalid email"""
        invalid_emails = [
            "invalid",
            "@example.com",
            "test@",
            "test@example",
            "test example.com",
        ]

        for email in invalid_emails:
            self.assertFalse(ValidationHelper.validate_email_format(email))


class CacheHelperTests(TestCase):
    """Tests for CacheHelper class"""

    def test_get_cache_key_simple(self):
        """Test get_cache_key with simple arguments"""
        key = CacheHelper.get_cache_key("prefix", "arg1", "arg2")
        self.assertEqual(key, "prefix:arg1:arg2")

    def test_get_cache_key_with_numbers(self):
        """Test get_cache_key with numeric arguments"""
        key = CacheHelper.get_cache_key("prefix", 1, 2, 3)
        self.assertEqual(key, "prefix:1:2:3")

    def test_get_cache_key_single_prefix(self):
        """Test get_cache_key with only prefix"""
        key = CacheHelper.get_cache_key("prefix")
        self.assertEqual(key, "prefix")

    def test_get_user_cache_key(self):
        """Test get_user_cache_key"""
        key = CacheHelper.get_user_cache_key(123, "videos")
        self.assertEqual(key, "user:123:videos")

    def test_get_resource_cache_key(self):
        """Test get_resource_cache_key"""
        key = CacheHelper.get_resource_cache_key("video", 456)
        self.assertEqual(key, "resource:video:456")
