// =========================================================================
// TEMPLATE KONFIGURASI LOKAL (Salin menjadi config.js untuk testing lokal)
// Untuk deploy di Netlify via GitHub, file config.js dibuat otomatis oleh netlify.toml
// =========================================================================
window.APP_CONFIG = {
  SUPABASE_URL: 'GANTI_DENGAN_PROJECT_URL_SUPABASE',
  SUPABASE_KEY: 'GANTI_DENGAN_ANON_PUBLIC_KEY_SUPABASE',
  APP_TITLE: 'R&D Project Monitoring',
  SHORT_TITLE: 'R&D Monitoring',
  DEADLINE_WARNING_DAYS: 3,
  MAX_FEED_ITEMS: 100,
  SESSION_STORAGE_KEY: 'rnd_supabase_session_v1'
};
