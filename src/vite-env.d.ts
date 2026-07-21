/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SHEETS_API_URL?: string;
  readonly VITE_SHEETS_API_TOKEN?: string;
  readonly VITE_EDIT_PASSCODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
