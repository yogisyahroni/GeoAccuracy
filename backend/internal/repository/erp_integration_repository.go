package repository

import (
	"context"
	"time"

	"geoaccuracy-backend/internal/domain"

	"github.com/jmoiron/sqlx"
)

type erpIntegrationRepository struct {
	db *sqlx.DB
}

func NewErpIntegrationRepository(db *sqlx.DB) domain.ErpIntegrationRepository {
	return &erpIntegrationRepository{db: db}
}

func (r *erpIntegrationRepository) Create(ctx context.Context, i *domain.ErpIntegration) error {
	query := `
		INSERT INTO erp_integrations (user_id, name, url, method, auth_header_key, auth_header_value, cron_schedule)
		VALUES (:user_id, :name, :url, :method, :auth_header_key, :auth_header_value, :cron_schedule)
		RETURNING id, created_at, updated_at
	`
	rows, err := r.db.NamedQueryContext(ctx, query, i)
	if err != nil {
		return err
	}
	defer rows.Close()

	if rows.Next() {
		return rows.Scan(&i.ID, &i.CreatedAt, &i.UpdatedAt)
	}
	return rows.Err()
}

func (r *erpIntegrationRepository) GetByID(ctx context.Context, id int64, userID int64) (*domain.ErpIntegration, error) {
	query := `SELECT * FROM erp_integrations WHERE id = $1 AND user_id = $2`
	var i domain.ErpIntegration
	err := r.db.GetContext(ctx, &i, query, id, userID)
	if err != nil {
		return nil, err
	}
	return &i, nil
}

func (r *erpIntegrationRepository) ListByUserID(ctx context.Context, userID int64) ([]domain.ErpIntegration, error) {
	query := `SELECT * FROM erp_integrations WHERE user_id = $1 ORDER BY created_at DESC`
	var integrations []domain.ErpIntegration
	err := r.db.SelectContext(ctx, &integrations, query, userID)
	if err != nil {
		return nil, err
	}
	return integrations, nil
}

func (r *erpIntegrationRepository) ListAllInternal(ctx context.Context) ([]domain.ErpIntegration, error) {
	query := `SELECT * FROM erp_integrations`
	var integrations []domain.ErpIntegration
	err := r.db.SelectContext(ctx, &integrations, query)
	if err != nil {
		return nil, err
	}
	return integrations, nil
}

func (r *erpIntegrationRepository) Update(ctx context.Context, i *domain.ErpIntegration) error {
	query := `
		UPDATE erp_integrations
		SET name = :name, url = :url, method = :method, 
		    auth_header_key = :auth_header_key, auth_header_value = :auth_header_value, 
		    cron_schedule = :cron_schedule, updated_at = NOW()
		WHERE id = :id AND user_id = :user_id
		RETURNING updated_at
	`
	rows, err := r.db.NamedQueryContext(ctx, query, i)
	if err != nil {
		return err
	}
	defer rows.Close()

	if rows.Next() {
		return rows.Scan(&i.UpdatedAt)
	}
	return rows.Err()
}

func (r *erpIntegrationRepository) UpdateLastSyncTime(ctx context.Context, id int64, syncTime time.Time) error {
	query := `UPDATE erp_integrations SET last_sync_at = $1 WHERE id = $2`
	_, err := r.db.ExecContext(ctx, query, syncTime, id)
	return err
}

func (r *erpIntegrationRepository) Delete(ctx context.Context, id int64, userID int64) error {
	query := `DELETE FROM erp_integrations WHERE id = $1 AND user_id = $2`
	_, err := r.db.ExecContext(ctx, query, id, userID)
	return err
}
