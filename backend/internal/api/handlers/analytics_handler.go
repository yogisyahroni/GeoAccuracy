package handlers

import (
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"geoaccuracy-backend/internal/domain"
)

// AnalyticsHandler handles /api/advanced-analytics routes.
type AnalyticsHandler struct {
	repo domain.AnalyticsRepository
}

// NewAnalyticsHandler creates a new AnalyticsHandler.
func NewAnalyticsHandler(repo domain.AnalyticsRepository) *AnalyticsHandler {
	return &AnalyticsHandler{repo: repo}
}

// GetCourierLeaderboard returns the top couriers by accuracy.
// GET /api/advanced-analytics/couriers?limit=10
func (h *AnalyticsHandler) GetCourierLeaderboard(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))

	leaderboard, err := h.repo.GetCourierLeaderboard(c.Request.Context(), int64(userID), limit)
	if err != nil {
		log.Printf("[AnalyticsHandler] GetCourierLeaderboard error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve courier leaderboard"})
		return
	}

	if leaderboard == nil {
		leaderboard = []domain.CourierAccuracyAgg{}
	}

	c.JSON(http.StatusOK, leaderboard)
}

// GetSLATrends returns the SLA (on-time vs late) trend over time.
// GET /api/advanced-analytics/sla?days=7
func (h *AnalyticsHandler) GetSLATrends(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}

	days, _ := strconv.Atoi(c.DefaultQuery("days", "7"))

	trends, err := h.repo.GetSLATrends(c.Request.Context(), int64(userID), days)
	if err != nil {
		log.Printf("[AnalyticsHandler] GetSLATrends error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve SLA trends"})
		return
	}

	if trends == nil {
		trends = []domain.SLATrendAgg{}
	}

	c.JSON(http.StatusOK, trends)
}
