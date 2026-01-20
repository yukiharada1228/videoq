"""
Tests for common responses module
"""

from django.test import TestCase
from rest_framework import status

from app.common.responses import (create_created_response,
                                  create_error_response,
                                  create_no_content_response,
                                  create_success_response)


class ResponseHelpersTests(TestCase):
    """Tests for response helper functions"""

    def test_create_error_response(self):
        """Test create_error_response with unified format"""
        response = create_error_response(
            "Error message", status.HTTP_400_BAD_REQUEST, code="VALIDATION_ERROR"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"]["code"], "VALIDATION_ERROR")
        self.assertEqual(response.data["error"]["message"], "Error message")

    def test_create_error_response_default_status(self):
        """Test create_error_response with default status code"""
        response = create_error_response("Error message")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"]["code"], "VALIDATION_ERROR")
        self.assertEqual(response.data["error"]["message"], "Error message")

    def test_create_error_response_with_fields(self):
        """Test create_error_response with field errors"""
        response = create_error_response(
            "Validation failed",
            code="VALIDATION_ERROR",
            fields={"email": ["Invalid email format"]},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"]["code"], "VALIDATION_ERROR")
        self.assertEqual(response.data["error"]["message"], "Validation failed")
        self.assertEqual(response.data["error"]["fields"]["email"], ["Invalid email format"])

    def test_create_success_response_with_data(self):
        """Test create_success_response with data"""
        data = {"key": "value", "number": 123}
        response = create_success_response(data=data)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["key"], "value")
        self.assertEqual(response.data["number"], 123)

    def test_create_success_response_with_message(self):
        """Test create_success_response with message"""
        response = create_success_response(message="Success message")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["message"], "Success message")

    def test_create_success_response_with_data_and_message(self):
        """Test create_success_response with both data and message"""
        data = {"key": "value"}
        response = create_success_response(data=data, message="Success")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["key"], "value")
        self.assertEqual(response.data["message"], "Success")

    def test_create_success_response_empty(self):
        """Test create_success_response with no data or message"""
        response = create_success_response()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {})

    def test_create_success_response_custom_status(self):
        """Test create_success_response with custom status code"""
        response = create_success_response(
            data={"key": "value"}, status_code=status.HTTP_202_ACCEPTED
        )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)

    def test_create_created_response(self):
        """Test create_created_response"""
        data = {"id": 1, "name": "Test"}
        response = create_created_response(data=data, message="Created")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["id"], 1)
        self.assertEqual(response.data["name"], "Test")
        self.assertEqual(response.data["message"], "Created")

    def test_create_created_response_default_message(self):
        """Test create_created_response with default message"""
        data = {"id": 1}
        response = create_created_response(data=data)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["message"], "Created successfully")

    def test_create_no_content_response(self):
        """Test create_no_content_response"""
        response = create_no_content_response()

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertIsNone(response.data)
