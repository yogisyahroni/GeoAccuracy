package domain

import "time"

// UserSettings holds per-user application settings.
type UserSettings struct {
	UserID           int       `db:"user_id" json:"user_id"`
	MapsKey          string    `db:"maps_key" json:"maps_key"`
	GeoapifyKey      string    `db:"geoapify_key" json:"geoapify_key"`
	PositionStackKey string    `db:"position_stack_key" json:"position_stack_key"`
	UpdatedAt        time.Time `db:"updated_at" json:"updated_at"`
}

// UpdateSettingsRequest is the payload for PUT /api/settings/maps
type UpdateSettingsRequest struct {
	MapsKey          string `json:"maps_key"` // no longer strictly required for all
	GeoapifyKey      string `json:"geoapify_key"`
	PositionStackKey string `json:"position_stack_key"`
}

// TestMapsKeyRequest is the payload for POST /api/settings/maps/test
type TestMapsKeyRequest struct {
	Provider string `json:"provider" binding:"required"` // 'google', 'geoapify', 'positionstack'
	Key      string `json:"key" binding:"required"`
}

// TestMapsKeyResponse is the response for POST /api/settings/maps/test
type TestMapsKeyResponse struct {
	Provider string `json:"provider"`
	Valid    bool   `json:"valid"`
	Message  string `json:"message"`
}
