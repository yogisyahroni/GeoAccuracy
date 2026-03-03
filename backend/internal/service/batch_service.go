package service

import (
	"context"
	"errors"
	"geoaccuracy-backend/internal/domain"
	"geoaccuracy-backend/pkg/utils"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"

	ws "geoaccuracy-backend/internal/websocket"
)

// errAccessDenied is returned when the authenticated user does not own the requested batch.
var errAccessDenied = errors.New("batch not found or access denied")

type batchService struct {
	batchRepo      domain.BatchRepository
	geoService     GeocodeService
	historyService *HistoryService
	analyticsRepo  domain.AnalyticsRepository // for courier_performance population
	hub            *ws.Hub
}

func NewBatchService(repo domain.BatchRepository, geoService GeocodeService, historySvc *HistoryService, analyticsRepo domain.AnalyticsRepository, hub *ws.Hub) domain.BatchService {
	return &batchService{
		batchRepo:      repo,
		geoService:     geoService,
		historyService: historySvc,
		analyticsRepo:  analyticsRepo,
		hub:            hub,
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

// verifyBatchOwnership fetches the batch and confirms it belongs to userID.
// Returns errAccessDenied if the batch is missing or owned by another user.
func (s *batchService) verifyBatchOwnership(ctx context.Context, batchID uuid.UUID, userID int64) error {
	batch, err := s.batchRepo.GetBatchByID(ctx, batchID)
	if err != nil {
		return err
	}
	if batch == nil || batch.UserID != userID {
		return errAccessDenied
	}
	return nil
}

// UploadSystemData validates batch ownership then bulk-inserts/updates system records.
func (s *batchService) UploadSystemData(ctx context.Context, userID int64, batchID uuid.UUID, records []domain.SystemRecord) error {
	// FIX BUG-03: verify the batch belongs to this user before allowing writes.
	if err := s.verifyBatchOwnership(ctx, batchID, userID); err != nil {
		return err
	}
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

// UploadFieldData validates batch ownership then stores field GPS records.
func (s *batchService) UploadFieldData(ctx context.Context, userID int64, batchID uuid.UUID, records []domain.FieldRecord) error {
	// FIX BUG-03: verify the batch belongs to this user before allowing writes.
	if err := s.verifyBatchOwnership(ctx, batchID, userID); err != nil {
		return err
	}
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
	// FIX BUG-03: verify the batch belongs to this user before allowing processing.
	if err := s.verifyBatchOwnership(ctx, batchID, userID); err != nil {
		return err
	}

	err := s.batchRepo.UpdateBatchStatus(ctx, batchID, domain.BatchStatusProcessing)
	if err != nil {
		return err
	}

	// Run processing asynchronously so HTTP request can return immediately
	go func() {
		// Create a separate background context so HTTP cancellation doesn't stop processing
		bgCtx := context.Background()

		items, err := s.batchRepo.GetBatchItemsByBatchID(bgCtx, batchID)
		if err != nil {
			s.batchRepo.UpdateBatchStatus(bgCtx, batchID, domain.BatchStatusFailed)
			if s.hub != nil {
				s.hub.Broadcast <- ws.Message{Type: "error", BatchID: batchID.String(), Payload: err.Error()}
			}
			return
		}

		total := len(items)
		var results []domain.ValidationResult
		var updatedItems []domain.BatchItem
		var courierEvents []domain.CourierPerformance

		// IN-MEMORY CACHE FOR BATCH (Best practice for thousands of identical addresses)
		memCache := make(map[string]*domain.GeocodeResponse)

		for i, item := range items {
			if item.SystemAddress == "" {
				s.emitProgress(batchID.String(), i+1, total)
				continue
			}

			normalizeAddr := strings.ToLower(strings.TrimSpace(item.SystemAddress))
			var geoRes *domain.GeocodeResponse
			var geoErr error

			if cachedRes, ok := memCache[normalizeAddr]; ok {
				geoRes = cachedRes
			} else {
				geoRes, geoErr = s.geoService.GeocodeAddress(bgCtx, int(userID), item.SystemAddress)
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

			// Emit progress immediately after processing this item
			s.emitProgress(batchID.String(), i+1, total)
		}

		// FIX BUG-05: Guard before UpsertBatchItems — if every item was skipped
		// (e.g. all system_address fields were empty), updatedItems is nil/empty.
		// While the repository already has an empty-slice guard at the SQL level,
		// calling UpsertBatchItems with zero items is a no-op that could still
		// mark the batch as "completed" with 0 actual results on disk.
		if len(updatedItems) == 0 {
			log.Printf("WARN: ProcessBatch batch=%v produced 0 updatedItems — all records were skipped", batchID)
			s.batchRepo.UpdateBatchStatus(bgCtx, batchID, domain.BatchStatusCompleted)
			if s.hub != nil {
				s.hub.Broadcast <- ws.Message{Type: "completed", BatchID: batchID.String(), Payload: "Batch completed (all records skipped due to empty addresses)"}
			}
			return
		}

		if err := s.batchRepo.UpsertBatchItems(bgCtx, updatedItems); err != nil {
			s.batchRepo.UpdateBatchStatus(bgCtx, batchID, domain.BatchStatusFailed)
			if s.hub != nil {
				s.hub.Broadcast <- ws.Message{Type: "error", BatchID: batchID.String(), Payload: "Database error during save"}
			}
			return
		}

		s.batchRepo.UpdateBatchStatus(bgCtx, batchID, domain.BatchStatusCompleted)
		if s.hub != nil {
			s.hub.Broadcast <- ws.Message{Type: "completed", BatchID: batchID.String(), Payload: "Batch processing completed successfully"}
		}

		// Save history session AND courier performance events
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

func (s *batchService) emitProgress(batchID string, processed, total int) {
	if s.hub == nil {
		return
	}
	s.hub.Broadcast <- ws.Message{
		BatchID: batchID,
		Type:    "progress",
		Payload: map[string]interface{}{
			"processed": processed,
			"total":     total,
		},
	}
}

// safeFloat extracts value from *float64, returning 0 if nil.
func safeFloat(f *float64) float64 {
	if f == nil {
		return 0
	}
	return *f
}

// GetBatchResults validates batch ownership then returns all items for that batch.
func (s *batchService) GetBatchResults(ctx context.Context, userID int64, batchID uuid.UUID) ([]domain.BatchItem, error) {
	// FIX BUG-03: verify the batch belongs to this user before returning results.
	if err := s.verifyBatchOwnership(ctx, batchID, userID); err != nil {
		return nil, err
	}
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
