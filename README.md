# R&D Project Monitoring PWA (v6.0)

Aplikasi Progressive Web App (PWA) untuk monitoring progres proyek, timeline Gantt, standar SLA 6 hari kerja (Senin–Sabtu), dan evaluasi SK KPD berbasis **Supabase** dan **Netlify**.

## Pembaruan Utama v6.0
1. **Pengesahan Final Done & Keputusan SK KPD**: Dilengkapi pilihan Hasil Evaluasi dinamis, Tanggal Selesai Aktual, dan Nomor SK KPD / Dokumen Hasil.
2. **Standar SLA 6 Hari Kerja (Senin–Sabtu) per Bagian**: Admin dapat menetapkan standar durasi hari kerja tiap bagian produksi; target tahap otomatis terhitung jika tidak diisi manual.
3. **Tab Laporan Evaluasi (Mingguan / Bulanan / Kuartalan)**: Rekap project masuk vs selesai, rata-rata *Lead Time* (hari kerja), *On-Time Delivery %*, rekap kendala per bagian, cetak PDF rapat, dan salin ringkasan ke WhatsApp.
4. **Clone Trial Ulang (1-Klik)**: Membuat kode project baru dari trial sebelumnya dengan tautan `parent_kode`.

## Cara Upgrade dari v5.0 ke v6.0
1. Buka **SQL Editor** di Supabase, lalu jalankan isi file `migration_v5_to_v6.sql`.
2. Push seluruh file pada paket ini ke repositori GitHub Anda (`config.js` diabaikan oleh `.gitignore`). Netlify akan otomatis menayangkan v6.0 dalam ~15 detik.
