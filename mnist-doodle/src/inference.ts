// Use global 'ort' loaded via script tag to avoid Vite ESM/WASM dynamic import issues
const ort = (window as any).ort;

export class Predictor {
  private session: any = null;
  // Use relative path for model URL (relative to the index.html)
  private readonly modelUrl = './model/mnist.onnx';

  async init() {
    try {
      if (!ort) {
        throw new Error('ONNX Runtime not loaded. Check index.html script tag.');
      }
      
      // Set wasm paths to be relative so it works on GitHub Pages subdirectories
      ort.env.wasm.wasmPaths = './';
      // Disable multi-threading for the simplest execution in dev environment
      ort.env.wasm.numThreads = 1;

      console.log('Loading model from:', this.modelUrl);
      this.session = await ort.InferenceSession.create(this.modelUrl);
      console.log('ONNX Session created successfully');
    } catch (e) {
      console.error('Failed to create ONNX session:', e);
      throw e;
    }
  }

  async predict(input: Float32Array): Promise<number[]> {
    if (!this.session) {
      throw new Error('Predictor not initialized');
    }

    const tensor = new ort.Tensor('float32', input, [1, 1, 28, 28]);
    const feeds = { input: tensor };
    
    const results = await this.session.run(feeds);
    const output = results.output.data as Float32Array;
    
    // Softmax is applied in the model (log_softmax), but we want probabilities
    // Actually, log_softmax results need exp() to get probabilities
    const probs = Array.from(output).map(v => Math.exp(v));
    const sum = probs.reduce((a, b) => a + b, 0);
    return probs.map(p => p / sum);
  }
}
