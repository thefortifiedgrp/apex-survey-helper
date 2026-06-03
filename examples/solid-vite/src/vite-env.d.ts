/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APEX_API_BASE?: string;
  readonly VITE_APEX_PUBLISHABLE_KEY?: string;
  readonly VITE_APEX_DRUG_IDS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
