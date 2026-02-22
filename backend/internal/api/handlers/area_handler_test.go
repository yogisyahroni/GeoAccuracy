package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"

	"geoaccuracy-backend/internal/api/handlers"
	"geoaccuracy-backend/internal/domain"
	"geoaccuracy-backend/internal/service"
)

// mockAreaService implements the generic logic needed to simulate an AreaService.
type mockAreaService struct {
	mock.Mock
}

func (m *mockAreaService) CreateArea(ctx context.Context, req *domain.CreateAreaRequest) (*domain.Area, error) {
	args := m.Called(ctx, req)
	if args.Get(0) != nil {
		return args.Get(0).(*domain.Area), args.Error(1)
	}
	return nil, args.Error(1)
}

func (m *mockAreaService) GetAreaByID(ctx context.Context, id uuid.UUID) (*domain.Area, error) {
	args := m.Called(ctx, id)
	if args.Get(0) != nil {
		return args.Get(0).(*domain.Area), args.Error(1)
	}
	return nil, args.Error(1)
}

func (m *mockAreaService) ListAreas(ctx context.Context) ([]domain.Area, error) {
	args := m.Called(ctx)
	if args.Get(0) != nil {
		return args.Get(0).([]domain.Area), args.Error(1)
	}
	return nil, args.Error(1)
}

func (m *mockAreaService) DeleteArea(ctx context.Context, id uuid.UUID) error {
	return m.Called(ctx, id).Error(0)
}

func (m *mockAreaService) GetAreasContainingPoint(ctx context.Context, lat float64, lng float64) ([]domain.Area, error) {
	args := m.Called(ctx, lat, lng)
	if args.Get(0) != nil {
		return args.Get(0).([]domain.Area), args.Error(1)
	}
	return nil, args.Error(1)
}

func setupAreaRouter(areaSvc service.AreaService) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.Default()
	handler := handlers.NewAreaHandler(areaSvc)

	// Create simplified routes bypassing JWT for service-level abstraction tests
	router.POST("/api/areas", handler.CreateArea)
	router.GET("/api/areas", handler.ListAreas)
	router.GET("/api/areas/:id", handler.GetArea)
	router.DELETE("/api/areas/:id", handler.DeleteArea)
	router.GET("/api/areas/check", handler.CheckPointInArea)

	return router
}

func TestCreateAreaHandler_Success(t *testing.T) {
	mockSvc := new(mockAreaService)
	router := setupAreaRouter(mockSvc)

	reqPayload := domain.CreateAreaRequest{
		Name:        "Kota Bandung",
		Description: "Ibu kota Provinsi Jawa Barat",
		GeoJSON: map[string]interface{}{
			"type": "Polygon",
			"coordinates": [][][]float64{
				{{107.5, -6.9}, {107.6, -6.9}, {107.6, -7.0}, {107.5, -7.0}, {107.5, -6.9}},
			},
		},
	}

	expectedID := uuid.New()
	expectedRes := &domain.Area{
		ID:          expectedID,
		Name:        "Kota Bandung",
		Description: "Ibu kota Provinsi Jawa Barat",
	}

	mockSvc.On("CreateArea", mock.Anything, mock.AnythingOfType("*domain.CreateAreaRequest")).Return(expectedRes, nil)

	body, _ := json.Marshal(reqPayload)
	req, _ := http.NewRequest(http.MethodPost, "/api/areas", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)

	var res map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &res)
	assert.NoError(t, err)
	assert.Equal(t, "Kota Bandung", res["name"])

	mockSvc.AssertExpectations(t)
}

func TestListAreasHandler_Success(t *testing.T) {
	mockSvc := new(mockAreaService)
	router := setupAreaRouter(mockSvc)

	expectedRes := []domain.Area{
		{ID: uuid.New(), Name: "DKI Jakarta"},
		{ID: uuid.New(), Name: "Banten"},
	}

	mockSvc.On("ListAreas", mock.Anything).Return(expectedRes, nil)

	req, _ := http.NewRequest(http.MethodGet, "/api/areas", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var res []map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &res)
	assert.NoError(t, err)
	assert.Len(t, res, 2)
	assert.Equal(t, "DKI Jakarta", res[0]["name"])

	mockSvc.AssertExpectations(t)
}

func TestCheckLocationHandler_Success(t *testing.T) {
	mockSvc := new(mockAreaService)
	router := setupAreaRouter(mockSvc)

	expectedRes := []domain.Area{
		{ID: uuid.New(), Name: "Jakarta Selatan"},
	}

	// We pass raw specific numbers mirroring query values.
	mockSvc.On("GetAreasContainingPoint", mock.Anything, -6.2297, 106.8159).Return(expectedRes, nil)

	req, _ := http.NewRequest(http.MethodGet, "/api/areas/check?lat=-6.2297&lng=106.8159", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var res map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &res)
	assert.NoError(t, err)

	dataList := res["areas"].([]interface{})
	assert.Len(t, dataList, 1)

	firstResult := dataList[0].(map[string]interface{})
	assert.Equal(t, "Jakarta Selatan", firstResult["name"])

	mockSvc.AssertExpectations(t)
}
