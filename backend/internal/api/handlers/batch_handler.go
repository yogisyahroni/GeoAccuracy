package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"geoaccuracy-backend/internal/domain"
)

type BatchHandler struct {
	batchService domain.BatchService
}

func NewBatchHandler(batchService domain.BatchService) *BatchHandler {
	return &BatchHandler{batchService: batchService}
}

type createBatchRequest struct {
	Name string `json:"name"`
}

func (h *BatchHandler) CreateBatch(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}

	var req createBatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
		return
	}

	batch, err := h.batchService.CreateBatch(c.Request.Context(), int64(userID), req.Name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, batch)
}

func (h *BatchHandler) ListBatches(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}

	batches, err := h.batchService.ListUserBatches(c.Request.Context(), int64(userID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, batches)
}

func (h *BatchHandler) UploadSystemData(c *gin.Context) {
	// FIX BUG-03: Capture userID and pass it for ownership check in service layer.
	userID, ok := getUserID(c)
	if !ok {
		return
	}

	batchIDStr := c.Param("id")
	batchID, err := uuid.Parse(batchIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid batch ID"})
		return
	}

	var records []domain.SystemRecord
	if err := c.ShouldBindJSON(&records); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
		return
	}

	if err := h.batchService.UploadSystemData(c.Request.Context(), int64(userID), batchID, records); err != nil {
		if err.Error() == "batch not found or access denied" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "System data uploaded successfully"})
}

func (h *BatchHandler) UploadFieldData(c *gin.Context) {
	// FIX BUG-03: Capture userID and pass it for ownership check in service layer.
	userID, ok := getUserID(c)
	if !ok {
		return
	}

	batchIDStr := c.Param("id")
	batchID, err := uuid.Parse(batchIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid batch ID"})
		return
	}

	var records []domain.FieldRecord
	if err := c.ShouldBindJSON(&records); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
		return
	}

	if err := h.batchService.UploadFieldData(c.Request.Context(), int64(userID), batchID, records); err != nil {
		if err.Error() == "batch not found or access denied" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Field data uploaded successfully"})
}

func (h *BatchHandler) ProcessBatch(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}

	batchIDStr := c.Param("id")
	batchID, err := uuid.Parse(batchIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid batch ID"})
		return
	}

	// ProcessBatch ownership is verified in the service layer.
	if err := h.batchService.ProcessBatch(c.Request.Context(), int64(userID), batchID); err != nil {
		if err.Error() == "batch not found or access denied" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 202 Accepted: processing runs asynchronously via WebSocket
	c.JSON(http.StatusAccepted, gin.H{"message": "Batch processing started"})
}

func (h *BatchHandler) GetBatchResults(c *gin.Context) {
	// FIX BUG-03: Capture userID and pass it for ownership check in service layer.
	userID, ok := getUserID(c)
	if !ok {
		return
	}

	batchIDStr := c.Param("id")
	batchID, err := uuid.Parse(batchIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid batch ID"})
		return
	}

	items, err := h.batchService.GetBatchResults(c.Request.Context(), int64(userID), batchID)
	if err != nil {
		if err.Error() == "batch not found or access denied" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, items)
}
