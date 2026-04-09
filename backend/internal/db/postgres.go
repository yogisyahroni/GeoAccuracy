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
