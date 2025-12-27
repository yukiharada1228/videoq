# RAG Prompt Engineering

## Overview

VideoQ's AI chat feature uses RAG (Retrieval-Augmented Generation) architecture to generate answers based on video transcription data. This document describes the design and implementation of prompt engineering used in RAG.

## User-Configurable LLM Settings

Each user can customize their LLM preferences via the Settings page:

- **LLM Model**: The chat model used for generating responses (e.g., `gpt-4o-mini`, `gpt-4o`, `gpt-4-turbo`)
  - Default: `gpt-4o-mini`
  - Stored in `User.preferred_llm_model`
- **Temperature**: Controls randomness/creativity of responses (range: 0.0 to 2.0)
  - Default: `0.7`
  - Stored in `User.preferred_llm_temperature`
  - Lower values produce more focused, deterministic outputs
  - Higher values produce more creative, varied outputs

These settings are applied when generating chat responses using the `get_langchain_llm` function in `backend/app/chat/services/llm.py`.

## Architecture

### Prompt Components

The system prompt for RAG chat consists of the following elements:

1. **Header**: Contains the assistant's role, background, request, and format instructions
2. **Rules**: Constraints and guidelines for answer generation
3. **Format Instruction**: Output format specification
4. **Reference Materials**: Relevant scene information retrieved from vector search

### Prompt Generation Flow

```
User Query
    ↓
Vector Search (PGVector)
    ↓
Retrieve Related Scenes (max 6)
    ↓
Build Prompt (build_system_prompt)
    ↓
Send to LLM (OpenAI ChatGPT)
    ↓
Generate Answer
```

## Prompt Template Structure

Prompts are defined in `backend/app/chat/prompts/prompts.json`.

### Default Prompt (English)

```json
{
  "rag": {
    "default": {
      "header": "You are {role}. Because {background}, please {request}. Follow the rules below and respond using the specified format.",
      "role": "an assistant who answers using scenes linked to the user's video group",
      "background": "the conversation must stay grounded in the provided scene context",
      "request": "answer the user's latest message",
      "format_instruction": "respond with 1-3 bullet points and finish with a single-sentence summary",
      "rules": [
        "If you are unsure, say you do not know clearly instead of speculating.",
        "Prioritize the provided scene context when forming your answers."
      ],
      "section_titles": {
        "rules": "# Rules",
        "format": "# Format",
        "reference": "# Reference Materials"
      },
      "reference": {
        "lead": "Below are relevant scenes extracted from the user's video group.",
        "footer": "Include brief descriptions when helpful.",
        "empty": "No reference scenes are available. Base your answer on the rules above."
      }
    }
  }
}
```

### Japanese Prompt

A prompt for the Japanese locale (`ja`) is also defined and is automatically selected based on the `Accept-Language` header.

## Prompt Generation Details

### build_system_prompt Function

The `build_system_prompt` function in `backend/app/chat/prompts/loader.py` combines the prompt template with search results to generate the final system prompt.

**Parameters:**
- `locale`: Locale (e.g., `"ja"`, `"en"`). Uses default (English) if `None`
- `references`: List of related scenes retrieved from vector search

**Generated Prompt Structure:**

```
[Header]

# Rules
1. [Rule 1]
2. [Rule 2]

# Format
[Format Instruction]

# Reference Materials
[Reference Lead Text]
[Related Scene 1]
[Related Scene 2]
...
[Reference Footer]
```

### Reference Information Format

Each related scene is included in the prompt in the following format:

```
[1] [Video Title] [Start Time] - [End Time]
[Scene Transcription Content]
```

Example:
```
[1] Project Overview Video 00:01:23 - 00:02:45
This project is a web application that provides video transcription and AI chat features.
Main features include video upload, automatic transcription, and AI chat.
```

## Locale Support

Prompts support multiple languages with the following locales:

- `default` (English): Default prompt
- `ja` (Japanese): Japanese prompt

Locale resolution follows this priority order:

1. Specified locale (e.g., `"ja-JP"`)
2. Language part of locale (e.g., `"ja"`)
3. Default (`"default"`)

### Specifying Locale

Clients can specify the locale using the `Accept-Language` HTTP header:

```http
Accept-Language: ja,en;q=0.9
```

The backend extracts the first locale from this header and uses the corresponding prompt.

## Integration with Vector Search

### Search Parameters

- **Search Count (k)**: Retrieves up to 6 related scenes
- **Filter**: Filtered by user ID and video IDs within the video group
- **Embedding Model**: Configurable via `EMBEDDING_MODEL` environment variable (default: `text-embedding-3-small`)

### Processing Search Results

Documents retrieved from search are converted to reference information for prompts by the `_build_reference_entries` method:

```python
def _build_reference_entries(self, docs: Sequence[Any]) -> List[str]:
    """Generate reference information list for detailed prompt from documents"""
    reference_entries = []
    for idx, doc in enumerate(docs, start=1):
        metadata = getattr(doc, "metadata", {}) or {}
        title = metadata.get("video_title", "")
        start_time = metadata.get("start_time", "")
        end_time = metadata.get("end_time", "")
        page_content = getattr(doc, "page_content", "")
        
        reference_entries.append(
            f"[{idx}] {title} {start_time} - {end_time}\n{page_content}"
        )
    return reference_entries
```

## Customizing Prompts

### Editing Prompt Templates

To customize prompts, edit `backend/app/chat/prompts/prompts.json`.

**Notes:**
- Maintain the existing key structure
- Include required fields (`header`, `role`, `background`, `request`, `format_instruction`)
- When adding a new locale, it will be merged with `default` using `_deep_merge`

### Adding a New Locale

To add a new locale (e.g., `fr`):

```json
{
  "rag": {
    "default": { ... },
    "ja": { ... },
    "fr": {
      "header": "Vous êtes {role}. Parce que {background}, veuillez {request}...",
      "role": "un assistant qui répond en utilisant des scènes liées au groupe vidéo de l'utilisateur",
      ...
    }
  }
}
```

### Modifying Prompt Structure

If you need to significantly modify the prompt structure, you will also need to update the `build_system_prompt` function in `backend/app/chat/prompts/loader.py`.

## Best Practices

### Prompt Design Principles

1. **Clear Role Definition**: Clearly define the assistant's role
2. **Context Emphasis**: Instruct to prioritize provided scene information
3. **Uncertainty Handling**: When uncertain, state that clearly instead of speculating
4. **Output Format Specification**: Specify a consistent output format

### Performance Optimization

- **Adjust Search Count**: Adjust the `k` parameter (currently 6) to balance prompt size and accuracy
- **Token Limits**: Each scene is limited to a maximum of 512 tokens (via the `scene_otsu` module)
- **Caching**: Prompt configuration is cached with `@lru_cache`

### Debugging

To inspect prompt content:

```python
from app.chat.prompts import build_system_prompt

# Default locale
prompt = build_system_prompt(
    locale=None,
    references=["[1] Test Video 00:00:00 - 00:01:00\nTest content"]
)
print(prompt)

# Japanese locale
prompt_ja = build_system_prompt(
    locale="ja",
    references=["[1] テスト動画 00:00:00 - 00:01:00\nテスト内容"]
)
print(prompt_ja)
```

## Implementation Files

- **Prompt Definition**: `backend/app/chat/prompts/prompts.json`
- **Prompt Loader**: `backend/app/chat/prompts/loader.py`
- **RAG Service**: `backend/app/chat/services/rag_chat.py`
- **Tests**: `backend/app/chat/prompts/tests/test_loader.py`

## Related Documentation

- [System Configuration Diagram](system-configuration-diagram.md)
- [Scene Splitting](../../backend/app/tasks/srt_processing.py)
- [Scene Detection (`scene_otsu`)](../../backend/app/scene_otsu/)
- [Vector Management](../../backend/app/utils/vector_manager.py)
