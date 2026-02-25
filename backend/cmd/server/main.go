package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jmoiron/sqlx"

	"geoaccuracy-backend/config"
	"geoaccuracy-backend/internal/api"
	"geoaccuracy-backend/internal/api/handlers"
	"geoaccuracy-backend/internal/db"
	"geoaccuracy-backend/internal/repository"
	"geoaccuracy-backend/internal/service"
)

func main() {
	// 1. Load Configuration
	cfg := config.LoadConfig()

	// 2. Connect to Database (PostgreSQL)
	database, err := db.ConnectPostgres(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer database.Close()
	log.Println("Connected to PostgreSQL successfully")

	// 3. Setup Repositories
	userRepo := repository.NewUserRepository(database)
	geoRepo := repository.NewGeocodeRepository(database)
	settingsRepo := repository.NewSettingsRepository(database)
	historyRepo := repository.NewHistoryRepository(database)
	dsRepo := repository.NewDataSourceRepository(database)
	areaRepo := repository.NewAreaRepository(database)
	webhookRepo := repository.NewWebhookRepository(database)
	batchRepo := repository.NewBatchRepository(database)

	sqlxDB := sqlx.NewDb(database, "postgres")
	analyticsRepo := repository.NewAnalyticsRepository(sqlxDB)

	// 4. Setup Services
	authSvc := service.NewAuthService(userRepo, cfg)
	geoSvc := service.NewGeocodeService(geoRepo, settingsRepo)
	historySvc := service.NewHistoryService(historyRepo)
	compSvc := service.NewComparisonService(geoSvc, historySvc)
	batchSvc := service.NewBatchService(batchRepo, geoSvc, historySvc)
	settingsSvc := service.NewSettingsService(settingsRepo)
	dsSvc := service.NewDataSourceService(dsRepo, cfg)
	etlSvc := service.NewETLService(dsRepo, cfg)

	// Create Webhook and ERP services before Scheduler
	webhookSvc := service.NewWebhookService(webhookRepo, compSvc, analyticsRepo)
	erpRepo := repository.NewErpIntegrationRepository(sqlxDB)
	erpSvc := service.NewErpIntegrationService(erpRepo, cfg, webhookSvc)

	// Now Scheduler can accept all dependencies including ERP
	schedulerSvc := service.NewSchedulerService(dsSvc, etlSvc, compSvc, erpSvc)
	areaSvc := service.NewAreaService(areaRepo)

	// Start scheduler and load active jobs
	schedulerSvc.Start()
	if err := schedulerSvc.ReloadPipelines(context.Background()); err != nil {
		log.Printf("Warning: Failed to load scheduled pipelines: %v", err)
	}
	if err := schedulerSvc.ReloadErpIntegrations(context.Background()); err != nil {
		log.Printf("Warning: Failed to load scheduled ERP Syncs: %v", err)
	}
	defer schedulerSvc.Stop()

	// 5. Setup Handlers
	authHandler := handlers.NewAuthHandler(authSvc)
	geoHandler := handlers.NewGeocodeHandler(geoSvc)
	compHandler := handlers.NewComparisonHandler(compSvc)
	settingsHandler := handlers.NewSettingsHandler(settingsSvc)
	historyHandler := handlers.NewHistoryHandler(historySvc)
	dsHandler := handlers.NewDataSourceHandler(dsSvc, etlSvc, compSvc, schedulerSvc)
	areaHandler := handlers.NewAreaHandler(areaSvc)
	webhookHandler := handlers.NewWebhookHandler(webhookSvc)
	analyticsHandler := handlers.NewAnalyticsHandler(analyticsRepo)
	erpHandler := handlers.NewErpIntegrationHandler(erpSvc)
	batchHandler := handlers.NewBatchHandler(batchSvc)

	// 6. Setup Router
	router := api.SetupRouter(cfg, authHandler, geoHandler, compHandler, settingsHandler, historyHandler, dsHandler, areaHandler, webhookHandler, analyticsHandler, erpHandler, batchHandler, webhookRepo)

	// 7. Start Server with Graceful Shutdown
	srv := &http.Server{
		Addr:         ":" + cfg.AppPort,
		Handler:      router,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Printf("Starting server on port %s in %s mode\n", cfg.AppPort, cfg.AppEnv)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %s\n", err)
		}
	}()

	// Wait for interrupt signal to gracefully shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal("Server forced to shutdown:", err)
	}

	log.Println("Server exiting")
}
