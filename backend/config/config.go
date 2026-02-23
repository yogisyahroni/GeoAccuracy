package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	AppEnv           string
	AppPort          string
	DBHost           string
	DBPort           string
	DBUser           string
	DBPassword       string
	DBName           string
	RedisURL         string
	JWTSecret        string
	AESEncryptionKey string
	// AllowedOrigins is a comma-separated list of allowed CORS origins.
	// Example: "https://geoverify.vercel.app,http://localhost:8080"
	AllowedOrigins string
}

func LoadConfig() *Config {
	_ = godotenv.Load() // optional, relies on env vars if not present

	cfg := &Config{
		AppEnv: getEnv("APP_ENV", "development"),
		// Render.com injects PORT env var — use it first, fallback to APP_PORT, then default 8081
		AppPort:          getEnvPriority([]string{"PORT", "APP_PORT"}, "8081"),
		DBHost:           getEnv("DB_HOST", "localhost"),
		DBPort:           getEnv("DB_PORT", "5432"),
		DBUser:           getEnv("DB_USER", "postgres"),
		DBPassword:       getEnv("DB_PASSWORD", "postgres"),
		DBName:           getEnv("DB_NAME", "geoaccuracy"),
		RedisURL:         getEnv("REDIS_URL", ""),
		JWTSecret:        getEnv("JWT_SECRET", "super-secret-default-key-change-in-prod"),
		AESEncryptionKey: getEnv("AES_ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef"),
		AllowedOrigins:   getEnv("ALLOWED_ORIGINS", "http://localhost:8080,http://localhost:5173"),
	}

	if cfg.AppEnv == "production" {
		if os.Getenv("JWT_SECRET") == "" {
			log.Fatal("JWT_SECRET must be set in production")
		}
		if os.Getenv("DB_PASSWORD") == "" {
			log.Fatal("DB_PASSWORD must be set in production")
		}
		// ALLOWED_ORIGINS: warn but don't fatal — allows recovery
		if os.Getenv("ALLOWED_ORIGINS") == "" {
			log.Println("[WARN] ALLOWED_ORIGINS not set in production — using permissive default")
		}
	}

	return cfg
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists && value != "" {
		return value
	}
	return fallback
}

// getEnvPriority tries multiple env var keys in order, returns first non-empty value.
func getEnvPriority(keys []string, fallback string) string {
	for _, key := range keys {
		if value, exists := os.LookupEnv(key); exists && value != "" {
			return value
		}
	}
	return fallback
}
