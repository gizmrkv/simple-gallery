import './style.css';
import { Predictor, softmax } from './inference';
import { loadVocab, encode, type Vocab } from './tokenize';
import { computeAttribution } from './attribution';
import { languageName } from './labels';

const TOP_N = 10;

const form = document.getElementById('predict-form') as HTMLFormElement;
const wordInput = document.getElementById('word-input') as HTMLInputElement;
const predictBtn = document.getElementById('predict-btn') as HTMLButtonElement;
const loadingDiv = document.getElementById('loading') as HTMLDivElement;
const loadingText = document.getElementById('loading-text') as HTMLParagraphElement;
const resultDiv = document.getElementById('result-display') as HTMLDivElement;
const rankingList = document.getElementById('ranking-list') as HTMLDivElement;
const attributionDisplay = document.getElementById('attribution-display') as HTMLDivElement;
const errorDiv = document.getElementById('error-message') as HTMLDivElement;

const predictor = new Predictor();
let vocab: Vocab | null = null;

async function init() {
  try {
    loadingDiv.classList.remove('hidden');
    predictBtn.disabled = true;
    vocab = await loadVocab('./model/vocab.json');
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

    const topLabelIndex = vocab.labels.indexOf(ranked[0].label);
    const scores = await computeAttribution(word, vocab, predictor, topLabelIndex);
    renderAttribution(word, scores);

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
    wrapper.appendChild(span);
  }
  attributionDisplay.appendChild(wrapper);
}

init();
