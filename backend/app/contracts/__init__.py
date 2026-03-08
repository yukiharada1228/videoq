"""
Shared contracts (constants, protocols) usable by any layer.

Modules here must not import from any app layer (domain, use_cases,
infrastructure, presentation, entrypoints). They define shared
identifiers that multiple layers reference without creating a
circular or direction-violating dependency.
"""
