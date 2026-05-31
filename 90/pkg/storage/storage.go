package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

type ExecRecord struct {
	ID         string    `json:"id"`
	Timestamp  time.Time `json:"timestamp"`
	Command    string    `json:"command"`
	ServerName string    `json:"server_name"`
	Host       string    `json:"host"`
	Group      string    `json:"group"`
	Stdout     string    `json:"stdout"`
	Stderr     string    `json:"stderr"`
	ExitCode   int       `json:"exit_code"`
	Error      string    `json:"error,omitempty"`
	Duration   float64   `json:"duration_seconds"`
	RetryCount int       `json:"retry_count"`
	Success    bool      `json:"success"`
}

type BatchRecord struct {
	BatchID   string       `json:"batch_id"`
	Timestamp time.Time    `json:"timestamp"`
	Command   string       `json:"command"`
	Group     string       `json:"group,omitempty"`
	ServerCount int       `json:"server_count"`
	Success   int          `json:"success"`
	Failed    int          `json:"failed"`
	Records   []ExecRecord `json:"records"`
}

type Storage struct {
	baseDir string
	mu      sync.Mutex
}

var (
	defaultStorage *Storage
	once           sync.Once
)

func DefaultStorage() *Storage {
	once.Do(func() {
		defaultStorage = NewStorage("./data")
	})
	return defaultStorage
}

func NewStorage(baseDir string) *Storage {
	_ = os.MkdirAll(baseDir, 0755)
	return &Storage{baseDir: baseDir}
}

func (s *Storage) SaveBatch(batch *BatchRecord) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	dayDir := filepath.Join(s.baseDir, time.Now().Format("2006-01-02"))
	if err := os.MkdirAll(dayDir, 0755); err != nil {
		return err
	}

	fileName := fmt.Sprintf("%s_%s.json", batch.BatchID, batch.Timestamp.Format("150405"))
	filePath := filepath.Join(dayDir, fileName)

	data, err := json.MarshalIndent(batch, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(filePath, data, 0644)
}

func (s *Storage) SaveRecord(record *ExecRecord) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	dayDir := filepath.Join(s.baseDir, time.Now().Format("2006-01-02"))
	if err := os.MkdirAll(dayDir, 0755); err != nil {
		return err
	}

	fileName := fmt.Sprintf("%s_%s.json", record.ID, record.Timestamp.Format("150405"))
	filePath := filepath.Join(dayDir, fileName)

	data, err := json.MarshalIndent(record, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(filePath, data, 0644)
}

func (s *Storage) ListRecords(date string, serverName string, limit int) ([]ExecRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if date == "" {
		date = time.Now().Format("2006-01-02")
	}

	dir := filepath.Join(s.baseDir, date)
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return nil, nil
	}

	var records []ExecRecord

	files, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	for _, file := range files {
		if file.IsDir() || !filepath.HasSuffix(file.Name(), ".json") {
			continue
		}

		data, err := os.ReadFile(filepath.Join(dir, file.Name()))
		if err != nil {
			continue
		}

		var record ExecRecord
		if err := json.Unmarshal(data, &record); err != nil {
			var batch BatchRecord
			if err := json.Unmarshal(data, &batch); err == nil {
				for _, r := range batch.Records {
					if serverName == "" || r.ServerName == serverName {
						records = append(records, r)
					}
				}
			}
			continue
		}

		if serverName == "" || record.ServerName == serverName {
			records = append(records, record)
		}
	}

	sort.Slice(records, func(i, j int) bool {
		return records[i].Timestamp.After(records[j].Timestamp)
	})

	if limit > 0 && len(records) > limit {
		records = records[:limit]
	}

	return records, nil
}

func (s *Storage) ListBatches(date string, limit int) ([]BatchRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if date == "" {
		date = time.Now().Format("2006-01-02")
	}

	dir := filepath.Join(s.baseDir, date)
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return nil, nil
	}

	var batches []BatchRecord

	files, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	for _, file := range files {
		if file.IsDir() || !filepath.HasSuffix(file.Name(), ".json") {
			continue
		}

		data, err := os.ReadFile(filepath.Join(dir, file.Name()))
		if err != nil {
			continue
		}

		var batch BatchRecord
		if err := json.Unmarshal(data, &batch); err != nil {
			continue
		}

		if batch.BatchID != "" {
			batches = append(batches, batch)
		}
	}

	sort.Slice(batches, func(i, j int) bool {
		return batches[i].Timestamp.After(batches[j].Timestamp)
	})

	if limit > 0 && len(batches) > limit {
		batches = batches[:limit]
	}

	return batches, nil
}

func (s *Storage) GetBatch(batchID string) (*BatchRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for daysBack := 0; daysBack < 7; daysBack++ {
		date := time.Now().AddDate(0, 0, -daysBack).Format("2006-01-02")
		dir := filepath.Join(s.baseDir, date)

		if _, err := os.Stat(dir); os.IsNotExist(err) {
			continue
		}

		files, err := os.ReadDir(dir)
		if err != nil {
			continue
		}

		for _, file := range files {
			if file.IsDir() || !filepath.HasSuffix(file.Name(), ".json") {
				continue
			}

			if len(file.Name()) >= len(batchID) && file.Name()[:len(batchID)] == batchID {
				data, err := os.ReadFile(filepath.Join(dir, file.Name()))
				if err != nil {
					continue
				}

				var batch BatchRecord
				if err := json.Unmarshal(data, &batch); err == nil {
					return &batch, nil
				}
			}
		}
	}

	return nil, fmt.Errorf("batch not found: %s", batchID)
}

func GenerateID() string {
	return fmt.Sprintf("batch_%d", time.Now().UnixNano())
}
