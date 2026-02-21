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
}

func LoadConfig() *Config {
	_ = godotenv.Load() // optional, relies on env vars if not present

	cfg := &Config{
		AppEnv:           getEnv("APP_ENV", "development"),
		AppPort:          getEnv("APP_PORT", "8080"),
		DBHost:           getEnv("DB_HOST", "localhost"),
		DBPort:           getEnv("DB_PORT", "5432"),
		DBUser:           getEnv("DB_USER", "postgres"),
		DBPassword:       getEnv("DB_PASSWORD", "postgres"),
		DBName:           getEnv("DB_NAME", "geoaccuracy"),
		RedisURL:         getEnv("REDIS_URL", "redis://localhost:6379"),
		JWTSecret:        getEnv("JWT_SECRET", "super-secret-default-key-change-in-prod"),
		AESEncryptionKey: getEnv("AES_ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef"), // 32 bytes default for AES-256
	}

	if cfg.AppEnv == "production" {
		if os.Getenv("JWT_SECRET") == "" {
			log.Fatal("JWT_SECRET must be set in production")
		}
		if os.Getenv("DB_PASSWORD") == "" {
			log.Fatal("DB_PASSWORD must be set in production")
		}
	}

	return cfg
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}
