package service

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"geoaccuracy-backend/internal/domain"
	"geoaccuracy-backend/internal/repository"
)

// SettingsService handles Maps API key management.
type SettingsService struct {
	repo       repository.SettingsRepository
	httpClient *http.Client
}

// NewSettingsService creates a new SettingsService.
func NewSettingsService(repo repository.SettingsRepository) *SettingsService {
	return &SettingsService{
		repo:       repo,
		httpClient: &http.Client{Timeout: 8 * time.Second},
	}
}

// GetSettings returns the settings for a user (or defaults if not set).
func (s *SettingsService) GetSettings(userID int) (*domain.UserSettings, error) {
	return s.repo.GetByUserID(userID)
}

// UpdateSettings persists new API keys for the user.
func (s *SettingsService) UpdateSettings(userID int, req domain.UpdateSettingsRequest) error {
	mapsKey := strings.TrimSpace(req.MapsKey)
	geoKey := strings.TrimSpace(req.GeoapifyKey)
	psKey := strings.TrimSpace(req.PositionStackKey)

	if err := s.repo.Upsert(userID, mapsKey, geoKey, psKey); err != nil {
		return fmt.Errorf("settings service UpdateSettings: %w", err)
	}
	return nil
}

// TestProviderKey validates the API key against the given provider API.
// Returns true if the key is valid.
func (s *SettingsService) TestProviderKey(ctx context.Context, provider, key string) *domain.TestMapsKeyResponse {
	key = strings.TrimSpace(key)
	if key == "" {
		return &domain.TestMapsKeyResponse{Valid: false, Message: "API key tidak boleh kosong", Provider: provider}
	}

	var endpoint string
	var params url.Values

	switch provider {
	case "google":
		endpoint = "https://maps.googleapis.com/maps/api/geocode/json"
		params = url.Values{"address": {"Jakarta"}, "key": {key}}
	case "geoapify":
		endpoint = "https://api.geoapify.com/v1/geocode/search"
		params = url.Values{"text": {"Jakarta"}, "apiKey": {key}}
	case "positionstack":
		endpoint = "http://api.positionstack.com/v1/forward"
		params = url.Values{"query": {"Jakarta"}, "access_key": {key}}
	default:
		return &domain.TestMapsKeyResponse{Valid: false, Message: "Provider tidak didukung", Provider: provider}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint+"?"+params.Encode(), nil)
	if err != nil {
		return &domain.TestMapsKeyResponse{Valid: false, Message: "Gagal membuat request", Provider: provider}
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return &domain.TestMapsKeyResponse{Valid: false, Message: "Tidak dapat menjangkau provider: " + err.Error(), Provider: provider}
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusNoContent {
		return &domain.TestMapsKeyResponse{Valid: true, Message: "API key valid dan aktif", Provider: provider}
	} else if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return &domain.TestMapsKeyResponse{Valid: false, Message: "API key ditolak atau tidak valid", Provider: provider}
	} else {
		return &domain.TestMapsKeyResponse{Valid: false, Message: fmt.Sprintf("Response tidak valid (HTTP %d)", resp.StatusCode), Provider: provider}
	}
}
