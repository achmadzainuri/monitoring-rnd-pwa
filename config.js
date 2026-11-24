// =========================================================================
// PUSAT KONFIGURASI APLIKASI R&D PROJECT MONITORING
// =========================================================================
window.APP_CONFIG = {
  // 1. Koneksi Database Supabase
  SUPABASE_URL: 'https://fqzgwubtpraiggiunjtl.supabase.co',
  SUPABASE_KEY: 'sb_publishable_WoFdPlP5SadZMyenRB874w_R-Uo0yeX',

  // 2. Pengaturan Umum & Peringatan Deadline
  APP_TITLE: 'R&D Project Monitoring',
  DEADLINE_WARNING_DAYS: 3,      // Peringatan kuning mulai H-3 sebelum jatuh tempo
  MAX_FEED_ITEMS: 100,           // Batas tampilan kartu log & project per halaman
  SESSION_STORAGE_KEY: 'rnd_supabase_session_v1'
};
