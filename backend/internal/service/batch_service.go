package service

import (
	"context"
	"geoaccuracy-backend/internal/domain"
	"geoaccuracy-backend/pkg/utils"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
)

type batchService struct {
	batchRepo      domain.BatchRepository
	geoService     GeocodeService
	historyService *HistoryService
	analyticsRepo  domain.AnalyticsRepository // for courier_performance population
}

func NewBatchService(repo domain.BatchRepository, geoService GeocodeService, historySvc *HistoryService, analyticsRepo domain.AnalyticsRepository) domain.BatchService {
	return &batchService{
		batchRepo:      repo,
		geoService:     geoService,
		historyService: historySvc,
		analyticsRepo:  analyticsRepo,
	}
}

func (s *batchService) CreateBatch(ctx context.Context, userID int64, name string) (*domain.Batch, error) {
	batch := &domain.Batch{
		UserID: userID,
		Name:   name,
		Status: domain.BatchStatusDraft,
	}
	err := s.batchRepo.CreateBatch(ctx, batch)
	if err != nil {
		return nil, err
	}
	return batch, nil
}

func (s *batchService) GetBatch(ctx context.Context, id uuid.UUID) (*domain.Batch, error) {
	return s.batchRepo.GetBatchByID(ctx, id)
}

func (s *batchService) ListUserBatches(ctx context.Context, userID int64) ([]domain.Batch, error) {
	return s.batchRepo.GetBatchesByUserID(ctx, userID)
}

func (s *batchService) UploadSystemData(ctx context.Context, batchID uuid.UUID, records []domain.SystemRecord) error {
	var items []domain.BatchItem
	for _, rec := range records {
		items = append(items, domain.BatchItem{
			BatchID:       batchID,
			Connote:       rec.Connote,
			RecipientName: rec.RecipientName,
			SystemAddress: rec.SystemAddress,
			GeocodeStatus: "pending",
		})
	}
	return s.batchRepo.UpsertBatchItems(ctx, items)
}

func (s *batchService) UploadFieldData(ctx context.Context, batchID uuid.UUID, records []domain.FieldRecord) error {
	var items []domain.BatchItem
	for _, rec := range records {
		lat := rec.FieldLat
		lng := rec.FieldLng

		items = append(items, domain.BatchItem{
			BatchID:   batchID,
			Connote:   rec.Connote,
			FieldLat:  &lat,
			FieldLng:  &lng,
			CourierID: rec.ReportedBy, // persist courier identifier from CSV
		})
	}
	return s.batchRepo.UpsertBatchItems(ctx, items)
}

func (s *batchService) ProcessBatch(ctx context.Context, userID int64, batchID uuid.UUID) error {
	err := s.batchRepo.UpdateBatchStatus(ctx, batchID, domain.BatchStatusProcessing)
	if err != nil {
		return err
	}

	items, err := s.batchRepo.GetBatchItemsByBatchID(ctx, batchID)
	if err != nil {
		s.batchRepo.UpdateBatchStatus(ctx, batchID, domain.BatchStatusFailed)
		return err
	}

	var results []domain.ValidationResult
	var updatedItems []domain.BatchItem
	var courierEvents []domain.CourierPerformance

	// IN-MEMORY CACHE FOR BATCH (Best practice for thousands of identical addresses)
	memCache := make(map[string]*domain.GeocodeResponse)

	for _, item := range items {
		if item.SystemAddress == "" {
			continue
		}

		normalizeAddr := strings.ToLower(strings.TrimSpace(item.SystemAddress))
		var geoRes *domain.GeocodeResponse
		var geoErr error

		if cachedRes, ok := memCache[normalizeAddr]; ok {
			geoRes = cachedRes
		} else {
			geoRes, geoErr = s.geoService.GeocodeAddress(ctx, int(userID), item.SystemAddress)
			if geoErr == nil {
				memCache[normalizeAddr] = geoRes
			}
		}

		outItem := domain.BatchItem{
			ID:        item.ID,
			BatchID:   item.BatchID,
			Connote:   item.Connote,
			CourierID: item.CourierID,
		}

		if geoErr != nil {
			outItem.Error = geoErr.Error()
			outItem.GeocodeStatus = "failed"

			// Still record the courier event as an error
			if item.CourierID != "" && s.analyticsRepo != nil {
				dist := 0.0
				courierEvents = append(courierEvents, domain.CourierPerformance{
					UserID:                 userID,
					BatchID:                batchID.String(),
					CourierID:              item.CourierID,
					OrderID:                item.Connote,
					ReportedLat:            safeFloat(item.FieldLat),
					ReportedLng:            safeFloat(item.FieldLng),
					DistanceVarianceMeters: &dist,
					AccuracyStatus:         "error",
					SLAStatus:              "unknown",
					EventTimestamp:         time.Now(),
				})
			}
		} else {
			sysLat := geoRes.Lat
			sysLng := geoRes.Lng
			outItem.SystemLat = &sysLat
			outItem.SystemLng = &sysLng
			outItem.GeocodeStatus = "completed"

			if item.FieldLat != nil && item.FieldLng != nil {
				dist := utils.CalculateDistance(sysLat, sysLng, *item.FieldLat, *item.FieldLng)
				accuracy := utils.EvaluateAccuracy(dist)

				outItem.DistanceKm = &dist
				outItem.AccuracyLevel = accuracy

				results = append(results, domain.ValidationResult{
					SystemAddress: item.SystemAddress,
					GeoLat:        sysLat,
					GeoLng:        sysLng,
					FieldLat:      *item.FieldLat,
					FieldLng:      *item.FieldLng,
					DistanceKm:    dist,
					AccuracyLevel: accuracy,
					Provider:      geoRes.Provider,
				})

				// Build courier performance event if courier is identified
				if item.CourierID != "" && s.analyticsRepo != nil {
					distMeters := dist * 1000
					slaStatus := "on_time" // default — extend later with delivery date logic
					courierEvents = append(courierEvents, domain.CourierPerformance{
						UserID:                 userID,
						BatchID:                batchID.String(),
						CourierID:              item.CourierID,
						OrderID:                item.Connote,
						ReportedLat:            *item.FieldLat,
						ReportedLng:            *item.FieldLng,
						ActualLat:              &sysLat,
						ActualLng:              &sysLng,
						DistanceVarianceMeters: &distMeters,
						AccuracyStatus:         accuracy,
						SLAStatus:              slaStatus,
						EventTimestamp:         time.Now(),
					})
				}
			}
		}

		updatedItems = append(updatedItems, outItem)
	}

	if err := s.batchRepo.UpsertBatchItems(ctx, updatedItems); err != nil {
		s.batchRepo.UpdateBatchStatus(ctx, batchID, domain.BatchStatusFailed)
		return err
	}

	s.batchRepo.UpdateBatchStatus(ctx, batchID, domain.BatchStatusCompleted)

	// Async: save history session AND courier performance events
	go func() {
		session := buildSession(int(userID), results)
		if err := s.historyService.SaveSession(session); err != nil {
			log.Printf("WARN: failed to save comparison session for batch %v: %v", batchID, err)
		}

		if s.analyticsRepo != nil {
			for _, event := range courierEvents {
				ev := event // copy for goroutine safety
				if err := s.analyticsRepo.SaveCourierPerformance(context.Background(), &ev); err != nil {
					log.Printf("WARN: failed to save courier performance for %s/%s: %v", ev.CourierID, ev.OrderID, err)
				}
			}
			log.Printf("INFO: saved %d courier performance events for batch %v", len(courierEvents), batchID)
		}
	}()

	return nil
}

// safeFloat extracts value from *float64, returning 0 if nil.
func safeFloat(f *float64) float64 {
	if f == nil {
		return 0
	}
	return *f
}

func (s *batchService) GetBatchResults(ctx context.Context, batchID uuid.UUID) ([]domain.BatchItem, error) {
	return s.batchRepo.GetBatchItemsByBatchID(ctx, batchID)
}

// UpsertETLItems bulk-inserts ETL-derived BatchItems so they appear in the Dashboard
// alongside CSV-upload batches. Called after RunPipeline finishes streaming.
func (s *batchService) UpsertETLItems(ctx context.Context, batchID uuid.UUID, items []domain.BatchItem) error {
	return s.batchRepo.UpsertBatchItems(ctx, items)
}

// MarkBatchCompleted transitions an ETL batch to the completed state so the
// Dashboard's loadLatestBatch() will pick it up.
func (s *batchService) MarkBatchCompleted(ctx context.Context, batchID uuid.UUID) error {
	return s.batchRepo.UpdateBatchStatus(ctx, batchID, domain.BatchStatusCompleted)
}
