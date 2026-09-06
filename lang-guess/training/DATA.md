# データソースとライセンス

`training/prepare_data.py` と `training/generate_unknown.py` が生成する
`training/data/words.csv`(`word,lang` の2列、31クラス)の出典・ライセンス・
フィルタリング/簡略化の方針をまとめる。生データ本体は `training/data/raw/`
にキャッシュされるが、リポジトリにはコミットしない(`.gitignore`対象)。

## ラテン文字表記27言語

en, es, fr, de, it, pt, nl, sv, no, da, fi, is, pl, cs, sk, sl, hr, hu, ro, tr,
id, ms, vi, ca, eu, lt, lv

- 出典: [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords)
  (`content/2018/{code}/{code}_50k.txt`)
- ライセンス: リポジトリ内で明記(MIT。詳細はリポジトリのLICENSE参照)
- フィルタ: 各行 `word<空白>count` の先頭トークンを小文字化し、
  `^[a-z'-]*[a-z][a-z'-]*$`(a-z・アポストロフィ・ハイフンのみ、
  a-zを1文字以上含む)にマッチする単語だけを採用。数字を含む行、
  記号のみの行、アクセント記号付きラテン文字(é, ñ, ü, þ, ð など)を含む
  単語は除外した。
  - この「アクセント記号を含む単語を除外する」という判断は、トークナイザの
    語彙が a-z + `'` + `-` のみ(フロントエンドの入力もプレーンなASCII
    a-zキー入力を想定)であることに合わせたもの。アクセントを保持したまま
    学習に入れると、学習時にそれらの文字が全部同じ`unk_char_id`に潰れて
    しまい、区別に使えないノイズになるだけなので、あらかじめ除外する方が
    データがきれいになると判断した。
  - 副作用として、アクセント記号を多用する言語(is, cs, sk, sl, hr, pl,
    hu, tr, vi など)では通過する単語数が他言語よりやや少なくなっている
    (それでも最終的に全言語 20,000語以上を確保できている。詳細は
    `data/data_summary.json`参照)。

## 日本語(ja): ローマ字化

- 出典: [JMdict](http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz) (EDRDG,
  Electronic Dictionary Research and Development Group)
- ライセンス: Creative Commons Attribution-ShareAlike 4.0
  ([EDRDGライセンス規定](https://www.edrdg.org/edrdg/licence.html)参照)
- 抽出: `<r_ele><reb>`(かな読み)のみを使用。`<keb>`(漢字表記)は使わない。
- ローマ字化: `training/romanize.py::kana_to_romaji()` に実装した
  簡略ヘボン式コンバータ(ひらがな・カタカナの基本表+濁点/半濁点+拗音を
  フルスクラッチ実装)。簡略化ルール:
  - 長音はモーラをそのまま連結する(とうきょう -> `toukyou`。
    「トーキョー」のように短縮しない)。カタカナ長音符「ー」は
    直前モーラの母音を繰り返す。
  - 促音(っ/ッ)は次のモーラの子音を重ねる(がっこう -> `gakkou`)。
    「っち」のような本来「tchi」となる例外ケースも、次モーラのローマ字の
    先頭文字を単純に重ねるだけ(`cchi`)にしている。
  - ん/ンは常に`n`(伝統的なb/m/p前での"m"化は行わない)。
  - 漢字・数字・認識できない記号を含む読みはスキップし件数をログに出力する
    (実行時ログで確認可能。最終ラン時点で漢字等を含みスキップされた件数は
    後述のログ参照)。
  - 1モーラのみの読み(え、を、等)は曖昧なノイズになりやすいため除外した。
    2モーラ以上を採用する、という判断で実装している(仕様に明記された
    「1〜2モーラは判断による」という指示への対応)。

## 中国語(zh): 拼音化

- 出典: [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cc-cedict)
  (MDBG配布版 `cedict_1_0_ts_utf-8_mdbg.txt.gz`)
- ライセンス: Creative Commons Attribution-ShareAlike 4.0
- 抽出: `traditional simplified [pinyin] /definitions/` 形式の行から
  角括弧内の拼音を抽出。
- 変換: 声調番号(1-5)と、スペース・中黒などの記号を除去し、小文字化して
  連結(`[ni3 hao3]` -> `nihao`)。結果がa-zのみ・2文字以上の文字列のみ採用。

## 韓国語(ko): ローマ字化

- 出典: [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords)
  (`content/2018/ko/ko_50k.txt`)
- ライセンス: MIT(FrequencyWordsリポジトリと同じ)
- フィルタ: 単語全体がハングル音節(U+AC00–U+D7A3)のみからなるものだけ採用。
- 変換: `training/romanize.py::hangul_word_to_rr()` に実装した
  Revised Romanization(RR)簡略版。各ハングル音節を
  `code = ord(ch) - 0xAC00; initial = code // (21*28); medial = (code % (21*28)) // 28;
  final = code % 28` で分解し、標準RRの初声/中声/終声テーブルで変換して単純連結する。
  音節境界をまたぐ音韻変化(例: ㄹ+ㄴ -> ll)は適用しない、という仕様どおりの簡略版。
  - **仕様からの訂正**: タスク仕様に明記された初声(initial)テーブルの
    12番目の値が `ng` となっていたが、これは韓国語のハングル字母の並び
    (ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆ**ㅇ**ㅈㅉㅊㅋㅌㅍㅎ)における12番目の字母
    `ㅇ` が「初声としては無音」であるという実際のRevised Romanizationの
    規則と矛盾する(`ㅇ`が"ng"になるのは終声(final)の場合のみ)。仕様の
    終声テーブルには正しく`ng`が含まれている(終声21番目)ため、これは
    テーブルの転記ミスと判断し、初声12番目は空文字列`""`(無音)として実装した。
    文字どおりに`ng`を使うと、母音で始まるほぼ全ての音節(例: 아=a, 어=eo,
    안녕=annyeong など、非常に高頻度)の頭に不要な`ng`が付いてしまい
    (例: 안녕 -> `nganneong` のような誤った結果)、韓国語クラス全体の
    ローマ字化が実用にならないほど壊れるため、実際の標準規則を優先した。

## UNKNOWN(unk)クラス: 合成ネガティブ

`training/generate_unknown.py` が以下3種類の生成器で合成する(詳細は
スクリプト内のdocstring参照):

1. 一様ランダム(a-zから一様サンプル、長さは全実単語の長さ分布からサンプル)
2. 文字bigramマルコフ連鎖(全実単語から学習)
3. 実単語のシャッフル(既存の実単語と一致した場合は棄却)

いずれの生成器についても、生成結果が実データセット中の実在単語と偶然一致した
場合はunk行から除外している(同じ文字列が実言語ラベルとunkラベルの両方で
出現するというラベル矛盾を避けるため。仕様ではこの重複排除は生成器3のみに
求められていたが、ラベル整合性のため3つの生成器すべてに適用した)。

## 生データのキャッシュ

`training/data/raw/` にダウンロード生データをキャッシュする(2回目以降の
実行を高速化するため)。このディレクトリはリポジトリにコミットしない
想定(`training/.gitignore`で除外済み)。
