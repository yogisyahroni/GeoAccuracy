package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// BatchStatus represents the current state of a batch
type BatchStatus string

const (
	BatchStatusDraft      BatchStatus = "draft"
	BatchStatusProcessing BatchStatus = "processing"
	BatchStatusCompleted  BatchStatus = "completed"
	BatchStatusFailed     BatchStatus = "failed"
)

// Batch represents a group of items uploaded by a user for processing
type Batch struct {
	ID        uuid.UUID   `json:"id" db:"id"`
	UserID    int64       `json:"user_id" db:"user_id"`
	Name      string      `json:"name" db:"name"`
	Status    BatchStatus `json:"status" db:"status"`
	CreatedAt time.Time   `json:"created_at" db:"created_at"`
	UpdatedAt time.Time   `json:"updated_at" db:"updated_at"`
}

// BatchItem represents an individual record within a batch
type BatchItem struct {
	ID            uuid.UUID `json:"id" db:"id"`
	BatchID       uuid.UUID `json:"batch_id" db:"batch_id"`
	Connote       string    `json:"connote" db:"connote"`
	RecipientName string    `json:"recipient_name" db:"recipient_name"`
	SystemAddress string    `json:"system_address" db:"system_address"`
	SystemLat     *float64  `json:"system_lat" db:"system_lat"`
	SystemLng     *float64  `json:"system_lng" db:"system_lng"`
	FieldLat      *float64  `json:"field_lat" db:"field_lat"`
	FieldLng      *float64  `json:"field_lng" db:"field_lng"`
	DistanceKm    *float64  `json:"distance_km" db:"distance_km"`
	AccuracyLevel string    `json:"accuracy_level" db:"accuracy_level"`
	Error         string    `json:"error" db:"error"`
	GeocodeStatus string    `json:"geocode_status" db:"geocode_status"`
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
	UpdatedAt     time.Time `json:"updated_at" db:"updated_at"`
}

// BatchRepository defines the interface for batch data access
type BatchRepository interface {
	CreateBatch(ctx context.Context, batch *Batch) error
	GetBatchByID(ctx context.Context, id uuid.UUID) (*Batch, error)
	GetBatchesByUserID(ctx context.Context, userID int64) ([]Batch, error)
	UpdateBatchStatus(ctx context.Context, id uuid.UUID, status BatchStatus) error

	// BatchItem methods
	UpsertBatchItems(ctx context.Context, items []BatchItem) error
	GetBatchItemsByBatchID(ctx context.Context, batchID uuid.UUID) ([]BatchItem, error)
	GetBatchItemsByBatchIDAndStatus(ctx context.Context, batchID uuid.UUID, status string) ([]BatchItem, error)
}

type SystemRecord struct {
	Connote       string `json:"connote"`
	RecipientName string `json:"recipient_name"`
	SystemAddress string `json:"system_address"`
}

type FieldRecord struct {
	Connote  string  `json:"connote"`
	FieldLat float64 `json:"field_lat"`
	FieldLng float64 `json:"field_lng"`
}

// BatchService defines the interface for batch business logic
type BatchService interface {
	CreateBatch(ctx context.Context, userID int64, name string) (*Batch, error)
	GetBatch(ctx context.Context, id uuid.UUID) (*Batch, error)
	ListUserBatches(ctx context.Context, userID int64) ([]Batch, error)

	UploadSystemData(ctx context.Context, batchID uuid.UUID, records []SystemRecord) error
	UploadFieldData(ctx context.Context, batchID uuid.UUID, records []FieldRecord) error

	ProcessBatch(ctx context.Context, userID int64, batchID uuid.UUID) error
	GetBatchResults(ctx context.Context, batchID uuid.UUID) ([]BatchItem, error)
}
