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
import itertools
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

import structlog

from constants import (
    CHAR_TO_ID,
    LABEL_MERGE_MAP,
    LABELS,
    RAW_LATIN_LANGS,
    VOCAB_CHARS,
)
from romanize import hangul_word_to_rr, kana_to_romaji, pinyin_to_plain

TRAINING_DIR = Path(__file__).resolve().parent
RAW_DIR = TRAINING_DIR / "data" / "raw"
WORDS_CSV = TRAINING_DIR / "data" / "words.csv"
SUMMARY_JSON = TRAINING_DIR / "data" / "data_summary.json"
EXAMPLES_JSON = TRAINING_DIR.parent / "public" / "model" / "examples.json"
EXAMPLES_PER_LANG = 1500

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


def parse_frequency_list(path: Path) -> list[str]:
    """`word<space or tab>count` 形式の頻度リストをパースし、語彙に収まる単語を
    頻度(count)降順に並べたリストで返す(examples.json用に頻度順を保持する)。"""
    counts: dict[str, int] = {}
    with path.open(encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split(maxsplit=1)
            word = parts[0].lower()
            if not _is_valid_latin_word(word):
                continue
            try:
                count = int(parts[1]) if len(parts) > 1 else 0
            except ValueError:
                count = 0
            # 同じ単語が複数行にまたがる場合は最大のcountを採用する
            if count > counts.get(word, -1):
                counts[word] = count
    return sorted(counts, key=lambda w: counts[w], reverse=True)


def collect_latin_languages() -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for code in RAW_LATIN_LANGS:
        url = FREQ_WORDS_URL.format(code=code)
        dest = RAW_DIR / f"{code}_50k.txt"
        _download(url, dest)
        words = parse_frequency_list(dest)
        log.info("parsed latin language", lang=code, n_words=len(words))
        result[code] = words
    return result


def collect_japanese() -> list[str]:
    """JMdictをentry単位で走査し、各entryが頻度タグ(re_pri/ke_pri、値は問わず
    存在の有無だけを見る。ichi1/news1/spec1/gai1/nfXX等)を持つかどうかで
    「よく使われる語」を判定する。examples.json用に、優先度タグ有りの読みを
    先頭にしたリストを返す(words.csv用の重複排除もここで行う)。"""
    dest = RAW_DIR / "JMdict_e.gz"
    _download(JMDICT_URL, dest)
    log.info("parsing JMdict (this can take a little while)")

    with gzip.open(dest, "rb") as f:
        tree = ET.parse(f)
    root = tree.getroot()

    seen: set[str] = set()
    common_words: list[str] = []
    other_words: list[str] = []
    n_skipped_unrecognized = 0
    n_skipped_too_short = 0
    for entry in root.iter("entry"):
        is_common = any(
            r_ele.find("re_pri") is not None for r_ele in entry.iter("r_ele")
        ) or any(k_ele.find("ke_pri") is not None for k_ele in entry.iter("k_ele"))

        for r_ele in entry.iter("r_ele"):
            reb = r_ele.find("reb")
            if reb is None or not reb.text:
                continue
            reading = reb.text.strip()

            romaji = kana_to_romaji(reading)
            if romaji is None:
                n_skipped_unrecognized += 1
                continue
            # 1モーラの読みは短すぎて曖昧なノイズになりやすいため除外する
            # (仕様の「1〜2モーラは判断による」に基づき、2モーラ以上を採用する決定とした)。
            if len(reading) < 2:
                n_skipped_too_short += 1
                continue
            if not _is_valid_latin_word(romaji):
                continue
            if romaji in seen:
                continue
            seen.add(romaji)
            (common_words if is_common else other_words).append(romaji)

    log.info(
        "japanese romanization done",
        n_words=len(seen),
        n_common=len(common_words),
        n_skipped_unrecognized_chars=n_skipped_unrecognized,
        n_skipped_too_short=n_skipped_too_short,
    )
    return common_words + other_words


_CEDICT_LINE_RE = re.compile(r"^(?P<trad>\S+)\s+(?P<simp>\S+)\s+\[(?P<pinyin>[^\]]*)\]\s+/")


def collect_chinese() -> list[str]:
    """CC-CEDICTには頻度情報がないため、examples.json用の順序は単純な辞書順
    (アルファベット順)で妥協する(DATA.md参照)。"""
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
    return sorted(words)


_HANGUL_ONLY_RE = re.compile(r"^[가-힣]+$")


def collect_korean() -> list[str]:
    """FrequencyWordsのko_50k.txtの頻度順を保持したままローマ字化する
    (examples.json用の頻度順ソートに使う)。"""
    url = FREQ_WORDS_URL.format(code="ko")
    dest = RAW_DIR / "ko_50k.txt"
    _download(url, dest)

    seen: set[str] = set()
    words: list[str] = []
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
            if romanized not in seen:
                seen.add(romanized)
                words.append(romanized)

    log.info(
        "korean romanization done",
        n_words=len(words),
        n_skipped_non_hangul=n_skipped_non_hangul,
    )
    return words


def build_examples(all_words: dict[str, list[str]]) -> dict[str, list[str]]:
    """フロントエンドの「実例単語」機能用に、統合後の23クラス(constants.LABELS)
    それぞれについて、頻度順(collect_*()が返す順序)の上位EXAMPLES_PER_LANG件を
    まとめる。統合クラスタ(例: es_pt)は元言語(es, pt)のリストを交互に
    織り交ぜてから上限を適用する(どちらか一方に偏らないように)。"""
    # 統合後の各ラベルがどの元言語コードから構成されるかを逆引きする
    sources_by_new_label: dict[str, list[str]] = {}
    for old_code, new_label in LABEL_MERGE_MAP.items():
        sources_by_new_label.setdefault(new_label, []).append(old_code)

    examples: dict[str, list[str]] = {}
    for label in LABELS:
        if label == "unk":
            continue
        source_codes = sources_by_new_label.get(label, [label])
        # 極端に短い単語(the, a, 's...)は最頻出ではあるが、2〜4文字の部分文字列と
        # 一致しにくく「実例」として役に立たないため、examples.json用には除外する
        # (words.csv=学習データ側は変更しない)。
        lists = [
            [w for w in all_words[code] if len(w) >= 4]
            for code in source_codes
            if code in all_words
        ]
        # 複数言語を交互に織り交ぜる(どれか1つに偏らないように)。
        # zip_longestで長さの違いを吸収し、Noneの穴は詰めて捨てる。
        merged = [
            w for tup in itertools.zip_longest(*lists) for w in tup if w is not None
        ]
        examples[label] = merged[:EXAMPLES_PER_LANG]

    return examples


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    assert set(VOCAB_CHARS) == set(CHAR_TO_ID.keys())  # sanity check

    all_words: dict[str, list[str]] = collect_latin_languages()
    all_words["ja"] = collect_japanese()
    all_words["zh"] = collect_chinese()
    all_words["ko"] = collect_korean()

    WORDS_CSV.parent.mkdir(parents=True, exist_ok=True)
    with WORDS_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["word", "lang"])
        for lang, words in all_words.items():
            for word in sorted(set(words)):
                writer.writerow([word, lang])

    summary = {lang: len(words) for lang, words in all_words.items()}
    with SUMMARY_JSON.open("w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False, sort_keys=True)

    log.info("done", total_words=sum(summary.values()), per_language=summary)
    low = {lang: n for lang, n in summary.items() if n < 2000}
    if low:
        log.warning("languages with fewer than 2000 words after filtering", languages=low)

    examples = build_examples(all_words)
    EXAMPLES_JSON.parent.mkdir(parents=True, exist_ok=True)
    with EXAMPLES_JSON.open("w", encoding="utf-8") as f:
        json.dump(examples, f, ensure_ascii=False, indent=2)
    log.info(
        "wrote examples.json",
        path=str(EXAMPLES_JSON),
        per_label={label: len(words) for label, words in examples.items()},
    )


if __name__ == "__main__":
    main()
