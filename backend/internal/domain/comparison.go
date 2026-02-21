package domain

type ValidationRequestItem struct {
	ID            string  `json:"id"`
	SystemAddress string  `json:"system_address" binding:"required"`
	FieldLat      float64 `json:"field_lat" binding:"required"`
	FieldLng      float64 `json:"field_lng" binding:"required"`
}

type BatchValidationRequest struct {
	Items []ValidationRequestItem `json:"items" binding:"required,dive"`
}

type ValidationResult struct {
	ID            string  `json:"id"`
	SystemAddress string  `json:"system_address"`
	GeoLat        float64 `json:"geo_lat"`
	GeoLng        float64 `json:"geo_lng"`
	FieldLat      float64 `json:"field_lat"`
	FieldLng      float64 `json:"field_lng"`
	DistanceKm    float64 `json:"distance_km"`
	AccuracyLevel string  `json:"accuracy_level"`
	Provider      string  `json:"provider"`
	Error         string  `json:"error,omitempty"`
}

type BatchValidationResponse struct {
	Results []ValidationResult `json:"results"`
}
