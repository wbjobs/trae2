package template

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
	"sync"
	"unicode/utf8"

	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/transform"

	"icc-server/internal/driver"
	"icc-server/internal/model"
)

type Manager struct {
	templates map[string]*model.Template
	mu        sync.RWMutex
}

func NewManager() *Manager {
	return &Manager{
		templates: make(map[string]*model.Template),
	}
}

func (m *Manager) Create(tpl model.Template) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.templates[tpl.ID]; exists {
		return fmt.Errorf("template %s already exists", tpl.ID)
	}

	m.templates[tpl.ID] = &tpl
	log.Printf("[Template] Created: %s (type=%s)", tpl.Name, tpl.DeviceType)
	return nil
}

func (m *Manager) Get(id string) (*model.Template, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	tpl, ok := m.templates[id]
	if !ok {
		return nil, fmt.Errorf("template %s not found", id)
	}
	return tpl, nil
}

func (m *Manager) Update(tpl model.Template) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.templates[tpl.ID]; !ok {
		return fmt.Errorf("template %s not found", tpl.ID)
	}

	tpl.UpdatedAt = time.Now()
	m.templates[tpl.ID] = &tpl
	log.Printf("[Template] Updated: %s", tpl.Name)
	return nil
}

func (m *Manager) Delete(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	tpl, ok := m.templates[id]
	if !ok {
		return fmt.Errorf("template %s not found", id)
	}

	delete(m.templates, id)
	log.Printf("[Template] Deleted: %s", tpl.Name)
	return nil
}

func (m *Manager) List() []*model.Template {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*model.Template, 0, len(m.templates))
	for _, tpl := range m.templates {
		result = append(result, tpl)
	}
	return result
}

func (m *Manager) ApplyToDevices(templateID string, deviceIDs []string, driverMgr *driver.Manager) (map[string]interface{}, error) {
	tpl, err := m.Get(templateID)
	if err != nil {
		return nil, err
	}

	results := make(map[string]interface{})
	var successCount, failCount int

	for _, deviceID := range deviceIDs {
		err := driverMgr.ApplyTemplate(deviceID, tpl.Params)
		if err != nil {
			results[deviceID] = map[string]interface{}{
				"success": false,
				"error":   err.Error(),
			}
			failCount++
		} else {
			results[deviceID] = map[string]interface{}{
				"success": true,
				"params_applied": len(tpl.Params),
			}
			successCount++
		}
	}

	log.Printf("[Template] Applied %s to %d devices: %d success, %d failed",
		tpl.Name, len(deviceIDs), successCount, failCount)

	return map[string]interface{}{
		"template_id": templateID,
		"total":       len(deviceIDs),
		"success":     successCount,
		"failed":      failCount,
		"results":     results,
	}, nil
}

func (m *Manager) Export(id string) (string, error) {
	tpl, err := m.Get(id)
	if err != nil {
		return "", err
	}

	data, err := json.MarshalIndent(tpl, "", "  ")
	if err != nil {
		return "", err
	}

	return string(data), nil
}

func (m *Manager) Import(data string) (*model.Template, error) {
	var tpl model.Template
	if err := json.Unmarshal([]byte(data), &tpl); err != nil {
		return nil, fmt.Errorf("invalid template data: %w", err)
	}

	tpl.ID = generateID()
	tpl.CreatedAt = time.Now()
	tpl.UpdatedAt = time.Now()

	if err := m.Create(tpl); err != nil {
		return nil, err
	}

	return &tpl, nil
}

func generateID() string {
	return "TPL" + time.Now().Format("20060102150405")
}

func (m *Manager) ImportBatch(data string) (map[string]interface{}, error) {
	data = strings.TrimSpace(data)
	if strings.HasPrefix(data, "[") {
		var templates []model.Template
		if err := json.Unmarshal([]byte(data), &templates); err != nil {
			return nil, fmt.Errorf("invalid template array: %w", err)
		}

		var successCount, failCount int
		results := make(map[string]interface{})
		imported := make([]*model.Template, 0)
		errors := make([]string, 0)

		for _, tpl := range templates {
			tpl.ID = generateID()
			tpl.CreatedAt = time.Now()
			tpl.UpdatedAt = time.Now()

			if err := m.Create(tpl); err != nil {
				failCount++
				errors = append(errors, fmt.Sprintf("template '%s': %s", tpl.Name, err.Error()))
			} else {
				successCount++
				imported = append(imported, &tpl)
			}
		}

		results["total"] = len(templates)
		results["success"] = successCount
		results["failed"] = failCount
		results["imported"] = imported
		if len(errors) > 0 {
			results["errors"] = errors
		}

		log.Printf("[Template] Batch import completed: %d/%d success", successCount, len(templates))
		return results, nil
	}

	var tpl model.Template
	if err := json.Unmarshal([]byte(data), &tpl); err != nil {
		return nil, fmt.Errorf("invalid template data: %w", err)
	}

	tpl.ID = generateID()
	tpl.CreatedAt = time.Now()
	tpl.UpdatedAt = time.Now()

	if err := m.Create(tpl); err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"total":   1,
		"success": 1,
		"failed":  0,
		"imported": []*model.Template{&tpl},
	}, nil
}

func (m *Manager) ImportFiles(filePaths []string) (map[string]interface{}, error) {
	var total, successCount, failCount int
	imported := make([]*model.Template, 0)
	fileResults := make(map[string]interface{})
	errors := make([]string, 0)

	for _, filePath := range filePaths {
		fileResult := map[string]interface{}{
			"file": filePath,
		}

		data, err := readFileAutoDecode(filePath)
		if err != nil {
			failCount++
			total++
			errors = append(errors, fmt.Sprintf("file '%s': read failed: %s", filePath, err.Error()))
			fileResult["success"] = false
			fileResult["error"] = err.Error()
			fileResults[filePath] = fileResult
			continue
		}

		contentStr := strings.TrimSpace(string(data))
		if len(contentStr) == 0 {
			failCount++
			total++
			errors = append(errors, fmt.Sprintf("file '%s': empty file", filePath))
			fileResult["success"] = false
			fileResult["error"] = "empty file"
			fileResults[filePath] = fileResult
			continue
		}

		var templates []model.Template
		var singleTpl model.Template
		var isArray bool

		if strings.HasPrefix(contentStr, "[") {
			isArray = true
			if err := json.Unmarshal([]byte(contentStr), &templates); err != nil {
				failCount++
				total++
				errors = append(errors, fmt.Sprintf("file '%s': invalid JSON array: %s", filePath, err.Error()))
				fileResult["success"] = false
				fileResult["error"] = err.Error()
				fileResults[filePath] = fileResult
				continue
			}
			total += len(templates)
		} else {
			isArray = false
			if err := json.Unmarshal([]byte(contentStr), &singleTpl); err != nil {
				failCount++
				total++
				errors = append(errors, fmt.Sprintf("file '%s': invalid JSON object: %s", filePath, err.Error()))
				fileResult["success"] = false
				fileResult["error"] = err.Error()
				fileResults[filePath] = fileResult
				continue
			}
			templates = []model.Template{singleTpl}
			total++
		}

		fileSuccess := 0
		fileErrors := make([]string, 0)
		for _, tpl := range templates {
			tpl.ID = generateID()
			tpl.CreatedAt = time.Now()
			tpl.UpdatedAt = time.Now()

			if err := m.Create(tpl); err != nil {
				failCount++
				fileErrors = append(fileErrors, fmt.Sprintf("template '%s': %s", tpl.Name, err.Error()))
			} else {
				successCount++
				fileSuccess++
				imported = append(imported, &tpl)
			}
		}

		fileResult["success"] = fileSuccess
		fileResult["total"] = len(templates)
		fileResult["failed"] = len(templates) - fileSuccess
		if len(fileErrors) > 0 {
			fileResult["errors"] = fileErrors
			errors = append(errors, fileErrors...)
		}
		if isArray {
			fileResult["type"] = "array"
		} else {
			fileResult["type"] = "single"
		}
		fileResults[filePath] = fileResult
	}

	result := map[string]interface{}{
		"total":        total,
		"success":      successCount,
		"failed":       failCount,
		"imported":     imported,
		"file_results": fileResults,
	}
	if len(errors) > 0 {
		result["errors"] = errors
	}

	log.Printf("[Template] File batch import completed: %d/%d templates, %d files",
		successCount, total, len(filePaths))
	return result, nil
}

func readFileAutoDecode(path string) ([]byte, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	if len(data) >= 3 && data[0] == 0xEF && data[1] == 0xBB && data[2] == 0xBF {
		data = data[3:]
	}

	if utf8.Valid(data) {
		return data, nil
	}

	reader := transform.NewReader(bytes.NewReader(data), simplifiedchinese.GBK.NewDecoder())
	decoded, err := io.ReadAll(reader)
	if err != nil {
		return data, nil
	}
	return decoded, nil
}

func (m *Manager) ExportAll() ([]byte, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	templates := make([]*model.Template, 0, len(m.templates))
	for _, tpl := range m.templates {
		templates = append(templates, tpl)
	}

	bundle := map[string]interface{}{
		"version":     "1.0",
		"exported_at": time.Now().Format(time.RFC3339),
		"count":       len(templates),
		"templates":   templates,
	}

	return json.MarshalIndent(bundle, "", "  ")
}

func (m *Manager) Restore(data []byte) (map[string]interface{}, error) {
	var bundle struct {
		Version   string            `json:"version"`
		ExportedAt string           `json:"exported_at"`
		Count     int               `json:"count"`
		Templates []model.Template  `json:"templates"`
	}

	if err := json.Unmarshal(data, &bundle); err != nil {
		return nil, fmt.Errorf("invalid backup format: %w", err)
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	successCount := 0
	failCount := 0
	imported := make([]*model.Template, 0)
	errors := make([]string, 0)

	for _, tpl := range bundle.Templates {
		if tpl.ID == "" {
			tpl.ID = generateID()
		} else if _, exists := m.templates[tpl.ID]; exists {
			origID := tpl.ID
			tpl.ID = generateID()
			log.Printf("[Template] Backup restore: ID %s exists, renamed to %s", origID, tpl.ID)
		}
		tpl.CreatedAt = time.Now()
		tpl.UpdatedAt = time.Now()

		m.templates[tpl.ID] = &tpl
		successCount++
		imported = append(imported, &tpl)
	}

	if err := m.save(); err != nil {
		return nil, err
	}

	log.Printf("[Template] Backup restore complete: %d restored, %d failed", successCount, failCount)

	return map[string]interface{}{
		"version":   bundle.Version,
		"exported_at": bundle.ExportedAt,
		"total":     successCount + failCount,
		"success":   successCount,
		"failed":    failCount,
		"imported":  imported,
		"errors":    errors,
	}, nil
}
