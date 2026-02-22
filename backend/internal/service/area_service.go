package service

import (
	"context"
	"encoding/json"
	"fmt"
	"geoaccuracy-backend/internal/domain"
	"geoaccuracy-backend/internal/repository"

	"github.com/google/uuid"
)

type AreaService interface {
	CreateArea(ctx context.Context, req *domain.CreateAreaRequest) (*domain.Area, error)
	GetAreaByID(ctx context.Context, id uuid.UUID) (*domain.Area, error)
	ListAreas(ctx context.Context) ([]domain.Area, error)
	DeleteArea(ctx context.Context, id uuid.UUID) error
	GetAreasContainingPoint(ctx context.Context, lat float64, lng float64) ([]domain.Area, error)
}

type areaService struct {
	areaRepo repository.AreaRepository
}

func NewAreaService(areaRepo repository.AreaRepository) AreaService {
	return &areaService{
		areaRepo: areaRepo,
	}
}

func (s *areaService) CreateArea(ctx context.Context, req *domain.CreateAreaRequest) (*domain.Area, error) {
	// Validate that GeoJSON is somewhat structurally sound
	geoJSONBytes, err := json.Marshal(req.GeoJSON)
	if err != nil {
		return nil, fmt.Errorf("invalid geojson payload: %w", err)
	}

	// Basic check: Ensure it has proper GeoJSON geometry types (Polygon or MultiPolygon for Area)
	var geo map[string]interface{}
	if err := json.Unmarshal(geoJSONBytes, &geo); err != nil {
		return nil, fmt.Errorf("could not parse geojson structure: %w", err)
	}

	geomType, ok := geo["type"].(string)
	if !ok || (geomType != "Polygon" && geomType != "MultiPolygon" && geomType != "Feature" && geomType != "FeatureCollection") {
		return nil, fmt.Errorf("invalid geometry type: only Polygon, MultiPolygon, Feature, or FeatureCollection allowed")
	}

	area := &domain.Area{
		Name:        req.Name,
		Description: req.Description,
		GeoJSON:     req.GeoJSON,
	}

	if err := s.areaRepo.Create(ctx, area); err != nil {
		return nil, fmt.Errorf("repository error: %w", err)
	}

	return area, nil
}

func (s *areaService) GetAreaByID(ctx context.Context, id uuid.UUID) (*domain.Area, error) {
	return s.areaRepo.GetByID(ctx, id)
}

func (s *areaService) ListAreas(ctx context.Context) ([]domain.Area, error) {
	return s.areaRepo.ListAll(ctx)
}

func (s *areaService) DeleteArea(ctx context.Context, id uuid.UUID) error {
	return s.areaRepo.Delete(ctx, id)
}

func (s *areaService) GetAreasContainingPoint(ctx context.Context, lat float64, lng float64) ([]domain.Area, error) {
	return s.areaRepo.CheckPointInArea(ctx, lat, lng)
}
