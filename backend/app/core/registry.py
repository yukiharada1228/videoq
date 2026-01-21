"""
Service Registry for dependency injection
"""

from typing import Any, Callable, Dict, Optional


class ServiceRegistry:
    """
    Service registry for managing dependencies.
    Supports both direct service registration and factory registration.
    """

    def __init__(self):
        self._services: Dict[str, Any] = {}
        self._factories: Dict[str, Callable[[], Any]] = {}

    def register(self, name: str, service: Any) -> None:
        """
        Register a service instance.

        Args:
            name: Service identifier
            service: Service instance to register
        """
        self._services[name] = service

    def register_factory(self, name: str, factory: Callable[[], Any]) -> None:
        """
        Register a factory function that creates a service on demand.

        Args:
            name: Service identifier
            factory: Callable that returns a service instance
        """
        self._factories[name] = factory

    def get(self, name: str, default: Optional[Any] = None) -> Any:
        """
        Get a registered service or create one from factory.

        Args:
            name: Service identifier
            default: Default value if service not found

        Returns:
            Service instance or default value
        """
        # First check direct services
        if name in self._services:
            return self._services[name]

        # Then check factories
        if name in self._factories:
            service = self._factories[name]()
            return service

        return default

    def clear(self) -> None:
        """
        Clear all registered services and factories.
        Useful for testing to reset state between tests.
        """
        self._services.clear()
        self._factories.clear()

    def has(self, name: str) -> bool:
        """
        Check if a service or factory is registered.

        Args:
            name: Service identifier

        Returns:
            True if service or factory exists
        """
        return name in self._services or name in self._factories


# Global registry instance
registry = ServiceRegistry()
