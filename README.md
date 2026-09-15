# PPA VoltSwap: EV Charging & Battery Swap Station Management System ⚡🔋

Sistem manajemen operasional penukaran baterai (*battery swap*) dan pengisian daya (*charging*) armada Electric Vehicle (Dump Truck 90T) terintegrasi pada proyek operasional PT Putra Perkasa Abadi (PPA).

---

## 🚀 Fitur Utama

1. **⚡ Charging Swap Transaction Management**:
   - Log sheet pencatatan transaksi swap harian (Waktu In/Out, Durasi, SOC Bat In/Out dalam %, kWh Energi, HM, Status On Time / Out Off Time).
   - Validasi real-time dan perhitungan otomatis target jam pergantian (*Time Schedule Target*).
   - Tampilan ganda: Tabel Enterprise untuk Desktop & Kartu Interaktif untuk Layar Sentuh / Mobile.

2. **📅 History Daily & Analitik**:
   - Riwayat breakdown transaksi harian per unit armada DT.
   - Pemantauan frekuensi swap, konsumsi daya total, dan durasi rata-rata.

3. **⚠️ Problem & Downtime Log**:
   - Pencatatan gangguan charger, crane OHC delay, low power, dll.
   - Durasi gangguan dan kalkulasi dampak operasional.

4. **🎯 Swap Schedule & Queue Plan**:
   - Pengaturan rencana antrean jadwal penukaran per shift dan per unit armada.
   - Fitur unggah file Excel/CSV jadwal otomatis untuk input massal.

5. **🚜 Populasi Unit EV**:
   - Katalog armada EV Dump Truck 90T aktif beserta status kesiapan operasional.

6. **🗄️ Database Manager & Cloud Sync Center**:
   - Kontrol hak akses berbasis role (Operator, Leader, Supervisor, Admin).
   - Manajemen akun & reset password operator.
   - **Sinkronisasi Otomatis Google Sheets**: 1-Click backup data transaksi baru (*Incremental Sync / Auto-Resume*) ke master spreadsheet.
   - **Ekspor Excel Asli (.xlsx)**: Unduh master Excel multi-sheet (5 sheet sekaligus) dan ekspor instan per tabel.
   - **Arsitektur Siap Firebase**: Struktur data kompatibel dengan Cloud Firestore untuk migrasi masa depan.

---

## 💻 Struktur Berkas Proyek

```text
.
├── index.html               # Antarmuka utama aplikasi (Enterprise UI)
├── style.css                # Desain sistem responsif PPA Safe & Strong
├── app.js                   # Mesin logika aplikasi & pengelola data
├── data.js                  # Data awal & master dataset armada
├── login_bg.jpg             # Aset visual latar belakang portal login
├── server.js                # Server HTTP lokal berbasis Node.js
├── manifest.json            # Konfigurasi Progressive Web App (PWA)
├── sw.js                    # Service Worker untuk dukungan luring (offline)
├── JALANKAN_APLIKASI.bat    # Script jalan cepat di komputer lokal
├── AUTO_DEPLOY_GOOGLE.bat   # Script build & auto-deploy ke Google Apps Script
└── gas_deploy/              # Modul bundle Google Apps Script
    ├── Code.js              # Backend Google Apps Script (doGet & API Sync)
    ├── build_bundle.js      # Bundler HTML + CSS + JS inline
    ├── deploy.js            # CI/CD otomatis Clasp ke Google Apps Script
    └── appsscript.json      # Konfigurasi manifes Google Apps Script
```

---

## 🛠️ Cara Menjalankan Secara Lokal

1. Pastikan **Node.js** terinstal di komputer.
2. Jalankan aplikasi dengan mengklik ganda:
   ```cmd
   JALANKAN_APLIKASI.bat
   ```
   atau lewat terminal:
   ```bash
   node server.js
   ```
3. Buka browser pada alamat:
   ```text
   http://localhost:8080
   ```

---

## ☁️ Deployment ke Google Apps Script

Untuk mempublikasikan pembaruan ke Google Apps Script Web App secara otomatis:
```cmd
AUTO_DEPLOY_GOOGLE.bat
```
Script akan meng-compile seluruh aset lokal ke dalam `gas_deploy/index.html` dan mengunggahnya langsung menggunakan Clasp.

---

## 🔒 Keamanan & Lisensi
Dikembangkan untuk kebutuhan operasional Charging Station EV PT Putra Perkasa Abadi (PPA).
Seluruh hak cipta dilindungi undang-undang.
