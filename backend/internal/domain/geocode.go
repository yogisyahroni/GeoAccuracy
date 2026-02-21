package domain

import "time"

type GeocodeRequest struct {
	Address string `json:"address" binding:"required"`
}

type GeocodeResponse struct {
	Address   string  `json:"address"`
	City      string  `json:"city"`
	Province  string  `json:"province"`
	Lat       float64 `json:"lat"`
	Lng       float64 `json:"lng"`
	Provider  string  `json:"provider"`
	FromCache bool    `json:"from_cache"`
}

type GeocodeCache struct {
	ID              int64     `json:"id"`
	AddressHash     string    `json:"address_hash"`
	OriginalAddress string    `json:"original_address"`
	City            string    `json:"city"`
	Province        string    `json:"province"`
	Lat             float64   `json:"lat"`
	Lng             float64   `json:"lng"`
	Provider        string    `json:"provider"`
	CreatedAt       time.Time `json:"created_at"`
	ExpiresAt       time.Time `json:"expires_at"`
}
