// Picks the right Qwen3.5 model for the device, downloads it once, and loads it with llama.rn.
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system/legacy';
import { initLlama, LlamaContext } from 'llama.rn';

// TODO: replace with the exact GGUF file URLs you choose on Hugging Face
// (search "Qwen3.5-4B GGUF" / "Qwen3.5-2B GGUF", pick the Q4_K_M file).
const MODELS = {
  large: {
    name: 'Qwen3.5-4B (Q4_K_M)',
    file: 'qwen3.5-4b-q4_k_m.gguf',
    url: 'https://huggingface.co/<repo>/resolve/main/<Qwen3.5-4B-Q4_K_M>.gguf',
  },
  small: {
    name: 'Qwen3.5-2B (Q4_K_M)',
    file: 'qwen3.5-2b-q4_k_m.gguf',
    url: 'https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/main/Qwen3.5-2B-Q4_K_M.gguf', // ~1.3 GB
  },
};

let context: LlamaContext | null = null;

/** 8 GB+ RAM phones get the 4B model; everything else gets the 2B. */
export function pickModel() {
  return MODELS.small; // TEST: always use the 2B model for now.
  // Later, when the 4B link is filled in, switch back to:
  // const gb = (Device.totalMemory ?? 0) / 1024 ** 3;
  // return gb >= 7.5 ? MODELS.large : MODELS.small;
}

function modelPath(file: string) {
  return `${FileSystem.documentDirectory}models/${file}`;
}

export async function isModelDownloaded() {
  const info = await FileSystem.getInfoAsync(modelPath(pickModel().file));
  return info.exists;
}

/** One-time download (needs internet once). onProgress gets 0..1. */
export async function downloadModel(onProgress?: (p: number) => void) {
  const model = pickModel();
  await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}models`, {
    intermediates: true,
  }).catch(() => {});

  const task = FileSystem.createDownloadResumable(
    model.url,
    modelPath(model.file),
    {},
    ({ totalBytesWritten, totalBytesExpectedToWrite }) =>
      onProgress?.(totalBytesWritten / totalBytesExpectedToWrite),
  );
  await task.downloadAsync();
}

/** Loads the model into memory. Call once, e.g. when the chat screen opens. */
export async function loadModel(): Promise<LlamaContext> {
  if (context) return context;
  const model = pickModel();
  context = await initLlama({
    model: modelPath(model.file),
    n_ctx: 4096,        // context window; keep small to save RAM
    n_gpu_layers: 99,   // use the iPhone GPU (Metal) for all layers
    use_mlock: true,
  });
  return context;
}

/** Free the RAM, e.g. when the app goes to the background. */
export async function unloadModel() {
  await context?.release();
  context = null;
}
