package api

import (
	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"geoaccuracy-backend/config"
	"geoaccuracy-backend/internal/api/handlers"
	"geoaccuracy-backend/internal/api/middleware"
	"geoaccuracy-backend/internal/domain"
)

func SetupRouter(
	cfg *config.Config,
	authHandler *handlers.AuthHandler,
	geoHandler *handlers.GeocodeHandler,
	compHandler *handlers.ComparisonHandler,
	settingsHandler *handlers.SettingsHandler,
	historyHandler *handlers.HistoryHandler,
	dsHandler *handlers.DataSourceHandler,
	areaHandler *handlers.AreaHandler,
	webhookHandler *handlers.WebhookHandler,
	analyticsHandler *handlers.AnalyticsHandler,
	erpHandler *handlers.ErpIntegrationHandler,
	webhookRepo domain.WebhookRepository,
) *gin.Engine {

	if cfg.AppEnv == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()

	// Global middleware
	r.Use(middleware.SecurityHeaders())
	r.Use(middleware.CORSMiddleware())
	r.Use(middleware.MetricsMiddleware()) // Apply Prometheus metrics tracking

	// Health check (public)
	r.GET("/api/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "version": "2.0.0"})
	})

	// Prometheus metrics endpoint (public or internal port)
	r.GET("/metrics", gin.WrapH(promhttp.Handler()))

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
			// ── Read-Only Access (All Authenticated: admin, editor, observer) ──
			protected.GET("/history", historyHandler.ListSessions)
			protected.GET("/analytics", historyHandler.GetAnalytics)
			protected.GET("/advanced-analytics/couriers", analyticsHandler.GetCourierLeaderboard)
			protected.GET("/advanced-analytics/sla", analyticsHandler.GetSLATrends)

			protected.GET("/datasources", dsHandler.List)
			protected.GET("/datasources/:id/schema", dsHandler.GetSchema)
			protected.GET("/datasources/:id/pipelines", dsHandler.ListPipelines)

			protected.GET("/areas", areaHandler.ListAreas)
			protected.GET("/areas/check", areaHandler.CheckPointInArea)
			protected.GET("/areas/:id", areaHandler.GetArea)

			// ── Editor & Admin Access (Operational Mutations) ──
			editorGroup := protected.Group("/")
			editorGroup.Use(middleware.RequireRole("admin", "editor"))
			{
				editorGroup.POST("/geocode", geoHandler.Geocode) // Integrasi Database & Pipa Proses
				editorGroup.POST("/compare", compHandler.ValidateBatch)

				editorGroup.POST("/datasources", dsHandler.Create)
				editorGroup.POST("/datasources/test", dsHandler.TestConnection)
				editorGroup.POST("/pipelines", dsHandler.SavePipeline)
				editorGroup.DELETE("/pipelines/:id", dsHandler.DeletePipeline)
				editorGroup.POST("/pipelines/:id/run", dsHandler.RunPipeline)

				// Integrasi ERP API Outbound (Cron-based Push/Pull)
				editorGroup.POST("/erp-integrations", erpHandler.Create)
				editorGroup.GET("/erp-integrations", erpHandler.List)
				editorGroup.PUT("/erp-integrations/:id", erpHandler.Update)
				editorGroup.DELETE("/erp-integrations/:id", erpHandler.Delete)
				editorGroup.POST("/erp-integrations/:id/sync", erpHandler.ManualSync)

				editorGroup.POST("/areas", areaHandler.CreateArea)
				editorGroup.DELETE("/areas/:id", areaHandler.DeleteArea)
			}

			// ── Admin Only Access (Global Settings) ──
			adminGroup := protected.Group("/")
			adminGroup.Use(middleware.RequireRole("admin"))
			{
				// Internal Global API Keys
				adminGroup.GET("/settings", settingsHandler.GetSettings)
				adminGroup.PUT("/settings/keys", settingsHandler.UpdateSettings)
				adminGroup.POST("/settings/keys/test", settingsHandler.TestProviderKey)

				// External Ingestion API Keys (Webhooks)
				adminGroup.GET("/settings/api-keys", webhookHandler.ListAPIKeys)
				adminGroup.POST("/settings/api-keys", webhookHandler.GenerateAPIKey)
				adminGroup.DELETE("/settings/api-keys/:id", webhookHandler.RevokeAPIKey)
			}
		}

		// ── Webhook Ingestion (API Key Auth) ───────────────────────────
		ext := api.Group("/webhooks")
		ext.Use(middleware.APIKeyAuthMiddleware(webhookRepo))
		{
			ext.POST("/ingest", webhookHandler.IngestData)
		}
	}

	return r
}
