package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"geoaccuracy-backend/internal/domain"

	"github.com/google/uuid"
)

type AreaRepository interface {
	Create(ctx context.Context, area *domain.Area) error
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Area, error)
	ListAll(ctx context.Context) ([]domain.Area, error)
	Delete(ctx context.Context, id uuid.UUID) error
	CheckPointInArea(ctx context.Context, pointLat float64, pointLng float64) ([]domain.Area, error)
}

type postgresAreaRepository struct {
	db *sql.DB
}

func NewAreaRepository(db *sql.DB) AreaRepository {
	return &postgresAreaRepository{db: db}
}

func (r *postgresAreaRepository) Create(ctx context.Context, area *domain.Area) error {
	geoJSONBytes, err := json.Marshal(area.GeoJSON)
	if err != nil {
		return fmt.Errorf("failed to marshal geojson: %w", err)
	}

	query := `
		INSERT INTO areas (name, description, geom)
		VALUES ($1, $2, ST_GeomFromGeoJSON($3))
		RETURNING id, created_at, updated_at
	`
	err = r.db.QueryRowContext(ctx, query, area.Name, area.Description, string(geoJSONBytes)).
		Scan(&area.ID, &area.CreatedAt, &area.UpdatedAt)

	if err != nil {
		return fmt.Errorf("failed to create area: %w", err)
	}

	return nil
}

func (r *postgresAreaRepository) GetByID(ctx context.Context, id uuid.UUID) (*domain.Area, error) {
	query := `
		SELECT id, name, description, ST_AsGeoJSON(geom), created_at, updated_at
		FROM areas
		WHERE id = $1
	`
	var area domain.Area
	var geoJSONStr string
	err := r.db.QueryRowContext(ctx, query, id).
		Scan(&area.ID, &area.Name, &area.Description, &geoJSONStr, &area.CreatedAt, &area.UpdatedAt)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("area not found")
		}
		return nil, fmt.Errorf("failed to get area: %w", err)
	}

	if err := json.Unmarshal([]byte(geoJSONStr), &area.GeoJSON); err != nil {
		return nil, fmt.Errorf("failed to parse area geojson: %w", err)
	}

	return &area, nil
}

func (r *postgresAreaRepository) ListAll(ctx context.Context) ([]domain.Area, error) {
	query := `
		SELECT id, name, description, ST_AsGeoJSON(geom), created_at, updated_at
		FROM areas
		ORDER BY created_at DESC
	`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list areas: %w", err)
	}
	defer rows.Close()

	var areas []domain.Area
	for rows.Next() {
		var area domain.Area
		var geoJSONStr string
		err := rows.Scan(&area.ID, &area.Name, &area.Description, &geoJSONStr, &area.CreatedAt, &area.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan area row: %w", err)
		}

		if err := json.Unmarshal([]byte(geoJSONStr), &area.GeoJSON); err != nil {
			return nil, fmt.Errorf("failed to parse area geojson: %w", err)
		}

		areas = append(areas, area)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("row iteration error: %w", err)
	}

	return areas, nil
}

func (r *postgresAreaRepository) Delete(ctx context.Context, id uuid.UUID) error {
	query := "DELETE FROM areas WHERE id = $1"
	res, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete area: %w", err)
	}

	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("area not found")
	}

	return nil
}

func (r *postgresAreaRepository) CheckPointInArea(ctx context.Context, pointLat float64, pointLng float64) ([]domain.Area, error) {
	// PostGIS ST_Contains checks if geom B (Point) is entirely inside geom A (Polygon)
	// ST_MakePoint takes (longitude, latitude)
	query := `
		SELECT id, name, description, ST_AsGeoJSON(geom), created_at, updated_at
		FROM areas
		WHERE ST_Intersects(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))
	`
	rows, err := r.db.QueryContext(ctx, query, pointLng, pointLat)
	if err != nil {
		return nil, fmt.Errorf("failed to execute point-in-polygon query: %w", err)
	}
	defer rows.Close()

	var areas []domain.Area
	for rows.Next() {
		var area domain.Area
		var geoJSONStr string
		err := rows.Scan(&area.ID, &area.Name, &area.Description, &geoJSONStr, &area.CreatedAt, &area.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan pip area row: %w", err)
		}

		if err := json.Unmarshal([]byte(geoJSONStr), &area.GeoJSON); err != nil {
			return nil, fmt.Errorf("failed to parse area geojson: %w", err)
		}

		areas = append(areas, area)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("row iteration error in pip: %w", err)
	}

	return areas, nil
}
