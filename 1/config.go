package main

import (
	"fmt"
	"log"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/spf13/viper"
)

type ModbusConfig struct {
	Enabled    bool   `mapstructure:"enabled"`
	SlaveID    uint8  `mapstructure:"slave_id"`
	Address    string `mapstructure:"address"`
	Port       int    `mapstructure:"port"`
	Timeout    int    `mapstructure:"timeout"`
	PollPeriod int    `mapstructure:"poll_period"`
	Registers  []RegisterConfig `mapstructure:"registers"`
}

type RegisterConfig struct {
	Name     string `mapstructure:"name"`
	Address  uint16 `mapstructure:"address"`
	Quantity uint16 `mapstructure:"quantity"`
	Type     string `mapstructure:"type"`
}

type OPCUAConfig struct {
	Enabled    bool   `mapstructure:"enabled"`
	Endpoint   string `mapstructure:"endpoint"`
	Security   string `mapstructure:"security"`
	Policy     string `mapstructure:"policy"`
	Mode       string `mapstructure:"mode"`
	Username   string `mapstructure:"username"`
	Password   string `mapstructure:"password"`
	PollPeriod int    `mapstructure:"poll_period"`
	Nodes      []NodeConfig `mapstructure:"nodes"`
}

type NodeConfig struct {
	Name      string `mapstructure:"name"`
	NodeID    string `mapstructure:"node_id"`
	Namespace uint16 `mapstructure:"namespace"`
}

type MySQLConfig struct {
	Host     string `mapstructure:"host"`
	Port     int    `mapstructure:"port"`
	User     string `mapstructure:"user"`
	Password string `mapstructure:"password"`
	Database string `mapstructure:"database"`
	MaxOpen  int    `mapstructure:"max_open"`
	MaxIdle  int    `mapstructure:"max_idle"`
}

type InfluxDBConfig struct {
	URL    string `mapstructure:"url"`
	Token  string `mapstructure:"token"`
	Org    string `mapstructure:"org"`
	Bucket string `mapstructure:"bucket"`
}

type MQTTConfig struct {
	Broker   string `mapstructure:"broker"`
	Port     int    `mapstructure:"port"`
	ClientID string `mapstructure:"client_id"`
	Username string `mapstructure:"username"`
	Password string `mapstructure:"password"`
	Topic    string `mapstructure:"topic"`
	QoS      byte   `mapstructure:"qos"`
}

type MessageQueueConfig struct {
	MaxRetryAttempts  int `mapstructure:"max_retry_attempts"`
	RetryBaseDelay    int `mapstructure:"retry_base_delay"`
	MaxRetryDelay     int `mapstructure:"max_retry_delay"`
	DeadLetterLimit   int `mapstructure:"dead_letter_limit"`
	OfflineCacheLimit int `mapstructure:"offline_cache_limit"`
	CacheFlushInterval int `mapstructure:"cache_flush_interval"`
}

type GatewayConfig struct {
	GatewayID    string            `mapstructure:"gateway_id"`
	LogLevel     string            `mapstructure:"log_level"`
	Modbus       ModbusConfig      `mapstructure:"modbus"`
	OPCUA        OPCUAConfig       `mapstructure:"opcua"`
	MySQL        MySQLConfig       `mapstructure:"mysql"`
	InfluxDB     InfluxDBConfig    `mapstructure:"influxdb"`
	MQTT         MQTTConfig        `mapstructure:"mqtt"`
	MessageQueue MessageQueueConfig `mapstructure:"message_queue"`
}

var (
	Config     *GatewayConfig
	configPath string
)

func LoadConfig(path string) (*GatewayConfig, error) {
	configPath = path
	v := viper.New()
	v.SetConfigFile(path)
	v.SetConfigType("yaml")

	if err := v.ReadInConfig(); err != nil {
		return nil, fmt.Errorf("read config failed: %w", err)
	}

	var cfg GatewayConfig
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("unmarshal config failed: %w", err)
	}

	Config = &cfg
	return &cfg, nil
}

func WatchConfig(onChange func()) error {
	v := viper.New()
	v.SetConfigFile(configPath)
	v.SetConfigType("yaml")

	v.OnConfigChange(func(e fsnotify.Event) {
		log.Printf("Config file changed: %s", e.Name)
		var newCfg GatewayConfig
		if err := v.Unmarshal(&newCfg); err != nil {
			log.Printf("Failed to reload config: %v", err)
			return
		}
		Config = &newCfg
		log.Println("Config reloaded successfully")
		if onChange != nil {
			onChange()
		}
	})

	v.WatchConfig()
	log.Println("Config watcher started")
	return nil
}

func (c *MySQLConfig) DSN() string {
	return fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		c.User, c.Password, c.Host, c.Port, c.Database)
}

func (c *ModbusConfig) GetPollDuration() time.Duration {
	return time.Duration(c.PollPeriod) * time.Second
}

func (c *OPCUAConfig) GetPollDuration() time.Duration {
	return time.Duration(c.PollPeriod) * time.Second
}
