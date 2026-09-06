"""文字CNN言語識別モデルの学習。

`~/ml-experiments/_template/exps/0000_baseline/train.py` のスタイル
(dataclass Config + tyro.cli + structlog + YAML設定)を踏襲しているが、
このプロジェクトは一回限りの小規模タスクなので、fold横断・SUMMARY.md/BACKLOG.md・
「結果は上書きしない」ガードといった競技用の儀式は省いている。

debug実行(フル実行前に必ず通す):

    uv run python training/train.py --config 0000 --debug

フル実行:

    uv run python training/train.py --config 0000
"""

from __future__ import annotations

import logging
import sys
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path

import structlog
import torch
import torch.nn as nn
import torch.nn.functional as F
import tyro
import yaml
from torch.utils.data import DataLoader

from constants import LABELS
from dataset import LangIdDataset, load_rows, stratified_split
from model import CharCNN

TRAINING_DIR = Path(__file__).resolve().parent
NUM_CLASSES = len(LABELS)
UNK_LABEL_ID = LABELS.index("unk")

# ==== 設定 ====


@dataclass
class Config:
    """configs/NNNN.ymlの内容。未知キーはTypeErrorでfail-fastする。"""

    seed: int = 42
    batch_size: int = 256
    lr: float = 1e-3
    epochs: int = 10
    embed_dim: int = 32
    num_filters: int = 64
    dropout: float = 0.3
    max_len: int = 20
    val_frac: float = 0.1
    test_frac: float = 0.1
    weight_decay: float = 0.0
    use_class_weights: bool = True


def load_config(path: Path) -> Config:
    with path.open() as f:
        raw = yaml.safe_load(f)
    return Config(**raw)


def make_soft_ce_criterion(class_weights: torch.Tensor | None):
    """ソフトラベル(確率ベクトル)対応の重み付き交差エントロピー。

    nn.CrossEntropyLossは確率ベクトルターゲットも受け付けるが、重み付き平均の
    正規化方法がクラスID指定時と異なる(同じone-hot入力で異なる値になることを
    実測で確認済み)ため使わない。以下はone-hotターゲットに対してnn.CrossEntropyLoss
    (クラスID指定・weight指定)と厳密に一致する。"""

    def criterion(logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        log_probs = F.log_softmax(logits, dim=-1)
        if class_weights is None:
            return -(targets * log_probs).sum(dim=-1).mean()
        weighted_nll = -(targets * class_weights * log_probs).sum(dim=-1)
        sample_weight = (targets * class_weights).sum(dim=-1)
        return weighted_nll.sum() / sample_weight.sum()

    return criterion


def select_device(log: structlog.stdlib.BoundLogger) -> torch.device:
    """CUDAが実際に使えるかを一度演算して確認し、ダメならCPUにフォールバックする。

    torch.cuda.is_available()だけでは不十分(このマシンのGPU: GTX 1080は
    compute capability 6.1/Pascalで、PyPI配布のtorchビルドが対応するCC(7.5+)より
    古く、is_available()はTrueを返すのに実際の演算はno kernel image is available
    for execution on the deviceで失敗することを確認済み)。"""
    if torch.cuda.is_available():
        try:
            (torch.zeros(1, device="cuda") + 1).cpu()
            return torch.device("cuda")
        except RuntimeError as e:
            log.warning("cuda available but unusable, falling back to cpu", error=str(e))
    return torch.device("cpu")


# ==== ロギング ====


def setup_logging(log_path: Path) -> structlog.stdlib.BoundLogger:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        format="%(asctime)s %(message)s",
        level=logging.INFO,
        handlers=[logging.FileHandler(log_path), logging.StreamHandler()],
    )
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.StackInfoRenderer(),
            structlog.dev.ConsoleRenderer(colors=False),
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )
    return structlog.get_logger()


# ==== 学習・評価ループ ====


def run_epoch(
    model: nn.Module,
    loader: DataLoader,
    criterion,
    device: torch.device,
    optimizer: torch.optim.Optimizer | None = None,
) -> tuple[float, float]:
    """1エポック分の学習(optimizer指定時)または評価を行い、(平均loss, accuracy)を返す。

    「正解」は予測クラスがターゲットの確率ベクトル上で非ゼロ質量を持つかで判定する
    (複数言語に有効な単語は、そのどれを予測しても正解として扱う。単一ラベルの
    単語では従来通りpred==labelと同じ判定になる)。"""
    is_train = optimizer is not None
    model.train(is_train)

    total_loss = 0.0
    n_correct = 0
    n_total = 0
    with torch.set_grad_enabled(is_train):
        for ids, targets, _primary in loader:
            ids, targets = ids.to(device), targets.to(device)
            logits = model(ids)
            loss = criterion(logits, targets)

            if is_train:
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()

            total_loss += loss.item() * ids.size(0)
            preds = logits.argmax(dim=1)
            n_correct += (targets.gather(1, preds.unsqueeze(1)).squeeze(1) > 0).sum().item()
            n_total += ids.size(0)

    return total_loss / n_total, n_correct / n_total


@torch.no_grad()
def evaluate_breakdown(
    model: nn.Module, loader: DataLoader, device: torch.device
) -> tuple[float, dict[str, float], dict[str, int]]:
    """全体精度・言語別精度(recall)・unkクラスの混同行列カウントを返す。

    言語別の集計バケツとunkのtp/fp/fnはprimaryラベル(row[1]、複数言語に有効な
    単語の代表値)をキーにする。「正解」の判定はrun_epoch()と同様、予測クラスが
    ターゲットの確率ベクトル上で非ゼロ質量を持つかで行う。"""
    model.eval()
    per_lang_correct: Counter = Counter()
    per_lang_total: Counter = Counter()
    unk_tp = unk_fp = unk_fn = 0
    n_correct = 0
    n_total = 0

    for ids, targets, primary in loader:
        ids, targets, primary = ids.to(device), targets.to(device), primary.to(device)
        preds = model(ids).argmax(dim=1)
        correct_mask = targets.gather(1, preds.unsqueeze(1)).squeeze(1) > 0
        for pred, prim, is_correct in zip(preds.tolist(), primary.tolist(), correct_mask.tolist()):
            per_lang_total[prim] += 1
            if is_correct:
                per_lang_correct[prim] += 1
                n_correct += 1
            n_total += 1
            if pred == UNK_LABEL_ID and prim == UNK_LABEL_ID:
                unk_tp += 1
            elif pred == UNK_LABEL_ID and prim != UNK_LABEL_ID:
                unk_fp += 1
            elif pred != UNK_LABEL_ID and prim == UNK_LABEL_ID:
                unk_fn += 1

    per_lang_acc = {
        LABELS[lang_id]: per_lang_correct[lang_id] / per_lang_total[lang_id]
        for lang_id in per_lang_total
    }
    overall_acc = n_correct / n_total
    unk_stats = {"tp": unk_tp, "fp": unk_fp, "fn": unk_fn}
    return overall_acc, per_lang_acc, unk_stats


# ==== main ====


def main(config: str, debug: bool = False) -> None:
    """configs/{config}.ymlの設定で学習し、results/{config}/に出力する。

    Args:
        config: configs/内のconfig番号(例: "0000" -> configs/0000.yml)。
        debug: 縮小データ・1エポックでend-to-endを確認する。出力はresults/{config}_debug/に隔離する。
    """
    cfg = load_config(TRAINING_DIR / "configs" / f"{config}.yml")

    out_dir = TRAINING_DIR / "results" / (config + ("_debug" if debug else ""))
    out_dir.mkdir(parents=True, exist_ok=True)
    log = setup_logging(out_dir / "output.log")

    with (out_dir / "config.yml").open("w") as f:
        yaml.safe_dump(asdict(cfg), f, allow_unicode=True, sort_keys=False)

    torch.manual_seed(cfg.seed)
    device = select_device(log)
    log.info("device selected", device=str(device))

    rows = load_rows(TRAINING_DIR / "data" / "words.csv")
    train_rows, val_rows, test_rows = stratified_split(
        rows, val_frac=cfg.val_frac, test_frac=cfg.test_frac, seed=cfg.seed
    )

    if debug:
        # デバッグ実行はパイプライン全体の疎通確認が目的なので、各分割をごく小さく縮小する。
        train_rows, val_rows, test_rows = train_rows[:2000], val_rows[:500], test_rows[:500]
        cfg.epochs = min(cfg.epochs, 2)

    log.info(
        "data split",
        n_train=len(train_rows),
        n_val=len(val_rows),
        n_test=len(test_rows),
    )

    train_ds = LangIdDataset(train_rows, max_len=cfg.max_len)
    val_ds = LangIdDataset(val_rows, max_len=cfg.max_len)
    test_ds = LangIdDataset(test_rows, max_len=cfg.max_len)

    train_loader = DataLoader(train_ds, batch_size=cfg.batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=cfg.batch_size, shuffle=False)
    test_loader = DataLoader(test_ds, batch_size=cfg.batch_size, shuffle=False)

    model = CharCNN(
        num_classes=NUM_CLASSES,
        embed_dim=cfg.embed_dim,
        num_filters=cfg.num_filters,
        dropout=cfg.dropout,
    ).to(device)

    class_weights = None
    if cfg.use_class_weights:
        # primaryだけを数えると、複数言語に有効な単語がアルファベット順で先に来る
        # ラベル(ca, cs_sk, de, en等)に偏ってカウントされてしまうため、各単語の
        # ソフトラベル質量(1/len(all_labels))を全有効ラベルに加算する形で数える。
        lang_mass: Counter = Counter()
        for _, _, all_labels in train_rows:
            mass = 1.0 / len(all_labels)
            for lab in all_labels:
                lang_mass[lab] += mass
        total = len(train_rows)
        weights = [
            total / (NUM_CLASSES * lang_mass.get(label, 1)) for label in LABELS
        ]
        class_weights = torch.tensor(weights, dtype=torch.float32).to(device)
        log.info("using class weights", weights=dict(zip(LABELS, weights)))

    criterion = make_soft_ce_criterion(class_weights)
    optimizer = torch.optim.Adam(
        model.parameters(), lr=cfg.lr, weight_decay=cfg.weight_decay
    )

    best_val_acc = -1.0
    best_state = None
    for epoch in range(1, cfg.epochs + 1):
        train_loss, train_acc = run_epoch(model, train_loader, criterion, device, optimizer)
        val_loss, val_acc = run_epoch(model, val_loader, criterion, device)
        log.info(
            "epoch done",
            epoch=epoch,
            train_loss=round(train_loss, 4),
            train_acc=round(train_acc, 4),
            val_loss=round(val_loss, 4),
            val_acc=round(val_acc, 4),
        )
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            best_state = {
                "model_state_dict": model.state_dict(),
                "config": asdict(cfg),
                "labels": LABELS,
                "num_classes": NUM_CLASSES,
                "epoch": epoch,
                "val_acc": val_acc,
            }

    checkpoint_path = out_dir / "best_model.pt"
    torch.save(best_state, checkpoint_path)
    log.info("saved best checkpoint", path=str(checkpoint_path), best_val_acc=best_val_acc)

    # ベストチェックポイントを読み直してtestセットで最終評価する。
    model.load_state_dict(best_state["model_state_dict"])
    test_acc, per_lang_acc, unk_stats = evaluate_breakdown(model, test_loader, device)

    precision = unk_stats["tp"] / max(1, unk_stats["tp"] + unk_stats["fp"])
    recall = unk_stats["tp"] / max(1, unk_stats["tp"] + unk_stats["fn"])

    sorted_acc = sorted(per_lang_acc.items(), key=lambda kv: kv[1])
    log.info(
        "final test evaluation",
        test_acc=round(test_acc, 4),
        worst_5=[(lang, round(a, 4)) for lang, a in sorted_acc[:5]],
        best_5=[(lang, round(a, 4)) for lang, a in sorted_acc[-5:]],
        unk_precision=round(precision, 4),
        unk_recall=round(recall, 4),
        unk_tp=unk_stats["tp"],
        unk_fp=unk_stats["fp"],
        unk_fn=unk_stats["fn"],
    )

    metrics = {
        "best_val_acc": best_val_acc,
        "test_acc": test_acc,
        "per_lang_test_acc": per_lang_acc,
        "unk_precision": precision,
        "unk_recall": recall,
        "unk_stats": unk_stats,
    }
    with (out_dir / "metrics.json").open("w") as f:
        import json

        json.dump(metrics, f, indent=2, sort_keys=True)
    log.info("wrote metrics", path=str(out_dir / "metrics.json"))


if __name__ == "__main__":
    tyro.cli(main)
