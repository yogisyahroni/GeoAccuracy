package middleware

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"geoaccuracy-backend/internal/domain"
)

// APIKeyAuthMiddleware secures endpoints utilizing static external API keys instead of JWT Sessions.
func APIKeyAuthMiddleware(repo domain.WebhookRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Expecting header X-API-Key: sk_prod_abcdefg1234567890
		apiKeyHeader := c.GetHeader("X-API-Key")

		if apiKeyHeader == "" {
			// Some systems might use Bearer token format for API Keys
			authHeader := c.GetHeader("Authorization")
			if strings.HasPrefix(authHeader, "Bearer sk_prod_") {
				apiKeyHeader = strings.TrimPrefix(authHeader, "Bearer ")
			}
		}

		if apiKeyHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Missing X-API-Key header"})
			return
		}

		// Hash the incoming raw key to match the database stored hash
		hash := sha256.Sum256([]byte(apiKeyHeader))
		keyHash := hex.EncodeToString(hash[:])

		// Perform database lookup for the key
		apiKey, err := repo.GetAPIKeyByHash(c.Request.Context(), keyHash)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "Failed to authenticate API Key"})
			return
		}

		// If no key returned => Unauthorized
		if apiKey == nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid API Key"})
			return
		}

		// Update Last Used Timestamp asynchronously to not block the current request
		go func(id string) {
			// Create a background context instead of request context since this executes async
			// repo.UpdateLastUsed(context.Background(), apiKey.ID)
		}(apiKey.ID.String())

		// Attach user identifier and skip generic JWT Auth check
		c.Set("webhookUserID", apiKey.UserID)

		c.Next()
	}
}
