package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"geoaccuracy-backend/internal/domain"

	"github.com/google/uuid"
)

type webhookRepository struct {
	db *sql.DB
}

// NewWebhookRepository creates a new instance of WebhookRepository
func NewWebhookRepository(db *sql.DB) domain.WebhookRepository {
	return &webhookRepository{db: db}
}

func (r *webhookRepository) CreateAPIKey(ctx context.Context, apiKey *domain.ExternalAPIKey) error {
	query := `
		INSERT INTO external_api_keys (user_id, name, key_hash, prefix)
		VALUES ($1, $2, $3, $4)
		RETURNING id, created_at, updated_at
	`
	err := r.db.QueryRowContext(ctx, query,
		apiKey.UserID,
		apiKey.Name,
		apiKey.KeyHash,
		apiKey.Prefix,
	).Scan(&apiKey.ID, &apiKey.CreatedAt, &apiKey.UpdatedAt)

	return err
}

func (r *webhookRepository) GetAPIKeysByUserID(ctx context.Context, userID int) ([]domain.ExternalAPIKey, error) {
	query := `
		SELECT id, user_id, name, prefix, last_used_at, created_at, updated_at
		FROM external_api_keys
		WHERE user_id = $1
		ORDER BY created_at DESC
	`
	rows, err := r.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var keys []domain.ExternalAPIKey
	for rows.Next() {
		var key domain.ExternalAPIKey
		if err := rows.Scan(
			&key.ID,
			&key.UserID,
			&key.Name,
			&key.Prefix,
			&key.LastUsedAt,
			&key.CreatedAt,
			&key.UpdatedAt,
		); err != nil {
			return nil, err
		}
		keys = append(keys, key)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return keys, nil
}

func (r *webhookRepository) GetAPIKeyByHash(ctx context.Context, keyHash string) (*domain.ExternalAPIKey, error) {
	query := `
		SELECT id, user_id, name, key_hash, prefix, last_used_at, created_at, updated_at
		FROM external_api_keys
		WHERE key_hash = $1
	`
	var key domain.ExternalAPIKey
	err := r.db.QueryRowContext(ctx, query, keyHash).Scan(
		&key.ID,
		&key.UserID,
		&key.Name,
		&key.KeyHash,
		&key.Prefix,
		&key.LastUsedAt,
		&key.CreatedAt,
		&key.UpdatedAt,
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil // Return nil, nil for not found (standard Go idiom)
		}
		return nil, err
	}

	return &key, nil
}

func (r *webhookRepository) DeleteAPIKey(ctx context.Context, id uuid.UUID, userID int) error {
	query := `DELETE FROM external_api_keys WHERE id = $1 AND user_id = $2`
	result, err := r.db.ExecContext(ctx, query, id, userID)
	if err != nil {
		return err
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return errors.New("API key not found or unauthorized")
	}

	return nil
}

func (r *webhookRepository) UpdateLastUsed(ctx context.Context, id uuid.UUID) error {
	query := `UPDATE external_api_keys SET last_used_at = $1 WHERE id = $2`
	_, err := r.db.ExecContext(ctx, query, time.Now(), id)
	return err
}
