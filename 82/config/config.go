package config

import (
	"fmt"

	"github.com/spf13/viper"
	"binary-parser-cluster/pkg/api"
	"binary-parser-cluster/pkg/database"
	"binary-parser-cluster/pkg/logger"
	"binary-parser-cluster/pkg/protocol"
	"binary-parser-cluster/pkg/validator"
)

type Config struct {
	API        *api.APIConfig        `mapstructure:"api"`
	Database   *database.DBConfig    `mapstructure:"database"`
	Logger     *logger.LogConfig     `mapstructure:"logger"`
	Protocol   *ProtocolConfig       `mapstructure:"protocol"`
	Validator  *validator.ValidatorConfig `mapstructure:"validator"`
	Cluster    *ClusterConfig        `mapstructure:"cluster"`
}

type ProtocolConfig struct {
	Serial  *protocol.SerialConfig  `mapstructure:"serial"`
	TCP     *protocol.TCPConfig     `mapstructure:"tcp"`
	Private *protocol.PrivateConfig `mapstructure:"private"`
}

type ClusterConfig struct {
	Enabled       bool     `mapstructure:"enabled"`
	Strategy      string   `mapstructure:"strategy"`
	Nodes         []string `mapstructure:"nodes"`
	Weights       []int    `mapstructure:"weights"`
	HeartbeatSecs int      `mapstructure:"heartbeat_secs"`
}

func Load(configPath string) (*Config, error) {
	v := viper.New()
	v.SetConfigFile(configPath)
	v.SetConfigType("yaml")

	v.SetDefault("api.host", "0.0.0.0")
	v.SetDefault("api.port", 8080)
	v.SetDefault("api.mode", "debug")
	v.SetDefault("api.enable_cluster", true)

	v.SetDefault("database.host", "localhost")
	v.SetDefault("database.port", 5432)
	v.SetDefault("database.user", "postgres")
	v.SetDefault("database.password", "postgres")
	v.SetDefault("database.dbname", "parser_db")
	v.SetDefault("database.sslmode", "disable")
	v.SetDefault("database.max_conns", 20)

	v.SetDefault("logger.log_level", "info")
	v.SetDefault("logger.log_dir", "./logs")
	v.SetDefault("logger.max_file_size", 104857600)
	v.SetDefault("logger.max_backups", 10)
	v.SetDefault("logger.compress", false)
	v.SetDefault("logger.console_output", true)

	v.SetDefault("validator.enable_crc16", true)
	v.SetDefault("validator.enable_crc32", true)
	v.SetDefault("validator.enable_length_check", true)
	v.SetDefault("validator.min_packet_len", 4)
	v.SetDefault("validator.max_packet_len", 65535)

	v.SetDefault("cluster.enabled", true)
	v.SetDefault("cluster.strategy", "round_robin")
	v.SetDefault("cluster.heartbeat_secs", 10)

	if err := v.ReadInConfig(); err != nil {
		fmt.Printf("Warning: config file not found, using defaults: %v\n", err)
	}

	var config Config
	if err := v.Unmarshal(&config); err != nil {
		return nil, err
	}

	return &config, nil
}
