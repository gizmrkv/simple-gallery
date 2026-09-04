# simple-gallery

`simple-*` シリーズの小さなシミュレーション・アルゴリズムデモをまとめて GitHub Pages で公開するリポジトリ。

公開ページ: https://gizmrkv.github.io/simple-gallery/

## 収録プロジェクト

| プロジェクト | 内容 |
|---|---|
| [lead-turret](./lead-turret/) | 固定砲台が偏差射撃(リードショット)で目標を狙うシミュレーション |
| [boids-like](./boids-like/) | boidの群れを1つの共有プログラムで操作するゲームプロトタイプ |
| [boids-page](./boids-page/) | Boidsアルゴリズムによる群れの振る舞いモデル |
| [mnist-doodle](./mnist-doodle/) | ブラウザ上で動作する手書き数字認識デモ(ONNX Runtime Web) |

各プロジェクトは元々個別リポジトリ(`simple-lead-turret` など)として開発されており、そちらも引き続き公開されています。このリポジトリはそれらのビルド成果物を1つのGitHub Pagesサイトにまとめるためのものです。

## 構成

各ディレクトリは独立したVite+TypeScriptプロジェクトで、それぞれ個別に `npm install` / `npm run build` します。`.github/workflows/deploy.yml` がプロジェクトごとにビルドし、成果物を `site/<project>/` 以下にまとめて GitHub Pages にデプロイします。

## 開発

```sh
cd lead-turret   # 各プロジェクトのディレクトリへ
npm install
npm run dev
```
