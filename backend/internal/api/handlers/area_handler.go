package handlers

import (
	"net/http"
	"strconv"

	"geoaccuracy-backend/internal/domain"
	"geoaccuracy-backend/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type AreaHandler struct {
	areaService service.AreaService
}

func NewAreaHandler(areaService service.AreaService) *AreaHandler {
	return &AreaHandler{
		areaService: areaService,
	}
}

func (h *AreaHandler) CreateArea(c *gin.Context) {
	var req domain.CreateAreaRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request payload", "details": err.Error()})
		return
	}

	area, err := h.areaService.CreateArea(c.Request.Context(), &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create area", "details": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, area)
}

func (h *AreaHandler) GetArea(c *gin.Context) {
	idParam := c.Param("id")
	id, err := uuid.Parse(idParam)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid area ID"})
		return
	}

	area, err := h.areaService.GetAreaByID(c.Request.Context(), id)
	if err != nil {
		if err.Error() == "area not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "Area not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve area", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, area)
}

func (h *AreaHandler) ListAreas(c *gin.Context) {
	areas, err := h.areaService.ListAreas(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list areas", "details": err.Error()})
		return
	}

	if areas == nil {
		areas = []domain.Area{}
	}

	c.JSON(http.StatusOK, areas)
}

func (h *AreaHandler) DeleteArea(c *gin.Context) {
	idParam := c.Param("id")
	id, err := uuid.Parse(idParam)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid area ID"})
		return
	}

	err = h.areaService.DeleteArea(c.Request.Context(), id)
	if err != nil {
		if err.Error() == "area not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "Area not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete area", "details": err.Error()})
		return
	}

	c.Status(http.StatusNoContent)
}

func (h *AreaHandler) CheckPointInArea(c *gin.Context) {
	latStr := c.Query("lat")
	lngStr := c.Query("lng")

	lat, errLat := strconv.ParseFloat(latStr, 64)
	lng, errLng := strconv.ParseFloat(lngStr, 64)

	if errLat != nil || errLng != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Valid lat and lng query parameters are required"})
		return
	}

	areas, err := h.areaService.GetAreasContainingPoint(c.Request.Context(), lat, lng)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check points", "details": err.Error()})
		return
	}

	if areas == nil {
		areas = []domain.Area{}
	}

	c.JSON(http.StatusOK, gin.H{
		"contains": len(areas) > 0,
		"areas":    areas,
	})
}
