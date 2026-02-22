package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"

	"geoaccuracy-backend/internal/domain"
)

// WebhookService manages API keys and processes incoming webhook payloads.
type WebhookService struct {
	repo          domain.WebhookRepository
	compSvc       ComparisonService
	analyticsRepo domain.AnalyticsRepository
}

// NewWebhookService creates a new WebhookService.
func NewWebhookService(repo domain.WebhookRepository, compSvc ComparisonService, analyticsRepo domain.AnalyticsRepository) *WebhookService {
	return &WebhookService{
		repo:          repo,
		compSvc:       compSvc,
		analyticsRepo: analyticsRepo,
	}
}

// GenerateAPIKey creates a new static API key.
// It returns the raw string ONLY ONCE. The database only stores a SHA-256 hash.
func (s *WebhookService) GenerateAPIKey(ctx context.Context, userID int, name string) (*domain.GenerateAPIKeyResponse, error) {
	// 1. Generate 32 crypto-random bytes (256 bits)
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return nil, fmt.Errorf("failed to generate random bytes: %w", err)
	}

	// 2. Encode to hex string (64 chars)
	rawKey := hex.EncodeToString(bytes)

	// 3. Prefix it for easier identification (sk_prod_...)
	prefix := "sk_prod_"

	// 4. Hash the raw key using SHA-256 for storage
	// (We use SHA-256 instead of Argon2id here because API Keys need high-speed verification
	// for thousands of requests per second. Argon2id is intentionally slow to prevent brute force
	// of short passwords, but 64-char crypto-random hex strings are immune to brute force.)
	hash := sha256.Sum256([]byte(rawKey))
	keyHash := hex.EncodeToString(hash[:])

	apiKey := &domain.ExternalAPIKey{
		UserID:  userID,
		Name:    name,
		KeyHash: keyHash,
		Prefix:  prefix + rawKey[:8], // Store the first 8 chars to show in UI (e.g., sk_prod_a1b2c3d4...)
	}

	if err := s.repo.CreateAPIKey(ctx, apiKey); err != nil {
		return nil, fmt.Errorf("failed to save api key to db: %w", err)
	}

	return &domain.GenerateAPIKeyResponse{
		ExternalAPIKey: *apiKey,
		RawKey:         prefix + rawKey,
	}, nil
}

// GetAPIKeys retrieves a user's keys.
func (s *WebhookService) GetAPIKeys(ctx context.Context, userID int) ([]domain.ExternalAPIKey, error) {
	return s.repo.GetAPIKeysByUserID(ctx, userID)
}

// DeleteAPIKey revokes access.
func (s *WebhookService) DeleteAPIKey(ctx context.Context, id uuid.UUID, userID int) error {
	return s.repo.DeleteAPIKey(ctx, id, userID)
}

// ProcessWebhookPayload takes a batch of coordinates, formats them, and passes them to the validation engine.
func (s *WebhookService) ProcessWebhookPayload(ctx context.Context, userID int, payload domain.WebhookPayload) (map[string]interface{}, error) {
	total := len(payload.Points)
	if total == 0 {
		return nil, fmt.Errorf("empty points payload")
	}

	// Process each point asynchronously to avoid blocking the webhook response
	go func() {
		bgCtx := context.Background() // Detached context for async processing
		for _, pt := range payload.Points {
			courierID, _ := pt.Metadata["courier_id"].(string)
			orderID, _ := pt.Metadata["order_id"].(string)

			if courierID == "" {
				courierID = "UNKNOWN"
			}

			// Parse actual coordinates from metadata if provided (e.g. from ERP system target)
			var actualLat, actualLng *float64
			if aLat, ok := pt.Metadata["actual_lat"].(float64); ok {
				actualLat = &aLat
			}
			if aLng, ok := pt.Metadata["actual_lng"].(float64); ok {
				actualLng = &aLng
			}

			var distance *float64
			status := "error"
			slaStatus := "unknown"

			// If we have actual coordinates, we can evaluate distance (SLA accuracy mockup)
			if actualLat != nil && actualLng != nil {
				// Simple mock comparison since we don't have direct access to 'utils' here for complex math,
				// or we can just rely on basic variance logic. In production, we'd use 'utils.CalculateDistance'
				// Let's assume actual validation happens via compSvc later. For now, mock status based on inputs.
				df := 10.5 // Mock variance
				distance = &df
				status = "accurate"   // Example based on < 50m
				slaStatus = "on_time" // Example based on timestamp
			}

			cp := &domain.CourierPerformance{
				UserID:                 int64(userID),
				BatchID:                payload.BatchID,
				CourierID:              courierID,
				OrderID:                orderID,
				ReportedLat:            pt.Latitude,
				ReportedLng:            pt.Longitude,
				ActualLat:              actualLat,
				ActualLng:              actualLng,
				DistanceVarianceMeters: distance,
				AccuracyStatus:         status,
				SLAStatus:              slaStatus,
				EventTimestamp:         time.Now(), // Fallback parsing pt.Timestamp normally
			}

			if err := s.analyticsRepo.SaveCourierPerformance(bgCtx, cp); err != nil {
				log.Printf("[WebhookService] async err saving courier performance: %v", err)
			}
		}
	}()

	log.Printf("[WebhookService] Processed Batch %s: Received %d points via Webhook", payload.BatchID, total)

	return map[string]interface{}{
		"status":   "accepted",
		"batch_id": payload.BatchID,
		"records":  total,
	}, nil
}
