package utils

import (
	"math"
)

const (
	EarthRadiusKm = 6371.0
)

// CalculateDistance returns the distance between two coordinates in kilometers using the Haversine formula
func CalculateDistance(lat1, lon1, lat2, lon2 float64) float64 {
	dLat := (lat2 - lat1) * math.Pi / 180.0
	dLon := (lon2 - lon1) * math.Pi / 180.0

	radLat1 := lat1 * math.Pi / 180.0
	radLat2 := lat2 * math.Pi / 180.0

	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Sin(dLon/2)*math.Sin(dLon/2)*math.Cos(radLat1)*math.Cos(radLat2)

	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return EarthRadiusKm * c
}

// EvaluateAccuracy categorizes a distance into predefined accuracy levels
func EvaluateAccuracy(distanceKm float64) string {
	if distanceKm <= 5.0 {
		return "Akurat"
	}
	if distanceKm <= 10.0 {
		return "Cukup Akurat"
	}
	return "Tidak Akurat"
}
