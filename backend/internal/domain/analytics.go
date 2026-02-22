package domain

import (
	"context"
	"time"
)

// CourierPerformance tracks accuracy and SLA per webhook push event.
type CourierPerformance struct {
	ID                     int64     `db:"id" json:"id"`
	UserID                 int64     `db:"user_id" json:"user_id"`
	BatchID                string    `db:"batch_id" json:"batch_id"`
	CourierID              string    `db:"courier_id" json:"courier_id"`
	OrderID                string    `db:"order_id" json:"order_id"`
	ReportedLat            float64   `db:"reported_lat" json:"reported_lat"`
	ReportedLng            float64   `db:"reported_lng" json:"reported_lng"`
	ActualLat              *float64  `db:"actual_lat" json:"actual_lat"`
	ActualLng              *float64  `db:"actual_lng" json:"actual_lng"`
	DistanceVarianceMeters *float64  `db:"distance_variance_meters" json:"distance_variance_meters"`
	AccuracyStatus         string    `db:"accuracy_status" json:"accuracy_status"` // accurate, fairly_accurate, inaccurate, error
	SLAStatus              string    `db:"sla_status" json:"sla_status"`           // on_time, late, unknown
	EventTimestamp         time.Time `db:"event_timestamp" json:"event_timestamp"`
	CreatedAt              time.Time `db:"created_at" json:"created_at"`
}

// CourierAccuracyAgg represents grouped accuracy metrics per courier.
type CourierAccuracyAgg struct {
	CourierID       string  `db:"courier_id" json:"courier_id"`
	TotalDeliveries int     `db:"total_deliveries" json:"total_deliveries"`
	AccurateCount   int     `db:"accurate_count" json:"accurate_count"`
	FairlyCount     int     `db:"fairly_count" json:"fairly_count"`
	InaccurateCount int     `db:"inaccurate_count" json:"inaccurate_count"`
	ErrorCount      int     `db:"error_count" json:"error_count"`
	AccuracyRate    float64 `db:"accuracy_rate" json:"accuracy_rate"` // Percentage of accurate / total
}

// SLATrendAgg represents on-time vs late metrics grouped by time interval (e.g., daily).
type SLATrendAgg struct {
	Date        string  `db:"date" json:"date"` // YYYY-MM-DD
	OnTimeCount int     `db:"on_time_count" json:"on_time_count"`
	LateCount   int     `db:"late_count" json:"late_count"`
	TotalCount  int     `db:"total_count" json:"total_count"`
	OnTimeRate  float64 `db:"on_time_rate" json:"on_time_rate"`
}

// AdvancedAnalyticsResponse wraps the dashboard data.
type AdvancedAnalyticsResponse struct {
	TotalEvents        int                  `json:"total_events"`
	OverallAccuracy    float64              `json:"overall_accuracy_rate"`
	OverallOnTime      float64              `json:"overall_on_time_rate"`
	CourierLeaderboard []CourierAccuracyAgg `json:"courier_leaderboard"`
	SLATrend           []SLATrendAgg        `json:"sla_trend"`
}

// AnalyticsRepository defines data access methods for analytics.
type AnalyticsRepository interface {
	SaveCourierPerformance(ctx context.Context, cp *CourierPerformance) error
	GetCourierLeaderboard(ctx context.Context, userID int64, limit int) ([]CourierAccuracyAgg, error)
	GetSLATrends(ctx context.Context, userID int64, days int) ([]SLATrendAgg, error)
}
