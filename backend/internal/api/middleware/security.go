package middleware

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// SecurityHeaders applies basic helmet-like security headers
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-XSS-Protection", "1; mode=block")
		c.Header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		c.Header("Content-Security-Policy", "default-src 'self'")

		c.Next()
	}
}

// CORSMiddleware validates the request Origin against the ALLOWED_ORIGINS
// environment variable (comma-separated list). This prevents wildcard "*"
// in production and supports multiple allowed origins safely.
//
// Usage in routes.go:
//
//	r.Use(middleware.CORSMiddleware(cfg.AllowedOrigins))
//
// .env example:
//
//	ALLOWED_ORIGINS=https://geoverify.vercel.app,http://localhost:8080
func CORSMiddleware(allowedOrigins string) gin.HandlerFunc {
	// Build an O(1) lookup set from the comma-separated list.
	originSet := buildOriginSet(allowedOrigins)

	return func(c *gin.Context) {
		requestOrigin := c.Request.Header.Get("Origin")
		trimmedRequestOrigin := strings.TrimRight(requestOrigin, "/")

		// Handle preflight
		allowOrigin := ""
		if trimmedRequestOrigin != "" {
			if originSet["*"] || originSet[trimmedRequestOrigin] {
				allowOrigin = requestOrigin // keep original for the header
			}
		}

		if allowOrigin != "" {
			c.Writer.Header().Set("Access-Control-Allow-Origin", allowOrigin)
			c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
			c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, Accept, Origin, Cache-Control, X-Requested-With")
			c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE, PATCH")
			c.Writer.Header().Set("Vary", "Origin")
			c.Writer.Header().Set("Access-Control-Max-Age", "86400") // 24 hours
		} else if requestOrigin != "" {
			// Log unallowed origins to help debug CORS mismatches
			sanitizedOrigin := strings.NewReplacer("\r", "", "\n", "").Replace(requestOrigin)
			fmt.Printf("[CORS DEBUG] Blocked Origin: %s | Permitted: %s\n", sanitizedOrigin, allowedOrigins)
		}

		// Handle preflight request
		if c.Request.Method == http.MethodOptions {
			if allowOrigin != "" {
				c.AbortWithStatus(http.StatusNoContent)
			} else {
				c.AbortWithStatus(http.StatusForbidden)
			}
			return
		}

		c.Next()
	}
}

// buildOriginSet converts "https://a.com,http://localhost:8080" into a map
// for O(1) lookup. Trims whitespace around each origin.
func buildOriginSet(allowedOrigins string) map[string]bool {
	set := make(map[string]bool)
	for _, origin := range strings.Split(allowedOrigins, ",") {
		trimmed := strings.TrimRight(strings.TrimSpace(origin), "/")
		if trimmed != "" {
			set[trimmed] = true
		}
	}
	return set
}
