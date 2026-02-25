package repository

import (
	"context"
	"database/sql"
	"geoaccuracy-backend/internal/domain"

	"github.com/google/uuid"
)

type batchRepository struct {
	db *sql.DB
}

func NewBatchRepository(db *sql.DB) domain.BatchRepository {
	return &batchRepository{db: db}
}

func (r *batchRepository) CreateBatch(ctx context.Context, batch *domain.Batch) error {
	query := `
		INSERT INTO batches (id, user_id, name, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		RETURNING id, created_at, updated_at
	`
	if batch.ID == uuid.Nil {
		batch.ID = uuid.New()
	}

	return r.db.QueryRowContext(ctx, query,
		batch.ID, batch.UserID, batch.Name, batch.Status,
	).Scan(&batch.ID, &batch.CreatedAt, &batch.UpdatedAt)
}

func (r *batchRepository) GetBatchByID(ctx context.Context, id uuid.UUID) (*domain.Batch, error) {
	query := `
		SELECT id, user_id, name, status, created_at, updated_at
		FROM batches
		WHERE id = $1
	`
	b := &domain.Batch{}
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&b.ID, &b.UserID, &b.Name, &b.Status, &b.CreatedAt, &b.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return b, nil
}

func (r *batchRepository) GetBatchesByUserID(ctx context.Context, userID int64) ([]domain.Batch, error) {
	query := `
		SELECT id, user_id, name, status, created_at, updated_at
		FROM batches
		WHERE user_id = $1
		ORDER BY created_at DESC
	`
	rows, err := r.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var batches []domain.Batch
	for rows.Next() {
		var b domain.Batch
		if err := rows.Scan(
			&b.ID, &b.UserID, &b.Name, &b.Status, &b.CreatedAt, &b.UpdatedAt,
		); err != nil {
			return nil, err
		}
		batches = append(batches, b)
	}
	return batches, rows.Err()
}

func (r *batchRepository) UpdateBatchStatus(ctx context.Context, id uuid.UUID, status domain.BatchStatus) error {
	query := `
		UPDATE batches
		SET status = $1, updated_at = CURRENT_TIMESTAMP
		WHERE id = $2
	`
	_, err := r.db.ExecContext(ctx, query, status, id)
	return err
}

func (r *batchRepository) UpsertBatchItems(ctx context.Context, items []domain.BatchItem) error {
	if len(items) == 0 {
		return nil
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for _, item := range items {
		if item.ID == uuid.Nil {
			item.ID = uuid.New()
		}

		// Try update first — include courier_id so it is preserved on update
		updateQuery := `
			UPDATE batch_items
			SET recipient_name = COALESCE(NULLIF($1, ''), recipient_name),
				system_address = COALESCE(NULLIF($2, ''), system_address),
				courier_id     = COALESCE(NULLIF($3, ''), courier_id),
				system_lat     = COALESCE($4, system_lat),
				system_lng     = COALESCE($5, system_lng),
				field_lat      = COALESCE($6, field_lat),
				field_lng      = COALESCE($7, field_lng),
				distance_km    = COALESCE($8, distance_km),
				accuracy_level = COALESCE(NULLIF($9, ''),  accuracy_level),
				error          = COALESCE(NULLIF($10, ''), error),
				geocode_status = COALESCE(NULLIF($11, ''), geocode_status),
				updated_at     = CURRENT_TIMESTAMP
			WHERE batch_id = $12 AND connote = $13
		`

		res, err := tx.ExecContext(ctx, updateQuery,
			item.RecipientName, item.SystemAddress, item.CourierID,
			item.SystemLat, item.SystemLng,
			item.FieldLat, item.FieldLng,
			item.DistanceKm, item.AccuracyLevel, item.Error, item.GeocodeStatus,
			item.BatchID, item.Connote,
		)
		if err != nil {
			return err
		}

		rowsAffected, err := res.RowsAffected()
		if err != nil {
			return err
		}

		if rowsAffected == 0 {
			insertQuery := `
				INSERT INTO batch_items (
					id, batch_id, connote, recipient_name, system_address, courier_id,
					system_lat, system_lng, field_lat, field_lng,
					distance_km, accuracy_level, error, geocode_status
				) VALUES (
					$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
				)
			`
			_, err = tx.ExecContext(ctx, insertQuery,
				item.ID, item.BatchID, item.Connote, item.RecipientName, item.SystemAddress, item.CourierID,
				item.SystemLat, item.SystemLng, item.FieldLat, item.FieldLng,
				item.DistanceKm, item.AccuracyLevel, item.Error, item.GeocodeStatus,
			)
			if err != nil {
				return err
			}
		}
	}

	return tx.Commit()
}

func (r *batchRepository) GetBatchItemsByBatchID(ctx context.Context, batchID uuid.UUID) ([]domain.BatchItem, error) {
	query := `
		SELECT id, batch_id, connote, recipient_name, system_address, courier_id,
		       system_lat, system_lng, field_lat, field_lng,
		       distance_km, accuracy_level, error, geocode_status, created_at, updated_at
		FROM batch_items
		WHERE batch_id = $1
		ORDER BY created_at ASC
	`
	return r.queryBatchItems(ctx, query, batchID)
}

func (r *batchRepository) GetBatchItemsByBatchIDAndStatus(ctx context.Context, batchID uuid.UUID, status string) ([]domain.BatchItem, error) {
	query := `
		SELECT id, batch_id, connote, recipient_name, system_address, courier_id,
		       system_lat, system_lng, field_lat, field_lng,
		       distance_km, accuracy_level, error, geocode_status, created_at, updated_at
		FROM batch_items
		WHERE batch_id = $1 AND geocode_status = $2
		ORDER BY created_at ASC
	`
	return r.queryBatchItems(ctx, query, batchID, status)
}

func (r *batchRepository) queryBatchItems(ctx context.Context, query string, args ...interface{}) ([]domain.BatchItem, error) {
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []domain.BatchItem
	for rows.Next() {
		var i domain.BatchItem
		if err := rows.Scan(
			&i.ID, &i.BatchID, &i.Connote, &i.RecipientName, &i.SystemAddress, &i.CourierID,
			&i.SystemLat, &i.SystemLng, &i.FieldLat, &i.FieldLng,
			&i.DistanceKm, &i.AccuracyLevel, &i.Error, &i.GeocodeStatus,
			&i.CreatedAt, &i.UpdatedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	return items, rows.Err()
}
