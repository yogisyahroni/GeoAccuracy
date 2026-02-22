package domain

import (
	"time"

	"github.com/google/uuid"
)

type Area struct {
	ID          uuid.UUID   `json:"id"`
	Name        string      `json:"name"`
	Description string      `json:"description"`
	GeoJSON     interface{} `json:"geoJson"`
	CreatedAt   time.Time   `json:"createdAt"`
	UpdatedAt   time.Time   `json:"updatedAt"`
}

type CreateAreaRequest struct {
	Name        string      `json:"name" binding:"required"`
	Description string      `json:"description"`
	GeoJSON     interface{} `json:"geoJson" binding:"required"`
}
