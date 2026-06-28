/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'true' enables the live Gemma-on-Cerebras pipeline; anything else = offline mock mode. */
  readonly VITE_USE_LIVE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}