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
	hash := generateHash(address)

	mGeo.On("GetCachedResult", mock.Anything, hash).Return(&domain.GeocodeCache{
		Lat:             37.422,
		Lng:             -122.084,
		OriginalAddress: address,
		Provider:        "cache",
	}, nil)

	res, err := svc.GeocodeAddress(context.Background(), 1, address)

	assert.NoError(t, err)
	assert.NotNil(t, res)
	assert.Equal(t, "cache", res.Provider)
	assert.Equal(t, 37.422, res.Lat)
	mGeo.AssertExpectations(t)
	mSet.AssertNotCalled(t, "GetByUserID")
}

func TestGeocodeAddress_NominatimSuccess(t *testing.T) {
	svc, mGeo, mSet, mTrans := setupTestService()

	address := "Eiffel Tower"
	hash := generateHash(address)

	mGeo.On("GetCachedResult", mock.Anything, hash).Return(nil, ErrAddressNotFound)
	mSet.On("GetByUserID", 1).Return(&domain.UserSettings{}, nil) // no keys

	mGeo.On("SaveResult", mock.Anything, mock.AnythingOfType("*domain.GeocodeCache")).Return(nil)

	mTrans.roundTripFunc = func(req *http.Request) (*http.Response, error) {
		assert.Contains(t, req.URL.String(), "nominatim.openstreetmap.org")
		return jsonResponse(200, `[{"lat": "48.8584", "lon": "2.2945", "display_name": "Eiffel Tower", "type": "monument"}]`), nil
	}

	res, err := svc.GeocodeAddress(context.Background(), 1, address)

	assert.NoError(t, err)
	assert.NotNil(t, res)
	assert.Equal(t, "Nominatim", res.Provider)
	assert.Equal(t, 48.8584, res.Lat)
	assert.Equal(t, 2.2945, res.Lng)

	mGeo.AssertExpectations(t)
	mSet.AssertExpectations(t)
}

func TestGeocodeAddress_GeoapifyFallback(t *testing.T) {
	svc, mGeo, mSet, mTrans := setupTestService()

	address := "Berlin"
	hash := generateHash(address)

	mGeo.On("GetCachedResult", mock.Anything, hash).Return(nil, ErrAddressNotFound)
	mSet.On("GetByUserID", 1).Return(&domain.UserSettings{
		GeoapifyKey: "dummy_geo_key",
	}, nil)

	mGeo.On("SaveResult", mock.Anything, mock.AnythingOfType("*domain.GeocodeCache")).Return(nil)

	mTrans.roundTripFunc = func(req *http.Request) (*http.Response, error) {
		urlStr := req.URL.String()
		if strings.Contains(urlStr, "nominatim") {
			return jsonResponse(429, `rate limited`), nil
		}
		if strings.Contains(urlStr, "geoapify") {
			return jsonResponse(200, `{"features":[{"properties":{"lat": 52.52, "lon": 13.405, "formatted":"Berlin"}}]}`), nil
		}
		panic("unexpected url: " + urlStr)
	}

	res, err := svc.GeocodeAddress(context.Background(), 1, address)

	assert.NoError(t, err)
	assert.NotNil(t, res)
	assert.Equal(t, "Geoapify", res.Provider)
	assert.Equal(t, 52.52, res.Lat)
	assert.Equal(t, 13.405, res.Lng)

	mGeo.AssertExpectations(t)
	mSet.AssertExpectations(t)
}

func TestGeocodeAddress_GoogleMapsFallback(t *testing.T) {
	svc, mGeo, mSet, mTrans := setupTestService()

	address := "Sydney"
	hash := generateHash(address)

	mGeo.On("GetCachedResult", mock.Anything, hash).Return(nil, ErrAddressNotFound)
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
			return jsonResponse(429, `rate limited`), nil
		}
		if strings.Contains(urlStr, "googleapis.com") {
			return jsonResponse(200, `{
				"status": "OK",
				"results": [{"geometry":{"location":{"lat":-33.8688, "lng":151.2093}}, "formatted_address": "Sydney, NSW, Australia"}]
			}`), nil
		}
		panic("unexpected url: " + urlStr)
	}

	res, err := svc.GeocodeAddress(context.Background(), 1, address)

	assert.NoError(t, err)
	assert.NotNil(t, res)
	assert.Equal(t, "GoogleMaps", res.Provider)
	assert.Equal(t, -33.8688, res.Lat)
	assert.Equal(t, 151.2093, res.Lng)

	mGeo.AssertExpectations(t)
	mSet.AssertExpectations(t)
}

func TestGeocodeAddress_AllFailed(t *testing.T) {
	svc, mGeo, mSet, mTrans := setupTestService()

	address := "Nowhere"
	hash := generateHash(address)

	mGeo.On("GetCachedResult", mock.Anything, hash).Return(nil, ErrAddressNotFound)
	// Don't provide any keys to simulate failure if Nominatim fails
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
