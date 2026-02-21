package repository

import (
	"context"
	"database/sql"
	"geoaccuracy-backend/internal/domain"
)

type DataSourceRepository interface {
	Create(ctx context.Context, ds *domain.DataSource) error
	GetByID(ctx context.Context, id int64, userID int64) (*domain.DataSource, error)
	ListByUserID(ctx context.Context, userID int64) ([]domain.DataSource, error)
	Delete(ctx context.Context, id int64, userID int64) error

	SavePipeline(ctx context.Context, p *domain.TransformationPipeline) error
	GetPipelineByID(ctx context.Context, id int64, userID int64) (*domain.TransformationPipeline, error)
	ListPipelinesByDataSource(ctx context.Context, dsID int64, userID int64) ([]domain.TransformationPipeline, error)
	ListAllPipelines(ctx context.Context) ([]domain.TransformationPipeline, error)
	DeletePipeline(ctx context.Context, id int64, userID int64) error
}

type dataSourceRepository struct {
	db *sql.DB
}

func NewDataSourceRepository(db *sql.DB) DataSourceRepository {
	return &dataSourceRepository{db: db}
}

func (r *dataSourceRepository) Create(ctx context.Context, ds *domain.DataSource) error {
	query := `
		INSERT INTO data_sources (user_id, name, provider, host, port, database, username, password)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, created_at, updated_at
	`
	return r.db.QueryRowContext(ctx, query,
		ds.UserID, ds.Name, ds.Provider, ds.Host, ds.Port, ds.Database, ds.Username, ds.Password,
	).Scan(&ds.ID, &ds.CreatedAt, &ds.UpdatedAt)
}

func (r *dataSourceRepository) GetByID(ctx context.Context, id int64, userID int64) (*domain.DataSource, error) {
	query := `
		SELECT id, user_id, name, provider, host, port, database, username, password, created_at, updated_at
		FROM data_sources
		WHERE id = $1 AND user_id = $2
	`
	ds := &domain.DataSource{}
	err := r.db.QueryRowContext(ctx, query, id, userID).Scan(
		&ds.ID, &ds.UserID, &ds.Name, &ds.Provider, &ds.Host, &ds.Port,
		&ds.Database, &ds.Username, &ds.Password, &ds.CreatedAt, &ds.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil // Or custom error
		}
		return nil, err
	}
	return ds, nil
}

func (r *dataSourceRepository) ListByUserID(ctx context.Context, userID int64) ([]domain.DataSource, error) {
	query := `
		SELECT id, user_id, name, provider, host, port, database, username, password, created_at, updated_at
		FROM data_sources
		WHERE user_id = $1
		ORDER BY created_at DESC
	`
	rows, err := r.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var dss []domain.DataSource
	for rows.Next() {
		var ds domain.DataSource
		if err := rows.Scan(
			&ds.ID, &ds.UserID, &ds.Name, &ds.Provider, &ds.Host, &ds.Port,
			&ds.Database, &ds.Username, &ds.Password, &ds.CreatedAt, &ds.UpdatedAt,
		); err != nil {
			return nil, err
		}
		dss = append(dss, ds)
	}
	return dss, rows.Err()
}

func (r *dataSourceRepository) Delete(ctx context.Context, id int64, userID int64) error {
	query := `DELETE FROM data_sources WHERE id = $1 AND user_id = $2`
	result, err := r.db.ExecContext(ctx, query, id, userID)
	if err != nil {
		return err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return sql.ErrNoRows // Or custom not found
	}
	return nil
}

func (r *dataSourceRepository) SavePipeline(ctx context.Context, p *domain.TransformationPipeline) error {
	if p.ID == 0 {
		query := `
			INSERT INTO transformation_pipelines (user_id, data_source_id, name, config)
			VALUES ($1, $2, $3, $4)
			RETURNING id, created_at, updated_at
		`
		return r.db.QueryRowContext(ctx, query, p.UserID, p.DataSourceID, p.Name, p.Config).
			Scan(&p.ID, &p.CreatedAt, &p.UpdatedAt)
	}

	query := `
		UPDATE transformation_pipelines
		SET name = $1, config = $2, updated_at = CURRENT_TIMESTAMP
		WHERE id = $3 AND user_id = $4
		RETURNING updated_at
	`
	return r.db.QueryRowContext(ctx, query, p.Name, p.Config, p.ID, p.UserID).Scan(&p.UpdatedAt)
}

func (r *dataSourceRepository) GetPipelineByID(ctx context.Context, id int64, userID int64) (*domain.TransformationPipeline, error) {
	query := `
		SELECT id, user_id, data_source_id, name, config, created_at, updated_at
		FROM transformation_pipelines
		WHERE id = $1 AND user_id = $2
	`
	p := &domain.TransformationPipeline{}
	err := r.db.QueryRowContext(ctx, query, id, userID).Scan(
		&p.ID, &p.UserID, &p.DataSourceID, &p.Name, &p.Config, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return p, nil
}

func (r *dataSourceRepository) ListPipelinesByDataSource(ctx context.Context, dsID int64, userID int64) ([]domain.TransformationPipeline, error) {
	query := `
		SELECT id, user_id, data_source_id, name, config, created_at, updated_at
		FROM transformation_pipelines
		WHERE data_source_id = $1 AND user_id = $2
		ORDER BY created_at DESC
	`
	rows, err := r.db.QueryContext(ctx, query, dsID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ps []domain.TransformationPipeline
	for rows.Next() {
		var p domain.TransformationPipeline
		if err := rows.Scan(
			&p.ID, &p.UserID, &p.DataSourceID, &p.Name, &p.Config, &p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		ps = append(ps, p)
	}
	return ps, rows.Err()
}

func (r *dataSourceRepository) ListAllPipelines(ctx context.Context) ([]domain.TransformationPipeline, error) {
	query := `
		SELECT id, user_id, data_source_id, name, config, created_at, updated_at
		FROM transformation_pipelines
		ORDER BY created_at DESC
	`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ps []domain.TransformationPipeline
	for rows.Next() {
		var p domain.TransformationPipeline
		if err := rows.Scan(
			&p.ID, &p.UserID, &p.DataSourceID, &p.Name, &p.Config, &p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		ps = append(ps, p)
	}
	return ps, rows.Err()
}

func (r *dataSourceRepository) DeletePipeline(ctx context.Context, id int64, userID int64) error {
	query := `DELETE FROM transformation_pipelines WHERE id = $1 AND user_id = $2`
	result, err := r.db.ExecContext(ctx, query, id, userID)
	if err != nil {
		return err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return sql.ErrNoRows
	}
	return nil
}
