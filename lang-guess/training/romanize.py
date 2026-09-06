"""日本語(ローマ字)・韓国語(RR)・中国語(拼音)のローマ字化ロジック。

3言語ともASCII a-z(+一部記号)だけの「カジュアルなタイピング」を想定した簡略化
ローマ字化であり、正式なローマ字表記規則とは異なる箇所がある。各関数のdocstringに
簡略化の内容を明記する。
"""

from __future__ import annotations

import re

# ============================================================
# 日本語: かな -> ヘボン式(簡略版)ローマ字
# ============================================================

# 基本のひらがな単独モーラ表。
_HIRAGANA_BASE: dict[str, str] = {
    "あ": "a", "い": "i", "う": "u", "え": "e", "お": "o",
    "か": "ka", "き": "ki", "く": "ku", "け": "ke", "こ": "ko",
    "が": "ga", "ぎ": "gi", "ぐ": "gu", "げ": "ge", "ご": "go",
    "さ": "sa", "し": "shi", "す": "su", "せ": "se", "そ": "so",
    "ざ": "za", "じ": "ji", "ず": "zu", "ぜ": "ze", "ぞ": "zo",
    "た": "ta", "ち": "chi", "つ": "tsu", "て": "te", "と": "to",
    "だ": "da", "ぢ": "ji", "づ": "zu", "で": "de", "ど": "do",
    "な": "na", "に": "ni", "ぬ": "nu", "ね": "ne", "の": "no",
    "は": "ha", "ひ": "hi", "ふ": "fu", "へ": "he", "ほ": "ho",
    "ば": "ba", "び": "bi", "ぶ": "bu", "べ": "be", "ぼ": "bo",
    "ぱ": "pa", "ぴ": "pi", "ぷ": "pu", "ぺ": "pe", "ぽ": "po",
    "ま": "ma", "み": "mi", "む": "mu", "め": "me", "も": "mo",
    "や": "ya", "ゆ": "yu", "よ": "yo",
    "ら": "ra", "り": "ri", "る": "ru", "れ": "re", "ろ": "ro",
    "わ": "wa", "ゐ": "i", "ゑ": "e", "を": "o",
    # 小書きの母音(外来語表記などで単独モーラとして現れることがある)
    "ぁ": "a", "ぃ": "i", "ぅ": "u", "ぇ": "e", "ぉ": "o",
    "ゔ": "vu",
}

# 拗音(ようおん): 子音+small ya/yu/yo の2文字モーラ。
_HIRAGANA_YOON: dict[str, str] = {
    "きゃ": "kya", "きゅ": "kyu", "きょ": "kyo",
    "ぎゃ": "gya", "ぎゅ": "gyu", "ぎょ": "gyo",
    "しゃ": "sha", "しゅ": "shu", "しょ": "sho",
    "じゃ": "ja", "じゅ": "ju", "じょ": "jo",
    "ちゃ": "cha", "ちゅ": "chu", "ちょ": "cho",
    "ぢゃ": "ja", "ぢゅ": "ju", "ぢょ": "jo",
    "にゃ": "nya", "にゅ": "nyu", "にょ": "nyo",
    "ひゃ": "hya", "ひゅ": "hyu", "ひょ": "hyo",
    "びゃ": "bya", "びゅ": "byu", "びょ": "byo",
    "ぴゃ": "pya", "ぴゅ": "pyu", "ぴょ": "pyo",
    "みゃ": "mya", "みゅ": "myu", "みょ": "myo",
    "りゃ": "rya", "りゅ": "ryu", "りょ": "ryo",
}

_HIRAGANA_TO_KATAKANA_OFFSET = 0x60


def _shift(ch: str, offset: int) -> str:
    return chr(ord(ch) + offset)


# カタカナは対応するひらがなと同じ規則構造を持ち、コードポイントが+0x60の関係に
# あるため、ひらがな表をシフトして機械的に生成する。
_KATAKANA_BASE: dict[str, str] = {
    _shift(k, _HIRAGANA_TO_KATAKANA_OFFSET): v for k, v in _HIRAGANA_BASE.items()
}
_KATAKANA_YOON: dict[str, str] = {
    "".join(_shift(c, _HIRAGANA_TO_KATAKANA_OFFSET) for c in k): v
    for k, v in _HIRAGANA_YOON.items()
}

_SOKUON = {"っ", "ッ"}
_MORAIC_N = {"ん", "ン"}
_CHOONPU = "ー"  # カタカナ長音符(ひらがなには通常出現しないが、外来語表記のreadingで使われる)

_SINGLE_MORA: dict[str, str] = {**_HIRAGANA_BASE, **_KATAKANA_BASE}
_YOON_MORA: dict[str, str] = {**_HIRAGANA_YOON, **_KATAKANA_YOON}

_VOWELS = "aeiou"


def kana_to_romaji(reading: str) -> str | None:
    """かな(ひらがな/カタカナ)のreadingを簡略ヘボン式ローマ字に変換する。

    JMdictの<reb>要素はほぼ常にひらがなだが、外来語エントリではカタカナが
    使われることもあるため両方を認識する。認識できない文字(漢字・記号・数字など)
    が含まれる場合はNoneを返す(呼び出し側でスキップしてカウントする)。

    簡略化ルール(タスク仕様どおり):
    - 長音: モーラをそのまま連結するだけ(とうきょう -> "toukyou"、マカーオ ->
      長音符ーは直前モーラの母音を繰り返す)。
    - っ/ッ(促音): 次のモーラの子音を重ねる(がっこう -> "gakkou")。
      「っち」のような本来「tchi」となる例外は簡略化により「cchi」になる
      (次モーラのローマ字の先頭文字を単純に重ねるだけのため)。
    - ん/ン: 常に"n"(本来のb/m/p前での"m"化は簡略化により行わない)。
    """
    result: list[str] = []
    pending_geminate = False
    i = 0
    n = len(reading)
    while i < n:
        ch = reading[i]

        if ch in _SOKUON:
            pending_geminate = True
            i += 1
            continue

        if ch in _MORAIC_N:
            mora_romaji = "n"
            i += 1
        elif ch == _CHOONPU:
            if not result or result[-1][-1] not in _VOWELS:
                return None
            mora_romaji = result[-1][-1]
            i += 1
        else:
            # 2文字の拗音(子音+small ya/yu/yo)を先にチェックする。
            two = reading[i : i + 2]
            if two in _YOON_MORA:
                mora_romaji = _YOON_MORA[two]
                i += 2
            elif ch in _SINGLE_MORA:
                mora_romaji = _SINGLE_MORA[ch]
                i += 1
            else:
                return None  # 漢字・数字・記号など認識できない文字

        if pending_geminate:
            mora_romaji = mora_romaji[0] + mora_romaji
            pending_geminate = False

        result.append(mora_romaji)

    return "".join(result)


# ============================================================
# 韓国語: ハングル -> Revised Romanization(簡略版、音韻変化なし)
# ============================================================

_RR_INITIAL = [
    "g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s",
    "ss", "", "j", "jj", "ch", "k", "t", "p", "h",
]
_RR_MEDIAL = [
    "a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa",
    "wae", "oe", "yo", "u", "weo", "we", "wi", "yu", "eu", "ui", "i",
]
_RR_FINAL = [
    "", "g", "kk", "gs", "n", "nj", "nh", "d", "l", "lg",
    "lm", "lb", "ls", "lt", "lp", "lh", "m", "b", "bs", "s",
    "ss", "ng", "j", "ch", "k", "t", "p", "h",
]

_HANGUL_BASE = 0xAC00
_HANGUL_LAST = 0xD7A3


def hangul_syllable_to_rr(ch: str) -> str | None:
    """ハングル音節1文字(U+AC00-U+D7A3)をRevised Romanizationの綴りに変換する。

    仕様どおり、音節境界をまたぐ音韻変化(例: ㄹ+ㄴ -> ll)は適用せず、
    各音節を独立にinitial+medial+finalへ分解してテーブル変換するだけの簡略版。
    範囲外の文字(数字・記号・分離されたjamoなど)にはNoneを返す。
    """
    code = ord(ch)
    if not (_HANGUL_BASE <= code <= _HANGUL_LAST):
        return None
    offset = code - _HANGUL_BASE
    initial = offset // (21 * 28)
    medial = (offset % (21 * 28)) // 28
    final = offset % 28
    return _RR_INITIAL[initial] + _RR_MEDIAL[medial] + _RR_FINAL[final]


def hangul_word_to_rr(word: str) -> str | None:
    """ハングルのみからなる単語をRRローマ字化する。非ハングル文字を含む場合はNone。"""
    romanized = []
    for ch in word:
        r = hangul_syllable_to_rr(ch)
        if r is None:
            return None
        romanized.append(r)
    return "".join(romanized)


# ============================================================
# 中国語: CC-CEDICTの拼音表記 -> 声調なし・記号なしローマ字
# ============================================================

_PINYIN_TONE_DIGIT_RE = re.compile(r"[1-5]")
_NON_LETTER_RE = re.compile(r"[^a-z]")


def pinyin_to_plain(pinyin_field: str) -> str | None:
    """CC-CEDICTの角括弧内拼音(例: "ni3 hao3")を声調・記号なしの連結文字列に変換する。

    数字(声調)とスペース・中黒(·)などの記号を取り除き、小文字化して連結する。
    結果がa-zのみの空でない文字列でなければNoneを返す。
    """
    text = pinyin_field.lower()
    text = _PINYIN_TONE_DIGIT_RE.sub("", text)
    text = _NON_LETTER_RE.sub("", text)
    if not text:
        return None
    return text
