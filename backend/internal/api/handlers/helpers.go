package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

const ctxUserIDKey = "userID"

// getUserID extracts the authenticated user's ID from the Gin context.
// The AuthMiddleware sets this value. Returns false and writes 401 if not set.
func getUserID(c *gin.Context) (int, bool) {
	raw, exists := c.Get(ctxUserIDKey)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Tidak terautentikasi"})
		return 0, false
	}

	switch v := raw.(type) {
	case int:
		return v, true
	case int64:
		return int(v), true
	case float64:
		return int(v), true
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"message": "User ID tidak valid"})
		return 0, false
	}
}
