import './style.css';
import { HandCanvas } from './canvas';
import { Predictor } from './inference';
import { preprocess } from './preprocess';

const canvas = new HandCanvas('canvas');
const predictor = new Predictor();

const predictBtn = document.getElementById('predict-btn') as HTMLButtonElement;
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
const predictionSpan = document.getElementById('prediction') as HTMLSpanElement;
const confidenceList = document.getElementById('confidence-list') as HTMLDivElement;
const loadingDiv = document.getElementById('loading') as HTMLDivElement;
const resultDiv = document.getElementById('result-display') as HTMLDivElement;
const errorDiv = document.getElementById('error-message') as HTMLDivElement;

async function init() {
  try {
    loadingDiv.classList.remove('hidden');
    await predictor.init();
    loadingDiv.classList.add('hidden');
  } catch (error) {
    loadingDiv.classList.add('hidden');
    errorDiv.textContent = 'モデルの読み込みに失敗しました。';
    errorDiv.classList.remove('hidden');
  }
}

predictBtn.addEventListener('click', async () => {
  if (canvas.isEmpty()) {
    alert('数字を描いてください！');
    return;
  }

  try {
    loadingDiv.classList.remove('hidden');
    resultDiv.classList.add('hidden');
    errorDiv.classList.add('hidden');

    const inputData = preprocess(canvas.getCanvas());
    const probabilities = await predictor.predict(inputData);

    const maxProb = Math.max(...probabilities);
    const predictedDigit = probabilities.indexOf(maxProb);

    predictionSpan.textContent = predictedDigit.toString();
    updateConfidenceList(probabilities);

    loadingDiv.classList.add('hidden');
    resultDiv.classList.remove('hidden');
  } catch (error) {
    loadingDiv.classList.add('hidden');
    errorDiv.textContent = '推論中にエラーが発生しました。';
    errorDiv.classList.remove('hidden');
    console.error(error);
  }
});

clearBtn.addEventListener('click', () => {
  canvas.clear();
  resultDiv.classList.add('hidden');
  errorDiv.classList.add('hidden');
});

function updateConfidenceList(probs: number[]) {
  confidenceList.innerHTML = '';
  probs.forEach((prob, digit) => {
    const percentage = (prob * 100).toFixed(1);
    const item = document.createElement('div');
    item.innerHTML = `
      <div class="confidence-label">
        <span>${digit}</span>
        <span>${percentage}%</span>
      </div>
      <div class="confidence-bar">
        <div class="confidence-fill" style="width: ${percentage}%"></div>
      </div>
    `;
    confidenceList.appendChild(item);
  });
}

init();
