export function preprocess(canvas: HTMLCanvasElement): Float32Array {
  const size = 28;
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d')!;
  tempCanvas.width = size;
  tempCanvas.height = size;

  // 1. Resize to 28x28
  tempCtx.drawImage(canvas, 0, 0, size, size);
  
  const imageData = tempCtx.getImageData(0, 0, size, size);
  const { data } = imageData;
  const input = new Float32Array(size * size);

  // 2. Grayscale and Normalize
  // MNIST is white digit on black background (0-1)
  // Our model was trained with:
  // transforms.Normalize((0.1307,), (0.3081,))
  // mean = 0.1307, std = 0.3081
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Average color as grayscale
    const gray = (r + g + b) / 3 / 255.0;
    
    // Normalize: (val - mean) / std
    input[i / 4] = (gray - 0.1307) / 0.3081;
  }

  return input;
}
