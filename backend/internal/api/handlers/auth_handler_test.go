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

	"geoaccuracy-backend/config"
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

func (m *mockAuthService) Refresh(ctx context.Context, refreshToken string) (*domain.AuthResponse, error) {
	args := m.Called(ctx, refreshToken)
	if args.Get(0) != nil {
		return args.Get(0).(*domain.AuthResponse), args.Error(1)
	}
	return nil, args.Error(1)
}

func setupAuthRouter(authSvc service.AuthService) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.Default()
	cfg := &config.Config{AppEnv: "development"}
	handler := handlers.NewAuthHandler(authSvc, cfg)

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
	// access_token should be empty in JSON (Grade S++ Cookie Auth)
	assert.Equal(t, "", res["access_token"])

	// Verify cookies
	cookies := w.Result().Cookies()
	var foundAccess, foundRefresh bool
	for _, c := range cookies {
		if c.Name == "access_token" && c.Value == "mock-jwt-token" {
			foundAccess = true
			assert.True(t, c.HttpOnly)
		}
		if c.Name == "refresh_token" {
			foundRefresh = true
		}
	}
	assert.True(t, foundAccess, "access_token cookie not found or invalid")
	assert.True(t, foundRefresh, "refresh_token cookie not found")

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
	// access_token should be empty in JSON (Grade S++ Cookie Auth)
	assert.Equal(t, "", res["access_token"])

	// Verify cookies
	cookies := w.Result().Cookies()
	var foundAccess bool
	for _, c := range cookies {
		if c.Name == "access_token" && c.Value == "mock-jwt-token-login" {
			foundAccess = true
			assert.True(t, c.HttpOnly)
		}
	}
	assert.True(t, foundAccess, "access_token cookie not found or invalid")

	mockSvc.AssertExpectations(t)
}
