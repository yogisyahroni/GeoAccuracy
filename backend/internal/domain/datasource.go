package domain

import (
	"encoding/json"
	"time"
)

type DataSource struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	Name      string    `json:"name" binding:"required"`
	Provider  string    `json:"provider" binding:"required,oneof=postgresql mysql"`
	Host      string    `json:"host" binding:"required"`
	Port      int       `json:"port" binding:"required"`
	Database  string    `json:"database" binding:"required"`
	Username  string    `json:"username" binding:"required"`
	Password  string    `json:"password" binding:"required"` // Will be encrypted in DB
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type TransformationPipeline struct {
	ID           int64           `json:"id"`
	UserID       int64           `json:"user_id"`
	DataSourceID int64           `json:"data_source_id"`
	Name         string          `json:"name" binding:"required"`
	Config       json.RawMessage `json:"config" binding:"required"` // JSON containing joins & column mappings
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
}
