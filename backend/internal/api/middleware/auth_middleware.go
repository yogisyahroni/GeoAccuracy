package middleware

import (
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"geoaccuracy-backend/config"
	"geoaccuracy-backend/pkg/utils"
)

func AuthMiddleware(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var tokenString string

		// 1. Try to get token from cookie (Prioritized for S++ compliance)
		cookieToken, err := c.Cookie("access_token")
		if err == nil && cookieToken != "" {
			tokenString = cookieToken
		} else {
			// 2. Fallback to Authorization header
			authHeader := c.GetHeader("Authorization")
			if authHeader != "" {
				parts := strings.Split(authHeader, " ")
				if len(parts) == 2 && parts[0] == "Bearer" {
					tokenString = parts[1]
				}
			}
		}

		if tokenString == "" {
			// 3. Fallback to Sec-WebSocket-Protocol (Secured for WS Handshakes)
			// Browser WS API doesn't allow custom headers, so we often pass token here.
			wsProtocol := c.GetHeader("Sec-WebSocket-Protocol")
			if wsProtocol != "" {
				// Protocol can be "token, other-sub"
				parts := strings.Split(wsProtocol, ",")
				tokenString = strings.TrimSpace(parts[0])
			}
		}

		if tokenString == "" {
			// Internal debug log (visible in Render logs)
			log.Printf("[AUTH] Missing token from all sources (Cookie: %v, Header: %v)", 
				c.Request.Header.Get("Cookie") != "", 
				c.GetHeader("Authorization") != "")
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
			return
		}

		claims, err := utils.ParseToken(tokenString, cfg)
		if err != nil {
			log.Printf("[AUTH] Invalid token: %v", err)
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
			return
		}

		// Set user data in context for downstream handlers
		c.Set("userID", claims.UserID)
		c.Set("userRole", claims.Role)
		c.Next()
	}
}

