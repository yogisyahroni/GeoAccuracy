package service

import (
	"context"
	"geoaccuracy-backend/internal/domain"
	"geoaccuracy-backend/pkg/utils"
	"log"
	"strings"

	"github.com/google/uuid"
)

type batchService struct {
	batchRepo      domain.BatchRepository
	geoService     GeocodeService
	historyService *HistoryService
}

func NewBatchService(repo domain.BatchRepository, geoService GeocodeService, historySvc *HistoryService) domain.BatchService {
	return &batchService{
		batchRepo:      repo,
		geoService:     geoService,
		historyService: historySvc,
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

		// Create a copy to take pointer addresses
		lat := rec.FieldLat
		lng := rec.FieldLng

		items = append(items, domain.BatchItem{
			BatchID:  batchID,
			Connote:  rec.Connote,
			FieldLat: &lat,
			FieldLng: &lng,
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

	// IN-MEMORY CACHE FOR BATCH (Best practice for thousands of identical addresses)
	memCache := make(map[string]*domain.GeocodeResponse)

	for _, item := range items {
		if item.SystemAddress == "" {
			continue
		}

		normalizeAddr := strings.ToLower(strings.TrimSpace(item.SystemAddress))
		var geoRes *domain.GeocodeResponse
		var err error

		if cachedRes, ok := memCache[normalizeAddr]; ok {
			geoRes = cachedRes
		} else {
			geoRes, err = s.geoService.GeocodeAddress(ctx, int(userID), item.SystemAddress)
			if err == nil {
				memCache[normalizeAddr] = geoRes
			}
		}

		var outItem = domain.BatchItem{
			ID:      item.ID,
			BatchID: item.BatchID,
			Connote: item.Connote,
		}

		if err != nil {
			outItem.Error = err.Error()
			outItem.GeocodeStatus = "failed"
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
			}
		}

		updatedItems = append(updatedItems, outItem)
	}

	if err := s.batchRepo.UpsertBatchItems(ctx, updatedItems); err != nil {
		s.batchRepo.UpdateBatchStatus(ctx, batchID, domain.BatchStatusFailed)
		return err
	}

	s.batchRepo.UpdateBatchStatus(ctx, batchID, domain.BatchStatusCompleted)

	go func() {
		session := buildSession(int(userID), results)
		if err := s.historyService.SaveSession(session); err != nil {
			log.Printf("WARN: failed to save comparison session for batch %v: %v", batchID, err)
		}
	}()

	return nil
}

func (s *batchService) GetBatchResults(ctx context.Context, batchID uuid.UUID) ([]domain.BatchItem, error) {
	return s.batchRepo.GetBatchItemsByBatchID(ctx, batchID)
}
