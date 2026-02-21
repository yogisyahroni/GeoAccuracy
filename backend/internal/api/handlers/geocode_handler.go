package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"geoaccuracy-backend/internal/domain"
	"geoaccuracy-backend/internal/service"
)

type GeocodeHandler struct {
	geoService service.GeocodeService
}

func NewGeocodeHandler(geoService service.GeocodeService) *GeocodeHandler {
	return &GeocodeHandler{geoService: geoService}
}

func (h *GeocodeHandler) Geocode(c *gin.Context) {
	var req domain.GeocodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	userID, ok := getUserID(c)
	if !ok {
		return
	}

	res, err := h.geoService.GeocodeAddress(c.Request.Context(), userID, req.Address)
	if err != nil {
		if err == service.ErrAddressNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Address not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, res)
}
