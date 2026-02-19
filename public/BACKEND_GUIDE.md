# GeoAccuracy — Panduan Backend Golang

## 🗺️ Tentang Aplikasi

**GeoAccuracy** adalah aplikasi web untuk validasi akurasi alamat di industri logistik.

### Cara Kerja

```
Data Sistem (CSV/DB)          Data Lapangan (CSV/DB)
  [connote, alamat]     ←→     [connote, lat, lng]
         ↓                           ↓
   Geocoding API              Koordinat GPS
   (alamat → lat/lng)         (dari kurir/tim)
         ↓                           ↓
         └──────── Haversine ────────┘
                  Distance (meter)
                       ↓
           ✅ Akurat    (<= 50m)
           ⚠️ Cukup    (50-100m)
           ❌ Tidak    (> 100m)
```

---

## 🏗️ Arsitektur Backend Golang

### Struktur Folder

```
geoaccuracy-backend/
├── cmd/
│   └── server/
│       └── main.go
├── internal/
│   ├── api/
│   │   ├── handlers/
│   │   │   ├── db.go          # Koneksi & query database
│   │   │   ├── geocode.go     # Geocoding wrapper
│   │   │   └── compare.go     # Logika perbandingan
│   │   └── router.go
│   ├── db/
│   │   ├── postgres.go
│   │   ├── mysql.go
│   │   ├── mongodb.go
│   │   └── mssql.go
│   ├── geocoder/
│   │   ├── nominatim.go       # Free geocoder
│   │   ├── googlemaps.go      # Google Maps API
│   │   └── mapbox.go          # Mapbox API
│   └── models/
│       └── logistics.go
├── config/
│   └── config.go
├── docker-compose.yml
└── go.mod
```

---

## 🔌 Endpoint API yang Diperlukan

### 1. Test Koneksi Database
```
POST /api/db/test
Content-Type: application/json

Body:
{
  "type": "postgresql",           // postgresql | mysql | mongodb | mssql
  "host": "localhost",
  "port": 5432,
  "database": "logistik_db",
  "username": "admin",
  "password": "secret",
  "ssl": false
}

Response 200:
{
  "success": true,
  "message": "Koneksi berhasil",
  "version": "PostgreSQL 15.2"
}
```

### 2. Ambil Data dari Database
```
POST /api/db/query
Content-Type: application/json

Body:
{
  "connection_id": "conn_abc123",
  "query": "SELECT connote, address, city, province FROM shipments LIMIT 1000",
  "params": []
}

Response 200:
{
  "columns": ["connote", "address", "city", "province"],
  "rows": [
    ["JKT-001", "Jl. Sudirman No.1", "Jakarta", "DKI Jakarta"],
    ...
  ],
  "total": 1000
}
```

### 3. Geocoding Address
```
POST /api/geocode
Content-Type: application/json

Body:
{
  "address": "Jl. Sudirman No.1, Jakarta, DKI Jakarta",
  "provider": "nominatim"        // nominatim | google | mapbox
}

Response 200:
{
  "lat": -6.2087941,
  "lng": 106.845598,
  "display_name": "Jalan Jenderal Sudirman...",
  "provider": "nominatim",
  "cached": false
}
```

### 4. Batch Geocoding (Recommended untuk produksi)
```
POST /api/geocode/batch
Content-Type: application/json

Body:
{
  "items": [
    { "id": "JKT-001", "address": "Jl. Sudirman No.1, Jakarta, DKI Jakarta" },
    { "id": "JKT-002", "address": "Jl. Thamrin No.5, Jakarta, DKI Jakarta" }
  ],
  "provider": "google",
  "concurrency": 5,              // Paralel requests
  "cache": true
}

Response 200 (streaming):
data: {"id":"JKT-001","lat":-6.2087,"lng":106.845,"status":"done"}
data: {"id":"JKT-002","lat":-6.1944,"lng":106.823,"status":"done"}
```

### 5. Perbandingan & Kategori
```
POST /api/compare
Content-Type: application/json

Body:
{
  "system_data": [
    { "connote": "JKT-001", "address": "Jl. Sudirman No.1", "city": "Jakarta", "province": "DKI Jakarta" }
  ],
  "field_data": [
    { "connote": "JKT-001", "lat": -6.2090, "lng": 106.8450 }
  ],
  "geocode_provider": "google"
}

Response 200:
{
  "results": [
    {
      "connote": "JKT-001",
      "system_lat": -6.2088,
      "system_lng": 106.8456,
      "field_lat": -6.2090,
      "field_lng": 106.8450,
      "distance_meters": 23.5,
      "category": "accurate"
    }
  ],
  "stats": {
    "total": 1,
    "accurate": 1,
    "fairly_accurate": 0,
    "inaccurate": 0,
    "error": 0
  }
}
```

---

## 💻 Implementasi Golang

### `go.mod`
```go
module geoaccuracy-backend

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/lib/pq v1.10.9              // PostgreSQL
    github.com/go-sql-driver/mysql v1.7.1  // MySQL
    go.mongodb.org/mongo-driver v1.13.0    // MongoDB
    github.com/microsoft/go-mssqldb v1.6.0 // MSSQL
    github.com/redis/go-redis/v9 v9.3.0    // Cache
    golang.org/x/time v0.5.0              // Rate limiting
)
```

### `internal/geocoder/nominatim.go`
```go
package geocoder

import (
    "encoding/json"
    "fmt"
    "net/http"
    "net/url"
    "time"
)

type NominatimResult struct {
    Lat         string `json:"lat"`
    Lon         string `json:"lon"`
    DisplayName string `json:"display_name"`
}

// Rate limiter: 1 req/detik (Nominatim policy)
var nominatimLimiter = time.NewTicker(1100 * time.Millisecond)

func GeocodeNominatim(address, city, province string) (*GeocodeResult, error) {
    <-nominatimLimiter.C  // Wait for rate limit
    
    query := fmt.Sprintf("%s, %s, %s, Indonesia", address, city, province)
    apiURL := fmt.Sprintf(
        "https://nominatim.openstreetmap.org/search?q=%s&format=json&limit=1&countrycodes=id",
        url.QueryEscape(query),
    )
    
    req, _ := http.NewRequest("GET", apiURL, nil)
    req.Header.Set("User-Agent", "GeoAccuracyLogistics/1.0")
    req.Header.Set("Accept-Language", "id,en")
    
    client := &http.Client{Timeout: 10 * time.Second}
    resp, err := client.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    
    var results []NominatimResult
    json.NewDecoder(resp.Body).Decode(&results)
    
    if len(results) == 0 {
        return nil, fmt.Errorf("alamat tidak ditemukan")
    }
    
    return &GeocodeResult{
        Lat:         parseFloat(results[0].Lat),
        Lng:         parseFloat(results[0].Lon),
        DisplayName: results[0].DisplayName,
        Provider:    "nominatim",
    }, nil
}
```

### `internal/db/postgres.go`
```go
package db

import (
    "database/sql"
    "fmt"
    _ "github.com/lib/pq"
)

type DBConfig struct {
    Type     string
    Host     string
    Port     int
    Database string
    Username string
    Password string
    SSL      bool
}

func ConnectPostgres(cfg DBConfig) (*sql.DB, error) {
    sslMode := "disable"
    if cfg.SSL {
        sslMode = "require"
    }
    
    dsn := fmt.Sprintf(
        "host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
        cfg.Host, cfg.Port, cfg.Username, cfg.Password, cfg.Database, sslMode,
    )
    
    db, err := sql.Open("postgres", dsn)
    if err != nil {
        return nil, err
    }
    
    db.SetMaxOpenConns(25)
    db.SetMaxIdleConns(5)
    
    if err := db.Ping(); err != nil {
        return nil, fmt.Errorf("tidak bisa terhubung ke PostgreSQL: %w", err)
    }
    
    return db, nil
}
```

### `internal/api/handlers/compare.go` (Haversine)
```go
package handlers

import "math"

func HaversineDistance(lat1, lng1, lat2, lng2 float64) float64 {
    const R = 6371000 // Earth radius in meters
    
    toRad := func(deg float64) float64 { return deg * math.Pi / 180 }
    
    dLat := toRad(lat2 - lat1)
    dLng := toRad(lng2 - lng1)
    
    a := math.Sin(dLat/2)*math.Sin(dLat/2) +
        math.Cos(toRad(lat1))*math.Cos(toRad(lat2))*
        math.Sin(dLng/2)*math.Sin(dLng/2)
    
    c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
    return R * c
}

func CategorizeDistance(meters float64) string {
    switch {
    case meters <= 50:
        return "accurate"
    case meters <= 100:
        return "fairly_accurate"
    default:
        return "inaccurate"
    }
}
```

---

## 🚀 Cara Menjalankan

### Development
```bash
# Clone dan setup
git clone https://github.com/yourorg/geoaccuracy-backend
cd geoaccuracy-backend
go mod tidy

# Set environment variables
export GOOGLE_MAPS_API_KEY=your_key_here
export MAPBOX_TOKEN=your_token_here
export REDIS_URL=redis://localhost:6379

# Run
go run cmd/server/main.go
# Server berjalan di http://localhost:8080
```

### Docker
```yaml
# docker-compose.yml
version: '3.8'
services:
  api:
    build: .
    ports:
      - "8080:8080"
    environment:
      - GOOGLE_MAPS_API_KEY=${GOOGLE_MAPS_API_KEY}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

---

## 🔑 API Keys yang Diperlukan

| Provider | Cara Mendapatkan | Harga | Catatan |
|----------|-----------------|-------|---------|
| **Nominatim** | Gratis, tidak perlu key | Gratis | Max 1 req/detik, untuk dev |
| **Google Maps** | console.cloud.google.com | $5/1000 req | Paling akurat untuk Indonesia |
| **Mapbox** | account.mapbox.com | 100k req/bulan gratis | Alternatif Google |
| **HERE Maps** | developer.here.com | 250k req/bulan gratis | Alternatif lain |

---

## ⚡ Optimasi untuk Produksi

1. **Redis Caching** — Cache hasil geocoding selama 30 hari
2. **Worker Pool** — Proses geocoding paralel (5-10 goroutines)
3. **Rate Limiting** — Gin middleware per IP
4. **WebSocket** — Push progress batch geocoding ke frontend
5. **PostgreSQL** — Simpan histori analisis per session

---

## 🔗 Integrasi Frontend

Update `src/utils/geocoding.ts` untuk menggunakan backend:

```typescript
const BACKEND_URL = 'http://localhost:8080';

export async function geocodeAddress(address: string, city: string, province: string) {
  const response = await fetch(`${BACKEND_URL}/api/geocode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: `${address}, ${city}, ${province}`, provider: 'google' }),
  });
  
  if (!response.ok) throw new Error('Geocoding failed');
  const data = await response.json();
  return { lat: data.lat, lng: data.lng, displayName: data.display_name };
}
```

---

*GeoAccuracy Backend Guide · Dibuat untuk industri logistik Indonesia*
