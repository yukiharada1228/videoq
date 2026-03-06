from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

from app.presentation.common.mixins import DependencyResolverMixin


class _UseCase:
    def execute(self):
        return None


class DependencyResolverMixinTests(SimpleTestCase):
    def test_resolve_dependency_raises_when_dependency_missing(self):
        with self.assertRaises(ImproperlyConfigured):
            DependencyResolverMixin.resolve_dependency(None)

    def test_resolve_dependency_raises_when_factory_returns_none(self):
        with self.assertRaises(ImproperlyConfigured):
            DependencyResolverMixin.resolve_dependency(lambda: None)

    def test_resolve_dependency_supports_factory(self):
        use_case = DependencyResolverMixin.resolve_dependency(lambda: _UseCase())
        self.assertIsInstance(use_case, _UseCase)
