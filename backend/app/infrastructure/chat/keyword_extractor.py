"""
Infrastructure implementation of KeywordExtractor using janome (Japanese) and NLTK (English).
"""

import re
from collections import Counter
from typing import Dict, List

from app.domain.chat.ports import KeywordExtractor

_JA_NOUN_POS = ("名詞",)
_JA_NOUN_EXCLUDE_SUBTYPES = ("非自立", "代名詞", "数", "接尾")
_JA_CHAR_RE = re.compile(r"[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]")
_EN_CONTENT_TAGS = {"NN", "NNS", "NNP", "NNPS", "JJ", "JJR", "JJS"}

_janome_tokenizer = None


def _get_janome_tokenizer():
    global _janome_tokenizer
    if _janome_tokenizer is None:
        from janome.tokenizer import Tokenizer

        _janome_tokenizer = Tokenizer()
    return _janome_tokenizer


def _extract_ja_nouns(text: str, tokenizer) -> List[str]:
    nouns = []
    for token in tokenizer.tokenize(text):
        pos = token.part_of_speech.split(",")
        if pos[0] in _JA_NOUN_POS and pos[1] not in _JA_NOUN_EXCLUDE_SUBTYPES:
            if len(token.surface) >= 2:
                nouns.append(token.surface)
    return nouns


def _extract_en_keywords(text: str) -> List[str]:
    import nltk

    tokens = nltk.word_tokenize(text.lower())
    tagged = nltk.pos_tag(tokens)
    return [
        word
        for word, tag in tagged
        if tag in _EN_CONTENT_TAGS and len(word) >= 2 and word.isalpha()
    ]


class JanomeNltkKeywordExtractor(KeywordExtractor):
    """Extract keywords using janome for Japanese and NLTK for English."""

    def extract(self, questions: List[str], limit: int = 30) -> List[Dict]:
        counter: Counter = Counter()
        tokenizer = _get_janome_tokenizer()

        for q in questions:
            if _JA_CHAR_RE.search(q):
                words = _extract_ja_nouns(q, tokenizer)
            else:
                words = _extract_en_keywords(q)
            for word in words:
                counter[word] += 1

        return [{"word": word, "count": count} for word, count in counter.most_common(limit)]
