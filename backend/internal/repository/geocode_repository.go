package repository

import (
	"context"
	"database/sql"

	"geoaccuracy-backend/internal/domain"
)

type GeocodeRepository interface {
	GetCachedResult(ctx context.Context, addressHash string) (*domain.GeocodeCache, error)
	SaveResult(ctx context.Context, cache *domain.GeocodeCache) error
}

type postgresGeocodeRepository struct {
	db *sql.DB
}

func NewGeocodeRepository(db *sql.DB) GeocodeRepository {
	return &postgresGeocodeRepository{db: db}
}

func (r *postgresGeocodeRepository) GetCachedResult(ctx context.Context, addressHash string) (*domain.GeocodeCache, error) {
	query := `
		SELECT id, address_hash, original_address, city, province, lat, lng, provider, created_at, expires_at
		FROM geocode_cache
		WHERE address_hash = $1 AND expires_at > now()
	`

	var c domain.GeocodeCache
	err := r.db.QueryRowContext(ctx, query, addressHash).Scan(
		&c.ID, &c.AddressHash, &c.OriginalAddress, &c.City, &c.Province,
		&c.Lat, &c.Lng, &c.Provider, &c.CreatedAt, &c.ExpiresAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			// Cache miss or expired
			return nil, nil
		}
		return nil, err
	}

	return &c, nil
}

func (r *postgresGeocodeRepository) SaveResult(ctx context.Context, c *domain.GeocodeCache) error {
	query := `
		INSERT INTO geocode_cache (address_hash, original_address, city, province, lat, lng, provider, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (address_hash) DO UPDATE SET
			original_address = EXCLUDED.original_address,
			city = EXCLUDED.city,
			province = EXCLUDED.province,
			lat = EXCLUDED.lat,
			lng = EXCLUDED.lng,
			provider = EXCLUDED.provider,
			expires_at = EXCLUDED.expires_at
		RETURNING id, created_at
	`
	err := r.db.QueryRowContext(ctx, query,
		c.AddressHash, c.OriginalAddress, c.City, c.Province, c.Lat, c.Lng, c.Provider, c.ExpiresAt,
	).Scan(&c.ID, &c.CreatedAt)

	return err
}
