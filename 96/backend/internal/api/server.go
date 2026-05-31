package api

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"

	"icc-server/internal/model"

	"github.com/rs/cors"
)

type Server struct {
	handler  *Handler
	port     int
}

func NewServer(port int, handler *Handler) *Server {
	return &Server{
		handler: handler,
		port:    port,
	}
}

func (s *Server) Start() error {
	mux := http.NewServeMux()
	s.registerRoutes(mux)

	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization", "X-API-Signature", "X-API-Timestamp"},
		AllowCredentials: true,
	})

	handler := c.Handler(s.authMiddleware(mux))

	addr := ":" + strconv.Itoa(s.port)
	return http.ListenAndServe(addr, handler)
}

func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}

		if strings.HasPrefix(r.URL.Path, "/api/v1/auth") ||
			strings.HasPrefix(r.URL.Path, "/ws") ||
			r.Method == http.MethodGet {
			next.ServeHTTP(w, r)
			return
		}

		var body []byte
		if r.Body != nil && r.ContentLength > 0 {
			body, _ = io.ReadAll(r.Body)
			r.Body = io.NopCloser(strings.NewReader(string(body)))
		}

		if !s.handler.verifySignature(r, body) {
			writeError(w, http.StatusUnauthorized, "invalid signature or timestamp")
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (s *Server) registerRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/v1/auth/info", s.handler.HandleAuthInfo)
	mux.HandleFunc("/api/v1/devices", s.handler.HandleDevices)
	mux.HandleFunc("/api/v1/devices/", s.handler.HandleDeviceByID)
	mux.HandleFunc("/api/v1/commands", s.handler.HandleCommands)
	mux.HandleFunc("/api/v1/commands/", s.handler.HandleCommandByID)
	mux.HandleFunc("/api/v1/status", s.handler.HandleStatus)
	mux.HandleFunc("/api/v1/status/", s.handler.HandleStatusByDevice)
	mux.HandleFunc("/api/v1/templates", s.handler.HandleTemplates)
	mux.HandleFunc("/api/v1/templates/import", s.handler.HandleTemplateImport)
	mux.HandleFunc("/api/v1/templates/apply", s.handler.HandleTemplateApply)
	mux.HandleFunc("/api/v1/templates/export", s.handler.HandleTemplateExport)
	mux.HandleFunc("/api/v1/templates/restore", s.handler.HandleTemplateRestore)
	mux.HandleFunc("/api/v1/templates/", s.handler.HandleTemplateByID)
	mux.HandleFunc("/api/v1/scheduled/trigger/", s.handler.HandleScheduledCommandTrigger)
	mux.HandleFunc("/api/v1/scheduled", s.handler.HandleScheduledCommands)
	mux.HandleFunc("/api/v1/scheduled/", s.handler.HandleScheduledCommandByID)
	mux.HandleFunc("/ws", s.handler.HandleWebSocket)
}

func writeJSON(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, statusCode int, message string) {
	writeJSON(w, statusCode, model.APIResponse{
		Code:    statusCode,
		Message: message,
	})
}

func writeSuccess(w http.ResponseWriter, data interface{}) {
	writeJSON(w, http.StatusOK, model.APIResponse{
		Code:    0,
		Message: "success",
		Data:    data,
	})
}
