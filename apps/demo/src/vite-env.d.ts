/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SNAG_ENDPOINT?: string;
  readonly VITE_SNAG_PROJECT_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
