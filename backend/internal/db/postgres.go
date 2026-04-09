package db

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"geoaccuracy-backend/config"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	_ "github.com/lib/pq"
)

func ConnectPostgres(cfg *config.Config) (*sql.DB, error) {
	sslMode := "disable"
	// Supabase and production environments require SSL
	if cfg.AppEnv == "production" || strings.Contains(cfg.DBHost, "supabase.") || strings.Contains(cfg.DatabaseURL, "supabase.") {
		sslMode = "require"
	}

	dsn := cfg.DatabaseURL
	if dsn == "" {
		dsn = fmt.Sprintf(
			"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
			cfg.DBHost, cfg.DBPort, cfg.DBUser, cfg.DBPassword, cfg.DBName, sslMode,
		)
	} else {
		// If using DATABASE_URL, ensure sslmode is set if we are in production or Supabase
		if (cfg.AppEnv == "production" || strings.Contains(cfg.DatabaseURL, "supabase.")) && !strings.Contains(dsn, "sslmode=") {
			if strings.Contains(dsn, "?") {
				dsn += "&sslmode=" + sslMode
			} else {
				dsn += "?sslmode=" + sslMode
			}
		}
	}

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

// RunMigrations applies all pending SQL migrations to the database.
// This ensures that the areas, data_sources, and batches tables exist.
func RunMigrations(databaseURL string) error {
	// If databaseURL contains sslmode=require, ensure it's compatible with migrate
	// migrate expects postgres://...
	m, err := migrate.New(
		"file://internal/db/migrations",
		databaseURL,
	)
	if err != nil {
		return fmt.Errorf("could not create migrate instance: %w", err)
	}
	defer m.Close()

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("could not run up migrations: %w", err)
	}

	return nil
}
