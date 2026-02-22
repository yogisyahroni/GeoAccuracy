package middleware

import (
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
)

var (
	// HttpRequestsTotal counts the total number of HTTP requests processed, partitioned by status code and method.
	HttpRequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Total number of HTTP requests processed.",
		},
		[]string{"method", "status", "path"},
	)

	// HttpRequestDuration measures the duration of HTTP requests.
	HttpRequestDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "Duration of HTTP requests in seconds.",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"method", "path"},
	)
)

func init() {
	// Register metrics with Prometheus's default registerer
	prometheus.MustRegister(HttpRequestsTotal)
	prometheus.MustRegister(HttpRequestDuration)
}

// MetricsMiddleware returns a Gin middleware that records Prometheus metrics.
func MetricsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		// Allow the request to be processed
		c.Next()

		duration := time.Since(start).Seconds()
		status := strconv.Itoa(c.Writer.Status())
		method := c.Request.Method
		path := c.FullPath() // Use FullPath to avoid exploding cardinality with dynamic IDs (e.g. /users/1 vs /users/:id)

		// Defaults in case FullPath is empty (e.g., 404s route not found)
		if path == "" {
			path = "unknown"
		}

		HttpRequestsTotal.WithLabelValues(method, status, path).Inc()
		HttpRequestDuration.WithLabelValues(method, path).Observe(duration)
	}
}
