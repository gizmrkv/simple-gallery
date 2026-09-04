# simple-gallery

`simple-*` シリーズの小さなシミュレーション・アルゴリズムデモをまとめて GitHub Pages で公開するリポジトリ。

公開ページ: https://gizmrkv.github.io/simple-gallery/

## 概要

GitHub Pagesは1リポジトリにつき1サイトしか持てない。そのため各`simple-*`
プロジェクトを個別にPages公開すると、リポジトリの数だけURLが増えて散らばる。
このリポジトリは、それらのビルド成果物をサブディレクトリとして1つのサイトに
まとめ、ランディングページ([index.html](index.html))から一覧・遷移できるように
するためのもの。

各プロジェクトの開発は元の個別リポジトリ(`simple-lead-turret` など)で
引き続き行い、公開したくなったらこのリポジトリに反映する運用を想定している。

## 収録プロジェクト

| プロジェクト | 公開URL | 元リポジトリ | 内容 |
|---|---|---|---|
| [lead-turret](./lead-turret/) | [/lead-turret/](https://gizmrkv.github.io/simple-gallery/lead-turret/) | [simple-lead-turret](https://github.com/gizmrkv/simple-lead-turret) | 固定砲台が偏差射撃(リードショット)で目標を狙うシミュレーション |
| [boids-like](./boids-like/) | [/boids-like/](https://gizmrkv.github.io/simple-gallery/boids-like/) | [simple-boids-like](https://github.com/gizmrkv/simple-boids-like) | boidの群れを1つの共有プログラムで操作するゲームプロトタイプ |
| [boids-page](./boids-page/) | [/boids-page/](https://gizmrkv.github.io/simple-gallery/boids-page/) | [simple-boids-page](https://github.com/gizmrkv/simple-boids-page) | Boidsアルゴリズムによる群れの振る舞いモデル |
| [mnist-doodle](./mnist-doodle/) | [/mnist-doodle/](https://gizmrkv.github.io/simple-gallery/mnist-doodle/) | [simple-mnist-doodle-page](https://github.com/gizmrkv/simple-mnist-doodle-page) | ブラウザ上で動作する手書き数字認識デモ(ONNX Runtime Web) |

## 設計

- 各プロジェクトは独立したディレクトリに、独立したVite+TypeScriptプロジェクト
  として置く。依存関係やビルド設定を共通化・統合することはしない
  (バージョンが異なっていてもよい。1プロジェクトの依存を上げても他に影響しない)。
- 各プロジェクトの`vite.config.ts`は`base: "/simple-gallery/<ディレクトリ名>/"`を
  指定する(`boids-page`のように`base: "./"`で相対パス出力しているものはそのままでよい)。
- [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)がプロジェクトごとに
  マトリクスビルドし、各成果物を`site/<ディレクトリ名>/`に集約、ルートの
  [index.html](index.html)と合わせて1つのGitHub Pagesサイトとしてデプロイする。
- ルートの[index.html](index.html)はビルド不要な静的ファイル。各プロジェクトへの
  リンクカードを並べただけのランディングページ。

## 構成

```
simple-gallery/
├── index.html                  # ランディングページ(静的、ビルド不要)
├── lead-turret/                # 各プロジェクトのディレクトリ
│   ├── vite.config.ts          #   base: "/simple-gallery/lead-turret/"
│   ├── package.json
│   └── ...
├── boids-like/
├── boids-page/
├── mnist-doodle/
└── .github/workflows/deploy.yml  # 全プロジェクトをビルドしてまとめてデプロイ
```

## 開発

```sh
cd lead-turret   # 各プロジェクトのディレクトリへ
npm install
npm run dev
```

## 新しいプロダクトを追加する

1. 元プロジェクトのファイル一式(`.git`・`.github`・`node_modules`・`dist`を除く)を、
   このリポジトリ直下に新しいディレクトリとしてコピーする。
2. `vite.config.ts`の`base`を`/simple-gallery/<ディレクトリ名>/`に変更する
   (すでに`base: "./"`で相対パスにしている場合は変更不要)。
3. `npm install && npm run build`してローカルでビルドが通ることを確認し、
   `dist/index.html`内のアセットパスが`/simple-gallery/<ディレクトリ名>/...`に
   なっていることを確認する。
4. ルートの[index.html](index.html)に、そのプロジェクトへのリンクカードを追加する。
5. [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)の
   `build`ジョブの`matrix.project`と、`deploy`ジョブの集約ループにディレクトリ名を追加する。
6. この README の「収録プロジェクト」表に行を追加する。

Vite+TypeScript以外の技術(GodotのWeb exportなど)を追加する場合も基本方針は同じ
(そのディレクトリ配下でビルドし、`site/<ディレクトリ名>/`に成果物を置く)だが、
ビルドコマンドがプロジェクトごとに異なるため、workflowの該当ジョブを個別に
書き足すこと。
