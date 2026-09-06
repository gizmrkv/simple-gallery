"""学習済みチェックポイントをONNXにエクスポートし、フロントエンド用のvocab.jsonを書き出す。

I/O契約(フロントエンドがこれに依存するため変更不可):
- 入力名 "input", dtype int64, shape [1, max_len] (バッチサイズ1固定)
- 出力名 "logits", dtype float32, shape [1, 31] (softmax前の生logits)

出力先:
- ../public/model/lang-id.onnx  (= lang-guess/public/model/lang-id.onnx)
- ../public/model/vocab.json    (= lang-guess/public/model/vocab.json)

エクスポート後、onnxruntimeでロードして実際の単語で推論し、PyTorchモデルの出力と
一致することを検証する(このステップは省略しない)。

実行:
    uv run python training/export_onnx.py --config 0000
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
import tyro

from constants import CHAR_TO_ID, LABELS, PAD_ID, UNK_CHAR_ID
from dataset import encode_word, load_rows, stratified_split
from model import CharCNN

TRAINING_DIR = Path(__file__).resolve().parent
PUBLIC_MODEL_DIR = TRAINING_DIR.parent / "public" / "model"
ONNX_PATH = PUBLIC_MODEL_DIR / "lang-id.onnx"
VOCAB_JSON_PATH = PUBLIC_MODEL_DIR / "vocab.json"


def load_model_from_checkpoint(checkpoint_path: Path) -> tuple[CharCNN, dict]:
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    cfg = checkpoint["config"]
    model = CharCNN(
        num_classes=checkpoint["num_classes"],
        embed_dim=cfg["embed_dim"],
        num_filters=cfg["num_filters"],
        dropout=cfg["dropout"],
    )
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    return model, cfg


def write_vocab_json(max_len: int) -> None:
    vocab = {
        "char_to_id": CHAR_TO_ID,
        "pad_id": PAD_ID,
        "unk_char_id": UNK_CHAR_ID,
        "max_len": max_len,
        "labels": LABELS,
    }
    PUBLIC_MODEL_DIR.mkdir(parents=True, exist_ok=True)
    with VOCAB_JSON_PATH.open("w", encoding="utf-8") as f:
        json.dump(vocab, f, ensure_ascii=False, indent=2)
    print(f"wrote {VOCAB_JSON_PATH}")


def export(model: CharCNN, max_len: int) -> None:
    PUBLIC_MODEL_DIR.mkdir(parents=True, exist_ok=True)
    dummy_input = torch.zeros((1, max_len), dtype=torch.long)
    torch.onnx.export(
        model,
        (dummy_input,),
        str(ONNX_PATH),
        input_names=["input"],
        output_names=["logits"],
        opset_version=17,
        dynamic_axes=None,
        # torch>=2.9ではdynamo=Trueがデフォルトだが、それには追加依存(onnxscript)が
        # 必要になる。onnx/onnxruntimeだけで完結させるため、従来のTorchScriptベースの
        # エクスポータを明示的に使う。
        dynamo=False,
    )
    print(f"wrote {ONNX_PATH} ({ONNX_PATH.stat().st_size / 1024:.1f} KiB)")


def softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - np.max(x, axis=-1, keepdims=True))
    return e / e.sum(axis=-1, keepdims=True)


def verify(model: CharCNN, max_len: int) -> None:
    """ONNX出力がPyTorch出力とargmax・確率ともに一致することを、実単語+合成unk文字列で確認する。"""
    rows = load_rows(TRAINING_DIR / "data" / "words.csv")
    _, _, test_rows = stratified_split(rows, seed=42)

    # 複数言語から実単語を数個ずつ拾い、生成済みunk文字列も数個混ぜる
    seen_langs: set[str] = set()
    samples: list[tuple[str, str]] = []
    for word, lang in test_rows:
        if lang == "unk":
            continue
        if lang not in seen_langs and len(samples) < 10:
            samples.append((word, lang))
            seen_langs.add(lang)
    for word, lang in test_rows:
        if lang == "unk" and sum(1 for _, l in samples if l == "unk") < 2:
            samples.append((word, lang))

    session = ort.InferenceSession(str(ONNX_PATH))

    all_match = True
    for word, lang in samples:
        ids = encode_word(word, max_len)
        input_tensor = torch.tensor([ids], dtype=torch.long)

        with torch.no_grad():
            torch_logits = model(input_tensor).numpy()[0]

        onnx_input = np.array([ids], dtype=np.int64)
        onnx_logits = session.run(["logits"], {"input": onnx_input})[0][0]

        torch_probs = softmax(torch_logits)
        onnx_probs = softmax(onnx_logits)

        torch_pred = LABELS[int(np.argmax(torch_logits))]
        onnx_pred = LABELS[int(np.argmax(onnx_logits))]
        max_prob_diff = float(np.max(np.abs(torch_probs - onnx_probs)))

        match = torch_pred == onnx_pred and max_prob_diff < 1e-4
        all_match = all_match and match
        print(
            f"  {word!r:20s} true={lang:4s} torch_pred={torch_pred:4s} "
            f"onnx_pred={onnx_pred:4s} max_prob_diff={max_prob_diff:.2e} "
            f"{'OK' if match else 'MISMATCH'}"
        )

    print()
    if all_match:
        print(f"VERIFICATION PASSED: all {len(samples)} samples match between PyTorch and ONNX.")
    else:
        print("VERIFICATION FAILED: see MISMATCH rows above.")
        raise SystemExit(1)


def main(config: str = "0000", debug: bool = False) -> None:
    result_dir_name = config + ("_debug" if debug else "")
    checkpoint_path = TRAINING_DIR / "results" / result_dir_name / "best_model.pt"
    model, cfg = load_model_from_checkpoint(checkpoint_path)
    max_len = cfg["max_len"]

    write_vocab_json(max_len)
    export(model, max_len)
    verify(model, max_len)


if __name__ == "__main__":
    tyro.cli(main)
