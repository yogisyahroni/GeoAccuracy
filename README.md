# Geoverify Logistics (GeoAccuracy)

Geoverify Logistics adalah aplikasi *Full-Stack* enterprise yang dirancang untuk mengatasi masalah validasi alamat pengiriman tingkat lanjut. Aplikasi ini memberikan solusi bagi tim logistik untuk melakukan geocoding data pelanggan, membandingkannya dengan koordinat GPS dari kurir di lapangan, dan mendeteksi penyimpangan (discrepancy) spasial secara real-time.

Aplikasi ini menggunakan pendekatan **"Pushdown ELT"** untuk integrasi data tingkat lanjut, serta optimasi biaya geocoding tingkat tinggi menggunakan pola **"Waterfall Fallback"**.

---

## 🌟 Fitur Utama

1. **Enterprise Data Integration (ETL Builder)**
   Dapat terhubung langsung dengan sumber data eksternal seperti PostgreSQL, MySQL, REST APIs, hingga MongoDB. Skema ditarik secara dinamis untuk di-mapping oleh pengguna melalui UI Pipeline Builder tanpa menulis kode.
2. **Geocoding Cost Optimization (Waterfall Fallback)**
   Mengoptimalkan biaya penggunaan API Pemetaan (Google Maps) yang mahal. Sistem akan secara cerdas merutekan pencarian geolokasi dengan urutan:
   `PostgreSQL Local Cache -> Nominatim (Free) -> Geoapify / PositionStack (Freemium) -> Google Maps (Premium)`.
3. **Automated Batch Scheduling**
   Terintegrasi dengan Cron engine (`robfig/cron/v3`) di backend Go, memungkinkan pipeline integrasi data berjalan di latar belakang secara otomatis berdasarkan jadwal yang ditentukan dari User Interface frontend.
4. **Analytics & History**
   Dasbor tingkat lanjut yang mencatat hasil dari setiap sesi perbandingan data (Akurasi Tinggi, Moderat, Buruk). Dilengkapi dengan representasi grafis (Bar, Pie, Scatter Chart) yang ditenagai oleh `react-chartjs-2`.
5. **Multi-Provider Single Sign-On (SSO)**
   Mendukung jalur masuk (login) modular yang aman menggunakan JWT untuk autentikasi email dasar, maupun Auth Provider eksternal.
6. **Advanced Security (RLS & Encryption)**
   Menggunakan *Row-Level Security* (RLS) pada lapisan database untuk membatasi akses baca data antar *tenant*. Kredensial rahasia pada koneksi database eksternal dienkripsi menggunakan AES-256-GCM.

---

## 🏗 Arsitektur Sistem

Aplikasi ini dipisahkan menjadi dua bagian utama (Backend Application & Frontend SPA).

| Komponen | Teknologi | Keterangan |
| --- | --- | --- |
| **Frontend** | React 18, Vite, TypeScript | Mengelola antarmuka Single Page Application (SPA). |
| **Styling** | Tailwind CSS, Lucide Icons | UI modern dengan pendekatan visual glassmorphism. |
| **State & API** | Zustand, TanStack Query | Caching jaringan, state global, dan optimistic updates. |
| **Backend** | Go 1.24+, Gin Framework | High-performance API server dan Cron Engine dispatcher. |
| **Database** | PostgreSQL | Menyimpan auth, log history, setting, dan RLS cache. |
| **Testing** | Go Test, Testify (Mocking) | Test suite untuk backend controller, repository, dan services. |
| **Security** | Argon2id, JWT, AES-GCM | Penyimpanan rahasia standar perbankan / enterprise. |

---

## ⚙️ Cara Kerja Aplikasi

1. **Koneksi Database (DataSource):**
   Pengguna mengkonfigurasi kredensial (seperti URL DB PostgreSQL perusahaan) ke dalam menu Connections. Password dienkripsi lalu disimpan.
2. **Definisi Pipeline:**
   Pengguna memilih tabel-tabel mana yang berisi data alamat pelanggan, beserta tabel tempat kurir merekam GPS. Field-field ini kemudian di-"mapping" secara visual. Pipeline dapat diset *manual* ataupun berjalan *terjadwal (Cron)*.
3. **Pushdown Query Execution:**
   Backend Go mem-parsing konfigurasi pipeline dan merangkai native SQL dialek spesifik. Kueri ini akan digabungkan pada DB sumber (*Pushdown*) agar tidak menyedot data berlebih ke memory aplikasi.
4. **Waterfall Geocoding Engine:**
   Untuk setiap alamat teks tak berkoordinat, aplikasi mengekstrak koordinat lat/lng menggunakan GeocodeService. Jika *cache* lokal DB (dari transaksi sebelumnya) belum memiliki alamat tersebut, permohonan akan dialihkan ke layanan gratis Nominatim terlebih dahulu. Jika Nominatim terkena *rate limit*, ia akan jatuh ke Geoapify, kemudian PositionStack, dan akhirnya ke Google Maps (fallback terakhir pencengah kegagalan).
5. **Distance & Analytic Compilation:**
   Setelah mendapat pasangan titik A (Geocode Valid) dan titik B (GPS Kurir), sistem menjalankan rumus Haversine Spatial Math. Hasil dari komputasi tersebut dikompilasi, dibagi kategorinya, dan disimpan di tabel `comparison_sessions`. Dasbor analitik akan menyajikan hasilnya kepada pengguna.

---

## 🚀 Panduan Deployment & Instalasi Lokal

### 1. Prerequisites (Persiapan)

- [Node.js](https://nodejs.org/) versi >= 20
- [Go](https://go.dev/dl/) versi >= 1.24
- [PostgreSQL](https://www.postgresql.org/) atau [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### 2. Environment Variables

Buat file env di dua sisi aplikasi berdasarkan file contoh (`.env.example`).

**Frontend (`/.env.local`)**

```env
VITE_API_BASE_URL=http://localhost:8080
```

**Backend (`/backend/.env`)**

```env
APP_ENV=development
APP_PORT=8080
DB_URL=postgres://postgres:password@localhost:5432/geoaccuracy?sslmode=disable
JWT_SECRET=super_secret_string_make_sure_to_change_this_to_32_chars_or_more
ENCRYPTION_KEY=32_bytes_long_string_for_aes_enc
```

### 3. Menjalankan via Local Development (Tanpa Docker)

1. **Jalankan Database PostgreSQL:** Pastikan DB berjalan, dan sesuaikan string koneksi `DB_URL` di dalam `backend/.env`.
2. **Start Backend Server:**

   ```bash
   cd backend
   go mod download
   go run ./cmd/server
   ```

   *Note: Go akan menjankan Auto-Migrate schema secara otomatis saat dihidupkan.*
3. **Start Frontend Server:** (Pada terminal lain)

   ```bash
   npm install
   npm run dev
   ```

4. Buka `http://localhost:5173` pada browser Anda!

### 4. Menjalankan dengan Docker (Containerized)

Bagi Anda yang tak ingin repot mengatur dependencies lokal, sistem menyediakan file konfigurasi *docker-compose*.

```bash
docker-compose up -d --build
```

Perintah ini akan menyalakan container untuk *PostgreSQL*, me-*build* image backend *Go*, serta menghosting aplikasi *React* ke dalam jaringan yang sama.

### 5. Deployment ke Production Server (Linux VPS)

Kami telah merangkum skema container orchestrator ke dalam skrip bash eksekusi satu atap. Pada mesin VPS kosongan yang terinstal API Docker:

```bash
chmod +x deploy.sh
./deploy.sh
```

Atau jika ingin mengeksekusi instalasi secara manual tanpa Docker:

1. Ubah `APP_ENV=production` pada file `.env`.
2. Lakukan build frontend:

   ```bash
   npm run build
   ```

   Folder `dist/` akan tercipta. Ini hanyalah file statis (HTML/JS/CSS) murni, host folder ini di server Nginx/Apache atau pada CDN modern seperti Vercel / Cloudflare Pages.
3. Lakukan build backend:

   ```bash
   cd backend
   go build -o geoverify_backend ./cmd/server
   ```

   Jalankan `./geoverify_backend` sebagai systemd *Daemon Service* di Linux server agar otomatis menyala kembali jika server direstart.
4. Gunakan NGINX sebagai `Reverse Proxy` untuk memberikan enkripsi akses HTTPS / TLS menuju port frontend dan menyambungkan traffic `domainanda.com/api` menuju internal port backend `http://localhost:8080`.

---

## 🔒 Security Best Practices

Didesain dengan standarisasi Zero-Trust:

- Semua password login *hashed* di database (Argon2id). Sistem dilarang merespon dengan data password ini.
- Transport data token memakai skema bearer JWT dengan default expiry 15 menit.
- API Keys layanan Third-Party (seperti MongoDB, MySQL external) disimpan di-encrypt menggunakan library Go `crypto/aes` blok GCM sebelum mendarat ke *storage*.
- CORS difilter ketat (`*` dilarang saat variable `APP_ENV=production`).

## 🧪 Testing

Jalankan pengujian unit pada logika fallback backend dan HTTP Handler dengan:

```bash
cd backend
go test ./... -v
```
