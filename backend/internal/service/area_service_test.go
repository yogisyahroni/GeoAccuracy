package service

import (
	"context"
	"testing"
	"time"

	"geoaccuracy-backend/internal/domain"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

type mockAreaRepo struct {
	mock.Mock
}

func (m *mockAreaRepo) Create(ctx context.Context, area *domain.Area) error {
	args := m.Called(ctx, area)
	// Simulate DB filling in ID and Timestamps
	if args.Error(0) == nil {
		area.ID = uuid.New()
		area.CreatedAt = time.Now()
		area.UpdatedAt = time.Now()
	}
	return args.Error(0)
}

func (m *mockAreaRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.Area, error) {
	args := m.Called(ctx, id)
	var res *domain.Area
	if args.Get(0) != nil {
		res = args.Get(0).(*domain.Area)
	}
	return res, args.Error(1)
}

func (m *mockAreaRepo) ListAll(ctx context.Context) ([]domain.Area, error) {
	args := m.Called(ctx)
	var res []domain.Area
	if args.Get(0) != nil {
		res = args.Get(0).([]domain.Area)
	}
	return res, args.Error(1)
}

func (m *mockAreaRepo) Delete(ctx context.Context, id uuid.UUID) error {
	return m.Called(ctx, id).Error(0)
}

func (m *mockAreaRepo) CheckPointInArea(ctx context.Context, lat float64, lng float64) ([]domain.Area, error) {
	args := m.Called(ctx, lat, lng)
	var res []domain.Area
	if args.Get(0) != nil {
		res = args.Get(0).([]domain.Area)
	}
	return res, args.Error(1)
}

func TestCreateArea_Success(t *testing.T) {
	mockRepo := new(mockAreaRepo)
	svc := NewAreaService(mockRepo)

	validGeoJSON := map[string]interface{}{
		"type": "Polygon",
		"coordinates": [][][]float64{
			{{106.8, -6.2}, {106.9, -6.2}, {106.9, -6.3}, {106.8, -6.3}, {106.8, -6.2}},
		},
	}

	req := &domain.CreateAreaRequest{
		Name:        "Test Area",
		Description: "A test polygon",
		GeoJSON:     validGeoJSON,
	}

	mockRepo.On("Create", mock.Anything, mock.AnythingOfType("*domain.Area")).Return(nil)

	area, err := svc.CreateArea(context.Background(), req)

	assert.NoError(t, err)
	assert.NotNil(t, area)
	assert.Equal(t, req.Name, area.Name)
	assert.Equal(t, req.Description, area.Description)
	assert.NotEqual(t, uuid.Nil, area.ID)
	mockRepo.AssertExpectations(t)
}

func TestCreateArea_InvalidGeometryType(t *testing.T) {
	mockRepo := new(mockAreaRepo)
	svc := NewAreaService(mockRepo)

	invalidGeoJSON := map[string]interface{}{
		"type":        "Point", // Only Polygons are allowed via our service logic wrapper
		"coordinates": []float64{106.8, -6.2},
	}

	req := &domain.CreateAreaRequest{
		Name:    "Invalid Area",
		GeoJSON: invalidGeoJSON,
	}

	// Should fail before hitting the repo
	area, err := svc.CreateArea(context.Background(), req)

	assert.Error(t, err)
	assert.Nil(t, area)
	assert.Contains(t, err.Error(), "invalid geometry type")
	mockRepo.AssertNotCalled(t, "Create")
}

func TestCreateArea_InvalidJSONStructure(t *testing.T) {
	mockRepo := new(mockAreaRepo)
	svc := NewAreaService(mockRepo)

	req := &domain.CreateAreaRequest{
		Name:    "Invalid Area",
		GeoJSON: "not-a-map",
	}

	area, err := svc.CreateArea(context.Background(), req)

	assert.Error(t, err)
	assert.Nil(t, area)
	assert.Contains(t, err.Error(), "could not parse geojson structure")
	mockRepo.AssertNotCalled(t, "Create")
}

func TestCheckPointInArea(t *testing.T) {
	mockRepo := new(mockAreaRepo)
	svc := NewAreaService(mockRepo)

	expectedAreas := []domain.Area{
		{ID: uuid.New(), Name: "Jakarta Central"},
	}

	lat, lng := -6.2088, 106.8456
	mockRepo.On("CheckPointInArea", mock.Anything, lat, lng).Return(expectedAreas, nil)

	areas, err := svc.GetAreasContainingPoint(context.Background(), lat, lng)

	assert.NoError(t, err)
	assert.Len(t, areas, 1)
	assert.Equal(t, "Jakarta Central", areas[0].Name)
	mockRepo.AssertExpectations(t)
}
