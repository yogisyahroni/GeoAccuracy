package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"

	"geoaccuracy-backend/config"
	ws "geoaccuracy-backend/internal/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// FIX BUG-04: Only allow known production frontend origins.
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		allowed := []string{
			"https://geo-accuracy.vercel.app",
			"http://localhost:5173",
			"http://localhost:4173",
		}
		for _, o := range allowed {
			if origin == o {
				return true
			}
		}
		return origin == ""
	},
}

type WSHandler struct {
	hub *ws.Hub
	cfg *config.Config
}

func NewWSHandler(hub *ws.Hub, cfg *config.Config) *WSHandler {
	return &WSHandler{hub: hub, cfg: cfg}
}

// HandleBatchWS upgrades the HTTP connection and limits subscription by batchID.
func (h *WSHandler) HandleBatchWS(c *gin.Context) {
	// FIX: Rely on AuthMiddleware which already validated the cookie
	// during the HTTP Upgrade request.
	if _, ok := getUserID(c); !ok {
		// getUserID already sent 401
		return
	}

	batchID := c.Param("id")
	if batchID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing batch ID"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Failed to set websocket upgrade: %v", err)
		return
	}

	// Authentication successful via Middleware — send ack so the frontend 
	// knows it's live and can start receiving progress events.
	ack, _ := json.Marshal(map[string]string{"type": "auth_ok"})
	if err := conn.WriteMessage(websocket.TextMessage, ack); err != nil {
		log.Printf("WS: failed to send auth_ok for batch %s: %v", batchID, err)
		conn.Close()
		return
	}

	client := &ws.Client{
		Conn:    conn,
		BatchID: batchID,
		Send:    make(chan []byte, 256),
	}

	h.hub.Register(client)

	// FIX BUG-02: Use sync.Once so that Unregister+Close is called exactly once,
	// even if both goroutines (write-loop and read-loop) exit at the same time.
	var once sync.Once
	cleanup := func() {
		once.Do(func() {
			h.hub.Unregister(client)
			client.Conn.Close()
		})
	}

	// Write loop — forwards messages from the hub to the WebSocket connection.
	go func() {
		defer cleanup()
		for {
			msg, ok := <-client.Send
			if !ok {
				client.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := client.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(msg)

			// Drain any queued messages in the same write frame for efficiency.
			n := len(client.Send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-client.Send)
			}

			if err := w.Close(); err != nil {
				return
			}
		}
	}()

	// Read loop — blocks until the client disconnects, then triggers cleanup.
	go func() {
		defer cleanup()
		for {
			_, _, err := client.Conn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					log.Printf("WS unexpected close: %v", err)
				}
				break
			}
		}
	}()
}
