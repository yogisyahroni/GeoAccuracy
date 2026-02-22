package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"

	"geoaccuracy-backend/internal/api/handlers"
	"geoaccuracy-backend/internal/domain"
	"geoaccuracy-backend/internal/service"
)

// Mock AuthService
type mockAuthService struct {
	mock.Mock
}

func (m *mockAuthService) Register(ctx context.Context, req domain.RegisterRequest) (*domain.AuthResponse, error) {
	args := m.Called(ctx, req)
	if args.Get(0) != nil {
		return args.Get(0).(*domain.AuthResponse), args.Error(1)
	}
	return nil, args.Error(1)
}

func (m *mockAuthService) Login(ctx context.Context, req domain.LoginRequest) (*domain.AuthResponse, error) {
	args := m.Called(ctx, req)
	if args.Get(0) != nil {
		return args.Get(0).(*domain.AuthResponse), args.Error(1)
	}
	return nil, args.Error(1)
}

func setupAuthRouter(authSvc service.AuthService) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.Default()
	handler := handlers.NewAuthHandler(authSvc)

	router.POST("/api/auth/register", handler.Register)
	router.POST("/api/auth/login", handler.Login)

	return router
}

func TestRegister_Success(t *testing.T) {
	mockSvc := new(mockAuthService)
	router := setupAuthRouter(mockSvc)

	reqPayload := domain.RegisterRequest{
		Name:     "testuser",
		Email:    "test@example.com",
		Password: "Password123!",
	}

	expectedRes := &domain.AuthResponse{
		AccessToken: "mock-jwt-token",
		User: domain.User{
			ID:    1,
			Name:  "testuser",
			Email: "test@example.com",
			Role:  "user",
		},
	}

	mockSvc.On("Register", mock.Anything, reqPayload).Return(expectedRes, nil)

	body, _ := json.Marshal(reqPayload)
	req, _ := http.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)

	var res map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &res)
	assert.NoError(t, err)
	assert.Equal(t, "mock-jwt-token", res["access_token"])

	mockSvc.AssertExpectations(t)
}

func TestLogin_Success(t *testing.T) {
	mockSvc := new(mockAuthService)
	router := setupAuthRouter(mockSvc)

	reqPayload := domain.LoginRequest{
		Email:    "test@example.com",
		Password: "Password123!",
	}

	expectedRes := &domain.AuthResponse{
		AccessToken: "mock-jwt-token-login",
		User: domain.User{
			ID:    1,
			Name:  "testuser",
			Email: "test@example.com",
			Role:  "user",
		},
	}

	mockSvc.On("Login", mock.Anything, reqPayload).Return(expectedRes, nil)

	body, _ := json.Marshal(reqPayload)
	req, _ := http.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var res map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &res)
	assert.NoError(t, err)
	assert.Equal(t, "mock-jwt-token-login", res["access_token"])

	mockSvc.AssertExpectations(t)
}
