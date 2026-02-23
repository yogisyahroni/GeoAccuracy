package db

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"geoaccuracy-backend/config"

	_ "github.com/lib/pq"
)

func ConnectPostgres(cfg *config.Config) (*sql.DB, error) {
	sslMode := "disable"
	// Supabase requires SSL regardless of environment
	if cfg.AppEnv == "production" || strings.Contains(cfg.DBHost, "supabase.co") {
		sslMode = "require"
	}

	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		cfg.DBHost, cfg.DBPort, cfg.DBUser, cfg.DBPassword, cfg.DBName, sslMode,
	)

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, err
	}

	// Connection pool settings
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("could not connect to PostgreSQL: %w", err)
	}

	return db, nil
}
