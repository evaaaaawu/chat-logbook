# Use the FTS5 trigram tokenizer and defer CJK segmentation

The Index uses SQLite FTS5 with the **trigram** tokenizer. One tokenizer then covers CJK, English, code identifiers like `useState`, and file paths — without a per-language segmenter.

A native CJK segmenter (jieba) is deferred unless real recall complaints appear; it is premature complexity for now. Trigram trades some recall precision for broad, dependency-free coverage.
