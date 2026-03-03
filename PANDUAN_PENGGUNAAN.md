# 📘 **Panduan Lengkap Penggunaan GeoAccuracy Logistics Validator**

[![CI Pipeline](https://img.shields.io/badge/CI%2FCD-Passing-success.svg)]()
[![Coverage Status](https://img.shields.io/badge/Test_Coverage-%3E80%25-brightgreen.svg)]()

**Platform Validasi Alamat dan Performa Geocoding Kurir**

Selamat datang di Panduan Penggunaan GeoAccuracy! Aplikasi ini dibangun secara khusus untuk mencocokkan titik koordinat lokasi alamat yang ada di database sistem (CRM/ERP) Anda (berdasarkan alamat teks) dengan titik keberadaan kurir sebenarnya di lapangan (berdasarkan koordinat pengantaran).

Aplikasi ini menggunakan perhitungan rumus Haversine untuk mengukur seberapa presisi jarak lokasi kurir mengirim barang ke alamat aslinya.

---

## 📑 **Daftar Isi**

1. [Langkah Pertama: Pengaturan (Settings)](#1-langkah-pertama-pengaturan-settings)
2. [Skenario A: Upload via CSV / Excel (Dashboard Utama)](#2-skenario-a-upload-via-csv--excel-dashboard-utama)
   - [Melihat Hasil (Tabel Perbandingan)](#melihat-hasil-tabel-perbandingan)
3. [Skenario B: Tarik Data Langsung dari Database (ETL)](#3-skenario-b-tarik-data-langsung-dari-database-etl)
4. [Skenario C: Webhook Integration (Pengantaran Real-time)](#4-skenario-c-webhook-integration-pengantaran-real-time)
5. [Analitik Lanjutan & Performa Kurir](#5-analitik-lanjutan--performa-kurir)

---

## 1. Langkah Pertama: Pengaturan (Settings)

Agar GeoAccuracy bisa berjalan, Anda **wajib menyiapkan API Key** layanan geocoding terlebih dahulu. Layanan geocoding berfungsi mengubah *"Teks Alamat Sistem"* Anda menjadi *"Koordinat (Latitude & Longitude)"* sebelum diadu dengan letak kurir.

1. Buka menu **⚙️ Pengaturan** di panel sebelah kiri.
2. Anda akan melihat 3 tab penyedia layanan Geocoding (Google Maps, PositionStack, Geoapify). Walaupun ada 3, GeoAccuracy telah disetup untuk menggunakan **Nominatim (OpenStreetMap)** sebagai default fallback (gratis dan tanpa key). Namun untuk hasil produksi terbaik, masukkan salah satu API Key.
3. Misalnya, masukkan API Key Google Maps pada kolom yang tersedia.
4. Klik tombol **Uji Koneksi** untuk memastikan Key aktif.
5. Klik **Simpan Pengaturan**.

---

## 2. Skenario A: Upload via CSV / Excel (Dashboard Utama)

Ini adalah cara termudah dan tercepat untuk menguji data laporan harian pengantaran tanpa perlu mengkoneksikan ke database perusahaan Anda.

### A. Persiapkan File CSV

Siapkan dua buah file `.csv`:

1. **File Data Sistem (Data Order Pelanggan)**
   - Format minimal kolom: `connote`, `recipient_name`, `address`
   - *Penjelasan:* `connote` = Nomor Resi / Order ID yang unik.

2. **File Data Lapangan (Laporan Kurir)**
   - Format minimal kolom: `connote`, `lat`, `lng`, `reported_by`, `report_date`
   - *Penjelasan:*
     - `connote` wajib ada agar bisa dipasangkan dengan Data Sistem.
     - `lat` / `lng` = Titik GPS dari HP kurir saat menekan tombol "Selesai Kirim".
     - `reported_by` = **ID atau Nama Kurir** (Sangat penting agar hasil ini masuk ke halaman *Performa Kurir*).

### B. Proses Geocoding & Validasi

1. Buka menu **📊 Dashboard**.
2. **Drop file Data Sistem** ke dalam kotak biru berlogo file. Setelah sukses, warna pinggir kotak menjadi biru bertuliskan keterangan jumlah baris.
3. **Drop file Data Lapangan** ke dalam kotak kuning berlogo file. Pastikan keterangannya menjadi kuning (contoh: *100 data lapangan dimuat*).
4. Klik tombol kuning **"📝 Buat Mapping Pertama"** di form Mapping Kolom Alamat.
   - Kotak ini bertugas mengajari sistem kalau Anda memecah penulisan alamat di kolom yang berbeda, contoh: `Alamat Jalan, Kota, Provinsi`.
5. Klik tombol cerah **"🚀 Proses & Bandingkan"** berwarna cyan di kiri bawah layar.
6. Tunggu loading log selesai. Sistem akan otomatis membersihkan ulang area kotak drop zone dan menampilkan tabel yang panjang!

> ✅ **Catatan (Auto-Populate Performa Kurir)**: Karena di dalam file CSV Data Lapangan Anda menyertakan kolom `reported_by`, sistem di belakang layar sudah otomatis menganalisis hasil perbandingan ini dan mengirimkannya sebagai riwayat ke dasbor "Performa Kurir".

### Melihat Hasil (Tabel Perbandingan)

Di tabel bagian bawah Dashboard Anda, kolom hasil berwarna akan muncul:

- **Jarak (Meter):** Titik biru (koordinat dari alamat teks - hasil geocoding) dikurangi titik kuning (GPS dari HP Kurir).
- **Akurasi & Status:**
  - 🟢 **Akurat:** Melenceng kurang dari 50 meter.
  - 🟡 **Cukup Akurat:** Melenceng antara 50 - 100 meter.
  - 🔴 **Tidak Akurat:** Melenceng lebih dari 100 meter.
  - ⚫ **Error / Alamat Fiktif:** Alamat teks pelanggan terdeteksi cacat / tidak ditemukan di peta mana pun di dunia.

---

## 3. Skenario B: Tarik Data Langsung dari Database (Integrasi Data/ETL)

Bila Anda lelah upload CSV manual setiap hari, Anda bisa menarik record order logistik dari server perusahaan langsung menuju GeoAccuracy.

1. Buka menu **🔌 Integrasi Data**.
2. Klik tombol **"+ Tambah Koneksi"**.
3. Di panel form, isikan detail database Anda (PostgreSQL/MySQL), Host, Port, Username, Database Name. Misal nama koneksinya: *"DB WMS Internal"*.
4. Klik **Test Koneksi**, jika berhasil, klik **Simpan**.
5. Setelah koneksi muncul di kartu depan, klik tombol **"Buat Sinkronisasi Baru" (Setup Pipeline)**.
6. **Desain Pipeline:**
   - **Tabel Dasar:** Pilih tabel order history (misal: `deliveries`).
   - Gunakan fitur **Join Tabel** (Opsional) bila posisi HP Kurir tersimpan di tabel berbeda `tracking_logs`.
   - Lakukan **Mapping Kolom Output**: Atur kolom mana yang akan dikenali GeoAccuracy sebagai:
     - `Connote (ID Resi)` ➡️ misal dari kolom `deliveries.id`
     - `System Address` ➡️ gabungan dari kolom `alamat + kota`
     - `Courier ID (Reported By)` ➡️ misal dari kolom `tracking_logs.courier_name`
     - `Field_Lat/Lng` ➡️ dari kolom GPS tracking.
7. Klik **Run Pipeline**.
8. Sinkronisasi ETL Backend (ribuan data) berjalan otomatis di latar belakang dan merender hasilnya langsung di halaman **Dashboard**!

---

## 4. Skenario C: Webhook Integration (Pengantaran Real-time)

GeoAccuracy juga mendukung mode "Streaming 24/7" (Real-time). Bayangkan aplikasi kurir (HP Kurir) di lapangan memotret bahwa ia telah sampai, lalu HP kurir mengirim hit (POST payload) langsung ke server kita.

1. Buka menu **🔗 Integrasi Data** tab **Webhooks**.
2. Klik **Generate Webhook Token**.
3. Minta tim Mobile Developer / Backend Core Anda untuk mengubah kode di aplikasi HP Kurir dan memukul (POST) endpoint: `https://GEO-ACCURACY/api/webhooks/ingest`
   *(Aturan Payload JSON nya tersedia di tombol dokumentasi yang ada di tab tersebut).*
4. Otomatis, sekian detik setelah kurir kirim barang di lapangan, data real-time tersebut difilter Geocoder kami dan masuk menjadi SLA di dasbor analitik.

---

## 5. Analitik Lanjutan & Performa Kurir

Kini setelah segala sesuatu di atas berhasil berjalan, Anda bisa beralih ke menu **📈 Performa Kurir**.

Menu ini menganalisa performa (SLA - *Service Level Agreement*) individu masing-masing kurir berdasarkan:

- Total riwayat pengantaran yang dipegang Budi, Joko, atau Kurir PT X.
- Persentase (Berapa kali Budi melenceng >100 Meter)?
- Tren Ketepatan Waktu SLA (Apakah sering terlambat atau On Time)?

Sementara itu di menu **🗺️ Analitik Topologi**:

- Tampilkan peta heatmap.
- Deteksi anomali "Fake GPS". Jika kurir A selalu memiliki jarak melenceng identik 85 meter sebanyak 20 kali di kota yang berbeda-beda secara konstan, algoritma mendeteksi aktivitas fraud (Fake GPS Apps). Varians natural manusia kurir tidak pernah konstan!

***
*(Dokumentasi Resmi - Dirilis oleh AI Singularity Architect)*
