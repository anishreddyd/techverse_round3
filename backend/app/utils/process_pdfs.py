"""
Techverse Round 1A PDF Outline Extraction

"""

import os
import re
import json
import time
import string
from pathlib import Path
import argparse
from PyPDF2 import PdfReader

from collections import Counter, defaultdict

import fitz  # PyMuPDF

# Optional jsonschema validation (small dep; safe to import)
try:
    import jsonschema

    _HAVE_JSONSCHEMA = True
except Exception:  # pragma: no cover
    _HAVE_JSONSCHEMA = False


# ------------------------------------------------------------------
# MODE / FLAGS
# ------------------------------------------------------------------


def get_args():
    parser = argparse.ArgumentParser(description="Techverse Outline Extraction")
    parser.add_argument(
        "--input-dir", type=str, default="input", help="Path to input folder"
    )
    parser.add_argument(
        "--output-dir", type=str, default="output", help="Path to output folder"
    )
    return parser.parse_args()


args = get_args()
INPUT_DIR = args.input_dir
OUTPUT_DIR = args.output_dir


DEV = os.getenv("TECHVERSE_DEV_SECRET", "").lower() == "coffee"
EXTENDED = os.getenv("TECHVERSE_EXTENDED", "") == "1"
USE_FONT = os.getenv("TECHVERSE_USE_FONT", "1") == "1"
# VALIDATE flag retained for backward compatibility but ignored; validation always attempted.
_ = os.getenv("TECHVERSE_VALIDATE", "")
HIERARCHY = os.getenv("TECHVERSE_HIERARCHY", "") == "1"
SCHEMA_PATH = os.getenv("TECHVERSE_SCHEMA", "Challenge_1A/schema/output_schema.json")


# ------------------------------------------------------------------
# CONFIG THRESHOLDS
# ------------------------------------------------------------------
MAX_HEADING_CHARS = 100  # hard upper bound (safety)
MAX_HEADING_WORDS = 12  # allow short multi-word headings
PARA_WORD_MAX = 10  # >10 words => likely paragraph -> skip (unless numbered)
PARA_CJK_MAX = 25  # long contiguous CJK run => paragraph
MAX_PUNCT = 3
LOWERCASE_BODY_WORDS = 5  # mostly lowercase & >5 words => body
HEADER_REPEAT_RATIO = 0.2
FONT_COLLAPSE_PT = 0.6
TOP_TITLE_FRAC = 0.25
CENTER_TOL = 72  # points from horizontal center
NUM_LEVELS = 3
CONF_MAX = 10.0  # scoring ceiling


# ------------------------------------------------------------------
# TOC PAGE DETECTION
# ------------------------------------------------------------------
TOC_PAT = re.compile(
    r"(table\s+of\s+contents|^contents$|^toc$|目录|目次|الفهرس)", re.IGNORECASE
)


def is_toc_page(page_text: str) -> bool:
    if TOC_PAT.search(page_text):
        return True
    lines = [l.strip() for l in page_text.splitlines() if l.strip()]
    if not lines:
        return False
    num_pat = re.compile(r"^(\d+|[0-9.]+|[ivxlcdm]+)\b|^\.{2,}")
    numeric_like = sum(1 for l in lines if num_pat.search(l.lower()))
    return (numeric_like / len(lines)) >= 0.6


# ------------------------------------------------------------------
# UTILS: TEXT CLEAN / CHECKS
# ------------------------------------------------------------------
_ws_re = re.compile(r"\s+")


def clean_text(text: str) -> str:
    return _ws_re.sub(" ", text).strip()


def looks_like_url(text: str) -> bool:
    return bool(re.search(r"(https?://|www\.)", text.lower()))


def mostly_nonletters(text: str, threshold=0.6) -> bool:
    chars = [c for c in text.strip()]
    if not chars:
        return True
    letters = [c for c in chars if c.isalpha()]
    return (len(letters) / len(chars)) < (1 - threshold)


def count_punctuation(text: str) -> int:
    return sum(1 for c in text if c in string.punctuation)


def is_numbered_heading(text: str) -> bool:
    pat_nums = r"""^(
        (\d+(\.\d+){0,3})[.)\s-]* |
        ([IVXLCDM]+\.?)\s+ |
        (Chapter|Section)\s+\d+(\.\d+)* 
    )"""
    return bool(re.match(pat_nums, text.strip(), re.IGNORECASE | re.VERBOSE))


def numbering_depth(text: str) -> int:
    m = re.match(r"^\s*(\d+(?:\.\d+){0,5})\b", text)
    return m.group(1).count(".") + 1 if m else 0


def is_mostly_lower(text: str, ratio=0.75) -> bool:
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return False
    lower = sum(1 for c in letters if c.islower())
    return (lower / len(letters)) >= ratio


_CJK_CHAR_RE = re.compile(
    r"[\u4E00-\u9FFF\u3040-\u30FF\u31F0-\u31FF]"
)  # Chinese + Hiragana/Katakana


# ------------------------------------------------------------------
# SCRIPT DETECTION (hi/zh/ru/ja/ar/en)
# ------------------------------------------------------------------
def detect_script(text: str) -> str:
    # Define Unicode ranges for additional languages
    script_ranges = {
        "hi": [(0x0900, 0x097F)],  # Hindi (Devanagari)
        "bn": [(0x0980, 0x09FF)],  # Bengali
        "ta": [(0x0B80, 0x0BFF)],  # Tamil
        "te": [(0x0C00, 0x0C7F)],  # Telugu
        "kn": [(0x0C80, 0x0CFF)],  # Kannada
        "ml": [(0x0D00, 0x0D7F)],  # Malayalam
        "gu": [(0x0A80, 0x0AFF)],  # Gujarati
        "pa": [(0x0A00, 0x0A7F)],  # Punjabi (Gurmukhi)
        "mr": [(0x0900, 0x097F)],  # Marathi (same as Hindi)
        "ur": [(0x0600, 0x06FF)],  # Urdu (same as Arabic)
        "ar": [(0x0600, 0x06FF)],  # Arabic
        "zh": [(0x4E00, 0x9FFF)],  # Chinese
        "ja": [(0x3040, 0x30FF), (0x31F0, 0x31FF)],  # Japanese
        "ko": [(0xAC00, 0xD7AF)],  # Korean (Hangul)
        "ru": [(0x0400, 0x04FF)],  # Russian (Cyrillic)
        "th": [(0x0E00, 0x0E7F)],  # Thai
        "vi": [(0x0100, 0x017F)],  # Vietnamese (Latin Extended)
        "fr": [(0x00C0, 0x00FF)],  # French (Latin + accents)
        "de": [(0x00C0, 0x00FF)],  # German (shared)
        "es": [(0x00C0, 0x00FF)],  # Spanish (shared)
        "en": [(0x0000, 0x007F)],  # English (Basic Latin)
    }

    seen_langs = set()
    for ch in text:
        code = ord(ch)
        for lang, ranges in script_ranges.items():
            for r_start, r_end in ranges:
                if r_start <= code <= r_end:
                    seen_langs.add(lang)
                    break

    # Preference order: if multiple scripts, pick one
    priority = [
        "hi",
        "bn",
        "ta",
        "te",
        "kn",
        "ml",
        "gu",
        "pa",
        "mr",
        "ur",
        "ar",
        "zh",
        "ja",
        "ko",
        "ru",
        "th",
        "vi",
        "fr",
        "de",
        "es",
        "en",
    ]
    for lang in priority:
        if lang in seen_langs:
            return lang
    return "en"


# ------------------------------------------------------------------
# HEADING CANDIDATE FILTER (base structural tests)
# ------------------------------------------------------------------
def is_heading_candidate(text: str) -> bool:
    t = text.strip()
    if len(t) > MAX_HEADING_CHARS:
        return False
    words = t.split()
    if len(words) > MAX_HEADING_WORDS:
        return False
    if count_punctuation(t) > MAX_PUNCT or t.count(".") > 1 or t.endswith("."):
        return False
    if len(words) < 2 and not is_numbered_heading(t):
        return False
    if t.isdigit():
        return False
    return True


# ------------------------------------------------------------------
# STYLE UTILITIES
# ------------------------------------------------------------------
def is_bold(span) -> bool:
    flags = span.get("flags", 0)
    fontname = span.get("font", "").lower()
    return ("bold" in fontname) or bool(flags & 2) or bool(flags & 1)


# ------------------------------------------------------------------
# BODY / NOISE FILTERS
# ------------------------------------------------------------------
PAGE_NUM_PAT = re.compile(
    r"^(page\s*no\.?|page\s*:?|p\.?)\s*[\divxlcdm]+", re.IGNORECASE
)
CODE_PAT = re.compile(r"^(import|from|def|class)\b")
BULLET_PAT = re.compile(r"^[\-\*\u2022\u25CF\u25E6]\s+")  # -,*,•,●,◦


def looks_like_page_number(text: str) -> bool:
    return bool(PAGE_NUM_PAT.match(text.strip()))


def looks_like_code(text: str) -> bool:
    t = text.strip()
    if t.startswith("#"):
        return True
    if CODE_PAT.match(t):
        return True
    # crude Python-ish signal: "if foo:"-like; short token ending in ":" w/o spaces
    if (
        t.endswith(":")
        and " " not in t
        and "(" not in t
        and ")" not in t
        and len(t) < 40
    ):
        return True
    return False


def looks_like_bullet(text: str) -> bool:
    return bool(BULLET_PAT.match(text.strip()))


def looks_like_paragraph(text: str) -> bool:
    """Heuristic: too many words or long CJK span -> body (unless numbered heading)."""
    t = text.strip()
    if is_numbered_heading(t):
        return False
    words = t.split()
    if len(words) > PARA_WORD_MAX:
        return True
    if " " not in t and len(t) > PARA_CJK_MAX and _CJK_CHAR_RE.search(t):
        return True
    return False


# ------------------------------------------------------------------
# OUTPUT PATH (overwrite)
# ------------------------------------------------------------------
def make_output_path(base: Path, stem: str, suffix=".json") -> Path:
    """
    Return the canonical output path (<stem>.json). Existing files will be overwritten.
    """
    return base / f"{stem}{suffix}"


# ------------------------------------------------------------------
# TITLE DETECTION
# ------------------------------------------------------------------
def extract_title_candidate(page_lines, doc_meta_title):
    title_candidates = []
    for ln in page_lines:
        text = ln.text
        if looks_like_url(text) or mostly_nonletters(text):
            continue
        L = len(text)
        if L < 3 or L > 150:
            continue
        if count_punctuation(text) > 2:
            continue
        score = ln.size_norm * 5.0
        if ln.bold:
            score += 2.0
        if ln.centered:
            score += 3.0
        if ln.rel_y < TOP_TITLE_FRAC:
            score += 1.0
        if L < 10:
            score -= 1.0
        if L > 80:
            score -= 2.0
        title_candidates.append((score, ln))
    if title_candidates:
        return max(title_candidates, key=lambda x: x[0])[1].text
    if doc_meta_title:
        mt = doc_meta_title.strip()
        if len(mt) >= 3:
            return mt
    return page_lines[0].text if page_lines else ""


# ------------------------------------------------------------------
# DATA STRUCTURE FOR LINES
# ------------------------------------------------------------------
class LineInfo:
    __slots__ = ("text", "page", "font_size", "bold", "centered", "rel_y", "size_norm")

    def __init__(self, text, page, font_size, bold, centered, rel_y):
        self.text = text
        self.page = page
        self.font_size = font_size
        self.bold = bold
        self.centered = centered
        self.rel_y = rel_y
        self.size_norm = 0.0


# ------------------------------------------------------------------
# EXTRACT LINES FROM PDF (skip TOC pages)
# ------------------------------------------------------------------
def extract_lines_from_pdf(pdf_path: str):
    if isinstance(pdf_path, list):
        if len(pdf_path) == 1:
            pdf_path = pdf_path[0]
        else:
            raise ValueError(f"extract_lines_from_pdf expected a string path, got a list: {pdf_path}")
    doc = fitz.open(pdf_path)
    lines = []
    included_pages = []
    first_included_page_lines = []

    for page_index in range(doc.page_count):
        page = doc[page_index]
        page_num = page_index
        raw_text = page.get_text("text")

        if is_toc_page(raw_text):
            if DEV:
                print(f"[Dev] Skipping TOC page {page_num}")
            continue

        included_pages.append(page_num)
        page_w, page_h = page.rect.width, page.rect.height
        blocks = page.get_text("dict").get("blocks", [])
        page_lines_for_title = []

        for block in blocks:
            if "lines" not in block:
                continue
            for line in block["lines"]:
                spans = line.get("spans", [])
                if not spans:
                    continue

                parts = []
                max_size = 0.0
                any_bold = False
                x0_vals, x1_vals, y0_vals = [], [], []

                for span in spans:
                    txt = clean_text(span.get("text", ""))
                    if not txt:
                        continue
                    parts.append(txt)
                    size = float(span.get("size", 0))
                    max_size = max(max_size, size)
                    any_bold = any_bold or is_bold(span)
                    bbox = span.get("bbox", [0, 0, 0, 0])
                    x0_vals.append(bbox[0])
                    x1_vals.append(bbox[2])
                    y0_vals.append(bbox[1])

                if not parts:
                    continue

                text_line = clean_text(" ".join(parts))
                if len(text_line) < 2:
                    continue

                center_x = (
                    (sum(x0_vals) / len(x0_vals) + sum(x1_vals) / len(x1_vals)) / 2
                    if x0_vals
                    else 0
                )
                centered = abs(center_x - (page_w / 2)) < CENTER_TOL
                rel_y = (min(y0_vals) / page_h) if y0_vals else 0

                ln = LineInfo(text_line, page_num, max_size, any_bold, centered, rel_y)
                lines.append(ln)
                page_lines_for_title.append(ln)

        if not first_included_page_lines:
            first_included_page_lines = page_lines_for_title

    return doc, lines, included_pages, first_included_page_lines


# ------------------------------------------------------------------
# NORMALIZATION & LEVEL MAPPING
# ------------------------------------------------------------------
def normalize_sizes(lines):
    max_size = max((ln.font_size for ln in lines), default=1.0) or 1.0
    for ln in lines:
        ln.size_norm = ln.font_size / max_size
    return max_size


def build_font_level_map(lines):
    heading_like_sizes = [
        round(ln.font_size, 1) for ln in lines if is_heading_candidate(ln.text)
    ]
    if not heading_like_sizes:
        return {}
    size_counts = Counter(heading_like_sizes)
    filtered = [s for s, c in size_counts.items() if c >= 2] or list(size_counts.keys())
    filtered.sort(reverse=True)
    collapsed = []
    for s in filtered:
        if not collapsed or abs(s - collapsed[-1]) >= FONT_COLLAPSE_PT:
            collapsed.append(s)
    level_names = ["H1", "H2", "H3"]
    return {s: level_names[idx] for idx, s in enumerate(collapsed[:NUM_LEVELS])}


def build_repeat_map(lines, num_included_pages):
    txt_pages = defaultdict(set)
    for ln in lines:
        txt_pages[ln.text].add(ln.page)
    repeat_thresh = max(2, int(HEADER_REPEAT_RATIO * max(1, num_included_pages)))
    return txt_pages, repeat_thresh


def score_heading(ln: LineInfo):
    parts = {
        "size": ln.size_norm * 5.0,
        "bold": 2.0 if ln.bold else 0.0,
        "numbered": 1.0 if is_numbered_heading(ln.text) else 0.0,
        "top": 1.0 if ln.rel_y < TOP_TITLE_FRAC else 0.0,
        "centered": 1.0 if ln.centered else 0.0,
    }
    raw = sum(parts.values())
    conf = max(0.0, min(1.0, raw / CONF_MAX))
    return conf, parts


def map_level(ln: LineInfo, size_to_level):
    depth = numbering_depth(ln.text)
    if depth == 1:
        return "H1"
    elif depth == 2:
        return "H2"
    elif depth >= 3:
        return "H3"
    if USE_FONT and size_to_level:
        return min(size_to_level.items(), key=lambda kv: abs(ln.font_size - kv[0]))[1]
    return "H1"  # fallback when no numbering & font disabled


# ------------------------------------------------------------------
# BUILD HIERARCHY TREE FROM FLAT OUTLINE
# ------------------------------------------------------------------
_LEVEL_RANK = {"H1": 1, "H2": 2, "H3": 3}


def build_outline_tree(flat_items):
    """
    Convert a flat list of heading dicts (sorted by doc order) into a nested tree.
    Each node: level,text,page,confidence; children=list.
    Unknown levels get rank=999 and are treated as top-level.
    """
    roots = []
    stack = []  # list of nodes

    for item in flat_items:
        lvl = item.get("level", "H1")
        rank = _LEVEL_RANK.get(lvl, 999)

        node = {
            "level": lvl,
            "text": item["text"],
            "page": item["page"],
            "confidence": item.get("confidence", None),
            "children": [],
        }

        # pop until parent less deep
        while stack and _LEVEL_RANK.get(stack[-1]["level"], 999) >= rank:
            stack.pop()

        if stack:
            stack[-1]["children"].append(node)
        else:
            roots.append(node)

        stack.append(node)

    return roots


# ------------------------------------------------------------------
# SCHEMA SANITIZATION HELPER
# ------------------------------------------------------------------
def _to_schema_item(h):
    """
    Coerce a heading dict into schema-safe form.
    - level: only H1/H2/H3 accepted; else fallback H1
    - text: str
    - page: int >=1 (fallback 1)
    """
    lvl = h.get("level", "H1")
    if lvl not in ("H1", "H2", "H3"):
        lvl = "H1"
    txt = str(h.get("text", "")).strip()
    pg = h.get("page", 1)
    try:
        pg = int(pg)
    except Exception:
        pg = 0
    if pg < 0:
        pg = 0
    return {"level": lvl, "text": txt, "page": pg}


__BOILERPLATE_HEADINGS = {
    "about us",
    "disclaimer",
    "legal disclaimer",
    "terms of service",
    "copyright",
    "privacy policy",
    "references",
    "appendix",
    "index",
    "acknowledgments",
    "acknowledgements",
    "glossary",
    "contact information",
    "license",
    "site map",
}


def is_boilerplate_heading(text: str) -> bool:
    t = text.lower().strip().strip(":.-—").strip()
    return t in __BOILERPLATE_HEADINGS


# ------------------------------------------------------------------
# MAIN EXTRACTION (returns BOTH flat spec + extended flat)
# ------------------------------------------------------------------
def extract_outline(pdf_path: str):
    if not os.path.isfile(pdf_path):
        raise FileNotFoundError(f"PDF file does not exist: {pdf_path}")

    doc, lines, included_pages, first_page_lines = extract_lines_from_pdf(pdf_path)

    if not lines and "image" in str(doc[0].get_text("dict")).lower():
        print(f"[Techverse] Likely image-based scan: {pdf_path}")
        return {"title": "", "outline": []}, {"title": "", "outline": []}

    if not lines:
        return {"title": "", "outline": []}, {"title": "", "outline": []}

    normalize_sizes(lines)
    meta_title = doc.metadata.get("title") if doc.metadata else None
    title = extract_title_candidate(first_page_lines or lines, meta_title)
    size_to_level = build_font_level_map(lines) if USE_FONT else {}
    txt_pages, repeat_thresh = build_repeat_map(lines, len(included_pages))

    flat_extended = []
    seen = set()
    candidates = [ln for ln in lines if ln.text != title]
    candidates.sort(key=lambda ln: (ln.page, -ln.font_size))

    for ln in candidates:
        txt = ln.text.strip()
        if len(txt_pages.get(txt, ())) >= repeat_thresh:
            continue
        if looks_like_url(txt):
            continue
        if looks_like_page_number(txt):
            continue
        if looks_like_code(txt):
            continue
        if looks_like_bullet(txt):
            continue
        if mostly_nonletters(txt):
            continue
        if looks_like_paragraph(txt):
            continue
        if not is_heading_candidate(txt):
            continue
        if is_mostly_lower(txt) and len(txt.split()) > LOWERCASE_BODY_WORDS:
            continue
        if is_boilerplate_heading(txt):
            continue
        if txt in seen:
            continue
        seen.add(txt)
        conf, _parts = score_heading(ln)
        level = map_level(ln, size_to_level)
        flat_extended.append(
            {
                "level": level,
                "text": txt,
                "page": ln.page,
                "confidence": round(conf, 2),
                "lang": detect_script(txt),
                "font_size": round(ln.font_size, 2),
                "bold": ln.bold,
                "centered": ln.centered,
            }
        )

    def are_similar(a, b):
        a, b = a.lower(), b.lower()
        if a in b or b in a:
            return True
        common = set(a.split()) & set(b.split())
        return len(common) / max(1, min(len(a.split()), len(b.split()))) > 0.7

    diverse_headings = []
    for cand in flat_extended:
        if all(not are_similar(cand["text"], sel["text"]) for sel in diverse_headings):
            diverse_headings.append(cand)
        if len(diverse_headings) >= 100:
            break
    flat_extended = diverse_headings

    if DEV:
        print(
            f"[Dev] {Path(pdf_path).name}: kept_pages={len(included_pages)}/{doc.page_count} "
            f"lines={len(lines)} headings={len(flat_extended)} title='{title[:40]}'"
        )

    flat_extended = remove_redundant_headings(flat_extended)
    flat_extended = reprocess_headings(flat_extended)
    flat_spec = [_to_schema_item(h) for h in flat_extended]
    spec_result = {"title": title, "outline": flat_spec}
    ext_result = {"title": title, "outline": flat_extended}

    if HIERARCHY:
        ext_result["outline_tree"] = build_outline_tree(flat_extended)

    return spec_result, ext_result


def are_similar(text1, text2):
    return text1.lower().strip() == text2.lower().strip()


def reprocess_headings(headings):
    if len(headings) < 2:
        return headings
    cleaned = []
    last = None
    for current in headings:
        if not last:
            last = current
            continue
        same_page = last["page"] == current["page"]
        similar = abs(last["font_size"] - current["font_size"]) < 0.5 and are_similar(
            last["text"], current["text"]
        )
        if same_page and similar:
            better = last if last["confidence"] >= current["confidence"] else current
            last = better
        else:
            cleaned.append(last)
            last = current
    if last:
        cleaned.append(last)
    return cleaned


def remove_redundant_headings(headings, threshold=0.85):
    from difflib import SequenceMatcher
    import re

    def is_similar(a, b):
        return SequenceMatcher(None, a.lower(), b.lower()).ratio() >= threshold

    def collapse_repeated_words(text):
        words = text.split()
        collapsed = []
        for i, word in enumerate(words):
            if i == 0 or word != words[i - 1]:
                collapsed.append(word)
        return " ".join(collapsed)

    def is_noise_heading(text):
        text = text.strip()
        if len(text) < 4:
            return True
        if re.search(r"^page\s*(no\.?|number)?\s*[:\-]?\s*\d+$", text, re.I):
            return True
        if re.search(
            r"^(name|date|roll\s*no|submitted\s*by|signature|table\s*\d+)\b", text, re.I
        ):
            return True
        if re.fullmatch(r"[\d\s:.,\-]+", text):
            return True
        return False

    filtered = []
    seen = []
    for h in headings:
        h["text"] = collapse_repeated_words(h["text"])

        if is_noise_heading(h["text"]):
            continue

        if any(
            is_similar(h["text"], prev["text"]) and h["page"] == prev["page"]
            for prev in seen
        ):
            continue

        seen.append(h)
        filtered.append(h)

    return filtered


# ------------------------------------------------------------------
# SCHEMA (Inline fallback) + LOADING + VALIDATION
# ------------------------------------------------------------------
_SCHEMA_INLINE = {
    "$schema": "http://json-schema.org/draft-04/schema#",
    "title": "Adobe Round 1A PDF Outline Output Schema (Inline Fallback)",
    "type": "object",
    "required": ["title", "outline"],
    "additionalProperties": False,
    "properties": {
        "title": {"type": "string"},
        "outline": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["level", "text", "page"],
                "additionalProperties": False,
                "properties": {
                    "level": {"type": "string"},
                    "text": {"type": "string"},
                    "page": {"type": "integer", "minimum": 1},
                },
            },
        },
    },
}


def load_schema(path: Path):
    """
    Try to load schema from disk; fallback to inline schema if missing or load error.
    """
    if path.is_file():
        try:
            with open(path, "r", encoding="utf-8") as f:
                if DEV:
                    print(f"[Dev] Loaded schema from {path}.")
                return json.load(f)
        except Exception as e:  # pragma: no cover
            print(
                f"[Techverse] Failed to load schema {path}: {e}. Using inline fallback."
            )
    else:
        if DEV:
            print(f"[Dev] Schema not found at {path}. Using inline fallback.")
    return _SCHEMA_INLINE


def validate_json(data, schema):
    if not _HAVE_JSONSCHEMA:
        if DEV:
            print("[Dev] jsonschema not installed; skipping validation.")
        return True, []
    validator = jsonschema.Draft4Validator(schema)
    errors = sorted(validator.iter_errors(data), key=lambda e: e.path)
    return (len(errors) == 0), errors


# ------------------------------------------------------------------
# DRIVER
# ------------------------------------------------------------------
def process_pdfs():
    input_dir = Path(INPUT_DIR)
    output_dir = Path(OUTPUT_DIR)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load schema once (always attempt; fallback inline)
    schema_obj = load_schema(Path(SCHEMA_PATH))

    pdf_files = sorted(input_dir.glob("*.pdf"))
    if not pdf_files:
        print("[Techverse] No PDFs found in input directory.")
        return

    merged_data = []
    total = 0
    for pdf_file in pdf_files:
        print(f"[Techverse] Processing: {pdf_file.name}")
        start = time.time()
        try:
            spec_result, ext_result = extract_outline(str(pdf_file))

            # --- Write spec-compliant main file ---
            out_path = make_output_path(output_dir, pdf_file.stem, ".json")
            # overwrite safety
            if out_path.exists():
                out_path.unlink()
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(spec_result, f, indent=2, ensure_ascii=False)

            # --- Validate (always attempted when jsonschema is available) ---
            ok, _ = validate_json(spec_result, schema_obj)
            if ok:
                if DEV:
                    print(f"[Dev] Schema validation OK for {out_path.name}.")

            # --- Extended debug file (optional) ---
            if EXTENDED:
                ext_path = out_path.with_name(out_path.stem + "_extended.json")
                if ext_path.exists():
                    ext_path.unlink()
                with open(ext_path, "w", encoding="utf-8") as f:
                    json.dump(ext_result, f, indent=2, ensure_ascii=False)
                if DEV:
                    print(f"[Dev] Wrote extended debug: {ext_path.name}")

            # merged summary: use spec (schema) version
            merged_data.append(
                {
                    "file": pdf_file.name,
                    "title": spec_result["title"],
                    "outline": spec_result["outline"],
                }
            )
            print(f"[Techverse] Saved: {out_path.name} ({time.time() - start:.2f}s)")
            total += 1

        except Exception as e:
            print(f"[Techverse] Error processing {pdf_file.name}: {e}")
            if DEV:
                import traceback

                traceback.print_exc()

    # Write merged summary (schema-compliant)
    merged_path = make_output_path(output_dir, "merged_summary", ".json")
    if merged_path.exists():
        merged_path.unlink()
    with open(merged_path, "w", encoding="utf-8") as f:
        json.dump({"documents": merged_data}, f, indent=2, ensure_ascii=False)
    print(f"[Techverse] Saved merged summary: {merged_path.name}")
    print(f"\n[Techverse] Completed! Processed {total} PDF(s).")

def process_headings_1a(filepath):
    """
    Extract headings from a PDF.
    Always saves an output_1a.json file even if PDF has encoding issues or no headings.
    """
    session_id = Path(filepath).parent.parent.name
    output_dir = Path(__file__).resolve().parent.parent / "static" / "outputs" / session_id
    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = output_dir / f"{Path(filepath).stem}_output_1a.json"

    result = {
        "title": Path(filepath).stem,
        "outline": []
    }

    try:
        doc = fitz.open(filepath)
        text = ""
        for page in doc:
            try:
                text += page.get_text("text", flags=0) + "\n"
            except Exception:
                text += page.get_text("text", flags=0, clip=None, morph=None, errors="ignore") + "\n"

        # Simulate heading detection: (replace this with your real NLP logic)
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        headings = [line for line in lines if line.isupper() or len(line.split()) < 6]

        if not headings:
            headings = ["Full Document"]

        result["outline"] = headings

    except Exception as e:
        print(f"[1A ERROR] Failed processing {filepath}: {e}")
        result["outline"] = ["Full Document (Error reading text)"]

    # Save to JSON file
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    return [result]
    
# ------------------------------------------------------------------
# MAIN
# ------------------------------------------------------------------
if __name__ == "__main__":
    print("[Techverse] Running PDF Outline Extraction")
    print(f"[Techverse] Input directory: {INPUT_DIR}")
    print(f"[Techverse] Output directory: {OUTPUT_DIR}")
    print(
        f"[Techverse] Extended: {'on' if EXTENDED else 'off'} | Font-based level: {'on' if USE_FONT else 'off'} | Hierarchy: {'on' if HIERARCHY else 'off'}"
    )
    process_pdfs()
