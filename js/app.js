// =========================================================================
// MAIN APPLICATION CONTROLLER, MONITORING, TIMELINE & REPORTS (v8.0)
// =========================================================================
// =========================================================================
// STATE & HELPER FUNCTIONS (BASIS 6 HARI KERJA: SENIN - SABTU)
// =========================================================================
let CURRENT_USER = null;
let APP_DATA = { rawReferences: [], references: {}, projects: [], logs: [], editLogs: [], users: [] };
let SELECTED_PROJECT_FOR_LOG = null;
let ACTIVE_DETAIL_PROJECT = null;
let ACTIVE_EDIT_LOG = null;
let CHARTS = {};

let EDITING_USER_ID = null;
let EDITING_REF_OBJ = null;
let MON_FILTERS = { pics: [], statuses: [], bagians: [], kategoris: [], onlyKendala: false };
let PROJ_QUICK_FILTER = '';
let RADAR_CACHE = { late: [], soon: [], noTarget: [] };

function toIsoDate(rawStr) {
  const s = String(rawStr || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return '';
}

function parseLocalDate(isoStr) {
  const iso = toIsoDate(isoStr);
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDateIso(d) {
  if (!d || isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Tambah N hari kerja (Senin - Sabtu; Minggu dilewati)
function addWorkingDays6(isoStart, workDays) {
  const start = parseLocalDate(isoStart);
  const n = parseInt(workDays, 10) || 0;
  if (!start || n <= 0) return '';
  const cur = new Date(start.getTime());
  let added = 0;
  while (added < n) {
    cur.setDate(cur.getDate() + 1);
    if (cur.getDay() !== 0) { // 0 = Minggu
      added++;
    }
  }
  return formatDateIso(cur);
}

// Hitung selisih hari kerja (Senin - Sabtu) antara 2 tanggal
function diffWorkingDays6(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const s = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const e = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  if (s.getTime() === e.getTime()) return 0;
  const sign = e > s ? 1 : -1;
  const cur = new Date(s.getTime());
  let count = 0;
  while (cur.getTime() !== e.getTime()) {
    cur.setDate(cur.getDate() + sign);
    if (cur.getDay() !== 0) count += sign;
  }
  return count;
}

function getBagianSlaDays(bagianName) {
  const row = (APP_DATA.rawReferences || []).find(r => r.category === 'bagian' && r.item_value === bagianName);
  return row ? (parseInt(row.sla_days, 10) || 0) : 0;
}

function formatTimestampIndo(isoTs) {
  if (!isoTs) return '-';
  const d = new Date(isoTs);
  if (isNaN(d.getTime())) return isoTs;
  return d.toLocaleString('id-ID', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

function getWorkingDaysDiffFromToday(rawDateStr) {
  const targetDate = parseLocalDate(rawDateStr);
  if (!targetDate) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return diffWorkingDays6(today, targetDate);
}

function evaluateProjectSLA(p) {
  const st = String(p.status_terkini || '').trim().toLowerCase();
  if (st === 'done' || st === 'approve') {
    return { isFinalLate: false, isStageLate: false, isSoon: false, isNoTarget: false, badgesHtml: '' };
  }

  const finalDiff = getWorkingDaysDiffFromToday(p.target_selesai);
  const stageSt = String(p.status_tahap_aktif || '').trim().toLowerCase();
  let effectiveStageTarget = p.target_tahap_aktif;
  if (!effectiveStageTarget && p.tgl_update && p.posisi_terakhir) {
    const sla = getBagianSlaDays(p.posisi_terakhir);
    if (sla > 0) effectiveStageTarget = addWorkingDays6(p.tgl_update, sla);
  }
  const stageDiff = (stageSt !== 'stage done') ? getWorkingDaysDiffFromToday(effectiveStageTarget) : null;

  const isNoTarget = (finalDiff === null);
  const isFinalLate = (finalDiff !== null && finalDiff < 0);
  const isStageLate = (stageDiff !== null && stageDiff < 0);
  const isSoon = (!isFinalLate && !isStageLate) && (
    (finalDiff !== null && finalDiff >= 0 && finalDiff <= WARN_DAYS) ||
    (stageDiff !== null && stageDiff >= 0 && stageDiff <= WARN_DAYS)
  );

  let badges = [];
  if (isNoTarget) {
    badges.push(`<span class="sla-chip sla-notarget">📅 Belum Set Target Final</span>`);
  } else if (finalDiff < 0) {
    badges.push(`<span class="sla-chip sla-late">🚨 Final Telat ${Math.abs(finalDiff)} HK</span>`);
  } else if (finalDiff === 0) {
    badges.push(`<span class="sla-chip sla-soon">⏳ Deadline Final Hari Ini</span>`);
  } else if (finalDiff <= WARN_DAYS) {
    badges.push(`<span class="sla-chip sla-soon">⏳ Final H-${finalDiff} HK</span>`);
  }

  if (stageDiff !== null) {
    if (stageDiff < 0) badges.push(`<span class="sla-chip sla-late">⚠️ Tahap Telat ${Math.abs(stageDiff)} HK</span>`);
    else if (stageDiff === 0) badges.push(`<span class="sla-chip sla-soon">⏱️ Target Tahap Hari Ini</span>`);
    else if (stageDiff <= WARN_DAYS) badges.push(`<span class="sla-chip sla-soon">⏱️ Tahap H-${stageDiff} HK</span>`);
  }

  return { isFinalLate, isStageLate, isSoon, isNoTarget, badgesHtml: badges.join('') };
}

function getStatusTheme(statusStr, forceLate = false) {
  const s = String(statusStr || '').trim().toLowerCase();
  if (s === 'done' || s === 'approve') return { badgeClass: 'st-done', cardClass: 'card-st-done', hex: '#16a34a' };
  if (forceLate || s === 'delayed') return { badgeClass: 'st-delay', cardClass: 'card-st-delay', hex: '#dc2626' };
  if (s === 'on hold') return { badgeClass: 'st-hold', cardClass: 'card-st-hold', hex: '#d97706' };
  if (s === 'review' || s === 'awaiting decision') return { badgeClass: 'st-review', cardClass: 'card-st-review', hex: '#7c3aed' };
  if (s === 'on progress' || s === 'stage done') return { badgeClass: 'st-prog', cardClass: 'card-st-prog', hex: '#2563eb' };
  return { badgeClass: 'st-todo', cardClass: 'card-st-todo', hex: '#64748b' };
}

function canManageProject(p) {
  if (!CURRENT_USER || !p) return false;
  if (CURRENT_USER.role === 'ADMIN') return true;
  return CURRENT_USER.pic.toLowerCase() === String(p.pic_utama || '').trim().toLowerCase();
}

window.onload = () => {
  if (CFG.APP_TITLE) {
    document.title = CFG.APP_TITLE;
    document.getElementById('login-app-title').textContent = CFG.APP_TITLE;
  }
  if (CFG.SHORT_TITLE) {
    document.getElementById('topbar-app-title').textContent = CFG.SHORT_TITLE;
  }
  document.getElementById('radar-soon-sub').textContent = `Jatuh tempo H-${WARN_DAYS} HK s/d Hari Ini • Klik lihat`;

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('log-tgl').value = today;
  document.getElementById('new-tglreq').value = today;

  const saved = localStorage.getItem(SESSION_KEY);
  if (saved) {
    CURRENT_USER = JSON.parse(saved);
    initApp();
  }
};

// --- NOTIFICATION & CONFIRM ---
let notifTimer = null;
function showNotif(isSuccess, title, message) {
  if (notifTimer) clearTimeout(notifTimer);
  const overlay = document.getElementById('notif-overlay');
  const card = document.getElementById('notif-card');
  const icon = document.getElementById('notif-icon');

  card.className = 'toast-card ' + (isSuccess ? 'toast-success' : 'toast-error');
  icon.textContent = isSuccess ? '✓' : '✕';
  document.getElementById('notif-title').textContent = title;
  document.getElementById('notif-msg').textContent = message;

  overlay.style.display = 'flex';
  if (isSuccess) notifTimer = setTimeout(closeNotif, 2200);
}
function closeNotif() { document.getElementById('notif-overlay').style.display = 'none'; }

let pendingConfirmAction = null;
function showConfirm(title, message, onYesCallback) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent = message;
  pendingConfirmAction = onYesCallback;
  document.getElementById('confirm-overlay').style.display = 'flex';
}
function closeConfirm() {
  document.getElementById('confirm-overlay').style.display = 'none';
  pendingConfirmAction = null;
}
function executeConfirmCallback() {
  const fn = pendingConfirmAction;
  closeConfirm();
  if (typeof fn === 'function') fn();
}

// --- LOAD ALL DATA FROM SUPABASE ---
async function refreshData() {
  try {
    const [refRes, projRes, logRes, editRes, userRes] = await Promise.all([
      db.from('app_references').select('*').order('sort_order', { ascending: true }).order('id', { ascending: true }),
      db.from('projects').select('*').order('id', { ascending: false }),
      db.from('project_logs').select('*').order('tgl', { ascending: false }).order('id', { ascending: false }),
      db.from('audit_logs').select('*').order('id', { ascending: false }).limit(500),
      CURRENT_USER.role === 'ADMIN'
        ? db.from('app_users').select('id, username, default_password, pic_name, role').order('pic_name', { ascending: true })
        : Promise.resolve({ data: [] })
    ]);

    const groupedRefs = { bagian: [], status: [], jenisTrial: [], pic: [], requestBy: [], prioritas: [], kategori: [], hasilEvaluasi: [] };
    (refRes.data || []).forEach(r => {
      if (groupedRefs[r.category]) groupedRefs[r.category].push(r);
    });

    APP_DATA = {
      rawReferences: refRes.data || [],
      references: {
        bagian: groupedRefs.bagian.map(x => x.item_value),
        status: groupedRefs.status.map(x => x.item_value),
        jenisTrial: groupedRefs.jenisTrial.map(x => x.item_value),
        pic: groupedRefs.pic.map(x => x.item_value),
        requestBy: groupedRefs.requestBy.map(x => x.item_value),
        prioritas: groupedRefs.prioritas.map(x => x.item_value),
        kategori: groupedRefs.kategori.map(x => x.item_value),
        hasilEvaluasi: groupedRefs.hasilEvaluasi.map(x => x.item_value)
      },
      projects: projRes.data || [],
      logs: logRes.data || [],
      editLogs: editRes.data || [],
      users: userRes.data || []
    };

    populateAllDropdowns();
    buildMonitoringFilterCheckboxes();
    renderMonitoringDashboard();
    renderGanttTimeline();
    renderEvaluationReport();
    renderLogFeed();
    renderProjectList();
    if (CURRENT_USER.role === 'ADMIN') {
      renderAdminUserList();
      renderAdminRefList();
    }
  } catch (err) {
    showNotif(false, 'Gagal Memuat Data', 'Periksa koneksi internet Anda lalu tekan tombol refresh (↻).');
  }
}

function fillSelect(id, items, defaultVal = '', includeEmpty = false) {
  const el = document.getElementById(id);
  if (!el) return;
  const prefix = includeEmpty ? '<option value="">(Belum ditentukan)</option>' : '';
  el.innerHTML = prefix + items.map(i => `<option value="${i}" ${i === defaultVal ? 'selected' : ''}>${i}</option>`).join('');
}

function populateAllDropdowns() {
  const r = APP_DATA.references;
  const stageStatuses = (r.status || []).filter(s => s.toLowerCase() !== 'done');
  const evalList = (r.hasilEvaluasi && r.hasilEvaluasi.length > 0)
    ? r.hasilEvaluasi
    : ['Lanjut Produksi Massal', 'Revisi Konstruksi / Trial Ulang', 'Hold / Pending Manajemen', 'Drop / Tidak Dilanjutkan'];

  fillSelect('log-pic', r.pic || [], CURRENT_USER.pic);
  fillSelect('log-posisi', r.bagian || []);
  fillSelect('log-status', stageStatuses);

  fillSelect('elog-pic', r.pic || []);
  fillSelect('elog-posisi', r.bagian || []);
  fillSelect('elog-status', stageStatuses);

  fillSelect('new-kategori', r.kategori || []);
  fillSelect('new-status', stageStatuses, 'To - Do');
  fillSelect('new-jenis', r.jenisTrial || []);
  fillSelect('new-reqby', r.requestBy || []);
  fillSelect('new-prioritas', r.prioritas || []);
  fillSelect('new-pic', r.pic || [], CURRENT_USER.pic);

  fillSelect('edit-kategori', r.kategori || []);
  fillSelect('edit-jenis', r.jenisTrial || []);
  fillSelect('edit-status', r.status || []);
  fillSelect('edit-prioritas', r.prioritas || []);
  fillSelect('edit-reqby', r.requestBy || []);
  fillSelect('edit-pic', r.pic || []);
  fillSelect('edit-hasil-eval', evalList, '', true);
  fillSelect('fd-hasil-evaluasi', evalList);

  document.getElementById('proj-filter-status').innerHTML =
    '<option value="">Semua Status</option>' + (r.status || []).map(s => `<option value="${s}">${s}</option>`).join('');
  document.getElementById('proj-filter-posisi').innerHTML =
    '<option value="">Semua Posisi</option>' + (r.bagian || []).map(b => `<option value="${b}">${b}</option>`).join('');
  document.getElementById('tl-filter-pic').innerHTML =
    '<option value="">Semua PIC</option>' + (r.pic || []).map(p => `<option value="${p}">${p}</option>`).join('');
  document.getElementById('rep-filter-kat').innerHTML =
    '<option value="">Semua Kategori</option>' + (r.kategori || []).map(k => `<option value="${k}">${k}</option>`).join('');
  document.getElementById('rep-filter-pic').innerHTML =
    '<option value="">Semua PIC</option>' + (r.pic || []).map(p => `<option value="${p}">${p}</option>`).join('');

  updateAutoSlaHint();
}

function updateAutoSlaHint() {
  const bagian = document.getElementById('log-posisi')?.value;
  const tgl = document.getElementById('log-tgl')?.value;
  const hintEl = document.getElementById('log-sla-hint');
  if (!hintEl) return;
  const sla = getBagianSlaDays(bagian);
  if (sla > 0 && tgl) {
    const autoTarget = addWorkingDays6(tgl, sla);
    hintEl.textContent = `Standar SLA ${bagian}: ${sla} HK → Auto target: ${autoTarget}`;
  } else {
    hintEl.textContent = 'Kosongkan jika belum ada target tahap.';
  }
}

// --- EXPORT KE EXCEL (CSV UTF-8 BOM) ---
function exportProjectsToCsv() {
  if (!APP_DATA.projects.length) return showNotif(false, 'Data Kosong', 'Belum ada data project untuk diekspor.');
  const headers = ['Kode', 'Induk Trial', 'No Referensi Awal', 'Judul', 'Detail', 'Kategori', 'Jenis Trial', 'Request By', 'Tgl Request', 'Target Selesai', 'Tgl Selesai Aktual', 'Prioritas', 'PIC Utama', 'Tgl Update', 'Posisi Terakhir', 'PIC Tahapan', 'Step Terakhir', 'Status Terkini', 'Hasil Evaluasi', 'No SK Hasil', 'Target Tahap Aktif', 'Next Proses', 'Kendala', 'Total Log'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const rows = APP_DATA.projects.map(p => [
    p.kode, p.parent_kode, p.no_referensi, p.judul, p.detail, p.kategori, p.jenis_trial, p.request_by,
    p.tgl_request, p.target_selesai, p.tgl_selesai_aktual, p.prioritas, p.pic_utama, p.tgl_update,
    p.posisi_terakhir, p.pic_aktual, p.step_terakhir, p.status_terkini, p.hasil_evaluasi, p.no_sk_hasil,
    p.target_tahap_aktif, p.next_proses, p.kendala_terakhir, p.total_log
  ].map(esc).join(','));

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `RnD_Monitoring_Projects_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- SHARE RINGKASAN KE WHATSAPP ---
function shareProjectToWhatsApp() {
  const p = ACTIVE_DETAIL_PROJECT;
  if (!p) return;
  const lines = [
    `*UPDATE PROJECT R&D*`,
    `Kode: *${p.kode}*${p.no_referensi ? ` (Ref: ${p.no_referensi})` : ''}`,
    `Judul: *${p.judul || '-'}*`,
    `Status: *${p.status_terkini || 'To - Do'}*`,
    p.hasil_evaluasi ? `Hasil Evaluasi: *${p.hasil_evaluasi}*${p.no_sk_hasil ? ` (${p.no_sk_hasil})` : ''}` : '',
    `Posisi Terakhir: *${p.posisi_terakhir || '-'}*`,
    `PIC Utama: ${p.pic_utama || '-'} | Pelaksana: ${p.pic_aktual || '-'}`,
    `Target Final: ${p.target_selesai || 'Belum ditentukan'}${p.target_tahap_aktif ? ` | Target Tahap: ${p.target_tahap_aktif}` : ''}`,
    p.next_proses ? `Next Proses: ${p.next_proses}` : '',
    p.kendala_terakhir ? `⚠️ Kendala: ${p.kendala_terakhir}` : ''
  ].filter(Boolean).join('\n');

  window.open(`https://wa.me/?text=${encodeURIComponent(lines)}`, '_blank');
}

// --- GANTI PASSWORD MANDIRI ---
function openChangePassModal() {
  document.getElementById('pass-old').value = '';
  document.getElementById('pass-new').value = '';
  document.getElementById('pass-confirm').value = '';
  openModal('modal-change-pass');
}

async function handleChangePassword() {
  const oldP = document.getElementById('pass-old').value.trim();
  const newP = document.getElementById('pass-new').value.trim();
  const confP = document.getElementById('pass-confirm').value.trim();

  if (!oldP || !newP) return showNotif(false, 'Data Belum Lengkap', 'Isi password lama dan password baru.');
  if (newP !== confP) return showNotif(false, 'Tidak Cocok', 'Konfirmasi password baru tidak sama.');
  if (newP.length < 4) return showNotif(false, 'Terlalu Pendek', 'Password baru minimal 4 karakter.');

  const btn = document.getElementById('btn-change-pass');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';

  try {
    const { data: userRow } = await db.from('app_users').select('password_hash').eq('id', CURRENT_USER.id).single();
    const oldHash = await sha256Hex(oldP);
    if (userRow.password_hash !== oldHash && userRow.password_hash !== oldP) {
      showNotif(false, 'Password Salah', 'Password lama yang Anda masukkan tidak sesuai.');
      return;
    }
    const newHash = await sha256Hex(newP);
    const { error } = await db.from('app_users').update({ password_hash: newHash }).eq('id', CURRENT_USER.id);
    if (error) throw error;
    closeModal('modal-change-pass');
    showNotif(true, 'Password Diubah', 'Password baru berhasil disimpan.');
  } catch (e) {
    showNotif(false, 'Gagal', 'Terjadi kesalahan saat menyimpan password baru.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Simpan Password Baru';
  }
}

// --- ADMIN: MANAJEMEN USER & PIC ---
function openListUserModal() {
  document.getElementById('admin-user-search').value = '';
  renderAdminUserList();
  openModal('modal-list-user');
}

function renderAdminUserList() {
  const container = document.getElementById('admin-user-list');
  const q = (document.getElementById('admin-user-search')?.value || '').toLowerCase().trim();
  const users = (APP_DATA.users || []).filter(u =>
    !q || u.pic_name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)
  );

  if (users.length === 0) {
    container.innerHTML = '<div style="font-size:12px; color:var(--muted); text-align:center; padding:12px;">Tidak ada data akun yang sesuai.</div>';
    return;
  }

  container.innerHTML = users.map(u => `
    <div class="admin-list-row">
      <div style="font-size:12px;">
        <div><strong>${u.pic_name}</strong> <span class="badge ${u.role === 'ADMIN' ? 'st-done' : 'st-prog'}">${u.role}</span></div>
        <div style="color:var(--muted); margin-top:2px;">User: <strong>${u.username}</strong> • Default: <strong>${u.default_password || '1234'}</strong></div>
      </div>
      <div class="admin-row-actions">
        <button class="icon-btn" onclick="openUserFormModal(${u.id})" title="Edit User">✏️</button>
        <button class="icon-btn" onclick="handleAdminResetPassword(${u.id}, '${u.username}', '${u.pic_name}', '${u.default_password || '1234'}')" title="Reset Password ke Default">🔄</button>
        <button class="icon-btn" style="color:var(--danger);" onclick="handleDeleteUser(${u.id}, '${u.username}', '${u.pic_name}')" title="Hapus User">🗑️</button>
      </div>
    </div>
  `).join('');
}

function openUserFormModal(userId) {
  if (userId === null) {
    EDITING_USER_ID = null;
    document.getElementById('modal-user-title').textContent = '➕ Tambah User & PIC Baru';
    document.getElementById('usr-form-username').value = '';
    document.getElementById('usr-form-pic').value = '';
    document.getElementById('usr-form-pass').value = '1234';
    document.getElementById('usr-form-role').value = 'USER';
  } else {
    const u = (APP_DATA.users || []).find(item => item.id === userId);
    if (!u) return;
    EDITING_USER_ID = userId;
    document.getElementById('modal-user-title').textContent = `✏️ Edit Akun (${u.username})`;
    document.getElementById('usr-form-username').value = u.username;
    document.getElementById('usr-form-pic').value = u.pic_name;
    document.getElementById('usr-form-pass').value = u.default_password || '1234';
    document.getElementById('usr-form-role').value = u.role || 'USER';
  }
  openModal('modal-admin-user');
}

async function submitUserModal() {
  const username = document.getElementById('usr-form-username').value.trim().toLowerCase();
  const picName = document.getElementById('usr-form-pic').value.trim();
  const defaultPass = document.getElementById('usr-form-pass').value.trim() || '1234';
  const role = document.getElementById('usr-form-role').value;

  if (!username || !picName) return showNotif(false, 'Data Belum Lengkap', 'Username dan Nama PIC wajib diisi.');

  const btn = document.getElementById('btn-save-user');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';

  try {
    if (EDITING_USER_ID === null) {
      const passHash = await sha256Hex(defaultPass);
      const { error } = await db.from('app_users').insert([{
        username, password_hash: passHash, default_password: defaultPass, pic_name: picName, role
      }]);
      if (error) {
        showNotif(false, 'Gagal', error.code === '23505' ? `Username "${username}" sudah terdaftar.` : error.message);
        return;
      }
    } else {
      const { error } = await db.from('app_users').update({
        username, default_password: defaultPass, pic_name: picName, role
      }).eq('id', EDITING_USER_ID);
      if (error) {
        showNotif(false, 'Gagal', error.code === '23505' ? `Username "${username}" sudah dipakai akun lain.` : error.message);
        return;
      }
    }

    await db.from('app_references').upsert([{ category: 'pic', item_value: picName }], { onConflict: 'category,item_value', ignoreDuplicates: true });

    closeModal('modal-admin-user');
    await refreshData();
    showNotif(true, 'Berhasil', `Data akun ${picName} berhasil disimpan.`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Simpan Akun';
  }
}

function handleDeleteUser(userId, username, picName) {
  if (username.toLowerCase() === CURRENT_USER.username.toLowerCase()) {
    return showNotif(false, 'Tidak Diizinkan', 'Anda tidak dapat menghapus akun Anda sendiri yang sedang login.');
  }
  showConfirm('Hapus Akun User', `Hapus akun "${picName}" (${username}) dari sistem?`, async () => {
    const { error } = await db.from('app_users').delete().eq('id', userId);
    if (error) return showNotif(false, 'Gagal', error.message);
    await refreshData();
    showNotif(true, 'Akun Dihapus', `Akun ${picName} berhasil dihapus.`);
  });
}

function handleAdminResetPassword(userId, username, picName, defPlain) {
  showConfirm('Reset Password', `Reset password "${picName}" (${username}) ke default (${defPlain})?`, async () => {
    const hash = await sha256Hex(defPlain);
    const { error } = await db.from('app_users').update({ password_hash: hash }).eq('id', userId);
    if (error) return showNotif(false, 'Gagal', error.message);
    showNotif(true, 'Reset Berhasil', `Password ${picName} dikembalikan ke default (${defPlain}).`);
  });
}

// --- ADMIN: MANAJEMEN DATA MASTER + SLA ---
function openListRefModal() {
  renderAdminRefList();
  openModal('modal-list-ref');
}

function renderAdminRefList() {
  const refType = document.getElementById('adm-ref-selector').value;
  const items = (APP_DATA.rawReferences || []).filter(r => r.category === refType);
  const container = document.getElementById('admin-ref-list');

  if (items.length === 0) {
    container.innerHTML = '<div style="font-size:12px; color:var(--muted); text-align:center; padding:12px;">Daftar referensi ini masih kosong.</div>';
    return;
  }

  container.innerHTML = items.map((row, idx) => {
    const slaTag = (refType === 'bagian' && Number(row.sla_days) > 0)
      ? ` <span class="badge st-prog">SLA: ${row.sla_days} HK</span>`
      : '';
    return `
      <div class="admin-list-row">
        <span style="font-size:12px; font-weight:600;">${idx + 1}. ${row.item_value}${slaTag}</span>
        <div class="admin-row-actions">
          <button class="icon-btn" onclick="openRefFormModal('${refType}', ${row.id})" title="Edit Item">✏️</button>
          <button class="icon-btn" style="color:var(--danger);" onclick="handleDeleteRef(${row.id}, '${row.item_value.replace(/'/g, "\\'")}')" title="Hapus Item">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

function toggleRefSlaInput() {
  const cat = document.getElementById('ref-form-category').value;
  document.getElementById('ref-sla-wrapper').classList.toggle('hidden', cat !== 'bagian');
}

function openRefFormModal(preselectedCat, refId) {
  const catSelect = document.getElementById('ref-form-category');
  const catWrapper = document.getElementById('ref-cat-wrapper');
  if (preselectedCat) catSelect.value = preselectedCat;

  if (refId === null) {
    EDITING_REF_OBJ = null;
    catWrapper.classList.remove('hidden');
    document.getElementById('modal-ref-title').textContent = '➕ Tambah Data Master';
    document.getElementById('modal-ref-label').textContent = 'Nilai Item Baru *';
    document.getElementById('ref-form-val').value = '';
    document.getElementById('ref-form-sla').value = '0';
  } else {
    const row = (APP_DATA.rawReferences || []).find(r => r.id === refId);
    if (!row) return;
    EDITING_REF_OBJ = row;
    catWrapper.classList.add('hidden');
    const labelText = catSelect.options[catSelect.selectedIndex].text;
    document.getElementById('modal-ref-title').textContent = `✏️ Edit ${labelText}`;
    document.getElementById('modal-ref-label').textContent = `Ubah Nilai ${labelText} *`;
    document.getElementById('ref-form-val').value = row.item_value;
    document.getElementById('ref-form-sla').value = row.sla_days || 0;
  }
  toggleRefSlaInput();
  openModal('modal-admin-ref');
}

async function submitRefModal() {
  const refType = document.getElementById('ref-form-category').value;
  const newVal = document.getElementById('ref-form-val').value.trim();
  const slaDays = refType === 'bagian' ? (parseInt(document.getElementById('ref-form-sla').value, 10) || 0) : 0;
  if (!newVal) return showNotif(false, 'Data Kosong', 'Isi nilai item terlebih dahulu.');

  const btn = document.getElementById('btn-save-ref');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';

  try {
    if (EDITING_REF_OBJ === null) {
      const { error } = await db.from('app_references').insert([{ category: refType, item_value: newVal, sla_days: slaDays }]);
      if (error) {
        showNotif(false, 'Gagal', error.code === '23505' ? `Item "${newVal}" sudah ada di daftar.` : error.message);
        return;
      }
      document.getElementById('adm-ref-selector').value = refType;
    } else {
      const { error } = await db.from('app_references').update({ item_value: newVal, sla_days: slaDays }).eq('id', EDITING_REF_OBJ.id);
      if (error) {
        showNotif(false, 'Gagal', error.code === '23505' ? `Item "${newVal}" sudah ada di daftar.` : error.message);
        return;
      }
    }
    closeModal('modal-admin-ref');
    await refreshData();
    showNotif(true, 'Berhasil Disimpan', `Item "${newVal}" berhasil diperbarui.`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Simpan Item';
  }
}

function handleDeleteRef(refId, targetVal) {
  showConfirm('Hapus Data Master', `Hapus "${targetVal}" dari daftar referensi?`, async () => {
    const { error } = await db.from('app_references').delete().eq('id', refId);
    if (error) return showNotif(false, 'Gagal', error.message);
    await refreshData();
    showNotif(true, 'Item Dihapus', `Item "${targetVal}" berhasil dihapus.`);
  });
}

function runRecalculateAllProjects() {
  showConfirm('Sinkronisasi Ulang', 'Muat ulang dan sinkronkan seluruh data project dari database?', async () => {
    await refreshData();
    showNotif(true, 'Sinkronisasi Selesai', 'Seluruh data project telah diperbarui dari database.');
  });
}

// --- MULTI-SELECT FILTER MONITORING ---
function toggleFilterPanel(panelId) {
  const target = document.getElementById(panelId);
  const isOpen = target.style.display === 'block';
  document.querySelectorAll('.multi-panel').forEach(p => p.style.display = 'none');
  if (!isOpen) target.style.display = 'block';
}

function toggleKendalaFilter() {
  MON_FILTERS.onlyKendala = !MON_FILTERS.onlyKendala;
  updateFilterChipHighlights();
  renderMonitoringDashboard();
}

function buildMonitoringFilterCheckboxes() {
  const r = APP_DATA.references;
  renderCheckboxGroup('multi-pic-list', r.pic || [], 'pics');
  renderCheckboxGroup('multi-status-list', r.status || [], 'statuses');
  renderCheckboxGroup('multi-bagian-list', r.bagian || [], 'bagians');
  renderCheckboxGroup('multi-kat-list', r.kategori || [], 'kategoris');
  updateFilterChipHighlights();
}

function renderCheckboxGroup(containerId, items, filterKey) {
  const el = document.getElementById(containerId);
  el.innerHTML = items.map(val => {
    const checked = MON_FILTERS[filterKey].includes(val) ? 'checked' : '';
    return `
      <label class="check-label">
        <input type="checkbox" value="${val}" ${checked} onchange="onMultiFilterChange('${filterKey}', this)">
        <span>${val}</span>
      </label>
    `;
  }).join('');
}

function onMultiFilterChange(key, checkbox) {
  const val = checkbox.value;
  if (checkbox.checked) {
    if (!MON_FILTERS[key].includes(val)) MON_FILTERS[key].push(val);
  } else {
    MON_FILTERS[key] = MON_FILTERS[key].filter(item => item !== val);
  }
  updateFilterChipHighlights();
  renderMonitoringDashboard();
}

function setPicFilterMode(mode) {
  MON_FILTERS.pics = mode === 'MINE' ? [CURRENT_USER.pic] : [];
  buildMonitoringFilterCheckboxes();
  renderMonitoringDashboard();
}

function resetMonitoringFilters() {
  MON_FILTERS = {
    pics: CURRENT_USER.role === 'ADMIN' ? [] : [CURRENT_USER.pic],
    statuses: [],
    bagians: [],
    kategoris: [],
    onlyKendala: false
  };
  buildMonitoringFilterCheckboxes();
  renderMonitoringDashboard();
}

function removeSingleMonFilter(key, val) {
  if (key === 'onlyKendala') {
    MON_FILTERS.onlyKendala = false;
  } else {
    MON_FILTERS[key] = MON_FILTERS[key].filter(item => item !== val);
  }
  buildMonitoringFilterCheckboxes();
  renderMonitoringDashboard();
}

function renderActiveFilterPills() {
  const bar = document.getElementById('active-filter-pills');
  if (!bar) return;
  const pills = [];
  MON_FILTERS.pics.forEach(v => pills.push(`<span class="active-pill" onclick="removeSingleMonFilter('pics', '${v.replace(/'/g, "\'")}')">👤 ${v} ✕</span>`));
  MON_FILTERS.statuses.forEach(v => pills.push(`<span class="active-pill" onclick="removeSingleMonFilter('statuses', '${v.replace(/'/g, "\'")}')">📌 ${v} ✕</span>`));
  MON_FILTERS.bagians.forEach(v => pills.push(`<span class="active-pill" onclick="removeSingleMonFilter('bagians', '${v.replace(/'/g, "\'")}')">🏭 ${v} ✕</span>`));
  MON_FILTERS.kategoris.forEach(v => pills.push(`<span class="active-pill" onclick="removeSingleMonFilter('kategoris', '${v.replace(/'/g, "\'")}')">📂 ${v} ✕</span>`));
  if (MON_FILTERS.onlyKendala) {
    pills.push(`<span class="active-pill danger" onclick="removeSingleMonFilter('onlyKendala', '')">⚠️ Ada Kendala ✕</span>`);
  }

  if (pills.length === 0) {
    bar.classList.add('hidden');
    bar.innerHTML = '';
  } else {
    bar.classList.remove('hidden');
    bar.innerHTML = pills.join('');
  }
}

function updateFilterChipHighlights() {
  document.getElementById('btn-toggle-f-pic').classList.toggle('active', MON_FILTERS.pics.length > 0);
  document.getElementById('btn-toggle-f-status').classList.toggle('active', MON_FILTERS.statuses.length > 0);
  document.getElementById('btn-toggle-f-bagian').classList.toggle('active', MON_FILTERS.bagians.length > 0);
  document.getElementById('btn-toggle-f-kat').classList.toggle('active', MON_FILTERS.kategoris.length > 0);
  document.getElementById('btn-toggle-f-kendala').classList.toggle('danger-active', MON_FILTERS.onlyKendala);
  renderActiveFilterPills();
}

let DASH_KPI_CACHE = { total: [], progress: [], done: [], delay: [] };
function openDashboardKpiDrilldown(type) {
  if (type === 'TOTAL') {
    openDrilldownModal('📊 Total Project (Sesuai Filter)', `${DASH_KPI_CACHE.total.length} project terdaftar`, DASH_KPI_CACHE.total);
  } else if (type === 'PROGRESS') {
    openDrilldownModal('🔵 Project On Progress', `${DASH_KPI_CACHE.progress.length} project sedang berjalan / review`, DASH_KPI_CACHE.progress);
  } else if (type === 'DONE') {
    openDrilldownModal('✅ Project Final Done', `${DASH_KPI_CACHE.done.length} project telah selesai`, DASH_KPI_CACHE.done);
  } else if (type === 'DELAY') {
    openDrilldownModal('🚨 Project Delayed / Hold / Over SLA', `${DASH_KPI_CACHE.delay.length} project tertahan atau melewati batas waktu`, DASH_KPI_CACHE.delay);
  }
}

function getFilteredMonitoringProjects() {
  return APP_DATA.projects.filter(p => {
    const passPic = MON_FILTERS.pics.length === 0 || MON_FILTERS.pics.includes(p.pic_utama) || MON_FILTERS.pics.includes(p.pic_aktual);
    const passStat = MON_FILTERS.statuses.length === 0 || MON_FILTERS.statuses.includes(p.status_terkini);
    const passBag = MON_FILTERS.bagians.length === 0 || MON_FILTERS.bagians.includes(p.posisi_terakhir);
    const passKat = MON_FILTERS.kategoris.length === 0 || MON_FILTERS.kategoris.includes(p.kategori);
    const passKendala = !MON_FILTERS.onlyKendala || Boolean(String(p.kendala_terakhir || '').trim());
    return passPic && passStat && passBag && passKat && passKendala;
  });
}

function renderMonitoringDashboard() {
  const picMode = document.getElementById('pic-chart-mode').value;
  const filteredProjs = getFilteredMonitoringProjects();

  RADAR_CACHE.late = [];
  RADAR_CACHE.soon = [];
  RADAR_CACHE.noTarget = [];
  filteredProjs.forEach(p => {
    const sla = evaluateProjectSLA(p);
    if (sla.isNoTarget) RADAR_CACHE.noTarget.push(p);
    if (sla.isFinalLate || sla.isStageLate || String(p.status_terkini).toLowerCase() === 'delayed') {
      RADAR_CACHE.late.push(p);
    } else if (sla.isSoon) {
      RADAR_CACHE.soon.push(p);
    }
  });
  document.getElementById('radar-late-count').textContent = RADAR_CACHE.late.length;
  document.getElementById('radar-soon-count').textContent = RADAR_CACHE.soon.length;
  document.getElementById('radar-notarget-count').textContent = RADAR_CACHE.noTarget.length;

  const progList = filteredProjs.filter(p => ['On Progress', 'Stage Done', 'Review', 'Awaiting Decision'].includes(p.status_terkini));
  const doneList = filteredProjs.filter(p => ['Done', 'Approve'].includes(p.status_terkini));
  const delayList = filteredProjs.filter(p => {
    const sla = evaluateProjectSLA(p);
    return ['Delayed', 'On Hold'].includes(p.status_terkini) || sla.isFinalLate || sla.isStageLate;
  });

  DASH_KPI_CACHE = { total: filteredProjs, progress: progList, done: doneList, delay: delayList };

  document.getElementById('kpi-total').textContent = filteredProjs.length;
  document.getElementById('kpi-progress').textContent = progList.length;
  document.getElementById('kpi-done').textContent = doneList.length;
  document.getElementById('kpi-delay').textContent = delayList.length;

  const statusCounts = {};
  filteredProjs.forEach(p => {
    const s = p.status_terkini || 'To - Do';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });
  const statusLabels = Object.keys(statusCounts);
  const statusColors = statusLabels.map(lbl => getStatusTheme(lbl).hex);
  renderInteractiveChart('chart-status', 'doughnut', statusLabels, Object.values(statusCounts), statusColors, (clickedLabel) => {
    const matched = filteredProjs.filter(p => (p.status_terkini || 'To - Do') === clickedLabel);
    openDrilldownModal(`📊 Status: ${clickedLabel}`, `${matched.length} project pada status ini`, matched);
  });

  const bagCounts = {};
  filteredProjs.forEach(p => {
    if (p.posisi_terakhir) bagCounts[p.posisi_terakhir] = (bagCounts[p.posisi_terakhir] || 0) + 1;
  });
  const bagLabels = Object.keys(bagCounts);
  renderInteractiveChart('chart-bagian', 'bar', bagLabels, Object.values(bagCounts), '#2563eb', (clickedLabel) => {
    const matched = filteredProjs.filter(p => p.posisi_terakhir === clickedLabel);
    openDrilldownModal(`🏭 Bagian: ${clickedLabel}`, `${matched.length} project sedang berada di bagian ini`, matched);
  });

  const picCounts = {};
  filteredProjs.forEach(p => {
    const person = picMode === 'AKTUAL' ? (p.pic_aktual || p.pic_utama) : p.pic_utama;
    if (person && (MON_FILTERS.pics.length === 0 || MON_FILTERS.pics.includes(person))) {
      picCounts[person] = (picCounts[person] || 0) + 1;
    }
  });
  const picLabels = Object.keys(picCounts);
  renderInteractiveChart('chart-pic', 'bar', picLabels, Object.values(picCounts), '#1e3a8a', (clickedLabel) => {
    const matched = filteredProjs.filter(p => {
      const person = picMode === 'AKTUAL' ? (p.pic_aktual || p.pic_utama) : p.pic_utama;
      return person === clickedLabel;
    });
    openDrilldownModal(`👤 PIC: ${clickedLabel}`, `${matched.length} project ditangani oleh ${clickedLabel}`, matched);
  });
}

function renderInteractiveChart(canvasId, type, labels, data, colors, onClickItem) {
  if (CHARTS[canvasId]) CHARTS[canvasId].destroy();
  const ctx = document.getElementById(canvasId).getContext('2d');
  const hasData = labels.length > 0;

  CHARTS[canvasId] = new Chart(ctx, {
    type: type,
    data: {
      labels: hasData ? labels : ['Tidak ada data'],
      datasets: [{
        label: 'Jumlah Project',
        data: hasData ? data : [0],
        backgroundColor: hasData ? colors : ['#cbd5e1'],
        borderRadius: type === 'bar' ? 6 : 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onHover: (event, elements) => {
        event.native.target.style.cursor = (hasData && elements.length > 0) ? 'pointer' : 'default';
      },
      onClick: (event, elements) => {
        if (!hasData || elements.length === 0) return;
        const idx = elements[0].index;
        const clickedLabel = labels[idx];
        if (clickedLabel && typeof onClickItem === 'function') onClickItem(clickedLabel);
      },
      plugins: {
        legend: { display: type === 'doughnut', position: 'bottom', labels: { boxWidth: 11, font: { size: 11 } } },
        tooltip: {
          enabled: hasData,
          callbacks: {
            label: (ctxItem) => ` ${ctxItem.label}: ${ctxItem.parsed.y !== undefined ? ctxItem.parsed.y : ctxItem.parsed} project (Klik untuk daftar)`
          }
        }
      },
      scales: type === 'bar' ? { y: { beginAtZero: true, ticks: { precision: 0 } } } : {}
    }
  });
}

// --- TAB 2: TIMELINE PROJECT (GANTT CHART) ---
function renderGanttTimeline() {
  const container = document.getElementById('gantt-container');
  const q = (document.getElementById('tl-search-text')?.value || '').toLowerCase().trim();
  const mode = document.getElementById('tl-filter-status').value;
  const picFilter = document.getElementById('tl-filter-pic').value;

  const list = APP_DATA.projects.filter(p => {
    const st = String(p.status_terkini || '').toLowerCase();
    const isDone = (st === 'done' || st === 'approve');
    const sla = evaluateProjectSLA(p);

    if (q) {
      const hay = `${p.kode || ''} ${p.no_referensi || ''} ${p.judul || ''} ${p.detail || ''} ${p.pic_utama || ''} ${p.pic_aktual || ''} ${p.posisi_terakhir || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (mode === 'ACTIVE' && isDone) return false;
    if (mode === 'NOTARGET' && !sla.isNoTarget) return false;
    if (mode === 'LATE' && !(sla.isFinalLate || sla.isStageLate || st === 'delayed')) return false;
    if (picFilter && p.pic_utama !== picFilter && p.pic_aktual !== picFilter) return false;
    return true;
  });

  if (list.length === 0) {
    container.innerHTML = '<div style="padding:24px; text-align:center; color:var(--muted); font-size:13px;">Tidak ada project untuk ditampilkan pada timeline filter ini.</div>';
    return;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let minDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  let maxDate = new Date(today.getFullYear(), today.getMonth() + 2, 0);

  const items = list.map(p => {
    const start = parseLocalDate(p.tgl_request) || parseLocalDate(p.created_at?.slice(0, 10)) || today;
    const end = parseLocalDate(p.target_selesai) || parseLocalDate(p.target_tahap_aktif) || today;
    const safeEnd = end < start ? start : end;
    if (start < minDate) minDate = new Date(start.getFullYear(), start.getMonth(), 1);
    if (safeEnd > maxDate) maxDate = new Date(safeEnd.getFullYear(), safeEnd.getMonth() + 1, 0);
    return { p, start, end: safeEnd, hasNoTarget: !p.target_selesai };
  });

  const months = [];
  let cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  while (cursor <= maxDate) {
    months.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  if (months.length > 18) {
    months.splice(0, months.length - 18);
    minDate = months[0];
  }

  const totalSpanMs = Math.max(1, maxDate.getTime() - minDate.getTime());
  const todayPct = Math.min(100, Math.max(0, ((today.getTime() - minDate.getTime()) / totalSpanMs) * 100));

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const headerCols = months.map(m => `<div class="gantt-month-cell">${monthNames[m.getMonth()]} ${String(m.getFullYear()).slice(2)}</div>`).join('');
  const gridCols = months.map(() => `<div class="gantt-grid-col"></div>`).join('');

  const rowsHtml = items.map(({ p, start, end, hasNoTarget }) => {
    const clampedStart = start < minDate ? minDate : start;
    const leftPct = Math.min(98, Math.max(0, ((clampedStart.getTime() - minDate.getTime()) / totalSpanMs) * 100));
    const rawWidthPct = ((end.getTime() - clampedStart.getTime()) / totalSpanMs) * 100;
    const widthPct = Math.min(100 - leftPct, Math.max(3.5, rawWidthPct));

    const sla = evaluateProjectSLA(p);
    const isLate = sla.isFinalLate || sla.isStageLate;
    const theme = getStatusTheme(p.status_terkini, isLate);

    return `
      <div class="gantt-row" onclick="openProjectDetail(${p.id})">
        <div class="gantt-row-info">
          <div style="font-size:12px; font-weight:700; color:var(--accent);">${p.kode} <span style="font-weight:500; color:var(--muted);">(${p.pic_utama})</span></div>
          <div style="font-size:12px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.judul}</div>
          <div style="font-size:10px; color:var(--muted);">${p.tgl_request || '-'} → ${p.target_selesai || 'Belum Set Target'}</div>
        </div>
        <div class="gantt-row-track">
          <div class="gantt-grid-bg">${gridCols}</div>
          <div class="gantt-today-line" style="left:${todayPct}%;"></div>
          <div class="gantt-bar ${hasNoTarget ? 'gantt-bar-notarget' : ''}"
               style="left:${leftPct}%; width:${widthPct}%; background:${theme.hex};"
               title="${p.kode}: ${p.judul} (${p.status_terkini})">
            ${p.posisi_terakhir || p.status_terkini}
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="gantt-table">
      <div class="gantt-header">
        <div class="gantt-col-info">Project & Jadwal</div>
        <div class="gantt-col-track">
          ${headerCols}
          <div class="gantt-today-line" style="left:${todayPct}%;"><span class="gantt-today-tag">Hari Ini</span></div>
        </div>
      </div>
      ${rowsHtml}
    </div>
  `;
}

// --- TAB 3: LAPORAN EVALUASI MINGGUAN / BULANAN ---
function setReportPeriod(mode, triggerRender = true) {
  ['month', 'week', 'quarter', 'all'].forEach(k => {
    const btn = document.getElementById('rep-p-' + k);
    if (btn) btn.classList.toggle('active', k.toUpperCase() === mode);
  });

  const now = new Date();
  let startStr = '';
  let endStr = formatDateIso(now);

  if (mode === 'WEEK') {
    const day = now.getDay();
    const diffToMon = (day === 0 ? -6 : 1 - day);
    const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMon);
    startStr = formatDateIso(mon);
  } else if (mode === 'MONTH') {
    startStr = formatDateIso(new Date(now.getFullYear(), now.getMonth(), 1));
  } else if (mode === 'QUARTER') {
    const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
    startStr = formatDateIso(new Date(now.getFullYear(), qStartMonth, 1));
  } else {
    startStr = '2020-01-01';
  }

  document.getElementById('rep-start').value = startStr;
  document.getElementById('rep-end').value = endStr;
  if (triggerRender) renderEvaluationReport();
}

let LAST_REPORT_SUMMARY = {};
let EVAL_CACHE = { projsIn: [], projsDone: [], onTimeList: [], lateDoneList: [], byDecision: {}, byBagian: {} };

function openEvalDrilldown(mode, keyVal = '') {
  if (mode === 'IN') {
    openDrilldownModal('📥 Project Masuk Periode Ini', `${EVAL_CACHE.projsIn.length} project didaftarkan pada periode terpilih`, EVAL_CACHE.projsIn);
  } else if (mode === 'DONE') {
    openDrilldownModal('✅ Project Selesai (Final Done)', `${EVAL_CACHE.projsDone.length} project selesai pada periode terpilih`, EVAL_CACHE.projsDone);
  } else if (mode === 'LEAD') {
    openDrilldownModal('⏱️ Rincian Lead Time Penyelesaian', `${EVAL_CACHE.projsDone.length} project selesai (klik kartu untuk melihat durasi tiap tahapan)`, EVAL_CACHE.projsDone);
  } else if (mode === 'ONTIME') {
    const combined = [...EVAL_CACHE.onTimeList, ...EVAL_CACHE.lateDoneList];
    const sub = `Tepat waktu (≤ Target): ${EVAL_CACHE.onTimeList.length} project • Terlambat: ${EVAL_CACHE.lateDoneList.length} project`;
    openDrilldownModal('🎯 Evaluasi On-Time Delivery', sub, combined.length > 0 ? combined : EVAL_CACHE.projsDone);
  } else if (mode === 'DECISION') {
    const list = EVAL_CACHE.byDecision[keyVal] || [];
    openDrilldownModal(`🏆 Keputusan: ${keyVal}`, `${list.length} project dengan hasil evaluasi ini`, list);
  } else if (mode === 'BAGIAN') {
    const list = EVAL_CACHE.byBagian[keyVal] || [];
    openDrilldownModal(`🏭 Project Aktif di Bagian: ${keyVal}`, `${list.length} project sedang berada di bagian ini`, list);
  }
}

function renderEvaluationReport() {
  const startIso = document.getElementById('rep-start').value || '2020-01-01';
  const endIso = document.getElementById('rep-end').value || formatDateIso(new Date());
  const fKat = document.getElementById('rep-filter-kat')?.value || '';
  const fPic = document.getElementById('rep-filter-pic')?.value || '';

  const baseScope = APP_DATA.projects.filter(p => {
    if (fKat && p.kategori !== fKat) return false;
    if (fPic && p.pic_utama !== fPic && p.pic_aktual !== fPic) return false;
    return true;
  });

  const projsIn = baseScope.filter(p => {
    const d = toIsoDate(p.tgl_request) || (p.created_at ? p.created_at.slice(0, 10) : '');
    return d && d >= startIso && d <= endIso;
  });

  const projsDone = baseScope.filter(p => {
    const st = String(p.status_terkini || '').toLowerCase();
    if (st !== 'done' && st !== 'approve') return false;
    const d = toIsoDate(p.tgl_selesai_aktual) || toIsoDate(p.tgl_update) || '';
    return d && d >= startIso && d <= endIso;
  });

  const skCount = projsDone.filter(p => Boolean(String(p.no_sk_hasil || '').trim())).length;

  let totalLead = 0;
  let leadCount = 0;
  const onTimeList = [];
  const lateDoneList = [];

  projsDone.forEach(p => {
    const reqD = parseLocalDate(p.tgl_request);
    const actD = parseLocalDate(p.tgl_selesai_aktual) || parseLocalDate(p.tgl_update);
    const tgtD = parseLocalDate(p.target_selesai);
    if (reqD && actD) {
      totalLead += Math.max(1, diffWorkingDays6(reqD, actD) + 1);
      leadCount++;
    }
    if (tgtD && actD) {
      if (actD <= tgtD) onTimeList.push(p);
      else lateDoneList.push(p);
    }
  });

  const onTimeEligible = onTimeList.length + lateDoneList.length;
  const avgLead = leadCount > 0 ? (totalLead / leadCount).toFixed(1) : '0';
  const onTimePct = onTimeEligible > 0 ? `${Math.round((onTimeList.length / onTimeEligible) * 100)}%` : '-';

  document.getElementById('rep-kpi-in').textContent = projsIn.length;
  document.getElementById('rep-kpi-done').textContent = projsDone.length;
  document.getElementById('rep-kpi-sk').textContent = `${skCount} terbit Dokumen / SK Hasil`;
  document.getElementById('rep-kpi-lead').textContent = `${avgLead} HK`;
  document.getElementById('rep-kpi-ontime').textContent = onTimePct;

  const byDecision = {};
  projsDone.forEach(p => {
    const lbl = p.hasil_evaluasi || 'Belum Diisi Keterangan Evaluasi';
    if (!byDecision[lbl]) byDecision[lbl] = [];
    byDecision[lbl].push(p);
  });
  const evalEntries = Object.entries(byDecision);
  document.getElementById('rep-eval-summary').innerHTML = evalEntries.length === 0
    ? '<div style="font-size:12px; color:var(--muted);">Belum ada project yang selesai pada rentang tanggal ini.</div>'
    : `<table class="rep-table"><thead><tr><th>Keputusan Akhir</th><th style="width:75px;">Jumlah</th></tr></thead><tbody>` +
      evalEntries.map(([k, arr]) => `<tr class="rep-row-clickable" onclick="openEvalDrilldown('DECISION', '${k.replace(/'/g, "\'")}')"><td><strong>${k}</strong></td><td><span class="badge st-prog">${arr.length}</span></td></tr>`).join('') +
      `</tbody></table>`;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const bagStats = {};
  const byBagian = {};
  baseScope.forEach(p => {
    const st = String(p.status_terkini || '').toLowerCase();
    if (st === 'done' || st === 'approve') return;
    const pos = p.posisi_terakhir || 'Belum Ada Posisi';
    if (!bagStats[pos]) bagStats[pos] = { count: 0, totalAge: 0, overSla: 0 };
    if (!byBagian[pos]) byBagian[pos] = [];
    byBagian[pos].push(p);
    bagStats[pos].count++;
    const upd = parseLocalDate(p.tgl_update) || parseLocalDate(p.tgl_request) || today;
    const ageHk = Math.max(0, diffWorkingDays6(upd, today));
    bagStats[pos].totalAge += ageHk;
    const sla = getBagianSlaDays(pos);
    if (sla > 0 && ageHk > sla) bagStats[pos].overSla++;
  });

  const bagEntries = Object.entries(bagStats);
  document.getElementById('rep-bagian-aging').innerHTML = bagEntries.length === 0
    ? '<div style="font-size:12px; color:var(--muted);">Tidak ada project aktif saat ini.</div>'
    : `<table class="rep-table"><thead><tr><th>Bagian</th><th>Aktif</th><th>Rata Aging</th><th>Over SLA</th></tr></thead><tbody>` +
      bagEntries.map(([pos, st]) => {
        const sla = getBagianSlaDays(pos);
        const avgAge = (st.totalAge / st.count).toFixed(1);
        return `<tr class="rep-row-clickable" onclick="openEvalDrilldown('BAGIAN', '${pos.replace(/'/g, "\'")}')">
          <td><strong>${pos}</strong>${sla > 0 ? `<br><span style="font-size:10px; color:var(--muted);">Std: ${sla} HK</span>` : ''}</td>
          <td>${st.count}</td>
          <td>${avgAge} HK</td>
          <td>${st.overSla > 0 ? `<span class="badge st-delay">${st.overSla}</span>` : '0'}</td>
        </tr>`;
      }).join('') +
      `</tbody></table>`;

  const kendalaProjs = baseScope.filter(p => {
    const st = String(p.status_terkini || '').toLowerCase();
    return (st !== 'done' && st !== 'approve') && Boolean(String(p.kendala_terakhir || '').trim());
  });

  document.getElementById('rep-kendala-list').innerHTML = kendalaProjs.length === 0
    ? '<div style="font-size:12px; color:var(--muted);">Tidak ada kendala lapangan aktif yang tercatat.</div>'
    : `<table class="rep-table"><thead><tr><th>Kode</th><th>Project</th><th>Bagian & PIC</th><th>Kendala</th></tr></thead><tbody>` +
      kendalaProjs.map(p => `<tr class="rep-row-clickable" onclick="openProjectDetail(${p.id})">
        <td><strong style="color:var(--accent);">${p.kode}</strong></td>
        <td>${p.judul}</td>
        <td>${p.posisi_terakhir || '-'}<br><span style="font-size:11px; color:var(--muted);">${p.pic_aktual || p.pic_utama}</span></td>
        <td style="color:var(--danger); font-weight:600;">${p.kendala_terakhir}</td>
      </tr>`).join('') +
      `</tbody></table>`;

  EVAL_CACHE = { projsIn, projsDone, onTimeList, lateDoneList, byDecision, byBagian };

  renderInteractiveChart(
    'chart-eval-flow',
    'bar',
    ['Project Masuk', 'Selesai (Done)', 'Terbit SK Hasil'],
    [projsIn.length, projsDone.length, skCount],
    ['#1e3a8a', '#16a34a', '#0ea5e9'],
    (lbl) => {
      if (lbl === 'Project Masuk') openEvalDrilldown('IN');
      else if (lbl === 'Selesai (Done)') openEvalDrilldown('DONE');
      else {
        const skProjs = projsDone.filter(p => Boolean(String(p.no_sk_hasil || '').trim()));
        openDrilldownModal('📑 Project Terbit Dokumen / SK Hasil', `${skProjs.length} project telah memiliki nomor SK hasil`, skProjs);
      }
    }
  );

  const decLabels = evalEntries.map(([k]) => k);
  const decCounts = evalEntries.map(([, arr]) => arr.length);
  const decColors = ['#16a34a', '#2563eb', '#d97706', '#dc2626', '#7c3aed', '#64748b'];
  renderInteractiveChart(
    'chart-eval-decision',
    'doughnut',
    decLabels,
    decCounts,
    decLabels.map((_, i) => decColors[i % decColors.length]),
    (clickedDec) => openEvalDrilldown('DECISION', clickedDec)
  );

  LAST_REPORT_SUMMARY = { startIso, endIso, inCount: projsIn.length, doneCount: projsDone.length, skCount, avgLead, onTimePct, kendalaCount: kendalaProjs.length };
}

function shareReportToWhatsApp() {
  const s = LAST_REPORT_SUMMARY;
  const text = [
    `*LAPORAN EVALUASI R&D*`,
    `Periode: ${s.startIso} s/d ${s.endIso}`,
    `• Project Masuk: *${s.inCount}*`,
    `• Selesai (Final Done): *${s.doneCount}* (${s.skCount} terbit Dokumen / SK Hasil)`,
    `• Rata-rata Lead Time: *${s.avgLead} HK*`,
    `• On-Time Delivery: *${s.onTimePct}*`,
    `• Project Berkendala Aktif: *${s.kendalaCount}*`
  ].join('\n');
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

// --- POPUP DRILLDOWN ---
function openDeadlineDrilldown(mode) {
  if (mode === 'LATE') {
    openDrilldownModal('🚨 Project Melewati Deadline', 'Project yang telah melewati target final atau batas waktu tahap', RADAR_CACHE.late);
  } else if (mode === 'SOON') {
    openDrilldownModal('⏳ Project Mendekati Deadline', `Project yang jatuh tempo hari ini hingga H-${WARN_DAYS} HK`, RADAR_CACHE.soon);
  } else {
    openDrilldownModal('📅 Project Belum Set Target Final', 'Klik project untuk membuka detail lalu tekan "Set Target Sekarang"', RADAR_CACHE.noTarget);
  }
}

function openDrilldownModal(title, subtitle, projectList) {
  document.getElementById('drilldown-title').textContent = title;
  document.getElementById('drilldown-sub').textContent = subtitle;
  const container = document.getElementById('drilldown-list');

  if (!projectList || projectList.length === 0) {
    container.innerHTML = '<div style="text-align:center; color:var(--muted); font-size:13px; padding:18px;">Tidak ada project pada kategori ini.</div>';
  } else {
    container.innerHTML = projectList.map(p => renderProjectCardHtml(p)).join('');
  }
  openModal('modal-drilldown');
}

function renderProjectCardHtml(p) {
  const sla = evaluateProjectSLA(p);
  const isLate = sla.isFinalLate || sla.isStageLate;
  const theme = getStatusTheme(p.status_terkini, isLate);

  return `
    <div class="item-card clickable ${theme.cardClass}" onclick="openProjectDetail(${p.id})">
      <div class="item-header">
        <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
          <strong style="color:var(--accent); font-size:13px;">${p.kode || '(TANPA KODE)'}</strong>
          ${p.no_referensi ? `<span class="ref-tag">📄 ${p.no_referensi}</span>` : ''}
          ${p.parent_kode ? `<span class="ref-tag">🔄 Ulang dari ${p.parent_kode}</span>` : ''}
        </div>
        <span class="badge ${theme.badgeClass}">${p.status_terkini || 'To - Do'}</span>
      </div>
      <div style="font-size:13px; font-weight:700; margin-bottom:3px;">${p.judul || p.detail}</div>
      <div style="font-size:11px; color:var(--muted); margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.detail}</div>
      ${p.hasil_evaluasi ? `<div><span class="sk-chip">🏆 ${p.hasil_evaluasi}${p.no_sk_hasil ? ` • ${p.no_sk_hasil}` : ''}</span></div>` : ''}
      ${sla.badgesHtml ? `<div style="margin-bottom:5px;">${sla.badgesHtml}</div>` : ''}
      ${p.kendala_terakhir ? `<div style="font-size:11px; color:var(--danger); margin-bottom:4px;">⚠️ Kendala: ${p.kendala_terakhir}</div>` : ''}
      <div style="font-size:11px; color:#475569;">
        Posisi: <strong>${p.posisi_terakhir || '-'}</strong> • PIC: <strong>${p.pic_aktual || p.pic_utama || '-'}</strong> • Log: ${p.total_log}x
      </div>
    </div>
  `;
}

// --- TAB 4: LOG FEED ---
function renderLogFeed() {
  const q = document.getElementById('log-search-filter').value.toLowerCase().trim();
  const container = document.getElementById('log-feed-container');

  const filteredLogs = APP_DATA.logs.filter(l =>
    !q ||
    l.kode_project.toLowerCase().includes(q) ||
    (l.judul || '').toLowerCase().includes(q) ||
    l.posisi.toLowerCase().includes(q) ||
    l.pic_pelaksana.toLowerCase().includes(q) ||
    l.step_proses.toLowerCase().includes(q)
  );

  if (filteredLogs.length === 0) {
    container.innerHTML = '<div class="card" style="text-align:center; color:var(--muted); font-size:13px; grid-column:1/-1;">Belum ada riwayat log. Tekan tombol <strong>+</strong> untuk menambah log baru.</div>';
    return;
  }

  container.innerHTML = filteredLogs.slice(0, MAX_ITEMS).map(l => {
    let effTarget = l.target_tahap;
    if (!effTarget && l.tgl && l.posisi) {
      const sla = getBagianSlaDays(l.posisi);
      if (sla > 0) effTarget = addWorkingDays6(l.tgl, sla);
    }
    const stageDiff = (String(l.status_tahap).toLowerCase() !== 'stage done') ? getWorkingDaysDiffFromToday(effTarget) : null;
    const isStageLate = (stageDiff !== null && stageDiff < 0);
    const theme = getStatusTheme(l.status_tahap, isStageLate);

    let stageBadge = '';
    if (stageDiff !== null) {
      if (stageDiff < 0) stageBadge = `<span class="sla-chip sla-late">⚠️ Tahap Telat ${Math.abs(stageDiff)} HK</span>`;
      else if (stageDiff <= WARN_DAYS) stageBadge = `<span class="sla-chip sla-soon">⏱️ Target Tahap: ${effTarget}</span>`;
      else stageBadge = `<span class="sla-chip sla-ok">🎯 Target Tahap: ${effTarget}</span>`;
    }

    return `
      <div class="item-card ${theme.cardClass}">
        <div class="item-header">
          <strong style="color:var(--accent); font-size:13px;">${l.kode_project} • ${l.posisi}</strong>
          <div style="display:flex; align-items:center; gap:5px;">
            <span class="badge ${theme.badgeClass}">${l.status_tahap}</span>
            <button class="icon-btn" onclick="openEditLogModal(${l.id})" title="Edit Log">✏️</button>
            <button class="icon-btn" style="color:var(--danger);" onclick="handleDeleteLog(${l.id})" title="Hapus Log">🗑️</button>
          </div>
        </div>
        <div style="font-size:13px; font-weight:700; margin-bottom:4px;">${l.judul || '-'}</div>
        <div style="font-size:12px; color:#334155; margin-bottom:5px;">${l.step_proses}</div>
        ${stageBadge}
        ${l.next_proses ? `<div style="font-size:11px; color:#1e40af; margin-top:4px;">Next: ${l.next_proses}</div>` : ''}
        ${l.kendala ? `<div style="font-size:11px; color:var(--danger); margin-top:2px;">Kendala: ${l.kendala}</div>` : ''}
        <div style="font-size:11px; color:var(--muted); margin-top:6px; border-top:1px solid #f1f5f9; padding-top:4px;">
          📅 ${l.tgl} • 👤 ${l.pic_pelaksana}
        </div>
      </div>
    `;
  }).join('');
}

function openEditLogModal(logId) {
  const logItem = APP_DATA.logs.find(l => l.id === logId);
  if (!logItem) return;
  ACTIVE_EDIT_LOG = logItem;

  document.getElementById('edit-log-title').textContent = `✏️ Edit Log ${logItem.kode_project}`;
  document.getElementById('elog-tgl').value = toIsoDate(logItem.tgl);
  document.getElementById('elog-pic').value = logItem.pic_pelaksana || '';
  document.getElementById('elog-posisi').value = logItem.posisi || '';
  document.getElementById('elog-status').value = logItem.status_tahap || '';
  document.getElementById('elog-step').value = logItem.step_proses || '';
  document.getElementById('elog-next').value = logItem.next_proses || '';
  document.getElementById('elog-target-tahap').value = toIsoDate(logItem.target_tahap);
  document.getElementById('elog-kendala').value = logItem.kendala || '';
  document.getElementById('elog-catatan').value = logItem.catatan || '';
  openModal('modal-edit-log');
}

async function submitEditLog() {
  if (!ACTIVE_EDIT_LOG) return;
  const step = document.getElementById('elog-step').value.trim();
  if (!step) return showNotif(false, 'Data Belum Lengkap', 'Kolom Step Proses tidak boleh kosong.');

  const btn = document.getElementById('btn-save-elog');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';

  const newTgl = document.getElementById('elog-tgl').value || ACTIVE_EDIT_LOG.tgl;
  const newPic = document.getElementById('elog-pic').value;
  const newPosisi = document.getElementById('elog-posisi').value;
  const newStatus = document.getElementById('elog-status').value;
  const newNext = document.getElementById('elog-next').value.trim();
  const newTargetTahap = document.getElementById('elog-target-tahap').value || null;
  const newKendala = document.getElementById('elog-kendala').value.trim();
  const newCatatan = document.getElementById('elog-catatan').value.trim();

  const fields = [
    { label: '[LOG] TANGGAL', oldVal: ACTIVE_EDIT_LOG.tgl || '', newVal: newTgl },
    { label: '[LOG] POSISI', oldVal: ACTIVE_EDIT_LOG.posisi || '', newVal: newPosisi },
    { label: '[LOG] PIC PELAKSANA', oldVal: ACTIVE_EDIT_LOG.pic_pelaksana || '', newVal: newPic },
    { label: '[LOG] STEP PROSES', oldVal: ACTIVE_EDIT_LOG.step_proses || '', newVal: step },
    { label: '[LOG] STATUS TAHAP', oldVal: ACTIVE_EDIT_LOG.status_tahap || '', newVal: newStatus },
    { label: '[LOG] NEXT PROSES', oldVal: ACTIVE_EDIT_LOG.next_proses || '', newVal: newNext },
    { label: '[LOG] TARGET TAHAP', oldVal: ACTIVE_EDIT_LOG.target_tahap || '', newVal: newTargetTahap || '' },
    { label: '[LOG] KENDALA', oldVal: ACTIVE_EDIT_LOG.kendala || '', newVal: newKendala },
    { label: '[LOG] CATATAN', oldVal: ACTIVE_EDIT_LOG.catatan || '', newVal: newCatatan }
  ];

  const audits = fields.filter(f => f.oldVal !== f.newVal).map(f => ({
    kode_project: ACTIVE_EDIT_LOG.kode_project,
    judul: ACTIVE_EDIT_LOG.judul,
    editor: CURRENT_USER.pic,
    field_name: f.label,
    old_val: f.oldVal || '(kosong)',
    new_val: f.newVal || '(kosong)'
  }));

  try {
    if (audits.length === 0) {
      closeModal('modal-edit-log');
      showNotif(true, 'Tidak Ada Perubahan', 'Data log tidak mengalami perubahan.');
      return;
    }

    const { error } = await db.from('project_logs').update({
      tgl: newTgl, posisi: newPosisi, pic_pelaksana: newPic,
      step_proses: step, status_tahap: newStatus, next_proses: newNext || null,
      target_tahap: newTargetTahap, kendala: newKendala || null, catatan: newCatatan || null
    }).eq('id', ACTIVE_EDIT_LOG.id);

    if (error) throw error;
    await db.from('audit_logs').insert(audits);

    closeModal('modal-edit-log');
    await refreshData();
    showNotif(true, 'Berhasil Diperbarui', 'Data log diperbarui & jejak edit tercatat.');
  } catch (e) {
    showNotif(false, 'Gagal', 'Gagal memperbarui data log.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Simpan Perubahan Log';
  }
}

function handleDeleteLog(logId) {
  const logItem = APP_DATA.logs.find(l => l.id === logId);
  if (!logItem) return;
  showConfirm('Hapus Riwayat Log', 'Hapus riwayat log ini? Jika tidak ada log tersisa, status project otomatis kembali menjadi To - Do.', async () => {
    const { error } = await db.from('project_logs').delete().eq('id', logId);
    if (error) return showNotif(false, 'Gagal', error.message);

    await db.from('audit_logs').insert([{
      kode_project: logItem.kode_project,
      judul: logItem.judul,
      editor: CURRENT_USER.pic,
      field_name: '[LOG] HAPUS RIWAYAT LOG',
      old_val: `${logItem.tgl} | ${logItem.posisi} | ${logItem.step_proses} (${logItem.status_tahap})`,
      new_val: 'DIHAPUS'
    }]);

    await refreshData();
    showNotif(true, 'Log Dihapus', 'Riwayat log dihapus & status project disinkronkan otomatis.');
  });
}

// --- TAB 5: PROJECT LIST & DETAIL ---
function toggleProjQuickFilter(mode) {
  PROJ_QUICK_FILTER = (PROJ_QUICK_FILTER === mode) ? '' : mode;
  document.getElementById('chip-proj-notarget').classList.toggle('active', PROJ_QUICK_FILTER === 'NOTARGET');
  document.getElementById('chip-proj-kendala').classList.toggle('danger-active', PROJ_QUICK_FILTER === 'KENDALA');
  renderProjectList();
}

function renderProjectList() {
  const q = document.getElementById('proj-filter-text').value.toLowerCase().trim();
  const fStat = document.getElementById('proj-filter-status').value;
  const fPos = document.getElementById('proj-filter-posisi').value;

  const filtered = APP_DATA.projects.filter(p => {
    const matchText = !q ||
      p.kode.toLowerCase().includes(q) ||
      (p.no_referensi || '').toLowerCase().includes(q) ||
      (p.no_sk_hasil || '').toLowerCase().includes(q) ||
      (p.judul || '').toLowerCase().includes(q) ||
      (p.detail || '').toLowerCase().includes(q);
    const matchStat = !fStat || p.status_terkini === fStat;
    const matchPos = !fPos || p.posisi_terakhir === fPos;

    let matchQuick = true;
    if (PROJ_QUICK_FILTER === 'NOTARGET') {
      const st = String(p.status_terkini || '').toLowerCase();
      matchQuick = (!p.target_selesai && st !== 'done' && st !== 'approve');
    } else if (PROJ_QUICK_FILTER === 'KENDALA') {
      matchQuick = Boolean(String(p.kendala_terakhir || '').trim());
    }

    return matchText && matchStat && matchPos && matchQuick;
  });

  const container = document.getElementById('project-list-container');
  if (filtered.length === 0) {
    container.innerHTML = '<div class="card" style="text-align:center; color:var(--muted); font-size:13px; grid-column:1/-1;">Tidak ada project yang sesuai filter.</div>';
    return;
  }

  container.innerHTML = filtered.slice(0, MAX_ITEMS).map(p => renderProjectCardHtml(p)).join('');
}

function buildMilestoneFlow(pLogs) {
  if (!pLogs || pLogs.length === 0) return '';
  const ordered = [...pLogs].reverse();
  const stages = [];

  ordered.forEach(l => {
    const d = parseLocalDate(l.tgl);
    const last = stages[stages.length - 1];
    if (!last || last.posisi !== l.posisi) {
      stages.push({ posisi: l.posisi, start: d, end: d, count: 1 });
    } else {
      if (d && (!last.end || d > last.end)) last.end = d;
      last.count += 1;
    }
  });

  return stages.map((s, idx) => {
    const nextStage = stages[idx + 1];
    const endDate = nextStage && nextStage.start ? nextStage.start : (s.end || new Date());
    const hk = (s.start && endDate) ? Math.max(1, diffWorkingDays6(s.start, endDate) + 1) : 1;
    const sla = getBagianSlaDays(s.posisi);
    const slaTxt = sla > 0 ? `/${sla} HK` : ' HK';
    const arrow = idx < stages.length - 1 ? `<span class="flow-arrow">→</span>` : '';
    return `<div class="flow-node"><strong>${s.posisi}</strong> <span style="color:var(--muted);">(${hk}${slaTxt} • ${s.count}x)</span></div>${arrow}`;
  }).join('');
}

function openProjectDetail(projId) {
  const p = APP_DATA.projects.find(item => item.id === projId);
  if (!p) return;
  ACTIVE_DETAIL_PROJECT = p;

  const sla = evaluateProjectSLA(p);
  const isAllowed = canManageProject(p);

  document.getElementById('det-header-code').textContent = p.kode;
  const tags = [];
  if (p.no_referensi) tags.push(`<span class="ref-tag">📄 Ref: ${p.no_referensi}</span>`);
  if (p.parent_kode) tags.push(`<span class="ref-tag">🔄 Ulang dari: ${p.parent_kode}</span>`);
  document.getElementById('det-noref-badge').innerHTML = tags.join(' ');

  document.getElementById('det-judul').textContent = p.judul || '-';
  document.getElementById('det-detail').textContent = p.detail || '-';
  document.getElementById('det-kategori').textContent = p.kategori || '-';
  document.getElementById('det-jenis').textContent = p.jenis_trial || '-';
  document.getElementById('det-status').textContent = p.status_terkini || 'To - Do';
  document.getElementById('det-posisi').textContent = p.posisi_terakhir || '-';
  document.getElementById('det-pic').textContent = p.pic_utama || '-';
  document.getElementById('det-pic-aktual').textContent = p.pic_aktual || '-';
  document.getElementById('det-tglreq').textContent = p.tgl_request || '-';
  document.getElementById('det-target').textContent = p.target_selesai || 'Belum ditentukan';
  document.getElementById('det-target-tahap').textContent = p.target_tahap_aktif || '-';
  document.getElementById('det-sla-badges').innerHTML = sla.badgesHtml;

  const evalBox = document.getElementById('det-final-eval-box');
  if (p.hasil_evaluasi || p.no_sk_hasil || p.tgl_selesai_aktual) {
    evalBox.classList.remove('hidden');
    evalBox.innerHTML = `
      <div>🏆 Keputusan Akhir: <strong>${p.hasil_evaluasi || '-'}</strong></div>
      <div>📑 No. Dokumen / SK Hasil: <strong>${p.no_sk_hasil || '-'}</strong> | Selesai Aktual: <strong>${p.tgl_selesai_aktual || '-'}</strong></div>
    `;
  } else {
    evalBox.classList.add('hidden');
  }

  document.getElementById('btn-det-edit').classList.toggle('hidden', !isAllowed);
  document.getElementById('btn-det-del').classList.toggle('hidden', !isAllowed);

  const btnQuickTarget = document.getElementById('btn-quick-set-target');
  btnQuickTarget.classList.toggle('hidden', !(isAllowed && sla.isNoTarget));

  const finalBox = document.getElementById('final-done-box');
  if (isAllowed && p.status_terkini !== 'Done') {
    finalBox.classList.remove('hidden');
  } else {
    finalBox.classList.add('hidden');
  }

  const pLogs = APP_DATA.logs.filter(l => l.kode_project === p.kode);
  const flowContainer = document.getElementById('det-flow-container');
  if (pLogs.length > 0) {
    flowContainer.classList.remove('hidden');
    document.getElementById('det-flow-stepper').innerHTML = buildMilestoneFlow(pLogs);
  } else {
    flowContainer.classList.add('hidden');
  }

  document.getElementById('det-tab-log').innerHTML = pLogs.length === 0
    ? '<p style="font-size:12px; color:var(--muted);">Belum ada riwayat progress untuk project ini.</p>'
    : pLogs.map(l => `
      <div class="tl-entry">
        <div><strong>${l.tgl}</strong> • <span style="color:var(--accent); font-weight:700;">${l.posisi}</span> (${l.status_tahap})</div>
        <div style="margin:4px 0;">${l.step_proses}</div>
        <div style="color:var(--muted);">
          Pelaksana: ${l.pic_pelaksana}
          ${l.target_tahap ? ' • Target Tahap: <strong>' + l.target_tahap + '</strong>' : ''}
          ${l.kendala ? ' • Kendala: ' + l.kendala : ''}
        </div>
      </div>
    `).join('');

  const pEdits = APP_DATA.editLogs.filter(e => e.kode_project === p.kode);
  document.getElementById('det-tab-edit').innerHTML = pEdits.length === 0
    ? '<p style="font-size:12px; color:var(--muted);">Belum pernah ada riwayat edit pada project ini.</p>'
    : pEdits.map(e => `
      <div class="tl-entry" style="border-left:3px solid var(--warning);">
        <div><strong>${formatTimestampIndo(e.created_at)}</strong> • Oleh: <strong>${e.editor}</strong></div>
        <div style="margin-top:3px;"><strong>${e.field_name}</strong>:</div>
        <div style="color:var(--muted);">Dari: <em>${e.old_val}</em> → Menjadi: <strong>${e.new_val}</strong></div>
      </div>
    `).join('');

  switchDetailSubTab('log');
  openModal('modal-project-detail');
}

function quickInputLogFromDetail() {
  const p = ACTIVE_DETAIL_PROJECT;
  if (!p) return;
  selectProjectForLog(p.id);
  if (p.posisi_terakhir) document.getElementById('log-posisi').value = p.posisi_terakhir;
  updateAutoSlaHint();
  openModal('modal-input-log');
}

function openNewProjectModal() {
  document.getElementById('new-proj-modal-title').textContent = '📁 Tambah Project Baru';
  document.getElementById('new-parent-kode').value = '';
  document.getElementById('new-parent-banner').style.display = 'none';
  document.getElementById('new-kode').value = '';
  document.getElementById('new-noref').value = '';
  document.getElementById('new-judul').value = '';
  document.getElementById('new-detail').value = '';
  document.getElementById('new-target').value = '';
  document.getElementById('new-tglreq').value = new Date().toISOString().split('T')[0];
  openModal('modal-new-project');
}

function cloneProjectForRetrial() {
  const p = ACTIVE_DETAIL_PROJECT;
  if (!p) return;
  document.getElementById('new-proj-modal-title').textContent = '🔄 Buat Trial Ulang (Clone)';
  document.getElementById('new-parent-kode').value = p.kode;
  const banner = document.getElementById('new-parent-banner');
  banner.innerHTML = `Menyalin spesifikasi dari project induk: <strong>${p.kode}</strong> (${p.judul})`;
  banner.style.display = 'block';

  document.getElementById('new-kode').value = '';
  document.getElementById('new-kategori').value = p.kategori || '';
  document.getElementById('new-noref').value = p.no_referensi || '';
  document.getElementById('new-judul').value = `${p.judul} (Trial Ulang)`;
  document.getElementById('new-detail').value = p.detail || '';
  document.getElementById('new-jenis').value = p.jenis_trial || '';
  document.getElementById('new-reqby').value = p.request_by || '';
  document.getElementById('new-prioritas').value = p.prioritas || '';
  document.getElementById('new-pic').value = p.pic_utama || CURRENT_USER.pic;
  document.getElementById('new-tglreq').value = new Date().toISOString().split('T')[0];
  document.getElementById('new-target').value = '';
  openModal('modal-new-project');
}

function switchDetailSubTab(sub) {
  document.getElementById('det-tab-log').classList.toggle('hidden', sub !== 'log');
  document.getElementById('det-tab-edit').classList.toggle('hidden', sub !== 'edit');
  document.getElementById('subbtn-log').classList.toggle('active', sub === 'log');
  document.getElementById('subbtn-edit').classList.toggle('active', sub === 'edit');
}

function openFinalDoneModal() {
  const p = ACTIVE_DETAIL_PROJECT;
  if (!p) return;
  document.getElementById('fd-modal-title').textContent = `✅ Pengesahan Final Done (${p.kode})`;
  document.getElementById('fd-tgl-selesai').value = new Date().toISOString().split('T')[0];
  document.getElementById('fd-no-sk').value = p.no_sk_hasil || '';
  document.getElementById('fd-catatan').value = '';
  openModal('modal-final-done');
}

async function submitMarkFinalDone() {
  const p = ACTIVE_DETAIL_PROJECT;
  if (!p) return;
  const hasilEval = document.getElementById('fd-hasil-evaluasi').value;
  const tglSelesai = document.getElementById('fd-tgl-selesai').value || new Date().toISOString().split('T')[0];
  const noSkHasil = document.getElementById('fd-no-sk').value.trim();
  const catatan = document.getElementById('fd-catatan').value.trim();

  const btn = document.getElementById('btn-confirm-final-done');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';

  try {
    const { error } = await db.from('projects').update({
      status_terkini: 'Done',
      tgl_selesai_aktual: tglSelesai,
      hasil_evaluasi: hasilEval,
      no_sk_hasil: noSkHasil || null
    }).eq('id', p.id);

    if (error) throw error;

    const summaryNew = `Done | ${hasilEval}${noSkHasil ? ` | SK: ${noSkHasil}` : ''}${catatan ? ` (${catatan})` : ''}`;
    await db.from('audit_logs').insert([{
      kode_project: p.kode,
      judul: p.judul,
      editor: CURRENT_USER.pic,
      field_name: 'PENGESAHAN FINAL DONE',
      old_val: p.status_terkini || 'On Progress',
      new_val: summaryNew
    }]);

    closeModal('modal-final-done');
    closeModal('modal-project-detail');
    closeModal('modal-drilldown');
    await refreshData();
    showNotif(true, 'Project Selesai', `Project ${p.kode} resmi disahkan (${hasilEval})!`);
  } catch (e) {
    showNotif(false, 'Gagal', e.message || 'Gagal mengesahkan project.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sahkan Project Selesai';
  }
}

function handleDeleteProject() {
  const p = ACTIVE_DETAIL_PROJECT;
  if (!p) return;
  if (Number(p.total_log) > 0) {
    return showNotif(false, 'Tidak Bisa Dihapus', 'Project ini memiliki riwayat log. Hapus riwayat log terlebih dahulu jika ingin menghapus project.');
  }
  showConfirm('Hapus Project', `Hapus project ${p.kode} dari daftar?`, async () => {
    const { error } = await db.from('projects').delete().eq('id', p.id);
    if (error) return showNotif(false, 'Gagal', error.message);

    await db.from('audit_logs').insert([{
      kode_project: p.kode,
      judul: p.judul,
      editor: CURRENT_USER.pic,
      field_name: 'HAPUS PROJECT',
      old_val: `${p.kode} - ${p.judul}`,
      new_val: 'DIHAPUS'
    }]);

    closeModal('modal-project-detail');
    closeModal('modal-drilldown');
    await refreshData();
    showNotif(true, 'Project Dihapus', `Project ${p.kode} berhasil dihapus.`);
  });
}

function openEditProjectModal(focusTarget = false) {
  const p = ACTIVE_DETAIL_PROJECT;
  if (!p) return;
  document.getElementById('edit-modal-title').textContent = `✏️ Edit ${p.kode}`;
  document.getElementById('edit-noref').value = p.no_referensi || '';
  document.getElementById('edit-nosk-hasil').value = p.no_sk_hasil || '';
  document.getElementById('edit-hasil-eval').value = p.hasil_evaluasi || '';
  document.getElementById('edit-judul').value = p.judul || '';
  document.getElementById('edit-detail').value = p.detail || '';
  document.getElementById('edit-kategori').value = p.kategori || '';
  document.getElementById('edit-jenis').value = p.jenis_trial || '';
  document.getElementById('edit-status').value = p.status_terkini || 'To - Do';
  document.getElementById('edit-prioritas').value = p.prioritas || '';
  document.getElementById('edit-reqby').value = p.request_by || '';
  document.getElementById('edit-pic').value = p.pic_utama || '';
  document.getElementById('edit-tglreq').value = toIsoDate(p.tgl_request);
  document.getElementById('edit-target').value = toIsoDate(p.target_selesai);
  openModal('modal-edit-project');
  if (focusTarget) {
    setTimeout(() => document.getElementById('edit-target').focus(), 120);
  }
}

async function submitEditProject() {
  const p = ACTIVE_DETAIL_PROJECT;
  if (!p) return;
  const judul = document.getElementById('edit-judul').value.trim();
  const detail = document.getElementById('edit-detail').value.trim();
  if (!judul || !detail) return showNotif(false, 'Data Belum Lengkap', 'Judul dan Detail project wajib diisi.');

  const btn = document.getElementById('btn-save-edit');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';

  const newNoRef = document.getElementById('edit-noref').value.trim();
  const newNoSkHasil = document.getElementById('edit-nosk-hasil').value.trim();
  const newHasilEval = document.getElementById('edit-hasil-eval').value;
  const newKat = document.getElementById('edit-kategori').value;
  const newJenis = document.getElementById('edit-jenis').value;
  const newStat = document.getElementById('edit-status').value;
  const newPrio = document.getElementById('edit-prioritas').value;
  const newReq = document.getElementById('edit-reqby').value;
  const newPic = document.getElementById('edit-pic').value;
  const newTglReq = document.getElementById('edit-tglreq').value || null;
  const newTarget = document.getElementById('edit-target').value || null;

  const fieldMap = [
    { label: 'NO REFERENSI AWAL', oldVal: p.no_referensi || '', newVal: newNoRef },
    { label: 'NO DOKUMEN / SK HASIL', oldVal: p.no_sk_hasil || '', newVal: newNoSkHasil },
    { label: 'HASIL EVALUASI', oldVal: p.hasil_evaluasi || '', newVal: newHasilEval },
    { label: 'JUDUL PROJECT', oldVal: p.judul || '', newVal: judul },
    { label: 'DETAIL', oldVal: p.detail || '', newVal: detail },
    { label: 'KATEGORI', oldVal: p.kategori || '', newVal: newKat },
    { label: 'JENIS TRIAL', oldVal: p.jenis_trial || '', newVal: newJenis },
    { label: 'REQUEST BY', oldVal: p.request_by || '', newVal: newReq },
    { label: 'TGL REQUEST', oldVal: p.tgl_request || '', newVal: newTglReq || '' },
    { label: 'TARGET SELESAI', oldVal: p.target_selesai || '', newVal: newTarget || '' },
    { label: 'PRIORITAS', oldVal: p.prioritas || '', newVal: newPrio },
    { label: 'PIC UTAMA', oldVal: p.pic_utama || '', newVal: newPic },
    { label: 'STATUS TERKINI', oldVal: p.status_terkini || '', newVal: newStat }
  ];

  const changes = fieldMap.filter(f => f.oldVal !== f.newVal).map(f => ({
    kode_project: p.kode,
    judul: judul,
    editor: CURRENT_USER.pic,
    field_name: f.label,
    old_val: f.oldVal || '(kosong)',
    new_val: f.newVal || '(kosong)'
  }));

  try {
    if (changes.length === 0) {
      closeModal('modal-edit-project');
      showNotif(true, 'Tidak Ada Perubahan', 'Data project tidak mengalami perubahan.');
      return;
    }

    const { error } = await db.from('projects').update({
      no_referensi: newNoRef || null,
      no_sk_hasil: newNoSkHasil || null,
      hasil_evaluasi: newHasilEval || null,
      judul, detail, kategori: newKat, jenis_trial: newJenis,
      status_terkini: newStat, prioritas: newPrio, request_by: newReq,
      pic_utama: newPic, tgl_request: newTglReq, target_selesai: newTarget
    }).eq('id', p.id);

    if (error) throw error;
    await db.from('audit_logs').insert(changes);

    closeModal('modal-edit-project');
    closeModal('modal-project-detail');
    closeModal('modal-drilldown');
    await refreshData();
    showNotif(true, 'Berhasil Disimpan', 'Perubahan project berhasil disimpan.');
  } catch (e) {
    showNotif(false, 'Gagal', 'Gagal menyimpan perubahan project.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Simpan Perubahan';
  }
}

// --- INPUT LOG & NEW PROJECT ---
function filterProjectDropdown() {
  const q = document.getElementById('project-search').value.toLowerCase().trim();
  const box = document.getElementById('search-results');
  if (!q) { box.style.display = 'none'; return; }

  const matches = APP_DATA.projects.filter(p =>
    p.kode.toLowerCase().includes(q) ||
    (p.no_referensi || '').toLowerCase().includes(q) ||
    (p.judul || '').toLowerCase().includes(q) ||
    (p.detail || '').toLowerCase().includes(q)
  ).slice(0, 25);

  box.innerHTML = matches.length === 0
    ? '<div class="search-item"><div class="desc">Project tidak ditemukan...</div></div>'
    : matches.map(p => `
        <div class="search-item" onclick="selectProjectForLog(${p.id})">
          <div class="code">${p.kode}${p.no_referensi ? ` • ${p.no_referensi}` : ''}</div>
          <div class="title">${p.judul || p.detail}</div>
          <div class="desc">${p.detail}</div>
        </div>
      `).join('');
  box.style.display = 'block';
}

function selectProjectForLog(projId) {
  const proj = APP_DATA.projects.find(p => p.id === projId);
  if (!proj) return;
  SELECTED_PROJECT_FOR_LOG = proj;
  document.getElementById('project-search').value = `${proj.kode} - ${proj.judul || proj.detail}`;
  document.getElementById('search-results').style.display = 'none';

  document.getElementById('info-kode').textContent = proj.kode;
  document.getElementById('info-judul').textContent = proj.judul || '-';
  document.getElementById('info-detail').textContent = proj.detail || '-';
  document.getElementById('info-pic-utama').textContent = proj.pic_utama || '-';
  document.getElementById('info-target-final').textContent = proj.target_selesai || 'Belum ditentukan';
  document.getElementById('selected-project-info').style.display = 'block';
}

async function submitLog() {
  if (!SELECTED_PROJECT_FOR_LOG) return showNotif(false, 'Project Belum Dipilih', 'Pilih project dari daftar pencarian terlebih dahulu.');
  const step = document.getElementById('log-step').value.trim();
  if (!step) return showNotif(false, 'Data Belum Lengkap', 'Kolom Step Proses wajib diisi.');

  const btn = document.getElementById('btn-submit-log');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';

  const logTgl = document.getElementById('log-tgl').value;
  const logPosisi = document.getElementById('log-posisi').value;
  let manualTarget = document.getElementById('log-target-tahap').value || null;
  if (!manualTarget) {
    const sla = getBagianSlaDays(logPosisi);
    if (sla > 0) manualTarget = addWorkingDays6(logTgl, sla) || null;
  }

  try {
    const { error } = await db.from('project_logs').insert([{
      tgl: logTgl,
      kode_project: SELECTED_PROJECT_FOR_LOG.kode,
      judul: SELECTED_PROJECT_FOR_LOG.judul || SELECTED_PROJECT_FOR_LOG.detail,
      detail: SELECTED_PROJECT_FOR_LOG.detail,
      kategori: SELECTED_PROJECT_FOR_LOG.kategori,
      posisi: logPosisi,
      pic_pelaksana: document.getElementById('log-pic').value,
      step_proses: step,
      status_tahap: document.getElementById('log-status').value,
      next_proses: document.getElementById('log-next').value.trim() || null,
      target_tahap: manualTarget,
      kendala: document.getElementById('log-kendala').value.trim() || null,
      catatan: document.getElementById('log-catatan').value.trim() || null
    }]);

    if (error) throw error;

    document.getElementById('log-step').value = '';
    document.getElementById('log-next').value = '';
    document.getElementById('log-target-tahap').value = '';
    document.getElementById('log-kendala').value = '';
    document.getElementById('log-catatan').value = '';
    document.getElementById('project-search').value = '';
    document.getElementById('selected-project-info').style.display = 'none';
    SELECTED_PROJECT_FOR_LOG = null;
    closeModal('modal-input-log');
    closeModal('modal-project-detail');
    await refreshData();
    showNotif(true, 'Berhasil Disimpan', 'Progress lapangan berhasil dicatat.');
  } catch (e) {
    showNotif(false, 'Gagal Menyimpan', 'Terjadi kesalahan saat menyimpan log.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Simpan Log';
  }
}

function generateNextCodeClient(kategori) {
  const katStr = String(kategori || 'PRJ').trim().toUpperCase();
  const prefix = (katStr.indexOf('-') !== -1 ? katStr.split('-')[0].trim() : katStr.substring(0, 3)) + '-';
  let maxNum = 0;

  APP_DATA.projects.forEach(p => {
    const codeStr = String(p.kode || '').trim().toUpperCase();
    if (codeStr.startsWith(prefix)) {
      const suffix = codeStr.slice(prefix.length);
      if (/^[0-9]+$/.test(suffix)) {
        const num = parseInt(suffix, 10);
        if (num > maxNum) maxNum = num;
      }
    }
  });
  return prefix + String(maxNum + 1).padStart(3, '0');
}

async function submitNewProject() {
  const judul = document.getElementById('new-judul').value.trim();
  const detail = document.getElementById('new-detail').value.trim();
  const kategori = document.getElementById('new-kategori').value;
  const parentKode = document.getElementById('new-parent-kode').value.trim();
  if (!judul || !detail) return showNotif(false, 'Data Belum Lengkap', 'Judul Project dan Keterangan Detail wajib diisi.');

  let finalKode = document.getElementById('new-kode').value.trim().toUpperCase();
  if (!finalKode) finalKode = generateNextCodeClient(kategori);

  const btn = document.getElementById('btn-add-proj');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';

  try {
    const { error } = await db.from('projects').insert([{
      kode: finalKode,
      parent_kode: parentKode || null,
      no_referensi: document.getElementById('new-noref').value.trim() || null,
      judul: judul,
      detail: detail,
      kategori: kategori,
      status_terkini: document.getElementById('new-status').value || 'To - Do',
      jenis_trial: document.getElementById('new-jenis').value || null,
      request_by: document.getElementById('new-reqby').value || null,
      tgl_request: document.getElementById('new-tglreq').value || null,
      target_selesai: document.getElementById('new-target').value || null,
      prioritas: document.getElementById('new-prioritas').value || null,
      pic_utama: document.getElementById('new-pic').value
    }]);

    if (error) {
      showNotif(false, 'Gagal Menyimpan', error.code === '23505' ? `Kode ${finalKode} sudah digunakan.` : error.message);
      return;
    }

    closeModal('modal-new-project');
    closeModal('modal-project-detail');
    await refreshData();
    showNotif(true, 'Project Ditambahkan', `Project baru tersimpan dengan kode ${finalKode}.`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Simpan Project';
  }
}

// --- NAVIGATION & MODAL UTILS ---

// --- EXPORT PDF RANGKUMAN DEADLINE MONITORING & SHARE WHATSAPP ---
async function exportMonitoringDeadlinePdf(actionMode = 'DOWNLOAD') {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    return showNotif(false, 'Library PDF Belum Siap', 'Pastikan koneksi internet aktif untuk memuat generator PDF.');
  }

  const lateList = RADAR_CACHE.late || [];
  const soonList = RADAR_CACHE.soon || [];
  const noTargetList = RADAR_CACHE.noTarget || [];

  if (lateList.length === 0 && soonList.length === 0 && noTargetList.length === 0) {
    return showNotif(true, 'Semua Terkendali', 'Tidak ada project yang melewati deadline, mendekati deadline, maupun belum set target pada filter aktif.');
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const todayStr = new Date().toISOString().split('T')[0];
  const todayIndo = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  const appTitle = CFG.APP_TITLE || 'R&D Project Monitoring';

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(appTitle.toUpperCase(), 14, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Laporan Status Deadline & Target Project  |  Dicetak: ${todayIndo}`, 14, 19);
  doc.text(`Oleh: ${CURRENT_USER?.pic || '-'}`, 14, 24);

  // Summary Boxes
  let y = 35;
  const boxes = [
    { label: 'MELEWATI DEADLINE', count: lateList.length, bg: [254, 242, 242], fg: [185, 28, 28] },
    { label: 'MENDEKATI DEADLINE', count: soonList.length, bg: [255, 251, 235], fg: [180, 83, 9] },
    { label: 'BELUM SET TARGET', count: noTargetList.length, bg: [238, 242, 255], fg: [55, 48, 163] }
  ];
  boxes.forEach((b, i) => {
    const x = 14 + (i * 62);
    doc.setFillColor(...b.bg);
    doc.roundedRect(x, y, 58, 18, 2, 2, 'F');
    doc.setTextColor(...b.fg);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(b.label, x + 4, y + 6);
    doc.setFontSize(14);
    doc.text(`${b.count} Project`, x + 4, y + 14);
  });
  y += 25;

  const buildRows = (arr) => arr.map((p, idx) => [
    String(idx + 1),
    `${p.kode || '-'}${p.no_referensi ? '\n(' + p.no_referensi + ')' : ''}`,
    `${p.judul || p.detail || '-'}${p.kendala_terakhir ? '\nKendala: ' + p.kendala_terakhir : ''}`,
    `${p.posisi_terakhir || '-'}\n(${p.status_terkini || 'To - Do'})`,
    `${p.pic_utama || '-'}${p.pic_aktual && p.pic_aktual !== p.pic_utama ? '\nTahap: ' + p.pic_aktual : ''}`,
    p.target_selesai || 'Belum Set'
  ]);

  const appendSectionTable = (title, colorRgb, list) => {
    if (list.length === 0) return;
    if (y > 250) { doc.addPage(); y = 16; }
    doc.setTextColor(...colorRgb);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(`${title} (${list.length} Project)`, 14, y);
    y += 3;

    doc.autoTable({
      startY: y,
      head: [['No', 'Kode / Ref', 'Judul Project & Kendala', 'Posisi / Status', 'PIC', 'Target Final']],
      body: buildRows(list),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2.2, valign: 'top', textColor: [30, 41, 59] },
      headStyles: { fillColor: colorRgb, textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 9, halign: 'center' },
        1: { cellWidth: 28 },
        2: { cellWidth: 66 },
        3: { cellWidth: 30 },
        4: { cellWidth: 27 },
        5: { cellWidth: 22 }
      },
      margin: { left: 14, right: 14 }
    });
    y = doc.lastAutoTable.finalY + 8;
  };

  appendSectionTable('1. MELEWATI DEADLINE', [185, 28, 28], lateList);
  appendSectionTable('2. MENDEKATI DEADLINE', [180, 83, 9], soonList);
  appendSectionTable('3. BELUM SET TARGET FINAL', [55, 48, 163], noTargetList);

  const fileName = `Monitoring_Deadline_RnD_${todayStr}.pdf`;

  if (actionMode === 'SHARE_WA') {
    const waLines = [
      `*RANGKUMAN MONITORING PROJECT R&D*`,
      `Tanggal: ${todayIndo}`,
      `🚨 Melewati Deadline: *${lateList.length} project*`,
      `⏳ Mendekati Deadline: *${soonList.length} project*`,
      `📅 Belum Set Target: *${noTargetList.length} project*`,
      ``,
      lateList.length > 0 ? `*Prioritas Melewati Deadline:*\n` + lateList.slice(0, 8).map(p => `• *${p.kode}* - ${p.judul} (${p.posisi_terakhir || '-'} / ${p.pic_aktual || p.pic_utama || '-'})`).join('\n') : '',
      soonList.length > 0 ? `\n*Mendekati Deadline:*\n` + soonList.slice(0, 8).map(p => `• *${p.kode}* - ${p.judul} (Target: ${p.target_selesai || p.target_tahap_aktif || '-'})`).join('\n') : ''
    ].filter(Boolean).join('\n');

    const pdfBlob = doc.output('blob');
    const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

    // Gunakan Native Share File jika perangkat mendukung (Android / iOS)
    if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
      try {
        await navigator.share({
          files: [pdfFile],
          title: 'Rangkuman Monitoring R&D',
          text: waLines
        });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }

    // Fallback Desktop/Laptop: Download PDF + Buka WhatsApp dengan rangkuman teks
    doc.save(fileName);
    window.open(`https://wa.me/?text=${encodeURIComponent(waLines + '\n\n_(File PDF ' + fileName + ' telah terunduh, silakan lampirkan)_')}`, '_blank');
    showNotif(true, 'PDF Diunduh & WA Dibuka', `File ${fileName} berhasil diunduh dan WhatsApp telah dibuka.`);
  } else {
    doc.save(fileName);
    showNotif(true, 'PDF Berhasil Diunduh', `File ${fileName} telah tersimpan di perangkat Anda.`);
  }
}

function toggleAccountDropdown(e) {
  if (e) e.stopPropagation();
  document.getElementById('account-dropdown').classList.toggle('open');
}
function closeAccountDropdown() {
  const dd = document.getElementById('account-dropdown');
  if (dd) dd.classList.remove('open');
}

function switchTab(tab) {
  ['monitoring', 'timeline', 'laporan', 'log', 'project', 'admin'].forEach(t => {
    const tabEl = document.getElementById('tab-' + t);
    if (tabEl) tabEl.classList.add('hidden');
    const nav = document.getElementById('nav-' + t);
    const dnav = document.getElementById('dnav-' + t);
    if (nav) nav.classList.remove('active');
    if (dnav) dnav.classList.remove('active');
  });
  document.getElementById('tab-' + tab).classList.remove('hidden');
  const activeNav = document.getElementById('nav-' + tab);
  const activeDnav = document.getElementById('dnav-' + tab);
  if (activeNav) activeNav.classList.add('active');
  if (activeDnav) activeDnav.classList.add('active');
  if (tab === 'timeline') renderGanttTimeline();
  if (tab === 'laporan') renderEvaluationReport();
}

function openModal(id) { document.getElementById(id).style.display = 'block'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

document.addEventListener('click', (e) => {
  if (!e.target.closest('.form-group')) {
    document.getElementById('search-results').style.display = 'none';
  }
  if (!e.target.closest('#account-menu-wrap')) {
    closeAccountDropdown();
  }
});
