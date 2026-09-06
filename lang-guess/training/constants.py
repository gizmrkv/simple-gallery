"""prepare_data.py / generate_unknown.py / dataset.py / train.py / export_onnx.py が共有する定数。

ラベル順序とトークナイザ語彙は、フロントエンド(../src/tokenize.ts, ../src/labels.ts)が
期待する契約と完全に一致していなければならない。ここを変更する場合は
export_onnx.pyが書き出すvocab.jsonの内容も連動して変わるので注意。
"""

from __future__ import annotations

# ラベル順序(出力ロジットのインデックスと対応)。src/labels.tsのLANGUAGE_NAMESと
# 同じ言語コード・同じ並び順にしてある(必須ではないが対応を追いやすくするため)。
LATIN_LANGS: list[str] = [
    "en", "es", "fr", "de", "it", "pt", "nl", "sv", "no", "da",
    "fi", "is", "pl", "cs", "sk", "sl", "hr", "hu", "ro", "tr",
    "id", "ms", "vi", "ca", "eu", "lt", "lv",
]
ROMANIZED_LANGS: list[str] = ["ja", "zh", "ko"]
UNK_LABEL = "unk"

LABELS: list[str] = [*LATIN_LANGS, *ROMANIZED_LANGS, UNK_LABEL]
assert len(LABELS) == 31

# 文字語彙: 小文字a-z + アポストロフィ + ハイフン。id 0 = PAD、語彙外の文字は
# unk_char_id に落とす(学習時・フロントエンド推論時で同じ規則を使う: src/tokenize.tsのencode()参照)。
VOCAB_CHARS: str = "abcdefghijklmnopqrstuvwxyz'-"
PAD_ID = 0
CHAR_TO_ID: dict[str, int] = {ch: i + 1 for i, ch in enumerate(VOCAB_CHARS)}
UNK_CHAR_ID = len(VOCAB_CHARS) + 1  # = 29
VOCAB_SIZE = UNK_CHAR_ID + 1  # = 30 (id 0..29)

DATA_DIR = "data"
RAW_DIR = "data/raw"
WORDS_CSV = "data/words.csv"
SUMMARY_JSON = "data/data_summary.json"
