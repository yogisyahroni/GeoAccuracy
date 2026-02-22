package domain

import (
	"context"
	"time"
)

type ErpIntegration struct {
	ID              int64      `json:"id" db:"id"`
	UserID          int64      `json:"user_id" db:"user_id"`
	Name            string     `json:"name" binding:"required" db:"name"`
	URL             string     `json:"url" binding:"required" db:"url"`
	Method          string     `json:"method" binding:"required,oneof=GET POST" db:"method"`
	AuthHeaderKey   string     `json:"auth_header_key" db:"auth_header_key"`
	AuthHeaderValue string     `json:"auth_header_value" db:"auth_header_value"` // Will be encrypted in DB
	CronSchedule    string     `json:"cron_schedule" binding:"required" db:"cron_schedule"`
	LastSyncAt      *time.Time `json:"last_sync_at" db:"last_sync_at"`
	CreatedAt       time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at" db:"updated_at"`
}

type ErpIntegrationRepository interface {
	Create(ctx context.Context, integration *ErpIntegration) error
	GetByID(ctx context.Context, id int64, userID int64) (*ErpIntegration, error)
	ListByUserID(ctx context.Context, userID int64) ([]ErpIntegration, error)
	ListAllInternal(ctx context.Context) ([]ErpIntegration, error) // Used by scheduler
	Update(ctx context.Context, integration *ErpIntegration) error
	UpdateLastSyncTime(ctx context.Context, id int64, syncTime time.Time) error
	Delete(ctx context.Context, id int64, userID int64) error
}

type ErpIntegrationService interface {
	Create(ctx context.Context, integration *ErpIntegration) error
	Get(ctx context.Context, id int64, userID int64) (*ErpIntegration, error)
	List(ctx context.Context, userID int64) ([]ErpIntegration, error)
	ListAllInternal(ctx context.Context) ([]ErpIntegration, error) // For scheduler to register jobs
	Update(ctx context.Context, integration *ErpIntegration) error
	Delete(ctx context.Context, id int64, userID int64) error
	ExecuteSyncJob(ctx context.Context, integrationID int64) error // The actual HTTP fetch operation trigger
}
