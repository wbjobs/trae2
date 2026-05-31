package history

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"db-inspector/pkg/analysis"
	"db-inspector/pkg/stats"
	"db-inspector/pkg/suggest"
)

type InspectionSummary struct {
	ID               string        `json:"id"`
	StartedAt        time.Time     `json:"started_at"`
	FinishedAt       time.Time     `json:"finished_at"`
	DurationMs       int64         `json:"duration_ms"`
	Groups           []string      `json:"groups,omitempty"`
	TotalClusters    int           `json:"total_clusters"`
	TotalNodes       int           `json:"total_nodes"`
	HealthyNodes     int           `json:"healthy_nodes"`
	TotalSlowQueries int           `json:"total_slow_queries"`
	AvgResponseMs    int64         `json:"avg_response_ms"`
	MaxResponseMs    int64         `json:"max_response_ms"`
	IssuesCount      int           `json:"issues_count"`
	OptimizationCount int          `json:"optimization_count"`
	ReportPath       string        `json:"report_path,omitempty"`
	HTMLReportPath   string        `json:"html_report_path,omitempty"`
}

type InspectionRecord struct {
	Summary       InspectionSummary       `json:"summary"`
	GlobalStats   stats.GlobalStats       `json:"global_stats"`
	Reports       []suggest.Report        `json:"reports"`
	AllAnalysis   []analysis.AnalysisResult `json:"all_analysis"`
}

type Store struct {
	baseDir        string
	retentionDays  int
}

func NewStore(baseDir string, retentionDays int) *Store {
	if baseDir == "" {
		baseDir = "./history"
	}
	if retentionDays <= 0 {
		retentionDays = 30
	}
	return &Store{
		baseDir:       baseDir,
		retentionDays: retentionDays,
	}
}

func (s *Store) Save(record InspectionRecord) (string, error) {
	dateDir := record.Summary.StartedAt.Format("2006-01-02")
	dir := filepath.Join(s.baseDir, dateDir)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("create history dir: %w", err)
	}

	recordID := record.Summary.ID
	jsonPath := filepath.Join(dir, fmt.Sprintf("%s.json", recordID))

	data, err := json.MarshalIndent(record, "", "  ")
	if err != nil {
		return "", fmt.Errorf("marshal record: %w", err)
	}

	if err := os.WriteFile(jsonPath, data, 0644); err != nil {
		return "", fmt.Errorf("write history file: %w", err)
	}

	if err := s.Cleanup(); err != nil {
		fmt.Fprintf(os.Stderr, "[WARN] cleanup old history failed: %v\n", err)
	}

	return jsonPath, nil
}

func (s *Store) Load(recordID string) (*InspectionRecord, error) {
	pattern := filepath.Join(s.baseDir, "*", fmt.Sprintf("%s.json", recordID))
	matches, err := filepath.Glob(pattern)
	if err != nil {
		return nil, fmt.Errorf("search record: %w", err)
	}
	if len(matches) == 0 {
		return nil, fmt.Errorf("record %s not found", recordID)
	}

	data, err := os.ReadFile(matches[0])
	if err != nil {
		return nil, fmt.Errorf("read record: %w", err)
	}

	var record InspectionRecord
	if err := json.Unmarshal(data, &record); err != nil {
		return nil, fmt.Errorf("parse record: %w", err)
	}
	return &record, nil
}

func (s *Store) List(dateFilter string, clusterFilter string, groupFilter string, limit int) ([]InspectionSummary, error) {
	var summaries []InspectionSummary

	dirPattern := filepath.Join(s.baseDir, "*")
	if dateFilter != "" {
		dirPattern = filepath.Join(s.baseDir, dateFilter)
	}

	dirs, err := filepath.Glob(dirPattern)
	if err != nil {
		return nil, fmt.Errorf("list date dirs: %w", err)
	}

	sort.Sort(sort.Reverse(sort.StringSlice(dirs)))

	for _, dir := range dirs {
		if !isDateDir(dir) {
			continue
		}
		files, err := filepath.Glob(filepath.Join(dir, "*.json"))
		if err != nil {
			continue
		}
		sort.Sort(sort.Reverse(sort.StringSlice(files)))

		for _, f := range files {
			data, err := os.ReadFile(f)
			if err != nil {
				continue
			}
			var record InspectionRecord
			if err := json.Unmarshal(data, &record); err != nil {
				continue
			}

			if clusterFilter != "" && !containsCluster(record.Summary, clusterFilter) {
				continue
			}
			if groupFilter != "" && !containsGroup(record.Summary, groupFilter) {
				continue
			}

			summaries = append(summaries, record.Summary)
			if limit > 0 && len(summaries) >= limit {
				return summaries, nil
			}
		}
	}

	return summaries, nil
}

func (s *Store) Cleanup() error {
	cutoff := time.Now().AddDate(0, 0, -s.retentionDays)
	dirs, err := filepath.Glob(filepath.Join(s.baseDir, "*"))
	if err != nil {
		return fmt.Errorf("list dirs: %w", err)
	}

	for _, dir := range dirs {
		info, err := os.Stat(dir)
		if err != nil || !info.IsDir() {
			continue
		}
		name := filepath.Base(dir)
		dirDate, err := time.Parse("2006-01-02", name)
		if err != nil {
			continue
		}
		if dirDate.Before(cutoff) {
			if err := os.RemoveAll(dir); err != nil {
				fmt.Fprintf(os.Stderr, "[WARN] remove old dir %s failed: %v\n", dir, err)
			}
		}
	}
	return nil
}

func (s *Store) Delete(recordID string) error {
	pattern := filepath.Join(s.baseDir, "*", fmt.Sprintf("%s.json", recordID))
	matches, err := filepath.Glob(pattern)
	if err != nil {
		return fmt.Errorf("search record: %w", err)
	}
	if len(matches) == 0 {
		return fmt.Errorf("record %s not found", recordID)
	}
	for _, m := range matches {
		if err := os.Remove(m); err != nil {
			return fmt.Errorf("delete record: %w", err)
		}
	}
	return nil
}

func (s *Store) Stats() (int, int64, error) {
	totalRecords := 0
	var totalSize int64

	err := filepath.Walk(s.baseDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() && strings.HasSuffix(info.Name(), ".json") {
			totalRecords++
			totalSize += info.Size()
		}
		return nil
	})
	if err != nil && !os.IsNotExist(err) {
		return 0, 0, err
	}
	return totalRecords, totalSize, nil
}

func isDateDir(dir string) bool {
	name := filepath.Base(dir)
	_, err := time.Parse("2006-01-02", name)
	return err == nil
}

func containsCluster(s InspectionSummary, clusterName string) bool {
	for _, c := range strings.Split(clusterName, ",") {
		c = strings.TrimSpace(c)
		if strings.Contains(strings.ToLower(s.ID), strings.ToLower(c)) {
			return true
		}
	}
	return true
}

func containsGroup(s InspectionSummary, groupName string) bool {
	groups := strings.Split(groupName, ",")
	for _, g := range groups {
		g = strings.TrimSpace(strings.ToLower(g))
		for _, sg := range s.Groups {
			if strings.ToLower(sg) == g {
				return true
			}
		}
	}
	return len(groups) == 0
}

func NewSummary(
	id string, startedAt, finishedAt time.Time, groups []string,
	globalStats stats.GlobalStats, reports []suggest.Report,
) InspectionSummary {
	issuesCount := 0
	optCount := 0
	for _, r := range reports {
		optCount += len(r.Suggestions)
		for _, s := range r.Suggestions {
			if s.Priority == "IMMEDIATE" || s.Priority == "CRITICAL" || s.Priority == "HIGH" {
				issuesCount++
			}
		}
	}

	return InspectionSummary{
		ID:                id,
		StartedAt:         startedAt,
		FinishedAt:        finishedAt,
		DurationMs:        finishedAt.Sub(startedAt).Milliseconds(),
		Groups:            groups,
		TotalClusters:     globalStats.TotalClusters,
		TotalNodes:        globalStats.TotalNodes,
		HealthyNodes:      globalStats.TotalNodes,
		TotalSlowQueries:  globalStats.TotalQueries,
		AvgResponseMs:     globalStats.OverallAvgTimeMs,
		MaxResponseMs:     globalStats.OverallMaxTimeMs,
		IssuesCount:       issuesCount,
		OptimizationCount: optCount,
	}
}
