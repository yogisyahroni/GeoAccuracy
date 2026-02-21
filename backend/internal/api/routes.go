package api

import (
	"github.com/gin-gonic/gin"

	"geoaccuracy-backend/config"
	"geoaccuracy-backend/internal/api/handlers"
	"geoaccuracy-backend/internal/api/middleware"
)

func SetupRouter(
	cfg *config.Config,
	authHandler *handlers.AuthHandler,
	geoHandler *handlers.GeocodeHandler,
	compHandler *handlers.ComparisonHandler,
	settingsHandler *handlers.SettingsHandler,
	historyHandler *handlers.HistoryHandler,
	dsHandler *handlers.DataSourceHandler,
) *gin.Engine {

	if cfg.AppEnv == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()

	// Global middleware
	r.Use(middleware.SecurityHeaders())
	r.Use(middleware.CORSMiddleware())

	// Health check (public)
	r.GET("/api/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "version": "2.0.0"})
	})

	api := r.Group("/api")
	{
		// ── Public ────────────────────────────────────────────────────────
		auth := api.Group("/auth")
		{
			auth.POST("/register", authHandler.Register)
			auth.POST("/login", authHandler.Login)
		}

		// ── Protected (JWT required) ───────────────────────────────────
		protected := api.Group("/")
		protected.Use(middleware.AuthMiddleware(cfg))
		{
			// Geocoding & comparison
			protected.POST("/geocode", geoHandler.Geocode)
			protected.POST("/compare", compHandler.ValidateBatch)

			// Settings (API keys)
			protected.GET("/settings", settingsHandler.GetSettings)
			protected.PUT("/settings/keys", settingsHandler.UpdateSettings)
			protected.POST("/settings/keys/test", settingsHandler.TestProviderKey)

			// History & Analytics
			protected.GET("/history", historyHandler.ListSessions)
			protected.GET("/analytics", historyHandler.GetAnalytics)

			// Data Sources & Pipelines
			protected.POST("/datasources", dsHandler.Create)
			protected.POST("/datasources/test", dsHandler.TestConnection)
			protected.GET("/datasources", dsHandler.List)
			protected.GET("/datasources/:id/schema", dsHandler.GetSchema)
			protected.POST("/pipelines/preview", dsHandler.PreviewPipeline)
			protected.POST("/pipelines/run", dsHandler.RunPipeline)
			protected.POST("/pipelines", dsHandler.SavePipeline)
			protected.GET("/datasources/:id/pipelines", dsHandler.ListPipelines)
			protected.DELETE("/pipelines/:id", dsHandler.DeletePipeline)
		}
	}

	return r
}
