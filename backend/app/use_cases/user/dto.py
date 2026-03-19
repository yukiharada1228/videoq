"""DTOs for user use cases."""

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class OpenAiApiKeyStatusDTO:
    has_key: bool
    masked_key: Optional[str]
    is_required: bool
