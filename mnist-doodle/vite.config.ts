import { defineConfig } from 'vite';

export default defineConfig({
  base: '/simple-gallery/mnist-doodle/',
  optimizeDeps: {
    // Exclude onnxruntime-web to avoid Vite trying to bundle its complex internals
    exclude: ['onnxruntime-web']
  },
  server: {
    headers: {
      // Required for some ONNX backends (like WebAssembly with SIMD/Multi-threading)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    }
  }
});
