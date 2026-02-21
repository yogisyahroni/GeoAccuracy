package service

import (
	"context"
	"log"

	"geoaccuracy-backend/internal/domain"
	"geoaccuracy-backend/pkg/utils"
)

type ComparisonService interface {
	ValidateBatch(ctx context.Context, userID int, req domain.BatchValidationRequest) (*domain.BatchValidationResponse, error)
	ValidateSingle(ctx context.Context, userID int, item domain.ValidationRequestItem) domain.ValidationResult
	SaveSession(session *domain.ComparisonSession) error
}

type comparisonService struct {
	geoService     GeocodeService
	historyService *HistoryService
}

// NewComparisonService creates a ComparisonService.
// historySvc is used to persist a summary after each batch completes.
func NewComparisonService(geoService GeocodeService, historySvc *HistoryService) ComparisonService {
	return &comparisonService{
		geoService:     geoService,
		historyService: historySvc,
	}
}

func (s *comparisonService) ValidateBatch(ctx context.Context, userID int, req domain.BatchValidationRequest) (*domain.BatchValidationResponse, error) {
	results := make([]domain.ValidationResult, 0, len(req.Items))

	for _, item := range req.Items {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		res := s.ValidateSingle(ctx, userID, item)
		results = append(results, res)
	}

	resp := &domain.BatchValidationResponse{Results: results}

	// Asynchronously persist a session summary (non-blocking, best-effort)
	go func() {
		session := buildSession(userID, results)
		if err := s.historyService.SaveSession(session); err != nil {
			log.Printf("WARN: failed to save comparison session: %v", err)
		}
	}()

	return resp, nil
}

func (s *comparisonService) SaveSession(session *domain.ComparisonSession) error {
	return s.historyService.SaveSession(session)
}

func (s *comparisonService) ValidateSingle(ctx context.Context, userID int, item domain.ValidationRequestItem) domain.ValidationResult {
	geoRes, err := s.geoService.GeocodeAddress(ctx, userID, item.SystemAddress)
	if err != nil {
		return domain.ValidationResult{
			ID:            item.ID,
			SystemAddress: item.SystemAddress,
			FieldLat:      item.FieldLat,
			FieldLng:      item.FieldLng,
			Error:         err.Error(),
		}
	}

	distance := utils.CalculateDistance(geoRes.Lat, geoRes.Lng, item.FieldLat, item.FieldLng)
	accuracy := utils.EvaluateAccuracy(distance)

	return domain.ValidationResult{
		ID:            item.ID,
		SystemAddress: item.SystemAddress,
		GeoLat:        geoRes.Lat,
		GeoLng:        geoRes.Lng,
		FieldLat:      item.FieldLat,
		FieldLng:      item.FieldLng,
		DistanceKm:    distance,
		AccuracyLevel: accuracy,
		Provider:      geoRes.Provider,
	}
}

// buildSession computes summary counts from validation results.
func buildSession(userID int, results []domain.ValidationResult) *domain.ComparisonSession {
	s := &domain.ComparisonSession{
		UserID:     userID,
		TotalCount: len(results),
	}
	for _, r := range results {
		if r.Error != "" {
			s.ErrorCount++
			continue
		}
		switch r.AccuracyLevel {
		case "accurate":
			s.AccurateCount++
		case "fairly_accurate":
			s.FairlyCount++
		case "inaccurate":
			s.InaccurateCount++
		default:
			s.ErrorCount++
		}
	}
	return s
}
