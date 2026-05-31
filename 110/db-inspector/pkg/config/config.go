package config

import (
	"errors"
	"fmt"
	"os"
	"sync"

	"gopkg.in/yaml.v3"
)

type DBType string

const (
	MySQL    DBType = "mysql"
	Postgres DBType = "postgres"
	SQLite   DBType = "sqlite"
)

type DBNode struct {
	Name     string `yaml:"name"`
	Type     DBType `yaml:"type"`
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	User     string `yaml:"user"`
	Password string `yaml:"password"`
	Database string `yaml:"database"`
	SSLMode  string `yaml:"ssl_mode"`
	Path     string `yaml:"path"`
}

type Cluster struct {
	Name  string   `yaml:"name"`
	Group string   `yaml:"group,omitempty"`
	Nodes []DBNode `yaml:"nodes"`
}

type InspectionGroup struct {
	Name        string   `yaml:"name"`
	Description string   `yaml:"description,omitempty"`
	Clusters    []string `yaml:"clusters"`
}

type SlowQueryPolicy struct {
	ThresholdMs    int64 `yaml:"threshold_ms"`
	TopN           int   `yaml:"top_n"`
	IncludeExplain bool  `yaml:"include_explain"`
}

type InspectionConfig struct {
	Clusters       []Cluster         `yaml:"clusters"`
	Groups         []InspectionGroup `yaml:"groups,omitempty"`
	SlowQuery      SlowQueryPolicy   `yaml:"slow_query"`
	OutputDir      string            `yaml:"output_dir"`
	ReportFormat   string            `yaml:"report_format"`
	ParallelConns  int               `yaml:"parallel_conns"`
	ConnectTimeout int             `yaml:"connect_timeout"`
	ReadTimeout    int               `yaml:"read_timeout"`
	RetryCount     int               `yaml:"retry_count"`
	RetryDelayMs   int               `yaml:"retry_delay_ms"`
	MaxSQLTextLen  int               `yaml:"max_sql_text_len"`
	SlowLogWindow  int               `yaml:"slow_log_window"`
	HistoryDir     string            `yaml:"history_dir"`
	HistoryRetentionDays int               `yaml:"history_retention_days"`
}

var (
	globalCfg *InspectionConfig
	configMu  sync.RWMutex
)

func DefaultConfig() *InspectionConfig {
	return &InspectionConfig{
		SlowQuery: SlowQueryPolicy{
			ThresholdMs:    1000,
			TopN:           20,
			IncludeExplain: true,
		},
		OutputDir:      "./reports",
		ReportFormat:   "text",
		ParallelConns:  5,
		ConnectTimeout: 10,
		ReadTimeout:    30,
		RetryCount:     2,
		RetryDelayMs:   500,
		MaxSQLTextLen:  4096,
		SlowLogWindow:  24,
		HistoryDir:     "./history",
		HistoryRetentionDays: 30,
	}
}

func LoadConfig(path string) (*InspectionConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config file %s: %w", path, err)
	}
	cfg := DefaultConfig()
	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("parse config file %s: %w", path, err)
	}
	if err := validateConfig(cfg); err != nil {
		return nil, err
	}
	configMu.Lock()
	globalCfg = cfg
	configMu.Unlock()
	return cfg, nil
}

func SaveConfig(path string, cfg *InspectionConfig) error {
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("write config file %s: %w", path, err)
	}
	return nil
}

func GetConfig() *InspectionConfig {
	configMu.RLock()
	defer configMu.RUnlock()
	if globalCfg == nil {
		return DefaultConfig()
	}
	return globalCfg
}

func AddCluster(path string, cluster Cluster) error {
	cfg, err := LoadConfig(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			cfg = DefaultConfig()
		} else {
			return err
		}
	}
	for _, c := range cfg.Clusters {
		if c.Name == cluster.Name {
			return fmt.Errorf("cluster %s already exists", cluster.Name)
		}
	}
	cfg.Clusters = append(cfg.Clusters, cluster)
	return SaveConfig(path, cfg)
}

func RemoveCluster(path string, name string) error {
	cfg, err := LoadConfig(path)
	if err != nil {
		return err
	}
	found := false
	newClusters := make([]Cluster, 0, len(cfg.Clusters))
	for _, c := range cfg.Clusters {
		if c.Name == name {
			found = true
			continue
		}
		newClusters = append(newClusters, c)
	}
	if !found {
		return fmt.Errorf("cluster %s not found", name)
	}
	cfg.Clusters = newClusters
	return SaveConfig(path, cfg)
}

func ListClusters(path string) ([]Cluster, error) {
	cfg, err := LoadConfig(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []Cluster{}, nil
		}
		return nil, err
	}
	return cfg.Clusters, nil
}

func AddNode(path string, clusterName string, node DBNode) error {
	cfg, err := LoadConfig(path)
	if err != nil {
		return err
	}
	for i, c := range cfg.Clusters {
		if c.Name == clusterName {
			for _, n := range c.Nodes {
				if n.Name == node.Name {
					return fmt.Errorf("node %s already exists in cluster %s", node.Name, clusterName)
				}
			}
			cfg.Clusters[i].Nodes = append(cfg.Clusters[i].Nodes, node)
			return SaveConfig(path, cfg)
		}
	}
	return fmt.Errorf("cluster %s not found", clusterName)
}

func RemoveNode(path string, clusterName string, nodeName string) error {
	cfg, err := LoadConfig(path)
	if err != nil {
		return err
	}
	for i, c := range cfg.Clusters {
		if c.Name == clusterName {
			newNodes := make([]DBNode, 0, len(c.Nodes))
			found := false
			for _, n := range c.Nodes {
				if n.Name == nodeName {
					found = true
					continue
				}
				newNodes = append(newNodes, n)
			}
			if !found {
				return fmt.Errorf("node %s not found in cluster %s", nodeName, clusterName)
			}
			cfg.Clusters[i].Nodes = newNodes
			return SaveConfig(path, cfg)
		}
	}
	return fmt.Errorf("cluster %s not found", clusterName)
}

func AddGroup(path string, group InspectionGroup) error {
	cfg, err := LoadConfig(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			cfg = DefaultConfig()
		} else {
			return err
		}
	}
	for _, g := range cfg.Groups {
		if g.Name == group.Name {
			return fmt.Errorf("group %s already exists", group.Name)
		}
	}
	for _, cname := range group.Clusters {
		found := false
		for _, c := range cfg.Clusters {
			if c.Name == cname {
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("cluster %s in group %s does not exist", cname, group.Name)
		}
	}
	cfg.Groups = append(cfg.Groups, group)
	return SaveConfig(path, cfg)
}

func RemoveGroup(path string, name string) error {
	cfg, err := LoadConfig(path)
	if err != nil {
		return err
	}
	found := false
	newGroups := make([]InspectionGroup, 0, len(cfg.Groups))
	for _, g := range cfg.Groups {
		if g.Name == name {
			found = true
			continue
		}
		newGroups = append(newGroups, g)
	}
	if !found {
		return fmt.Errorf("group %s not found", name)
	}
	cfg.Groups = newGroups
	return SaveConfig(path, cfg)
}

func ListGroups(path string) ([]InspectionGroup, error) {
	cfg, err := LoadConfig(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []InspectionGroup{}, nil
		}
		return nil, err
	}
	return cfg.Groups, nil
}

func FilterClustersByGroup(cfg *InspectionConfig, groupNames []string) ([]Cluster, error) {
	if len(groupNames) == 0 {
		return cfg.Clusters, nil
	}
	clusterMap := make(map[string]bool)
	for _, gname := range groupNames {
		found := false
		for _, g := range cfg.Groups {
			if g.Name == gname {
				found = true
				for _, cname := range g.Clusters {
					clusterMap[cname] = true
				}
				break
			}
		}
		if !found {
			return nil, fmt.Errorf("group %s not found", gname)
		}
	}
	var result []Cluster
	for _, c := range cfg.Clusters {
		if clusterMap[c.Name] {
			result = append(result, c)
		}
	}
	return result, nil
}

func (n DBNode) DSN() string {
	switch n.Type {
	case MySQL:
		return fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?timeout=%ds&readTimeout=%ds&parseTime=true",
			n.User, n.Password, n.Host, n.Port, n.Database, n.ConnectTimeout(), n.ReadTimeout())
	case Postgres:
		sslMode := n.SSLMode
		if sslMode == "" {
			sslMode = "disable"
		}
		return fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=%s connect_timeout=%d",
			n.Host, n.Port, n.User, n.Password, n.Database, sslMode, n.ConnectTimeout())
	case SQLite:
		return n.Path
	default:
		return ""
	}
}

func (n DBNode) ReadTimeout() int {
	cfg := GetConfig()
	if cfg.ReadTimeout > 0 {
		return cfg.ReadTimeout
	}
	return 30
}

func (n DBNode) ConnectTimeout() int {
	cfg := GetConfig()
	if cfg.ConnectTimeout > 0 {
		return cfg.ConnectTimeout
	}
	return 10
}

func validateConfig(cfg *InspectionConfig) error {
	if len(cfg.Clusters) == 0 {
		return fmt.Errorf("no clusters configured")
	}
	names := make(map[string]bool)
	for _, c := range cfg.Clusters {
		if names[c.Name] {
			return fmt.Errorf("duplicate cluster name: %s", c.Name)
		}
		names[c.Name] = true
		for _, n := range c.Nodes {
			if n.Type != MySQL && n.Type != Postgres && n.Type != SQLite {
				return fmt.Errorf("unsupported db type %s for node %s", n.Type, n.Name)
			}
		}
	}
	return nil
}

func InitDefaultConfigFile(path string) error {
	cfg := DefaultConfig()
	cfg.Clusters = []Cluster{
		{
			Name:  "example-cluster",
			Group: "production",
			Nodes: []DBNode{
				{
					Name:     "mysql-master",
					Type:     MySQL,
					Host:     "127.0.0.1",
					Port:     3306,
					User:     "root",
					Password: "",
					Database: "test",
				},
			},
		},
	}
	cfg.Groups = []InspectionGroup{
		{
			Name:        "production",
			Description: "生产环境集群",
			Clusters:    []string{"example-cluster"},
		},
	}
	return SaveConfig(path, cfg)
}
