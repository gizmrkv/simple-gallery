import './style.css';
import { Predictor, softmax } from './inference';
import { loadVocab, encode, type Vocab } from './tokenize';
import {
  computeAttribution,
  computeWindowScores,
  bestWindow,
  bestWindowAt,
  type WindowScore,
} from './attribution';
import { loadExamples, findExamples, type ExamplesData } from './examples';
import { languageName } from './labels';

const TOP_N = 10;
const EXAMPLES_LIMIT = 6;

const form = document.getElementById('predict-form') as HTMLFormElement;
const wordInput = document.getElementById('word-input') as HTMLInputElement;
const predictBtn = document.getElementById('predict-btn') as HTMLButtonElement;
const loadingDiv = document.getElementById('loading') as HTMLDivElement;
const loadingText = document.getElementById('loading-text') as HTMLParagraphElement;
const resultDiv = document.getElementById('result-display') as HTMLDivElement;
const rankingList = document.getElementById('ranking-list') as HTMLDivElement;
const attributionDisplay = document.getElementById('attribution-display') as HTMLDivElement;
const examplesDisplay = document.getElementById('examples-display') as HTMLDivElement;
const errorDiv = document.getElementById('error-message') as HTMLDivElement;

const predictor = new Predictor();
let vocab: Vocab | null = null;
let examples: ExamplesData | null = null;

// クリック探索用の状態: 直近の予測結果に対する窓スコア一覧と、対応する文字span要素。
let currentWord = '';
let currentTopLabel = '';
let currentWindows: WindowScore[] = [];
let currentSpans: HTMLSpanElement[] = [];

async function init() {
  try {
    loadingDiv.classList.remove('hidden');
    predictBtn.disabled = true;
    vocab = await loadVocab('./model/vocab.json');
    examples = await loadExamples('./model/examples.json');
    await predictor.init();
    loadingDiv.classList.add('hidden');
    predictBtn.disabled = false;
  } catch (error) {
    loadingText.textContent = 'モデルの読み込みに失敗しました。';
    console.error(error);
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!vocab) return;

  const word = wordInput.value.trim();
  if (!word) return;

  try {
    predictBtn.disabled = true;
    resultDiv.classList.add('hidden');
    errorDiv.classList.add('hidden');
    loadingText.textContent = '判定中...';
    loadingDiv.classList.remove('hidden');

    const ids = encode(word, vocab);
    const logits = await predictor.predictLogits(ids, vocab.max_len);
    const probs = softmax(logits);

    const ranked = vocab.labels
      .map((label, i) => ({ label, prob: probs[i] }))
      .sort((a, b) => b.prob - a.prob);

    renderRanking(ranked);

    const topLabel = ranked[0].label;
    const topLabelIndex = vocab.labels.indexOf(topLabel);
    const scores = await computeAttribution(word, vocab, predictor, topLabelIndex);
    renderAttribution(word, scores);

    currentWord = word.trim();
    currentTopLabel = topLabel;
    if (topLabel === 'unk') {
      // 「どの言語にも該当しない」場合は実例を探す対象の言語がないため機能自体を隠す
      currentWindows = [];
      renderExamples(null);
    } else {
      currentWindows = await computeWindowScores(word, vocab, predictor, topLabelIndex);
      showWindow(bestWindow(currentWindows));
    }

    loadingDiv.classList.add('hidden');
    resultDiv.classList.remove('hidden');
    predictBtn.disabled = false;
  } catch (error) {
    loadingDiv.classList.add('hidden');
    errorDiv.textContent = '推論中にエラーが発生しました。';
    errorDiv.classList.remove('hidden');
    predictBtn.disabled = false;
    console.error(error);
  }
});

function renderRanking(ranked: { label: string; prob: number }[]) {
  rankingList.innerHTML = '';
  ranked.slice(0, TOP_N).forEach(({ label, prob }) => {
    const percentage = (prob * 100).toFixed(1);
    const item = document.createElement('div');
    item.innerHTML = `
      <div class="confidence-label">
        <span>${languageName(label)}</span>
        <span>${percentage}%</span>
      </div>
      <div class="confidence-bar">
        <div class="confidence-fill" style="width: ${percentage}%"></div>
      </div>
    `;
    rankingList.appendChild(item);
  });
}

function renderAttribution(word: string, scores: number[]) {
  attributionDisplay.innerHTML = '';
  const trimmed = word.trim();
  const maxAbs = Math.max(1e-6, ...scores.map((s) => Math.abs(s)));

  const wrapper = document.createElement('div');
  wrapper.className = 'attribution-word';
  currentSpans = [];
  for (let i = 0; i < trimmed.length; i++) {
    const span = document.createElement('span');
    span.className = 'attribution-char';
    span.textContent = trimmed[i];
    const score = scores[i] ?? 0;
    const intensity = Math.abs(score) / maxAbs;
    if (score >= 0) {
      span.style.backgroundColor = `rgba(0, 198, 255, ${intensity.toFixed(2)})`;
    } else {
      span.style.backgroundColor = `rgba(255, 77, 77, ${intensity.toFixed(2)})`;
    }
    // クリックした文字を含む窓の中で最もスコアが高いものに切り替える
    // (currentWindowsは予測のたびに更新される事前計算済みの配列を参照するだけなので、
    // クリック時に追加の推論は発生しない)。
    span.addEventListener('click', () => {
      if (currentWindows.length === 0) return;
      const w = bestWindowAt(currentWindows, i);
      if (w) showWindow(w);
    });
    wrapper.appendChild(span);
    currentSpans.push(span);
  }
  attributionDisplay.appendChild(wrapper);
}

function showWindow(win: WindowScore | null) {
  currentSpans.forEach((span, i) => {
    const active = win !== null && i >= win.start && i < win.start + win.length;
    span.classList.toggle('window-active', active);
    span.classList.toggle('window-clickable', currentWindows.length > 0);
  });
  renderExamples(win);
}

function renderExampleChip(word: string, substring: string): HTMLElement {
  const chip = document.createElement('span');
  chip.className = 'example-chip';
  const idx = word.indexOf(substring);
  if (idx === -1) {
    chip.textContent = word;
    return chip;
  }
  chip.appendChild(document.createTextNode(word.slice(0, idx)));
  const mark = document.createElement('mark');
  mark.textContent = word.slice(idx, idx + substring.length);
  chip.appendChild(mark);
  chip.appendChild(document.createTextNode(word.slice(idx + substring.length)));
  return chip;
}

function renderExamples(win: WindowScore | null) {
  examplesDisplay.innerHTML = '';
  if (!win || !examples || currentTopLabel === 'unk') {
    return;
  }

  const substring = currentWord.slice(win.start, win.start + win.length);
  const matches = findExamples(examples, currentTopLabel, substring, EXAMPLES_LIMIT, currentWord);

  const heading = document.createElement('p');
  heading.className = 'examples-heading';
  heading.innerHTML = `<strong>${languageName(currentTopLabel)}</strong>には「${substring}」を含む単語がよくあります:`;
  examplesDisplay.appendChild(heading);

  if (matches.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'examples-empty';
    empty.textContent = '手元のサンプルの中には似た単語が見つかりませんでした。';
    examplesDisplay.appendChild(empty);
    return;
  }

  const chipList = document.createElement('div');
  chipList.className = 'example-chip-list';
  for (const word of matches) {
    chipList.appendChild(renderExampleChip(word, substring));
  }
  examplesDisplay.appendChild(chipList);
}

init();
