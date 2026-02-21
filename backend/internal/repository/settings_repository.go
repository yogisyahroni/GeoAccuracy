package repository

import (
	"database/sql"
	"fmt"
	"time"

	"geoaccuracy-backend/internal/domain"
)

// SettingsRepository handles user_settings table operations.
type SettingsRepository interface {
	GetByUserID(userID int) (*domain.UserSettings, error)
	Upsert(userID int, mapsKey, geoapifyKey, positionStackKey string) error
}

type postgresSettingsRepository struct {
	db *sql.DB
}

// NewSettingsRepository creates a new SettingsRepository.
func NewSettingsRepository(db *sql.DB) SettingsRepository {
	return &postgresSettingsRepository{db: db}
}

// GetByUserID returns the settings for a given user, or default empty settings if none exist.
func (r *postgresSettingsRepository) GetByUserID(userID int) (*domain.UserSettings, error) {
	s := &domain.UserSettings{
		UserID:    userID,
		MapsKey:   "",
		UpdatedAt: time.Now(),
	}

	err := r.db.QueryRow(
		`SELECT user_id, maps_key, geoapify_key, position_stack_key, updated_at FROM user_settings WHERE user_id = $1`, userID,
	).Scan(&s.UserID, &s.MapsKey, &s.GeoapifyKey, &s.PositionStackKey, &s.UpdatedAt)

	if err == sql.ErrNoRows {
		return s, nil // return defaults — not an error
	}
	if err != nil {
		return nil, fmt.Errorf("settings repository GetByUserID: %w", err)
	}
	return s, nil
}

// Upsert inserts or updates the user settings row.
func (r *postgresSettingsRepository) Upsert(userID int, mapsKey, geoapifyKey, positionStackKey string) error {
	_, err := r.db.Exec(
		`INSERT INTO user_settings (user_id, maps_key, geoapify_key, position_stack_key, updated_at)
		 VALUES ($1, $2, $3, $4, NOW())
		 ON CONFLICT (user_id) DO UPDATE
		   SET maps_key = EXCLUDED.maps_key,
		       geoapify_key = EXCLUDED.geoapify_key,
		       position_stack_key = EXCLUDED.position_stack_key,
		       updated_at = NOW()`,
		userID, mapsKey, geoapifyKey, positionStackKey,
	)
	if err != nil {
		return fmt.Errorf("settings repository Upsert: %w", err)
	}
	return nil
}
