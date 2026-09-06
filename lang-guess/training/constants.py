"""prepare_data.py / generate_unknown.py / dataset.py / train.py / export_onnx.py が共有する定数。

ラベル順序とトークナイザ語彙は、フロントエンド(../src/tokenize.ts, ../src/labels.ts)が
期待する契約と完全に一致していなければならない。ここを変更する場合は
export_onnx.pyが書き出すvocab.jsonの内容も連動して変わるので注意。
"""

from __future__ import annotations

# hermitdave/FrequencyWordsから実際にダウンロードする生の言語コード(27言語、
# 統合/除外を行う前)。prepare_data.pyのダウンロード先URL組み立てにのみ使う。
# 下のLATIN_LANGS(統合後、モデルのクラスに対応)とは別物なので注意。
RAW_LATIN_LANGS: list[str] = [
    "en", "es", "fr", "de", "it", "pt", "nl", "sv", "no", "da",
    "fi", "is", "pl", "cs", "sk", "sl", "hr", "hu", "ro", "tr",
    "id", "ms", "vi", "ca", "eu", "lt", "lv",
]

# ラベル順序(出力ロジットのインデックスと対応)。src/labels.tsのLANGUAGE_NAMESと
# 同じ言語コード・同じ並び順にしてある(必須ではないが対応を追いやすくするため)。
#
# v1(31クラス)の混同行列分析で、近縁言語ペア/トリオでの双方向の混同
# (id/ms, cs/sk, sl/hr, sv/no/da, es/pt, lt/lv)と、ベトナム語(vi)への
# 一方的な誤答吸着(アクセント記号を落とすと単語が短く曖昧になるため)が
# 精度低下の主因と判明したため、v2ではviを除外し、上記6クラスタをそれぞれ
# 1つのラベルに統合する。詳細はDATA.mdの「クラス統合/ベトナム語除外」節を参照。
LATIN_LANGS: list[str] = [
    "en", "fr", "de", "it", "nl", "fi", "is", "pl", "hu", "ro", "tr", "ca", "eu",
    "es_pt", "scand", "cs_sk", "sl_hr", "id_ms", "lt_lv",
]
ROMANIZED_LANGS: list[str] = ["ja", "zh", "ko"]
UNK_LABEL = "unk"

LABELS: list[str] = [*LATIN_LANGS, *ROMANIZED_LANGS, UNK_LABEL]
assert len(LABELS) == 23

# 統合前の生データ(data/words.csv)は元の言語コード(31クラス相当)のままなので、
# load_rows()側でこのマップを使って読み替える。生データ自体は書き換えない
# (将来ベトナム語にアクセント記号対応を追加する場合などに再利用できるように)。
LABEL_MERGE_MAP: dict[str, str] = {
    "es": "es_pt", "pt": "es_pt",
    "sv": "scand", "no": "scand", "da": "scand",
    "cs": "cs_sk", "sk": "cs_sk",
    "sl": "sl_hr", "hr": "sl_hr",
    "id": "id_ms", "ms": "id_ms",
    "lt": "lt_lv", "lv": "lt_lv",
}
DROPPED_LANGS: set[str] = {"vi"}

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
