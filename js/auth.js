// =========================================================================
// AUTHENTICATION, SUPABASE CLIENT, SESSION & PWA INSTALL (v8.0)
// =========================================================================
// =========================================================================
// INISIALISASI DARI CONFIG.JS
// =========================================================================
const CFG = window.APP_CONFIG || {};
const SUPABASE_URL = CFG.SUPABASE_URL;
const SUPABASE_KEY = CFG.SUPABASE_KEY;
const WARN_DAYS = CFG.DEADLINE_WARNING_DAYS ?? 3;
const MAX_ITEMS = CFG.MAX_FEED_ITEMS ?? 100;
const SESSION_KEY = CFG.SESSION_STORAGE_KEY || 'rnd_supabase_session_v1';

const db = (SUPABASE_URL && SUPABASE_KEY && !SUPABASE_URL.includes('GANTI_DENGAN'))
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

// =========================================================================
// PWA SERVICE WORKER & INSTALL PROMPT HANDLER
// =========================================================================
let deferredInstallPrompt = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  ['btn-install-login', 'btn-install-app', 'btn-install-akun'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  });
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  ['btn-install-login', 'btn-install-app', 'btn-install-akun'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  showNotif(true, 'Aplikasi Terpasang', 'Aplikasi berhasil dipasang ke perangkat Anda.');
});

async function triggerPwaInstall() {
  if (!deferredInstallPrompt) {
    showNotif(true, 'Cara Install Aplikasi', 'Di Chrome/Edge klik ikon Install di ujung kanan address bar. Di iPhone Safari tekan ikon Share lalu pilih "Add to Home Screen".');
    return;
  }
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === 'accepted') deferredInstallPrompt = null;
}

async function sha256Hex(plainText) {
  const msgBuffer = new TextEncoder().encode(String(plainText || '').trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- AUTH LOGIN ---
async function handleLogin() {
  if (!db) {
    return showNotif(false, 'Konfigurasi Kosong', 'Isi SUPABASE_URL dan SUPABASE_KEY terlebih dahulu pada file config.js atau Environment Variables Netlify.');
  }
  const u = document.getElementById('login-user').value.trim().toLowerCase();
  const p = document.getElementById('login-pass').value.trim();
  if (!u || !p) return showNotif(false, 'Data Belum Lengkap', 'Masukkan username dan password terlebih dahulu.');

  const btn = document.getElementById('btn-login');
  btn.disabled = true;
  btn.textContent = 'Memeriksa...';

  try {
    const { data, error } = await db.from('app_users').select('*').eq('username', u).maybeSingle();
    if (error) throw error;
    if (!data) {
      showNotif(false, 'Login Gagal', 'Username tidak terdaftar.');
      return;
    }
    const inputHash = await sha256Hex(p);
    if (data.password_hash !== inputHash && data.password_hash !== p) {
      showNotif(false, 'Login Gagal', 'Password yang Anda masukkan salah.');
      return;
    }
    CURRENT_USER = {
      id: data.id,
      username: data.username,
      pic: data.pic_name,
      role: String(data.role || 'USER').toUpperCase()
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(CURRENT_USER));
    document.getElementById('login-user').value = '';
    document.getElementById('login-pass').value = '';
    initApp();
  } catch (err) {
    showNotif(false, 'Koneksi Gagal', 'Tidak dapat terhubung ke server Supabase.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Masuk';
  }
}

function logout() {
  localStorage.removeItem(SESSION_KEY);
  CURRENT_USER = null;
  MON_FILTERS = { pics: [], statuses: [], bagians: [], kategoris: [], onlyKendala: false };
  document.getElementById('app-screen').classList.add('hidden');
  document.getElementById('nav-admin').classList.add('hidden');
  document.getElementById('dnav-admin').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
}

function initApp() {
  if (!db) {
    logout();
    return showNotif(false, 'Konfigurasi Kosong', 'Isi SUPABASE_URL dan SUPABASE_KEY pada file config.js.');
  }
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  const initials = String(CURRENT_USER.pic || CURRENT_USER.username || 'U')
    .trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  document.getElementById('topbar-avatar').textContent = initials;
  document.getElementById('dd-avatar').textContent = initials;
  document.getElementById('topbar-user-info').textContent = `${CURRENT_USER.pic}`;
  document.getElementById('akun-pic').textContent = CURRENT_USER.pic;
  document.getElementById('akun-username').textContent = CURRENT_USER.username;
  document.getElementById('akun-role').textContent = CURRENT_USER.role;

  if (CURRENT_USER.role === 'ADMIN') {
    document.getElementById('nav-admin').classList.remove('hidden');
    document.getElementById('dnav-admin').classList.remove('hidden');
    MON_FILTERS.pics = [];
  } else {
    document.getElementById('nav-admin').classList.add('hidden');
    document.getElementById('dnav-admin').classList.add('hidden');
    MON_FILTERS.pics = [CURRENT_USER.pic];
  }

  setReportPeriod('MONTH', false);
  switchTab('monitoring');
  refreshData();
}

