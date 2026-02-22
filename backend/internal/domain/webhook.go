package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// ExternalAPIKey represents a long-lived key for system-to-system access.
type ExternalAPIKey struct {
	ID         uuid.UUID  `json:"id"`
	UserID     int        `json:"userId"`
	Name       string     `json:"name"`
	KeyHash    string     `json:"-"` // Never expose the hash in API responses
	Prefix     string     `json:"prefix"`
	LastUsedAt *time.Time `json:"lastUsedAt"`
	CreatedAt  time.Time  `json:"createdAt"`
	UpdatedAt  time.Time  `json:"updatedAt"`
}

// GenerateAPIKeyResponse is returned ONCE to the user when creating a new key.
type GenerateAPIKeyResponse struct {
	ExternalAPIKey
	RawKey string `json:"rawKey"` // Only ever sent in the response of a create action!
}

// WebhookPayload represents an array of spatial/coordinate data received from external systems.
type WebhookPayload struct {
	BatchID string `json:"batch_id" binding:"required"`
	Points  []struct {
		Latitude  float64                `json:"latitude" binding:"required"`
		Longitude float64                `json:"longitude" binding:"required"`
		Timestamp string                 `json:"timestamp"`
		Metadata  map[string]interface{} `json:"metadata"`
	} `json:"points" binding:"required"`
}

// WebhookRepository defines data access methods for External API Keys.
type WebhookRepository interface {
	CreateAPIKey(ctx context.Context, apiKey *ExternalAPIKey) error
	GetAPIKeysByUserID(ctx context.Context, userID int) ([]ExternalAPIKey, error)
	GetAPIKeyByHash(ctx context.Context, keyHash string) (*ExternalAPIKey, error)
	DeleteAPIKey(ctx context.Context, id uuid.UUID, userID int) error
	UpdateLastUsed(ctx context.Context, id uuid.UUID) error
}
