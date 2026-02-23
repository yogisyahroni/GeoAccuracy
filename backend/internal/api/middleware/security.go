package middleware

import (
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

		// If the request has no Origin header (e.g. direct API calls / curl),
		// let it pass without setting CORS headers.
		if requestOrigin == "" {
			c.Next()
			return
		}

		// Check if origin is in the allow-list.
		if originSet[requestOrigin] {
			c.Writer.Header().Set("Access-Control-Allow-Origin", requestOrigin)
			c.Writer.Header().Set("Vary", "Origin") // Required for CDN caching correctness
		}
		// If origin is NOT allowed, do NOT set Access-Control-Allow-Origin.
		// The browser will block the response — this is the correct security behavior.

		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers",
			"Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, Accept, Origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE, PATCH")

		// Handle preflight request
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
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
		trimmed := strings.TrimSpace(origin)
		if trimmed != "" {
			set[trimmed] = true
		}
	}
	return set
}
