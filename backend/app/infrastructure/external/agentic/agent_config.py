"""Agent loop budget / limit constants (§7.3).

Default values live here. Reading them from env and building ``AgentBudget``
is the responsibility of the composition_root (infrastructure must not read
config and stays env-agnostic here).
"""

from dataclasses import dataclass

# --- Default limit constants (§7.3, §6.3, §7.2) ---
MAX_TOOL_ITERATIONS = 6
TOOL_RESULT_TOKEN_BUDGET = 12000
MAX_FULL_TRANSCRIPTS = 2
MAX_GET_VIDEO_CALLS = 3
MAX_LLM_CALLS = 8
TRANSCRIPT_CHAR_BUDGET = 24000
TRANSCRIPT_INLINE_TOKEN_LIMIT = 6000
SUMMARIZE_MAX_CHUNKS = 40
MAX_HISTORY_TURNS = 12
MAX_HISTORY_TOKENS = 4000


@dataclass
class AgentBudget:
    """Per-turn budget passed to ``AgenticChatGateway`` (§7.3).

    All fields default to the module-level constants so the gateway can be
    constructed without composition_root in tests.
    """

    max_tool_iterations: int = MAX_TOOL_ITERATIONS
    tool_result_token_budget: int = TOOL_RESULT_TOKEN_BUDGET
    max_full_transcripts: int = MAX_FULL_TRANSCRIPTS
    max_get_video_calls: int = MAX_GET_VIDEO_CALLS
    max_llm_calls: int = MAX_LLM_CALLS
    transcript_char_budget: int = TRANSCRIPT_CHAR_BUDGET
    transcript_inline_token_limit: int = TRANSCRIPT_INLINE_TOKEN_LIMIT
    summarize_max_chunks: int = SUMMARIZE_MAX_CHUNKS
    max_history_turns: int = MAX_HISTORY_TURNS
    max_history_tokens: int = MAX_HISTORY_TOKENS


class AgentToolError(Exception):
    """Raised by tool handlers / dispatcher for tool-level failures (§5.1, §9.1).

    ``status`` mirrors an HTTP-ish status code (e.g. 400 bad args, 403 out of
    group scope, 404 not found) for trace/diagnostics. The dispatcher converts
    these into ToolMessage content; they are not surfaced as HTTP errors.
    """

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status
