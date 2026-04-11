package domain

type ValidationRequestItem struct {
	ID            string                 `json:"id"`             // Unique identifier for tracking
	Connote       string                 `json:"connote"`        // Tracking Number (Resi) - The primary key for matching
	SystemAddress string                 `json:"system_address"` // Address to be geocoded
	CourierID     string                 `json:"courier_id"`     // Courier identifier for performance analysis
	FieldLat      float64                `json:"field_lat"`      // Latitude from the courier (POD)
	FieldLng      float64                `json:"field_lng"`      // Longitude from the courier (POD)
	Metadata      map[string]interface{} `json:"metadata"`       // Additional dynamic fields for dashboard display
}

type BatchValidationRequest struct {
	Items []ValidationRequestItem `json:"items" binding:"required,dive"`
}

type ValidationResult struct {
	ID            string                 `json:"id"`
	Connote       string                 `json:"connote"`
	SystemAddress string                 `json:"system_address"`
	CourierID     string                 `json:"courier_id"`
	GeoLat        float64                `json:"geo_lat"`
	GeoLng        float64                `json:"geo_lng"`
	FieldLat      float64                `json:"field_lat"`
	FieldLng      float64                `json:"field_lng"`
	DistanceKm    float64                `json:"distance_km"`
	AccuracyLevel string                 `json:"accuracy_level"`
	Provider      string                 `json:"provider"`
	Metadata      map[string]interface{} `json:"metadata"`
	Error         string                 `json:"error,omitempty"`
}

type BatchValidationResponse struct {
	Results []ValidationResult `json:"results"`
}
