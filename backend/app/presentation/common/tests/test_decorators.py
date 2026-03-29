"""
Tests for with_error_handling decorator.

Verifies that DRF APIException subclasses are NOT swallowed
(they propagate so DRF's custom_exception_handler can convert them
to the correct 4xx response), while non-DRF exceptions are caught
and converted to 500.
"""

import unittest

from rest_framework import status
from rest_framework.exceptions import (
    NotAuthenticated,
    PermissionDenied,
    ValidationError,
)
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory

from app.presentation.common.decorators import with_error_handling


def _make_view(exc):
    """Return a simple view function that raises *exc* when called."""

    @with_error_handling
    def view(request):
        raise exc

    return view


class WithErrorHandlingDrfExceptionsTest(unittest.TestCase):
    """DRF APIException subclasses must propagate, not be swallowed."""

    def setUp(self):
        factory = APIRequestFactory()
        self.request = factory.get("/")

    def _call(self, exc):
        view = _make_view(exc)
        return view(self.request)

    def test_validation_error_propagates(self):
        """ValidationError (400) must not be converted to 500."""
        with self.assertRaises(ValidationError):
            self._call(ValidationError("invalid input"))

    def test_permission_denied_propagates(self):
        """PermissionDenied (403) must not be converted to 500."""
        with self.assertRaises(PermissionDenied):
            self._call(PermissionDenied())

    def test_not_authenticated_propagates(self):
        """NotAuthenticated (401) must not be converted to 500."""
        with self.assertRaises(NotAuthenticated):
            self._call(NotAuthenticated())


class WithErrorHandlingNonDrfExceptionsTest(unittest.TestCase):
    """Non-DRF exceptions must be caught and returned as 500 responses."""

    def setUp(self):
        factory = APIRequestFactory()
        self.request = factory.get("/")

    def _call(self, exc):
        view = _make_view(exc)
        return view(self.request)

    def test_generic_exception_returns_500(self):
        """Unhandled Exception must produce HTTP 500, not propagate."""
        response = self._call(Exception("something went wrong"))
        self.assertIsInstance(response, Response)
        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)

    def test_value_error_returns_500(self):
        """ValueError must produce HTTP 500."""
        response = self._call(ValueError("bad value"))
        self.assertIsInstance(response, Response)
        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)

    def test_runtime_error_returns_500(self):
        """RuntimeError must produce HTTP 500."""
        response = self._call(RuntimeError("runtime failure"))
        self.assertIsInstance(response, Response)
        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)

    def test_success_response_returned_unchanged(self):
        """When view succeeds, its response is returned as-is."""

        @with_error_handling
        def ok_view(request):
            return Response({"ok": True}, status=status.HTTP_200_OK)

        factory = APIRequestFactory()
        response = ok_view(factory.get("/"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"ok": True})
