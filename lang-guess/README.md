# simple-lang-guess

アルファベットで単語を入力すると、どの言語(ローマ字化した日本語・中国語・
韓国語を含む)らしいかを、ブラウザ上で動作するニューラルネットワークが
推定するデモ。

[デモを見る](https://gizmrkv.github.io/simple-gallery/lang-guess/)

## 遊び方

- 入力欄にアルファベットで単語を入れて「判定する」を押す。
- 23クラス(ラテン文字表記言語13+近縁言語を統合した6クラスタ+ローマ字化した
  日本語/中国語/韓国語+「どの言語にも該当しない」)のうち、確率が高い順に
  上位10件をランキング表示する。近縁言語(例: インドネシア語/マレー語)は
  単語単体では区別が難しいため1つのクラスタにまとめてある(詳細は
  [training/DATA.md](training/DATA.md)参照)。
- 単語の下に文字ごとの色付き表示が出る。ある文字を隠して推論し直したときに
  一番上の予測確率がどれだけ下がるかを寄与度として計算しており(勾配を使わない
  perturbation系の特徴帰属)、寄与が大きい文字ほど濃く表示される。

## 仕組み

- 文字レベルのCNN(文字埋め込み+複数カーネル幅のConv1d+global max pooling)を
  PyTorchで学習し、ONNXにエクスポートしたものを[public/model/lang-id.onnx](public/model/lang-id.onnx)
  として同梱している。推論は[onnxruntime-web](https://github.com/microsoft/onnxruntime)で
  ブラウザ内WASM実行のみ(サーバー通信なし)。
- 学習データはhermitdave/FrequencyWords(欧州言語中心)・JMdict(日本語)・
  CC-CEDICT(中国語)を組み合わせ、未知の文字列を検出するための合成負例
  (ランダム文字列・文字bigramマルコフ連鎖・実在単語のシャッフル)も混ぜて学習した。
  データソース・ローマ字化ルール・学習結果の詳細は
  [training/DATA.md](training/DATA.md)と[training/README.md](training/README.md)を参照。
- 学習パイプライン(`training/`)はViteのビルド対象外の独立したPythonプロジェクト
  (uv管理)。ここで生成した`public/model/lang-id.onnx`・`vocab.json`だけを
  フロントエンドが読み込む。

## 開発

```sh
npm install
npm run dev      # 開発サーバー
npm run build    # 本番ビルド (dist/)
```

モデルを再学習する場合は[training/README.md](training/README.md)を参照。
