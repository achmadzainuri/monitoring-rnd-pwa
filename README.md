# R&D Project Monitoring PWA (v5.0)

Aplikasi Progressive Web App (PWA) untuk monitoring progres proyek dan trial R&D berbasis **Supabase (PostgreSQL)** dan **Netlify**.

## Fitur Utama v5.0
- **Radar 3 Kondisi**: Melewati Deadline, Mendekati Deadline (H-3), dan Belum Set Target Final.
- **Timeline Project (Gantt Chart & Milestone Alur Bagian)**: Visualisasi rentang waktu proyek dan pelacakan durasi hari di setiap bagian produksi.
- **Quick Update & WhatsApp Share**: Input log langsung dari detail proyek dan bagikan ringkasan status ke WhatsApp dalam 1 klik.
- **Filter Kendala & Nomor Referensi SK**: Pencarian berdasarkan `no_referensi` dan penyaringan cepat proyek yang memiliki kendala lapangan.

## Cara Deploy ke Netlify via GitHub
1. Upload seluruh isi folder ini ke repositori GitHub Anda (`config.js` otomatis diabaikan oleh `.gitignore`).
2. Hubungkan repositori ke Netlify (**Add new site > Import an existing project**).
3. Tambahkan 2 Environment Variables di Netlify:
   - `SUPABASE_URL`: Project URL Supabase Anda
   - `SUPABASE_KEY`: Publishable / Anon Public Key Supabase Anda
4. Netlify akan otomatis menjalankan perintah di `netlify.toml` untuk membuat `config.js` saat proses build.
