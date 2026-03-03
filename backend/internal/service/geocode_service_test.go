package service

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"geoaccuracy-backend/internal/domain"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

// mockGeocodeRepo mocks repository.GeocodeRepository
type mockGeocodeRepo struct {
	mock.Mock
}

func (m *mockGeocodeRepo) GetCachedResult(ctx context.Context, hash string) (*domain.GeocodeCache, error) {
	args := m.Called(ctx, hash)
	var res *domain.GeocodeCache
	if args.Get(0) != nil {
		res = args.Get(0).(*domain.GeocodeCache)
	}
	return res, args.Error(1)
}

func (m *mockGeocodeRepo) SaveResult(ctx context.Context, c *domain.GeocodeCache) error {
	return m.Called(ctx, c).Error(0)
}

// mockSettingsRepo mocks repository.SettingsRepository
type mockSettingsRepo struct {
	mock.Mock
}

func (m *mockSettingsRepo) GetByUserID(userID int) (*domain.UserSettings, error) {
	args := m.Called(userID)
	var res *domain.UserSettings
	if args.Get(0) != nil {
		res = args.Get(0).(*domain.UserSettings)
	}
	return res, args.Error(1)
}

func (m *mockSettingsRepo) Upsert(userID int, mapsKey, geoapifyKey, positionStackKey string) error {
	return m.Called(userID, mapsKey, geoapifyKey, positionStackKey).Error(0)
}

// mockRoundTripper intercepts HTTP requests made by the service
type mockRoundTripper struct {
	roundTripFunc func(req *http.Request) (*http.Response, error)
}

func (m *mockRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	return m.roundTripFunc(req)
}

func setupTestService() (*geocodeService, *mockGeocodeRepo, *mockSettingsRepo, *mockRoundTripper) {
	mGeoRepo := new(mockGeocodeRepo)
	mSetRepo := new(mockSettingsRepo)
	mTransport := &mockRoundTripper{}

	svc := NewGeocodeService(mGeoRepo, mSetRepo).(*geocodeService)
	// Inject the mock transport to prevent actual outbound calls
	svc.httpClient = &http.Client{
		Transport: mTransport,
		Timeout:   10 * time.Second,
	}

	return svc, mGeoRepo, mSetRepo, mTransport
}

func jsonResponse(statusCode int, body string) *http.Response {
	return &http.Response{
		StatusCode: statusCode,
		Body:       io.NopCloser(bytes.NewBufferString(body)),
		Header:     make(http.Header),
	}
}

func TestGeocodeAddress_CachedResult(t *testing.T) {
	svc, mGeo, mSet, _ := setupTestService()

	address := "1600 Amphitheatre Pkwy"
	hash := generateHash(normalizeAddress(address))

	mGeo.On("GetCachedResult", mock.Anything, hash).Return(&domain.GeocodeCache{
		Lat:             37.422,
		Lng:             -122.084,
		OriginalAddress: address,
		Provider:        "cache",
	}, nil)

	res, err := svc.GeocodeAddress(context.Background(), 1, address)

	assert.NoError(t, err)
	assert.NotNil(t, res)
	// Assertions for cache hit
	assert.Equal(t, true, res.FromCache)
	assert.Equal(t, "cache", res.Provider)
	assert.Equal(t, 37.422, res.Lat)
	assert.Equal(t, -122.084, res.Lng)

	mGeo.AssertExpectations(t)
	// Settings should never be pulled if cache hits
	mSet.AssertNotCalled(t, "GetByUserID")
}

func TestGeocodeAddress_NominatimSuccess(t *testing.T) {
	svc, mGeo, mSet, mTrans := setupTestService()

	address := "Eiffel Tower"
	hash := generateHash(normalizeAddress(address))

	// Cache Miss
	mGeo.On("GetCachedResult", mock.Anything, hash).Return(nil, nil)
	// User has no keys (or empty)
	mSet.On("GetByUserID", 1).Return(&domain.UserSettings{}, nil)

	// Expect saving result to cache
	mGeo.On("SaveResult", mock.Anything, mock.AnythingOfType("*domain.GeocodeCache")).Return(nil)

	// Mocking internal HTTP Transport
	mTrans.roundTripFunc = func(req *http.Request) (*http.Response, error) {
		assert.Contains(t, req.URL.String(), "nominatim.openstreetmap.org")
		return jsonResponse(200, `[{"lat": "48.8584", "lon": "2.2945", "address": {"city": "Paris", "state": "Ile-de-France"}}]`), nil
	}

	res, err := svc.GeocodeAddress(context.Background(), 1, address)

	assert.NoError(t, err)
	assert.NotNil(t, res)
	assert.Equal(t, "Nominatim", res.Provider)
	assert.Equal(t, 48.8584, res.Lat)
	assert.Equal(t, 2.2945, res.Lng)
	assert.Equal(t, "Paris", res.City)

	mGeo.AssertExpectations(t)
	mSet.AssertExpectations(t)
}

func TestGeocodeAddress_GeoapifyFallback(t *testing.T) {
	svc, mGeo, mSet, mTrans := setupTestService()

	address := "Berlin"
	hash := generateHash(normalizeAddress(address))

	// Cache Miss
	mGeo.On("GetCachedResult", mock.Anything, hash).Return(nil, nil)
	// User has geoapify key
	mSet.On("GetByUserID", 1).Return(&domain.UserSettings{
		GeoapifyKey: "dummy_geo_key",
	}, nil)

	// Saving fallback result
	mGeo.On("SaveResult", mock.Anything, mock.AnythingOfType("*domain.GeocodeCache")).Return(nil)

	// Intercept and assert the fallback cascade
	mTrans.roundTripFunc = func(req *http.Request) (*http.Response, error) {
		urlStr := req.URL.String()
		if strings.Contains(urlStr, "nominatim") {
			// Simulate rate limiting on nominatim
			return jsonResponse(429, `rate limited`), nil
		}
		if strings.Contains(urlStr, "geoapify") {
			return jsonResponse(200, `{"features":[{"properties":{"lat": 52.52, "lon": 13.405, "city":"Berlin", "state":"Berlin"}}]}`), nil
		}
		panic("unexpected url requested in fallback: " + urlStr)
	}

	res, err := svc.GeocodeAddress(context.Background(), 1, address)

	assert.NoError(t, err)
	assert.NotNil(t, res)
	assert.Equal(t, "Geoapify", res.Provider)
	assert.Equal(t, 52.52, res.Lat)
	assert.Equal(t, 13.405, res.Lng)
	assert.Equal(t, "Berlin", res.City)

	mGeo.AssertExpectations(t)
	mSet.AssertExpectations(t)
}

func TestGeocodeAddress_GoogleMapsFallback(t *testing.T) {
	svc, mGeo, mSet, mTrans := setupTestService()

	address := "Sydney"
	hash := generateHash(normalizeAddress(address))

	// Cache Miss
	mGeo.On("GetCachedResult", mock.Anything, hash).Return(nil, nil)
	// User possesses all API keys
	mSet.On("GetByUserID", 1).Return(&domain.UserSettings{
		MapsKey:          "dummy_google_key",
		GeoapifyKey:      "dummy_geo_key",
		PositionStackKey: "dummy_pos_key",
	}, nil)

	mGeo.On("SaveResult", mock.Anything, mock.AnythingOfType("*domain.GeocodeCache")).Return(nil)

	mTrans.roundTripFunc = func(req *http.Request) (*http.Response, error) {
		urlStr := req.URL.String()
		if strings.Contains(urlStr, "nominatim") {
			return jsonResponse(429, `rate limited`), nil
		}
		if strings.Contains(urlStr, "geoapify") {
			return jsonResponse(401, `unauthorized`), nil
		}
		if strings.Contains(urlStr, "positionstack") {
			return jsonResponse(403, `forbidden`), nil
		}
		if strings.Contains(urlStr, "googleapis.com") {
			// Google maps fallback payload
			return jsonResponse(200, `{
				"status": "OK",
				"results": [{
					"geometry": {"location": {"lat": -33.8688, "lng": 151.2093}}, 
					"address_components": [
						{"long_name": "Sydney", "types": ["locality"]},
						{"long_name": "New South Wales", "types": ["administrative_area_level_1"]}
					]
				}]
			}`), nil
		}
		panic("unexpected url: " + urlStr)
	}

	res, err := svc.GeocodeAddress(context.Background(), 1, address)

	assert.NoError(t, err)
	assert.NotNil(t, res)
	// Successfully falls through and utilizes Google Maps
	assert.Equal(t, "GoogleMaps", res.Provider)
	assert.Equal(t, -33.8688, res.Lat)
	assert.Equal(t, 151.2093, res.Lng)
	assert.Equal(t, "Sydney", res.City)

	mGeo.AssertExpectations(t)
	mSet.AssertExpectations(t)
}

func TestGeocodeAddress_AllFailed(t *testing.T) {
	svc, mGeo, mSet, mTrans := setupTestService()

	address := "Nowhere"
	hash := generateHash(normalizeAddress(address))

	mGeo.On("GetCachedResult", mock.Anything, hash).Return(nil, nil)
	// User without custom API keys
	mSet.On("GetByUserID", 1).Return(&domain.UserSettings{}, nil)

	mTrans.roundTripFunc = func(req *http.Request) (*http.Response, error) {
		assert.Contains(t, req.URL.String(), "nominatim")
		return jsonResponse(500, `internal server error`), nil
	}

	res, err := svc.GeocodeAddress(context.Background(), 1, address)

	assert.Error(t, err)
	assert.Nil(t, res)
	assert.Contains(t, err.Error(), "status 500")
}

func TestGeocodeAddress_PositionStackFallback(t *testing.T) {
	svc, mGeo, mSet, mTrans := setupTestService()

	address := "London"
	hash := generateHash(normalizeAddress(address))

	// Cache Miss
	mGeo.On("GetCachedResult", mock.Anything, hash).Return(nil, nil)
	// User possesses keys for PositionStack
	mSet.On("GetByUserID", 1).Return(&domain.UserSettings{
		PositionStackKey: "dummy_pos_key",
	}, nil)

	mGeo.On("SaveResult", mock.Anything, mock.AnythingOfType("*domain.GeocodeCache")).Return(nil)

	mTrans.roundTripFunc = func(req *http.Request) (*http.Response, error) {
		urlStr := req.URL.String()
		if strings.Contains(urlStr, "nominatim") {
			return jsonResponse(429, `rate limited`), nil
		}
		if strings.Contains(urlStr, "positionstack") {
			// PositionStack success payload
			return jsonResponse(200, `{
				"data": [{
					"latitude": 51.5074, 
					"longitude": -0.1278, 
					"locality": "London", 
					"region": "Greater London"
				}]
			}`), nil
		}
		panic("unexpected url: " + urlStr)
	}

	res, err := svc.GeocodeAddress(context.Background(), 1, address)

	assert.NoError(t, err)
	assert.NotNil(t, res)
	assert.Equal(t, "PositionStack", res.Provider)
	assert.Equal(t, 51.5074, res.Lat)
	assert.Equal(t, -0.1278, res.Lng)
	assert.Equal(t, "London", res.City)

	mGeo.AssertExpectations(t)
	mSet.AssertExpectations(t)
}
