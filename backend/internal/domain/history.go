package domain

import "time"

// ComparisonSession represents a single batch of addresses compared.
type ComparisonSession struct {
	ID              int       `db:"id" json:"id"`
	UserID          int       `db:"user_id" json:"user_id"`
	TotalCount      int       `db:"total_count" json:"total_count"`
	AccurateCount   int       `db:"accurate_count" json:"accurate_count"`
	FairlyCount     int       `db:"fairly_count" json:"fairly_count"`
	InaccurateCount int       `db:"inaccurate_count" json:"inaccurate_count"`
	ErrorCount      int       `db:"error_count" json:"error_count"`
	CreatedAt       time.Time `db:"created_at" json:"created_at"`
}

// ListSessionsResponse wraps a paginated list of sessions.
type ListSessionsResponse struct {
	Sessions []ComparisonSession `json:"sessions"`
	Total    int                 `json:"total"`
	Page     int                 `json:"page"`
	PageSize int                 `json:"page_size"`
}

// AnalyticsData holds aggregated session data for the dashboard.
type AnalyticsData struct {
	TotalSessions   int                 `json:"totalSessions"`
	TotalRecords    int                 `json:"totalRecords"`
	TotalAccurate   int                 `json:"totalAccurate"`
	TotalFairly     int                 `json:"totalFairly"`
	TotalInaccurate int                 `json:"totalInaccurate"`
	TotalError      int                 `json:"totalError"`
	AvgAccuracyRate int                 `json:"avgAccuracyRate"`
	RecentSessions  []ComparisonSession `json:"recentSessions"`
}
