package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"geoaccuracy-backend/internal/domain"
	"geoaccuracy-backend/internal/service"
)

type ComparisonHandler struct {
	compService service.ComparisonService
}

func NewComparisonHandler(compService service.ComparisonService) *ComparisonHandler {
	return &ComparisonHandler{compService: compService}
}

func (h *ComparisonHandler) ValidateBatch(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}

	var req domain.BatchValidationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	// Pass userID so the service can persist a session summary in history.
	res, err := h.compService.ValidateBatch(c.Request.Context(), userID, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, res)
}
