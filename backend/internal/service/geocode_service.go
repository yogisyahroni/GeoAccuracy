package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"golang.org/x/time/rate"

	"geoaccuracy-backend/internal/domain"
	"geoaccuracy-backend/internal/repository"
)

var (
	ErrGeocodeFailed   = errors.New("failed to geocode address")
	ErrAddressNotFound = errors.New("address not found by geocoding provider")
	ErrRateLimited     = errors.New("rate limited or forbidden by provider")
)

type GeocodeService interface {
	GeocodeAddress(ctx context.Context, userID int, address string) (*domain.GeocodeResponse, error)
}

type geocodeService struct {
	geoRepo      repository.GeocodeRepository
	settingsRepo repository.SettingsRepository
	rateLimiter  *rate.Limiter // Nominatim limiter (1 RPS)
	httpClient   *http.Client
}

func NewGeocodeService(geoRepo repository.GeocodeRepository, settingsRepo repository.SettingsRepository) GeocodeService {
	// Nominatim policy strictly demands max 1 request per second
	limiter := rate.NewLimiter(rate.Every(1*time.Second), 1)

	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	return &geocodeService{
		geoRepo:      geoRepo,
		settingsRepo: settingsRepo,
		rateLimiter:  limiter,
		httpClient:   client,
	}
}

func (s *geocodeService) GeocodeAddress(ctx context.Context, userID int, address string) (*domain.GeocodeResponse, error) {
	address = strings.TrimSpace(address)
	if address == "" {
		return nil, errors.New("empty address")
	}

	addressHash := generateHash(address)

	// 1. Check PostgreSQL Cache
	cached, err := s.geoRepo.GetCachedResult(ctx, addressHash)
	if err == nil && cached != nil {
		return &domain.GeocodeResponse{
			Address:   cached.OriginalAddress,
			City:      cached.City,
			Province:  cached.Province,
			Lat:       cached.Lat,
			Lng:       cached.Lng,
			Provider:  cached.Provider,
			FromCache: true,
		}, nil
	}

	// Fetch API Keys
	var mapsKey, geoapifyKey, positionStackKey string
	if userID != 0 {
		settings, err := s.settingsRepo.GetByUserID(userID)
		if err == nil && settings != nil {
			mapsKey = strings.TrimSpace(settings.MapsKey)
			geoapifyKey = strings.TrimSpace(settings.GeoapifyKey)
			positionStackKey = strings.TrimSpace(settings.PositionStackKey)
		}
	}

	// WATERFALL FALLBACK STRATEGY
	var res *domain.GeocodeResponse
	var geocodeErr error

	// Attempt 1: Nominatim (Free, rate limited at 1 RPS)
	err = s.rateLimiter.Wait(ctx)
	if err == nil {
		res, geocodeErr = s.geocodeNominatim(ctx, address)
		if geocodeErr == nil && res != nil {
			s.cacheResult(addressHash, address, res)
			return res, nil
		}
		log.Printf("[Waterfall] Nominatim failed for '%s': %v. Falling back...", address, geocodeErr)
	}

	// Attempt 2: Geoapify (Freemium)
	if geoapifyKey != "" {
		res, geocodeErr = s.geocodeGeoapify(ctx, address, geoapifyKey)
		if geocodeErr == nil && res != nil {
			s.cacheResult(addressHash, address, res)
			return res, nil
		}
		log.Printf("[Waterfall] Geoapify failed for '%s': %v. Falling back...", address, geocodeErr)
	}

	// Attempt 3: PositionStack (Freemium)
	if positionStackKey != "" {
		res, geocodeErr = s.geocodePositionStack(ctx, address, positionStackKey)
		if geocodeErr == nil && res != nil {
			s.cacheResult(addressHash, address, res)
			return res, nil
		}
		log.Printf("[Waterfall] PositionStack failed for '%s': %v. Falling back...", address, geocodeErr)
	}

	// Attempt 4: Google Maps (Premium, Final Fallback)
	if mapsKey != "" {
		res, geocodeErr = s.geocodeGoogleMaps(ctx, address, mapsKey)
		if geocodeErr == nil && res != nil {
			s.cacheResult(addressHash, address, res)
			return res, nil
		}
		log.Printf("[Waterfall] Google Maps failed for '%s': %v. No more fallbacks.", address, geocodeErr)
	}

	if geocodeErr != nil {
		return nil, geocodeErr
	}
	return nil, fmt.Errorf("all configured geocoding providers failed for address: %s", address)
}

func (s *geocodeService) geocodeNominatim(ctx context.Context, address string) (*domain.GeocodeResponse, error) {
	query := url.QueryEscape(address)
	reqURL := fmt.Sprintf("https://nominatim.openstreetmap.org/search?q=%s&format=json&limit=1&addressdetails=1", query)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "GeoVerifyLogistics/1.0 (PutraApp)")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrGeocodeFailed, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, ErrRateLimited
	} else if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w: status %d", ErrGeocodeFailed, resp.StatusCode)
	}

	var results []struct {
		Lat     string `json:"lat"`
		Lon     string `json:"lon"`
		Address struct {
			City     string `json:"city"`
			Town     string `json:"town"`
			Village  string `json:"village"`
			State    string `json:"state"`
			Province string `json:"province"`
		} `json:"address"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		return nil, fmt.Errorf("failed to decode Nominatim response: %w", err)
	}

	if len(results) == 0 {
		return nil, ErrAddressNotFound
	}

	var parsedLat, parsedLng float64
	fmt.Sscanf(results[0].Lat, "%f", &parsedLat)
	fmt.Sscanf(results[0].Lon, "%f", &parsedLng)

	city := results[0].Address.City
	if city == "" {
		city = results[0].Address.Town
	}
	if city == "" {
		city = results[0].Address.Village
	}

	province := results[0].Address.State
	if province == "" {
		province = results[0].Address.Province
	}

	return &domain.GeocodeResponse{
		Address:   address,
		City:      city,
		Province:  province,
		Lat:       parsedLat,
		Lng:       parsedLng,
		Provider:  "Nominatim",
		FromCache: false,
	}, nil
}

func (s *geocodeService) geocodeGeoapify(ctx context.Context, address, apiKey string) (*domain.GeocodeResponse, error) {
	query := url.QueryEscape(address)
	reqURL := fmt.Sprintf("https://api.geoapify.com/v1/geocode/search?text=%s&apiKey=%s&limit=1", query, apiKey)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrGeocodeFailed, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode == http.StatusUnauthorized {
		return nil, ErrRateLimited
	} else if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w: Geoapify status %d", ErrGeocodeFailed, resp.StatusCode)
	}

	var result struct {
		Features []struct {
			Properties struct {
				City  string  `json:"city"`
				State string  `json:"state"`
				Lat   float64 `json:"lat"`
				Lon   float64 `json:"lon"`
			} `json:"properties"`
		} `json:"features"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode Geoapify response: %w", err)
	}

	if len(result.Features) == 0 {
		return nil, ErrAddressNotFound
	}

	props := result.Features[0].Properties
	return &domain.GeocodeResponse{
		Address:   address,
		City:      props.City,
		Province:  props.State,
		Lat:       props.Lat,
		Lng:       props.Lon,
		Provider:  "Geoapify",
		FromCache: false,
	}, nil
}

func (s *geocodeService) geocodePositionStack(ctx context.Context, address, apiKey string) (*domain.GeocodeResponse, error) {
	query := url.QueryEscape(address)
	reqURL := fmt.Sprintf("http://api.positionstack.com/v1/forward?access_key=%s&query=%s&limit=1", apiKey, query)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrGeocodeFailed, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return nil, ErrRateLimited
	} else if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w: PositionStack status %d", ErrGeocodeFailed, resp.StatusCode)
	}

	var result struct {
		Data []struct {
			Latitude  float64 `json:"latitude"`
			Longitude float64 `json:"longitude"`
			Locality  string  `json:"locality"`
			Region    string  `json:"region"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode PositionStack response: %w", err)
	}

	if len(result.Data) == 0 {
		return nil, ErrAddressNotFound
	}

	data := result.Data[0]
	return &domain.GeocodeResponse{
		Address:   address,
		City:      data.Locality,
		Province:  data.Region,
		Lat:       data.Latitude,
		Lng:       data.Longitude,
		Provider:  "PositionStack",
		FromCache: false,
	}, nil
}

func (s *geocodeService) geocodeGoogleMaps(ctx context.Context, address, apiKey string) (*domain.GeocodeResponse, error) {
	query := url.QueryEscape(address)
	reqURL := fmt.Sprintf("https://maps.googleapis.com/maps/api/geocode/json?address=%s&key=%s", query, apiKey)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrGeocodeFailed, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w: Google Maps status %d", ErrGeocodeFailed, resp.StatusCode)
	}

	var result struct {
		Status  string `json:"status"`
		Results []struct {
			Geometry struct {
				Location struct {
					Lat float64 `json:"lat"`
					Lng float64 `json:"lng"`
				} `json:"location"`
			} `json:"geometry"`
			AddressComponents []struct {
				LongName string   `json:"long_name"`
				Types    []string `json:"types"`
			} `json:"address_components"`
		} `json:"results"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode Google Maps response: %w", err)
	}

	if result.Status == "ZERO_RESULTS" {
		return nil, ErrAddressNotFound
	} else if result.Status == "OVER_QUERY_LIMIT" || result.Status == "REQUEST_DENIED" {
		return nil, ErrRateLimited
	} else if result.Status != "OK" {
		return nil, fmt.Errorf("%w: Google Maps API status %s", ErrGeocodeFailed, result.Status)
	}

	if len(result.Results) == 0 {
		return nil, ErrAddressNotFound
	}

	res := result.Results[0]
	var city, province string

	for _, comp := range res.AddressComponents {
		for _, typ := range comp.Types {
			if typ == "administrative_area_level_2" || typ == "locality" {
				if city == "" {
					city = comp.LongName
				}
			}
			if typ == "administrative_area_level_1" {
				province = comp.LongName
			}
		}
	}

	return &domain.GeocodeResponse{
		Address:   address,
		City:      city,
		Province:  province,
		Lat:       res.Geometry.Location.Lat,
		Lng:       res.Geometry.Location.Lng,
		Provider:  "GoogleMaps",
		FromCache: false,
	}, nil
}

func (s *geocodeService) cacheResult(hash, originalAddress string, res *domain.GeocodeResponse) {
	cacheEntry := &domain.GeocodeCache{
		AddressHash:     hash,
		OriginalAddress: originalAddress,
		City:            res.City,
		Province:        res.Province,
		Lat:             res.Lat,
		Lng:             res.Lng,
		Provider:        res.Provider,
		ExpiresAt:       time.Now().Add(30 * 24 * time.Hour), // 30 days cache
	}
	_ = s.geoRepo.SaveResult(context.Background(), cacheEntry) // async safe context
}

func generateHash(s string) string {
	h := sha256.New()
	h.Write([]byte(strings.ToLower(s)))
	return hex.EncodeToString(h.Sum(nil))
}
