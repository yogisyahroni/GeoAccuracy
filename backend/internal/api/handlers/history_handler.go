package handlers

import (
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"geoaccuracy-backend/internal/service"
)

// HistoryHandler handles /api/history routes.
type HistoryHandler struct {
	historySvc *service.HistoryService
}

// NewHistoryHandler creates a new HistoryHandler.
func NewHistoryHandler(historySvc *service.HistoryService) *HistoryHandler {
	return &HistoryHandler{historySvc: historySvc}
}

// ListSessions returns a paginated list of the user's comparison sessions.
// GET /api/history?page=1&page_size=20
func (h *HistoryHandler) ListSessions(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	result, err := h.historySvc.ListSessions(userID, page, pageSize)
	if err != nil {
		log.Printf("ListSessions error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal mengambil riwayat"})
		return
	}

	c.JSON(http.StatusOK, result)
}

// GetAnalytics returns aggregated historical data for the user.
// GET /api/analytics
func (h *HistoryHandler) GetAnalytics(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}

	agg, err := h.historySvc.GetAnalytics(userID)
	if err != nil {
		log.Printf("GetAnalytics error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal mengambil data analitik"})
		return
	}

	c.JSON(http.StatusOK, agg)
}
