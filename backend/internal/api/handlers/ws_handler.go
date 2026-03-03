package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"

	"geoaccuracy-backend/config"
	ws "geoaccuracy-backend/internal/websocket"
	"geoaccuracy-backend/pkg/utils"
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

// wsAuthMessage is the shape of the first message the client must send
// after the WebSocket connection is established.
//
// FIX BUG-11: Using first-message authentication instead of a query-string token.
// When the token is passed as ?token=... it appears verbatim in:
//   - Render (server) access logs
//   - Browser URL bar / DevTools Network tab
//   - Any proxy or CDN access log between client and server
//
// With first-message auth the WebSocket URL is clean (/api/ws/batches/:id)
// and the JWT is only transmitted inside the encrypted WebSocket frame body.
type wsAuthMessage struct {
	Type  string `json:"type"`  // must be "auth"
	Token string `json:"token"` // JWT Bearer token
}

// HandleBatchWS upgrades the HTTP connection and limits subscription by batchID.
func (h *WSHandler) HandleBatchWS(c *gin.Context) {
	batchID := c.Param("id")
	if batchID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing batch ID"})
		return
	}

	// Upgrade before authentication — the WS handshake itself is still protected
	// by the CheckOrigin restriction above (BUG-04 fix). The JWT is validated
	// immediately after upgrade via the first message, so the window is minimal.
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Failed to set websocket upgrade: %v", err)
		return
	}

	// --- First-message authentication ---
	// Give the client 10 seconds to send the auth frame. This prevents idle
	// connections from sitting open without ever authenticating.
	conn.SetReadDeadline(time.Now().Add(10 * time.Second))

	_, rawMsg, err := conn.ReadMessage()
	if err != nil {
		log.Printf("WS: auth read failed for batch %s: %v", batchID, err)
		conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "auth timeout"),
		)
		conn.Close()
		return
	}

	// Remove read deadline for normal message processing.
	conn.SetReadDeadline(time.Time{})

	var authMsg wsAuthMessage
	if err := json.Unmarshal(rawMsg, &authMsg); err != nil || authMsg.Type != "auth" || authMsg.Token == "" {
		log.Printf("WS: invalid auth message for batch %s", batchID)
		conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "invalid auth message"),
		)
		conn.Close()
		return
	}

	if _, err := utils.ParseToken(authMsg.Token, h.cfg); err != nil {
		log.Printf("WS: unauthorized connection for batch %s: %v", batchID, err)
		conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, "unauthorized"),
		)
		conn.Close()
		return
	}

	// Authentication successful — send ack so the frontend knows it can start
	// receiving progress events (this prevents premature setWsStatus('processing')).
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
