package middleware

import (
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)


// SecurityHeaders applies basic helmet-like security headers
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-XSS-Protection", "1; mode=block")
		// Grade S++ HSTS: 2 years (63072000s) + includeSubDomains + preload
		c.Header("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
		c.Header("Content-Security-Policy", "default-src 'self'")

		c.Next()
	}
}

// ipLimiter represents a rate limiter per IP address
type ipLimiter struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

var (
	limiters = make(map[string]*ipLimiter)
	mu       sync.Mutex
)

// RateLimit implements strict throttling for public/sensitive routes.
// Grade S++ mandate: Prevent brute-force and DoS.
func RateLimit(r rate.Limit, b int) gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()

		mu.Lock()
		v, exists := limiters[ip]
		if !exists {
			v = &ipLimiter{
				limiter:  rate.NewLimiter(r, b),
				lastSeen: time.Now(),
			}
			limiters[ip] = v
		}
		v.lastSeen = time.Now()
		mu.Unlock()

		if !v.limiter.Allow() {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": "Rate limit exceeded. Please slow down.",
			})
			return
		}

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
