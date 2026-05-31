package api

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"icc-server/internal/collector"
	"icc-server/internal/command"
	"icc-server/internal/driver"
	"icc-server/internal/model"
	"icc-server/internal/template"

	"github.com/gorilla/websocket"
)

type Handler struct {
	driverMgr    *driver.Manager
	dispatcher   *command.Dispatcher
	collectorSvc *collector.Collector
	templateMgr  *template.Manager
	wsHub        *WebSocketHub
	secretKey    string
}

func NewHandler(
	driverMgr *driver.Manager,
	dispatcher *command.Dispatcher,
	collectorSvc *collector.Collector,
	templateMgr *template.Manager,
	wsHub *WebSocketHub,
	secretKey string,
) *Handler {
	return &Handler{
		driverMgr:    driverMgr,
		dispatcher:   dispatcher,
		collectorSvc: collectorSvc,
		templateMgr:  templateMgr,
		wsHub:        wsHub,
		secretKey:    secretKey,
	}
}

func (h *Handler) HandleDevices(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		devices := h.driverMgr.ListDevices()
		writeSuccess(w, devices)
	case http.MethodPost:
		var dev model.Device
		if err := json.NewDecoder(r.Body).Decode(&dev); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		dev.ID = generateID()
		dev.CreatedAt = time.Now()
		dev.UpdatedAt = time.Now()
		dev.LastSeen = time.Now()
		if err := h.driverMgr.RegisterDevice(dev); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeSuccess(w, dev)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (h *Handler) HandleDeviceByID(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/v1/devices/")
	switch r.Method {
	case http.MethodGet:
		dev, err := h.driverMgr.GetDevice(id)
		if err != nil {
			writeError(w, http.StatusNotFound, err.Error())
			return
		}
		writeSuccess(w, dev)
	case http.MethodPut:
		var dev model.Device
		if err := json.NewDecoder(r.Body).Decode(&dev); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		dev.ID = id
		dev.UpdatedAt = time.Now()
		if err := h.driverMgr.UpdateDevice(dev); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeSuccess(w, dev)
	case http.MethodDelete:
		if err := h.driverMgr.RemoveDevice(id); err != nil {
			writeError(w, http.StatusNotFound, err.Error())
			return
		}
		writeSuccess(w, nil)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (h *Handler) HandleCommands(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		cmds := h.dispatcher.ListCommands()
		writeSuccess(w, cmds)
	case http.MethodPost:
		var cmd model.Command
		if err := json.NewDecoder(r.Body).Decode(&cmd); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		cmd.ID = generateID()
		cmd.Status = model.CommandStatusPending
		cmd.CreatedAt = time.Now()
		if err := h.dispatcher.Enqueue(cmd); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeSuccess(w, cmd)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (h *Handler) HandleCommandByID(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/v1/commands/")
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	cmd, err := h.dispatcher.GetCommand(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeSuccess(w, cmd)
}

func (h *Handler) HandleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	reports := h.collectorSvc.GetAllStatus()
	writeSuccess(w, reports)
}

func (h *Handler) HandleStatusByDevice(w http.ResponseWriter, r *http.Request) {
	deviceID := strings.TrimPrefix(r.URL.Path, "/api/v1/status/")
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	report, err := h.collectorSvc.GetDeviceStatus(deviceID)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeSuccess(w, report)
}

func (h *Handler) HandleTemplates(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		templates := h.templateMgr.List()
		writeSuccess(w, templates)
	case http.MethodPost:
		var tpl model.Template
		if err := json.NewDecoder(r.Body).Decode(&tpl); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		tpl.ID = generateID()
		tpl.CreatedAt = time.Now()
		tpl.UpdatedAt = time.Now()
		if err := h.templateMgr.Create(tpl); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeSuccess(w, tpl)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (h *Handler) HandleTemplateByID(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/v1/templates/")
	switch r.Method {
	case http.MethodGet:
		tpl, err := h.templateMgr.Get(id)
		if err != nil {
			writeError(w, http.StatusNotFound, err.Error())
			return
		}
		writeSuccess(w, tpl)
	case http.MethodPut:
		var tpl model.Template
		if err := json.NewDecoder(r.Body).Decode(&tpl); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		tpl.ID = id
		tpl.UpdatedAt = time.Now()
		if err := h.templateMgr.Update(tpl); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeSuccess(w, tpl)
	case http.MethodDelete:
		if err := h.templateMgr.Delete(id); err != nil {
			writeError(w, http.StatusNotFound, err.Error())
			return
		}
		writeSuccess(w, nil)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (h *Handler) HandleTemplateApply(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		TemplateID string   `json:"template_id"`
		DeviceIDs  []string `json:"device_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	results, err := h.templateMgr.ApplyToDevices(req.TemplateID, req.DeviceIDs, h.driverMgr)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeSuccess(w, results)
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func (h *Handler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	client := &WebSocketClient{conn: conn, send: make(chan []byte, 256)}
	h.wsHub.Register(client)

	go client.WritePump()
	go client.ReadPump(h.wsHub)
}

func generateID() string {
	return strings.ReplaceAll(strings.ToUpper(time.Now().Format("20060102150405.000")), ".", "")
}

func (h *Handler) HandleTemplateImport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	contentType := r.Header.Get("Content-Type")
	if strings.Contains(contentType, "multipart/form-data") {
		err := r.ParseMultipartForm(32 << 20)
		if err != nil {
			writeError(w, http.StatusBadRequest, "failed to parse multipart form")
			return
		}

		files := r.MultipartForm.File["files"]
		if len(files) == 0 {
			writeError(w, http.StatusBadRequest, "no files uploaded")
			return
		}

		filePaths := make([]string, 0, len(files))
		for _, fh := range files {
			file, err := fh.Open()
			if err != nil {
				continue
			}

			tempPath := "/tmp/template_import_" + fh.Filename
			importData, err := io.ReadAll(file)
			file.Close()
			if err != nil {
				continue
			}

			err = os.WriteFile(tempPath, importData, 0644)
			if err != nil {
				continue
			}
			filePaths = append(filePaths, tempPath)
		}

		results, err := h.templateMgr.ImportFiles(filePaths)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		writeSuccess(w, results)
		return
	}

	var req struct {
		Data      string   `json:"data"`
		FilePaths []string `json:"file_paths"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if len(req.FilePaths) > 0 {
		results, err := h.templateMgr.ImportFiles(req.FilePaths)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeSuccess(w, results)
		return
	}

	if req.Data != "" {
		results, err := h.templateMgr.ImportBatch(req.Data)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeSuccess(w, results)
		return
	}

	writeError(w, http.StatusBadRequest, "missing data or file_paths")
}

func (h *Handler) HandleTemplateExport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	data, err := h.templateMgr.ExportAll()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	filename := fmt.Sprintf("templates_backup_%s.json", time.Now().Format("20060102_150405"))
	w.Header().Set("Content-Disposition", "attachment; filename="+filename)
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(data)
}

func (h *Handler) HandleTemplateRestore(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	contentType := r.Header.Get("Content-Type")
	var data []byte
	var err error

	if strings.Contains(contentType, "multipart/form-data") {
		err = r.ParseMultipartForm(50 << 20)
		if err != nil {
			writeError(w, http.StatusBadRequest, "failed to parse form: "+err.Error())
			return
		}

		file, _, err := r.FormFile("file")
		if err != nil {
			writeError(w, http.StatusBadRequest, "no file uploaded: "+err.Error())
			return
		}
		defer file.Close()

		data, err = io.ReadAll(file)
		if err != nil {
			writeError(w, http.StatusBadRequest, "failed to read file: "+err.Error())
			return
		}
	} else {
		data, err = io.ReadAll(r.Body)
		if err != nil {
			writeError(w, http.StatusBadRequest, "failed to read body: "+err.Error())
			return
		}
	}

	result, err := h.templateMgr.Restore(data)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeSuccess(w, result)
}

func (h *Handler) HandleAuthInfo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	info := map[string]interface{}{
		"timestamp": time.Now().Unix(),
		"algorithm": "HMAC-SHA256",
		"header_key": "X-API-Signature",
		"timestamp_header": "X-API-Timestamp",
	}
	writeSuccess(w, info)
}

func computeHMAC(message string, key string) string {
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte(message))
	return hex.EncodeToString(mac.Sum(nil))
}

func (h *Handler) verifySignature(r *http.Request, body []byte) bool {
	if h.secretKey == "" {
		return true
	}

	signature := r.Header.Get("X-API-Signature")
	timestampStr := r.Header.Get("X-API-Timestamp")

	if signature == "" || timestampStr == "" {
		return false
	}

	timestamp, err := strconv.ParseInt(timestampStr, 10, 64)
	if err != nil {
		return false
	}

	now := time.Now().Unix()
	if abs(now-timestamp) > 300 {
		return false
	}

	var bodyStr string
	if len(body) > 0 {
		bodyStr = string(body)
	} else {
		bodyStr = ""
	}

	message := r.Method + "\n" + r.URL.Path + "\n" + timestampStr + "\n" + bodyStr
	expected := computeHMAC(message, h.secretKey)

	return hmac.Equal([]byte(signature), []byte(expected))
}

func abs(x int64) int64 {
	if x < 0 {
		return -x
	}
	return x
}

func (h *Handler) HandleScheduledCommands(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		cmds := h.dispatcher.ListScheduledCommands()
		writeSuccess(w, cmds)
	case http.MethodPost:
		var sc model.ScheduledCommand
		if err := json.NewDecoder(r.Body).Decode(&sc); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		created, err := h.dispatcher.AddScheduledCommand(sc)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeSuccess(w, created)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (h *Handler) HandleScheduledCommandByID(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/v1/scheduled/")
	switch r.Method {
	case http.MethodGet:
		sc, err := h.dispatcher.GetScheduledCommand(id)
		if err != nil {
			writeError(w, http.StatusNotFound, err.Error())
			return
		}
		writeSuccess(w, sc)
	case http.MethodPut:
		var sc model.ScheduledCommand
		if err := json.NewDecoder(r.Body).Decode(&sc); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		sc.ID = id
		if err := h.dispatcher.UpdateScheduledCommand(sc); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeSuccess(w, sc)
	case http.MethodDelete:
		if err := h.dispatcher.DeleteScheduledCommand(id); err != nil {
			writeError(w, http.StatusNotFound, err.Error())
			return
		}
		writeSuccess(w, nil)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (h *Handler) HandleScheduledCommandTrigger(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	id := strings.TrimPrefix(r.URL.Path, "/api/v1/scheduled/trigger/")
	if err := h.dispatcher.TriggerScheduledCommand(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeSuccess(w, map[string]string{"status": "triggered"})
}
