package models

type Config struct {
	Server   ServerConfig   `yaml:"server"`
	Database DatabaseConfig `yaml:"database"`
	Redis    RedisConfig    `yaml:"redis"`
	Cluster  ClusterConfig  `yaml:"cluster"`
	FlowCtrl FlowCtrlConfig `yaml:"flowctrl"`
	Cache    CacheConfig    `yaml:"cache"`
	Log      LogConfig      `yaml:"log"`
}

type ServerConfig struct {
	NodeID        string `yaml:"node_id"`
	HTTPAddr      string `yaml:"http_addr"`
	TCPAddr       string `yaml:"tcp_addr"`
	GRPCAddr      string `yaml:"grpc_addr"`
	MetricsAddr   string `yaml:"metrics_addr"`
	MaxConnections int   `yaml:"max_connections"`
	ReadTimeout   int    `yaml:"read_timeout"`
	WriteTimeout  int    `yaml:"write_timeout"`
	AuthEnabled   bool   `yaml:"auth_enabled"`
}

type DatabaseConfig struct {
	Driver          string `yaml:"driver"`
	Host            string `yaml:"host"`
	Port            int    `yaml:"port"`
	User            string `yaml:"user"`
	Password        string `yaml:"password"`
	DBName          string `yaml:"dbname"`
	MaxOpenConns    int    `yaml:"max_open_conns"`
	MaxIdleConns    int    `yaml:"max_idle_conns"`
	ConnMaxLifetime int    `yaml:"conn_max_lifetime"`
	ShardingEnabled bool   `yaml:"sharding_enabled"`
	ShardCount      int    `yaml:"shard_count"`
	BatchSize       int    `yaml:"batch_size"`
	FlushInterval   int    `yaml:"flush_interval"`
	MultiDB         MultiDBConfig `yaml:"multi_db"`
}

type MultiDBConfig struct {
	Enabled         bool                   `yaml:"enabled"`
	Strategy        string                 `yaml:"strategy"`
	ShardCount      int                    `yaml:"shard_count"`
	MonthRetention  int                    `yaml:"month_retention"`
	RegionDatabases map[string]DBInstanceConfig `yaml:"region_databases"`
	ShardDatabases  []DBInstanceConfig     `yaml:"shard_databases"`
}

type DBInstanceConfig struct {
	Name     string `yaml:"name"`
	Driver   string `yaml:"driver"`
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	User     string `yaml:"user"`
	Password string `yaml:"password"`
	DBName   string `yaml:"dbname"`
	Weight   int    `yaml:"weight"`
	ReadOnly bool   `yaml:"read_only"`
	Region   string `yaml:"region"`
}

type RedisConfig struct {
	Addr         string   `yaml:"addr"`
	Password     string   `yaml:"password"`
	DB           int      `yaml:"db"`
	ClusterAddrs []string `yaml:"cluster_addrs"`
	ClusterMode  bool     `yaml:"cluster_mode"`
	PoolSize     int      `yaml:"pool_size"`
	MinIdleConns int      `yaml:"min_idle_conns"`
	DialTimeout  int      `yaml:"dial_timeout"`
	ReadTimeout  int      `yaml:"read_timeout"`
	WriteTimeout int      `yaml:"write_timeout"`
}

type ClusterConfig struct {
	Enabled        bool     `yaml:"enabled"`
	ServiceName    string   `yaml:"service_name"`
	RegisterAddr   string   `yaml:"register_addr"`
	RegistryType   string   `yaml:"registry_type"`
	LoadBalance    string   `yaml:"load_balance"`
	RegionRouter   bool     `yaml:"region_router"`
	RegionMap      map[string][]string `yaml:"region_map"`
	HealthCheck    HealthCheckConfig `yaml:"health_check"`
	RegionWhitelist RegionWhitelistConfig `yaml:"region_whitelist"`
	AutoScaling    AutoScalingConfig `yaml:"auto_scaling"`
}

type RegionWhitelistConfig struct {
	Enabled            bool              `yaml:"enabled"`
	Mode               string            `yaml:"mode"`
	DefaultAllowRegions []string         `yaml:"default_allow_regions"`
	DeviceRegionMap    map[string]string `yaml:"device_region_map"`
}

type AutoScalingConfig struct {
	Enabled              bool    `yaml:"enabled"`
	MaxNodes             int     `yaml:"max_nodes"`
	MinNodes             int     `yaml:"min_nodes"`
	ScaleUpThreshold     float64 `yaml:"scale_up_threshold"`
	ScaleDownThreshold   float64 `yaml:"scale_down_threshold"`
	ScaleUpCooldown      int     `yaml:"scale_up_cooldown"`
	ScaleDownCooldown    int     `yaml:"scale_down_cooldown"`
	TrafficMigrationRate float64 `yaml:"traffic_migration_rate"`
	NodeWarmupDuration   int     `yaml:"node_warmup_duration"`
}

type HealthCheckConfig struct {
	Interval int    `yaml:"interval"`
	Timeout  int    `yaml:"timeout"`
	Path     string `yaml:"path"`
}

type FlowCtrlConfig struct {
	Enabled          bool    `yaml:"enabled"`
	GlobalQPS        int     `yaml:"global_qps"`
	PerDeviceQPS     int     `yaml:"per_device_qps"`
	PerIPQPS         int     `yaml:"per_ip_qps"`
	BurstRatio       float64 `yaml:"burst_ratio"`
	LimiterType      string  `yaml:"limiter_type"`
	CircuitBreaker   CircuitBreakerConfig `yaml:"circuit_breaker"`
}

type CircuitBreakerConfig struct {
	Enabled          bool    `yaml:"enabled"`
	FailureThreshold float64 `yaml:"failure_threshold"`
	RequestCount     int     `yaml:"request_count"`
	Timeout          int     `yaml:"timeout"`
	HalfOpenMaxCalls int     `yaml:"half_open_max_calls"`
}

type CacheConfig struct {
	OfflineDataTTL   int    `yaml:"offline_data_ttl"`
	MaxOfflineSize   int    `yaml:"max_offline_size"`
	CompressEnabled  bool   `yaml:"compress_enabled"`
	CompressMinSize  int    `yaml:"compress_min_size"`
	RetryQueueSize   int    `yaml:"retry_queue_size"`
	RetryMaxAttempts int    `yaml:"retry_max_attempts"`
}

type LogConfig struct {
	Level      string `yaml:"level"`
	Format     string `yaml:"format"`
	Output     string `yaml:"output"`
	Filename   string `yaml:"filename"`
	MaxSize    int    `yaml:"max_size"`
	MaxBackups int    `yaml:"max_backups"`
	MaxAge     int    `yaml:"max_age"`
	Compress   bool   `yaml:"compress"`
}
