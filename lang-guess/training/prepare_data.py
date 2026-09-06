"""生データのダウンロード・パース・ローマ字化を行い、単一のデータセットCSVを書き出す。

- ラテン文字表記の27言語: hermitdave/FrequencyWordsの頻度リストをそのまま利用。
- 日本語(ja): JMdict(EDRDG, CC BY-SA)から読み(かな)を抽出しヘボン式簡略ローマ字化。
- 中国語(zh): CC-CEDICT(MDBG, CC BY-SA)から拼音を抽出し声調・記号を除去。
- 韓国語(ko): FrequencyWordsのko_50kのハングル単語をRevised Romanization簡略版で変換。

実行:
    uv run python training/prepare_data.py

出力:
    training/data/words.csv        (word,lang の2列)
    training/data/data_summary.json (言語別の最終件数と、ja/zh/koのスキップ件数)
    training/data/raw/             (ダウンロードした生データのキャッシュ。.gitignore対象)
"""

from __future__ import annotations

import csv
import gzip
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

import structlog

from constants import CHAR_TO_ID, LATIN_LANGS, VOCAB_CHARS
from romanize import hangul_word_to_rr, kana_to_romaji, pinyin_to_plain

TRAINING_DIR = Path(__file__).resolve().parent
RAW_DIR = TRAINING_DIR / "data" / "raw"
WORDS_CSV = TRAINING_DIR / "data" / "words.csv"
SUMMARY_JSON = TRAINING_DIR / "data" / "data_summary.json"

FREQ_WORDS_URL = (
    "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/"
    "content/2018/{code}/{code}_50k.txt"
)
JMDICT_URL = "http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz"
CEDICT_URL = "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz"

# 語彙(a-z + ' + -)のみからなる単語かどうかを判定する正規表現。
# 少なくとも1つのa-z文字を含むことを要求する(アポストロフィ/ハイフンのみは除外)。
_VALID_LATIN_WORD_RE = re.compile(r"^[a-z'-]*[a-z][a-z'-]*$")

log = structlog.get_logger()


def _download(url: str, dest: Path) -> Path:
    if dest.exists():
        log.info("using cached download", url=url, dest=str(dest))
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    log.info("downloading", url=url)
    req = urllib.request.Request(url, headers={"User-Agent": "lang-guess-training/0.1"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = resp.read()
    dest.write_bytes(data)
    log.info("downloaded", url=url, bytes=len(data))
    return dest


def _is_valid_latin_word(word: str) -> bool:
    return bool(_VALID_LATIN_WORD_RE.match(word))


def parse_frequency_list(path: Path) -> set[str]:
    """`word<space or tab>count` 形式の頻度リストをパースし、語彙に収まる単語集合を返す。"""
    words: set[str] = set()
    with path.open(encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split(maxsplit=1)
            word = parts[0].lower()
            if _is_valid_latin_word(word):
                words.add(word)
    return words


def collect_latin_languages() -> dict[str, set[str]]:
    result: dict[str, set[str]] = {}
    for code in LATIN_LANGS:
        url = FREQ_WORDS_URL.format(code=code)
        dest = RAW_DIR / f"{code}_50k.txt"
        _download(url, dest)
        words = parse_frequency_list(dest)
        log.info("parsed latin language", lang=code, n_words=len(words))
        result[code] = words
    return result


def collect_japanese() -> set[str]:
    dest = RAW_DIR / "JMdict_e.gz"
    _download(JMDICT_URL, dest)
    log.info("parsing JMdict (this can take a little while)")

    with gzip.open(dest, "rb") as f:
        tree = ET.parse(f)
    root = tree.getroot()

    readings: set[str] = set()
    for r_ele in root.iter("r_ele"):
        reb = r_ele.find("reb")
        if reb is not None and reb.text:
            readings.add(reb.text.strip())

    log.info("extracted kana readings", n_readings=len(readings))

    words: set[str] = set()
    n_skipped_unrecognized = 0
    n_skipped_too_short = 0
    for reading in readings:
        romaji = kana_to_romaji(reading)
        if romaji is None:
            n_skipped_unrecognized += 1
            continue
        # 1モーラの読みは短すぎて曖昧なノイズになりやすいため除外する
        # (仕様の「1〜2モーラは判断による」に基づき、2モーラ以上を採用する決定とした)。
        if len(reading) < 2:
            n_skipped_too_short += 1
            continue
        if _is_valid_latin_word(romaji):
            words.add(romaji)

    log.info(
        "japanese romanization done",
        n_words=len(words),
        n_skipped_unrecognized_chars=n_skipped_unrecognized,
        n_skipped_too_short=n_skipped_too_short,
    )
    return words


_CEDICT_LINE_RE = re.compile(r"^(?P<trad>\S+)\s+(?P<simp>\S+)\s+\[(?P<pinyin>[^\]]*)\]\s+/")


def collect_chinese() -> set[str]:
    dest = RAW_DIR / "cedict_1_0_ts_utf-8_mdbg.txt.gz"
    _download(CEDICT_URL, dest)

    words: set[str] = set()
    n_skipped_unparsed = 0
    n_skipped_invalid = 0
    with gzip.open(dest, "rt", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if not line or line.startswith("#"):
                continue
            m = _CEDICT_LINE_RE.match(line)
            if not m:
                n_skipped_unparsed += 1
                continue
            plain = pinyin_to_plain(m.group("pinyin"))
            if plain is None or len(plain) < 2 or not _is_valid_latin_word(plain):
                n_skipped_invalid += 1
                continue
            words.add(plain)

    log.info(
        "chinese romanization done",
        n_words=len(words),
        n_skipped_unparsed_lines=n_skipped_unparsed,
        n_skipped_invalid_pinyin=n_skipped_invalid,
    )
    return words


_HANGUL_ONLY_RE = re.compile(r"^[가-힣]+$")


def collect_korean() -> set[str]:
    url = FREQ_WORDS_URL.format(code="ko")
    dest = RAW_DIR / "ko_50k.txt"
    _download(url, dest)

    words: set[str] = set()
    n_skipped_non_hangul = 0
    with dest.open(encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            hangul_word = line.split(maxsplit=1)[0]
            if not _HANGUL_ONLY_RE.match(hangul_word):
                n_skipped_non_hangul += 1
                continue
            romanized = hangul_word_to_rr(hangul_word)
            if romanized is None or not _is_valid_latin_word(romanized):
                n_skipped_non_hangul += 1
                continue
            words.add(romanized)

    log.info(
        "korean romanization done",
        n_words=len(words),
        n_skipped_non_hangul=n_skipped_non_hangul,
    )
    return words


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    assert set(VOCAB_CHARS) == set(CHAR_TO_ID.keys())  # sanity check

    all_words: dict[str, set[str]] = collect_latin_languages()
    all_words["ja"] = collect_japanese()
    all_words["zh"] = collect_chinese()
    all_words["ko"] = collect_korean()

    WORDS_CSV.parent.mkdir(parents=True, exist_ok=True)
    with WORDS_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["word", "lang"])
        for lang, words in all_words.items():
            for word in sorted(words):
                writer.writerow([word, lang])

    summary = {lang: len(words) for lang, words in all_words.items()}
    with SUMMARY_JSON.open("w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False, sort_keys=True)

    log.info("done", total_words=sum(summary.values()), per_language=summary)
    low = {lang: n for lang, n in summary.items() if n < 2000}
    if low:
        log.warning("languages with fewer than 2000 words after filtering", languages=low)


if __name__ == "__main__":
    main()
