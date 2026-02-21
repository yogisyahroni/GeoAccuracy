# GeoMatch Validator - Product Requirements Document

**Versi:** 1.0.0  
**Tanggal:** 19 Februari 2026  
**Status:** Draft for Review

---

## Daftar Isi

1. [Executive Summary](#1-executive-summary)
2. [Tech Stack](#2-tech-stack)
3. [Database Schema](#3-database-schema)
4. [Accuracy Classification](#4-accuracy-classification-system)
5. [Backend API](#5-backend-api-specification)
6. [Frontend Architecture](#6-frontend-architecture)
7. [Backend Architecture](#7-backend-architecture)
8. [File Upload](#8-file-upload-specification)
9. [WebSocket](#9-real-time-updates)
10. [Security](#10-security-considerations)
11. [Deployment](#11-deployment-configuration)
12. [Testing](#12-testing-strategy)
13. [Monitoring](#13-monitoring--logging)
14. [Future Enhancements](#14-future-enhancements)

---

## 1. Executive Summary

**Nama Produk:** GeoMatch Validator  
**Tipe:** Internal Web Application  

### 1.1 Tujuan

Aplikasi untuk memvalidasi akurasi data alamat dengan mengkonversi alamat ke koordinat geografis dan membandingkan jarak antar dua sumber data (upload file vs database).

### 1.2 Success Criteria

- Akurasi geocoding &gt; 95%
- Processing speed &gt; 100 records/minute
- User dapat memproses batch hingga 10,000 records

---

## 2. Tech Stack

| Layer | Technology | Justification |
|-------|-----------|---------------|
| **Backend** | Go 1.21+ | High performance, excellent concurrency |
| **Frontend** | React 18 + Vite 5 | Fast HMR, optimized builds, no SSR overhead |
| **Database** | PostgreSQL 15 + PostGIS | Native geospatial support |
| **Cache** | Redis 7 | Geocoding result caching |
| **Maps API** | Google Maps Geocoding API | 40k free requests/month |
| **File Processing** | excelize (Go) | Native Excel handling |
| **State Management** | Zustand | Lightweight |
| **UI Components** | TanStack Table + Recharts | Performance-optimized |
| **Real-time** | WebSocket (gorilla/websocket) | Live progress updates |

---

## 3. Database Schema

### 3.1 ERD

┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│     users       │         │  upload_batches  │         │  data_records   │
├─────────────────┤         ├──────────────────┤         ├─────────────────┤
│ id UUID PK      │         │ id UUID PK       │◄────────│ batch_id UUID FK│
│ username VARCHAR│         │ user_id UUID FK  │────────►│ id UUID PK      │
│ email VARCHAR   │◄────────│ filename VARCHAR │         │ connote VARCHAR │
│ password_hash   │         │ original_name    │         │ source_type     │
│ api_key_enc TEXT│         │ total_records INT│         │ address_1 TEXT  │
│ created_at      │         │ status VARCHAR   │         │ address_2 TEXT  │
│ updated_at      │         │ created_at       │         │ lat_1 DECIMAL   │
└─────────────────┘         │ completed_at     │         │ lng_1 DECIMAL   │
│ accuracy_stats   │         │ lat_2 DECIMAL   │
│ JSONB            │         │ lng_2 DECIMAL   │
└──────────────────┘         │ distance_meters │
│ accuracy_level  │
│ geohash_1       │
│ geohash_2       │
│ processed_at    │
│ error_message   │
│ created_at      │
│ updated_at      │
└─────────────────┘
┌─────────────────┐         ┌──────────────────┐
│  geocoding_cache│         │  accuracy_rules   │
├─────────────────┤         ├──────────────────┤
│ id UUID PK      │         │ id UUID PK       │
│ address_hash    │         │ level_name       │
│ VARCHAR(64) PK  │         │ VARCHAR(20)      │
│ lat DECIMAL     │         │ min_distance INT │
│ lng DECIMAL     │         │ max_distance INT │
│ formatted_addr  │         │ color_code       │
│ TEXT            │         │ VARCHAR(7)       │
│ source_api      │         │ label VARCHAR(50)│
│ VARCHAR(20)     │         │ created_at       │
│ cached_at       │         │ updated_at       │
│ hit_count INT   │         └──────────────────┘
│ TTL TIMESTAMP   │
└─────────────────┘
┌─────────────────┐
│  api_usage_logs │
├─────────────────┤
│ id UUID PK      │
│ batch_id UUID FK│
│ request_type    │
│ VARCHAR(20)     │
│ status_code INT │
│ response_time_ms│
│ cost_estimate   │
│ DECIMAL(10,4)   │
│ created_at      │
└─────────────────┘

### 3.2 SQL Schema

```sql
-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    api_key_enc TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Upload batches
CREATE TABLE upload_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    file_size_bytes BIGINT,
    total_records INTEGER NOT NULL DEFAULT 0,
    processed_records INTEGER NOT NULL DEFAULT 0,
    failed_records INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    accuracy_stats JSONB DEFAULT '{}',
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Data records
CREATE TABLE data_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES upload_batches(id) ON DELETE CASCADE,
    connote VARCHAR(100) NOT NULL,
    source_type VARCHAR(20) DEFAULT 'upload',
    address_1 TEXT NOT NULL,
    lat_1 DECIMAL(10, 8),
    lng_1 DECIMAL(11, 8),
    geohash_1 VARCHAR(12),
    address_2 TEXT,
    lat_2 DECIMAL(10, 8),
    lng_2 DECIMAL(11, 8),
    geohash_2 VARCHAR(12),
    distance_meters DECIMAL(10, 2),
    accuracy_level VARCHAR(20),
    processed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    is_manual_override BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_connote_per_batch UNIQUE(batch_id, connote)
);

-- Indexes
CREATE INDEX idx_data_records_location_1 ON data_records USING GIST(
    ST_SetSRID(ST_MakePoint(lng_1::float, lat_1::float), 4326)
) WHERE lat_1 IS NOT NULL AND lng_1 IS NOT NULL;

CREATE INDEX idx_data_records_batch_accuracy ON data_records(batch_id, accuracy_level);
CREATE INDEX idx_data_records_connote ON data_records(connote);
CREATE INDEX idx_data_records_distance ON data_records(distance_meters) 
    WHERE distance_meters IS NOT NULL;

-- Geocoding cache
CREATE TABLE geocoding_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address_hash VARCHAR(64) UNIQUE NOT NULL,
    address_normalized TEXT NOT NULL,
    lat DECIMAL(10, 8) NOT NULL,
    lng DECIMAL(11, 8) NOT NULL,
    formatted_address TEXT,
    place_id VARCHAR(255),
    source_api VARCHAR(20) NOT NULL DEFAULT 'google_maps',
    hit_count INTEGER DEFAULT 1,
    cached_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_accessed TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days')
);

CREATE INDEX idx_geocoding_cache_hash ON geocoding_cache(address_hash);
CREATE INDEX idx_geocoding_cache_expires ON geocoding_cache(expires_at);

-- Accuracy rules
CREATE TABLE accuracy_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level_name VARCHAR(20) UNIQUE NOT NULL,
    min_distance INTEGER NOT NULL,
    max_distance INTEGER,
    color_code VARCHAR(7) NOT NULL,
    label VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_distance_range CHECK (min_distance >= 0),
    CONSTRAINT check_color_format CHECK (color_code ~ '^#[0-9A-Fa-f]{6}$')
);

INSERT INTO accuracy_rules (level_name, min_distance, max_distance, color_code, label, description) VALUES
('ACCURATE', 0, 50, '#22C55E', 'Akurat', '0 - 50 meter: Koordinat sangat akurat'),
('MODERATE', 50, 100, '#EAB308', 'Cukup Akurat', '50 - 100 meter: Koordinat cukup akurat'),
('INACCURATE', 100, NULL, '#EF4444', 'Tidak Akurat', '100+ meter: Koordinat tidak akurat, perlu verifikasi');

-- API usage logs
CREATE TABLE api_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES upload_batches(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    request_type VARCHAR(20) NOT NULL,
    status_code INTEGER,
    response_time_ms INTEGER,
    cost_estimate DECIMAL(10, 4),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_logs_batch ON api_usage_logs(batch_id);
CREATE INDEX idx_api_logs_created ON api_usage_logs(created_at);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_batches_updated_at BEFORE UPDATE ON upload_batches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_records_updated_at BEFORE UPDATE ON data_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


4. Accuracy Classification System
4.1 Distance Categories
Table
Copy
Level Range Color Badge Action
ACCURATE 0 - 50m 🟢 #22C55E Akurat None
MODERATE 50 - 100m 🟡 #EAB308 Cukup Akurat Review
INACCURATE ≥ 100m 🔴 #EF4444 Tidak Akurat Verify
4.2 Haversine Formula (Go)

package distance

import "math"

const earthRadiusMeters = 6371000

func HaversineDistance(lat1, lng1, lat2, lng2 float64) float64 {
    lat1Rad := lat1 * math.Pi / 180
    lat2Rad := lat2 * math.Pi / 180
    deltaLat := (lat2 - lat1) * math.Pi / 180
    deltaLng := (lng2 - lng1) * math.Pi / 180

    a := math.Sin(deltaLat/2)*math.Sin(deltaLat/2) +
        math.Cos(lat1Rad)*math.Cos(lat2Rad)*
            math.Sin(deltaLng/2)*math.Sin(deltaLng/2)
    c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

    return earthRadiusMeters * c
}

func ClassifyAccuracy(distanceMeters float64) string {
    switch {
    case distanceMeters >= 0 && distanceMeters < 50:
        return "ACCURATE"
    case distanceMeters >= 50 && distanceMeters < 100:
        return "MODERATE"
    default:
        return "INACCURATE"
    }
}



5. Backend API Specification
5.1 Endpoints

| Method | Endpoint                            | Auth | Description       |
| ------ | ----------------------------------- | ---- | ----------------- |
| POST   | `/api/v1/auth/login`                | No   | User login        |
| POST   | `/api/v1/auth/logout`               | Yes  | Logout            |
| GET    | `/api/v1/auth/me`                   | Yes  | Current user      |
| PUT    | `/api/v1/auth/apikey`               | Yes  | Update API key    |
| POST   | `/api/v1/uploads`                   | Yes  | Upload file       |
| GET    | `/api/v1/uploads/:id`               | Yes  | Upload details    |
| GET    | `/api/v1/uploads/:id/status`        | Yes  | Processing status |
| POST   | `/api/v1/uploads/:id/map-columns`   | Yes  | Map columns       |
| POST   | `/api/v1/uploads/:id/process`       | Yes  | Start processing  |
| DELETE | `/api/v1/uploads/:id`               | Yes  | Delete upload     |
| GET    | `/api/v1/batches/:id/records`       | Yes  | Get records       |
| GET    | `/api/v1/records/:id`               | Yes  | Record detail     |
| PUT    | `/api/v1/records/:id/verify`        | Yes  | Manual verify     |
| GET    | `/api/v1/dashboard/summary`         | Yes  | Dashboard stats   |
| GET    | `/api/v1/dashboard/batch/:id/stats` | Yes  | Batch stats       |
| GET    | `/api/v1/usage/quota`               | Yes  | API quota         |

5.2 WebSocket

| Endpoint          | Event       | Description        |
| ----------------- | ----------- | ------------------ |
| `/ws/batches/:id` | `progress`  | Real-time progress |
|                   | `completed` | Processing done    |
|                   | `error`     | Error occurred     |


5.3 Response Examples
Upload Response:

{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "filename": "upload_20240219_143022.xlsx",
    "original_name": "data_januari.xlsx",
    "total_records": 1500,
    "status": "pending_mapping",
    "preview": [
      {"A": "JKT001", "B": "Jl. Sudirman No. 1", "C": "Jl. Sudirman 1"}
    ],
    "detected_columns": {
      "connote": "A",
      "address_1": "B",
      "address_2": "C"
    }
  }
}

Processing Status:
{
  "success": true,
  "data": {
    "batch_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "processing",
    "progress": {
      "total": 1500,
      "processed": 750,
      "failed": 2,
      "percentage": 50.0
    },
    "accuracy_distribution": {
      "ACCURATE": 520,
      "MODERATE": 150,
      "INACCURATE": 78,
      "pending": 750
    },
    "eta_seconds": 45
  }
}

6.2 Routes
| Route        | Component       | Description    |
| ------------ | --------------- | -------------- |
| `/login`     | `Login`         | Auth page      |
| `/`          | `Dashboard`     | Main dashboard |
| `/upload`    | `UploadWizard`  | Upload flow    |
| `/batch/:id` | `ResultsViewer` | View results   |
| `/settings`  | `Settings`      | API key config |


6.3 WebSocket Hook
// hooks/useWebSocket.js
import { useEffect, useRef, useState } from 'react';

export function useBatchWebSocket(batchId) {
  const [progress, setProgress] = useState(null);
  const [status, setStatus] = useState('idle');
  const ws = useRef(null);

  useEffect(() => {
    if (!batchId) return;

    const wsUrl = `${import.meta.env.VITE_WS_URL}/batches/${batchId}`;
    ws.current = new WebSocket(wsUrl);

    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'progress':
          setProgress(message.payload);
          setStatus('processing');
          break;
        case 'completed':
          setStatus('completed');
          setProgress(message.payload);
          break;
        case 'error':
          setStatus('error');
          break;
      }
    };

    return () => ws.current?.close();
  }, [batchId]);

  return { progress, status };
}


7. Backend Architecture
7.1 Project Structure
backend/
├── cmd/
│   └── server/
│       └── main.go
├── internal/
│   ├── config/
│   ├── handlers/
│   ├── services/
│   │   ├── geocoding/
│   │   │   ├── google_maps_client.go
│   │   │   └── cache_service.go
│   │   ├── processor/
│   │   │   ├── batch_processor.go
│   │   │   └── worker_pool.go
│   │   └── fileparser/
│   ├── models/
│   ├── repository/
│   ├── middleware/
│   └── websocket/
├── pkg/
│   ├── crypto/
│   └── validator/
├── migrations/
└── Dockerfile


7.2 Geocoding Service
package geocoding

import (
    "context"
    "crypto/sha256"
    "encoding/hex"
    "fmt"
    "time"
    "googlemaps.github.io/maps"
)

type GeocodingService struct {
    client      *maps.Client
    cache       *CacheService
    rateLimiter *RateLimiter
}

type GeocodingResult struct {
    Lat              float64 `json:"lat"`
    Lng              float64 `json:"lng"`
    FormattedAddress string  `json:"formatted_address"`
    PlaceID          string  `json:"place_id"`
    FromCache        bool    `json:"from_cache"`
}

func (s *GeocodingService) GeocodeAddress(ctx context.Context, address string) (*GeocodingResult, error) {
    normalized := normalizeAddress(address)
    hash := hashAddress(normalized)
    
    // Check cache
    if cached, err := s.cache.Get(ctx, hash); err == nil && cached != nil {
        return &GeocodingResult{
            Lat:              cached.Lat,
            Lng:              cached.Lng,
            FormattedAddress: cached.FormattedAddress,
            PlaceID:          cached.PlaceID,
            FromCache:        true,
        }, nil
    }
    
    // Rate limit
    if err := s.rateLimiter.Wait(ctx); err != nil {
        return nil, fmt.Errorf("rate limit exceeded: %w", err)
    }
    
    // Call Google Maps API
    req := &maps.GeocodingRequest{
        Address: normalized,
        Region:  "id",
    }
    
    resp, err := s.client.Geocode(ctx, req)
    if err != nil {
        return nil, fmt.Errorf("geocoding failed: %w", err)
    }
    
    if len(resp) == 0 {
        return nil, fmt.Errorf("no results found")
    }
    
    result := &GeocodingResult{
        Lat:              resp[0].Geometry.Location.Lat,
        Lng:              resp[0].Geometry.Location.Lng,
        FormattedAddress: resp[0].FormattedAddress,
        PlaceID:          resp[0].PlaceID,
        FromCache:        false,
    }
    
    // Save to cache
    s.cache.Set(ctx, hash, normalized, result, 30*24*time.Hour)
    
    return result, nil
}

func hashAddress(addr string) string {
    h := sha256.New()
    h.Write([]byte(addr))
    return hex.EncodeToString(h.Sum(nil))
}

7.3 Batch Processor
package processor

import (
    "context"
    "sync"
    "time"
)

type BatchProcessor struct {
    workerCount  int
    geocodingSvc GeocodingService
    recordRepo   RecordRepository
    batchRepo    BatchRepository
    wsHub        *websocket.Hub
}

func (p *BatchProcessor) ProcessBatch(ctx context.Context, batchID string) error {
    p.batchRepo.UpdateStatus(batchID, "processing")
    
    records, err := p.recordRepo.GetPendingByBatch(ctx, batchID)
    if err != nil {
        return err
    }
    
    jobs := make(chan models.DataRecord, len(records))
    results := make(chan ProcessResult, len(records))
    
    var wg sync.WaitGroup
    
    // Start workers
    for w := 0; w < p.workerCount; w++ {
        wg.Add(1)
        go p.worker(ctx, &wg, jobs, results)
    }
    
    // Send jobs
    go func() {
        for _, record := range records {
            jobs <- record
        }
        close(jobs)
    }()
    
    // Collect results
    go func() {
        wg.Wait()
        close(results)
    }()
    
    // Process results
    processed := 0
    total := len(records)
    ticker := time.NewTicker(2 * time.Second)
    defer ticker.Stop()
    
    accuracyCount := map[string]int{
        "ACCURATE":   0,
        "MODERATE":   0,
        "INACCURATE": 0,
    }
    
    for result := range results {
        processed++
        if result.Error == nil {
            accuracyCount[result.AccuracyLevel]++
        }
        
        select {
        case <-ticker.C:
            p.broadcastProgress(batchID, processed, total, accuracyCount)
        default:
            if processed == total {
                p.broadcastProgress(batchID, processed, total, accuracyCount)
            }
        }
    }
    
    return p.finalizeBatch(batchID, accuracyCount)
}

8. File Upload Specification
8.1 Supported Formats
| Format | Extension | Max Size | Max Rows |
| ------ | --------- | -------- | -------- |
| Excel  | .xlsx     | 10 MB    | 50,000   |
| CSV    | .csv      | 10 MB    | 50,000   |

8.2 Required Columns

| Column      | Required | Example                       |
| ----------- | -------- | ----------------------------- |
| `connote`   | Yes      | `JKT00123456`                 |
| `address_1` | Yes      | `Jl. Sudirman No. 1, Jakarta` |
| `address_2` | No       | `Jl. Sudirman Kav. 1`         |

9. Real-time Updates
9.1 WebSocket Message Types
const (
    MsgTypeProgress  = "progress"
    MsgTypeCompleted = "completed"
    MsgTypeError     = "error"
)

type WSMessage struct {
    Type      string          `json:"type"`
    BatchID   string          `json:"batch_id"`
    Timestamp time.Time       `json:"timestamp"`
    Payload   json.RawMessage `json:"payload"`
}

type ProgressPayload struct {
    Total         int            `json:"total"`
    Processed     int            `json:"processed"`
    Failed        int            `json:"failed"`
    Percentage    float64        `json:"percentage"`
    AccuracyStats map[string]int `json:"accuracy_stats"`
    ETASeconds    int            `json:"eta_seconds"`
}


10. Security Considerations
API Key Encryption: AES-256-GCM untuk Google Maps API key
Authentication: JWT dengan refresh token
Rate Limiting:
Auth endpoints: 5 req/minute
Upload: 10 req/minute
General API: 100 req/minute
WebSocket: 5 connections/user
JWT Middleware

func AuthMiddleware(jwtConfig JWTConfig) gin.HandlerFunc {
    return func(c *gin.Context) {
        authHeader := c.GetHeader("Authorization")
        if authHeader == "" {
            c.AbortWithStatusJSON(401, gin.H{"error": "missing authorization header"})
            return
        }

        tokenString := strings.Replace(authHeader, "Bearer ", "", 1)
        claims, err := validateToken(tokenString, jwtConfig.SecretKey)
        if err != nil {
            c.AbortWithStatusJSON(401, gin.H{"error": "invalid token"})
            return
        }

        c.Set("user_id", claims.UserID)
        c.Next()
    }
}


11. Deployment Configuration
11.1 Docker Compose
version: '3.8'

services:
  app:
    build: ./backend
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/geomatch?sslmode=disable
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    depends_on:
      - db
      - redis
    volumes:
      - ./uploads:/app/uploads

  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    depends_on:
      - app

  db:
    image: postgis/postgis:15-3.4
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=geomatch
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./migrations:/docker-entrypoint-initdb.d

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - app
      - frontend

volumes:
  postgres_data:
  redis_data:


  11.2 Environment Variables

# .env.example
DATABASE_URL=postgresql://localhost:5432/geomatch?sslmode=disable
REDIS_URL=redis://localhost:6379

JWT_SECRET=your-256-bit-secret-key-here
ENCRYPTION_KEY=your-32-byte-encryption-key

GOOGLE_MAPS_API_KEY=your-api-key-here

PORT=8080
ENV=development
LOG_LEVEL=info

MAX_UPLOAD_SIZE=10485760
UPLOAD_DIR=./uploads

WORKER_POOL_SIZE=10
MAX_BATCH_SIZE=50000
GEOCODING_RATE_LIMIT=50


12. Testing Strategy
| Type        | Target          | Tools            |
| ----------- | --------------- | ---------------- |
| Unit Tests  | > 80% coverage  | testify, mockery |
| Integration | Critical paths  | testcontainers   |
| Load Tests  | 1000 concurrent | k6               |


13. Monitoring & Logging
Metrics
Business: Uploads/day, processing time, accuracy distribution
Technical: API latency, error rate, cache hit rate
Cost: Google Maps API usage
Alerts
| Condition          | Severity | Action        |
| ------------------ | -------- | ------------- |
| Error rate > 5%    | Critical | Page on-call  |
| Queue depth > 1000 | Warning  | Scale workers |
| API quota > 80%    | Warning  | Notify admin  |

14. Future Enhancements
| Priority | Feature                 | Description                         |
| -------- | ----------------------- | ----------------------------------- |
| P2       | Batch Comparison        | Compare two upload files            |
| P2       | Address Standardization | Normalize addresses                 |
| P3       | ML Prediction           | Predict accuracy before geocoding   |
| P3       | Multi-API Fallback      | OpenStreetMap fallback              |
| P3       | Mobile App              | React Native for field verification |


15. Appendix
Glossary
Connote: Nomor resi/tracking number
Geocoding: Konversi alamat ke koordinat lat/lng
Haversine: Formula jarak antar titik di bumi
