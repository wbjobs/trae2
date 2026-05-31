package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

type Server struct {
	Name     string `yaml:"name"`
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	User     string `yaml:"user"`
	Password string `yaml:"password"`
	KeyFile  string `yaml:"keyfile"`
	Group    string `yaml:"group"`
}

type AlertConfig struct {
	CPUThreshold    float64 `yaml:"cpu_threshold"`
	MemoryThreshold float64 `yaml:"memory_threshold"`
	DiskThreshold   float64 `yaml:"disk_threshold"`
	WebhookURL      string  `yaml:"webhook_url"`
	Email           struct {
		SMTP     string   `yaml:"smtp"`
		Port     int      `yaml:"port"`
		User     string   `yaml:"user"`
		Password string   `yaml:"password"`
		To       []string `yaml:"to"`
	} `yaml:"email"`
}

type Config struct {
	Servers []Server     `yaml:"servers"`
	Alerts  AlertConfig  `yaml:"alerts"`
}

var GlobalConfig *Config

func LoadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var config Config
	err = yaml.Unmarshal(data, &config)
	if err != nil {
		return nil, err
	}

	GlobalConfig = &config
	return &config, nil
}

func GetServersByGroup(group string) []Server {
	if GlobalConfig == nil {
		return nil
	}

	if group == "" {
		return GlobalConfig.Servers
	}

	var servers []Server
	for _, s := range GlobalConfig.Servers {
		if s.Group == group {
			servers = append(servers, s)
		}
	}
	return servers
}

func GetServerByName(name string) *Server {
	if GlobalConfig == nil {
		return nil
	}

	for i := range GlobalConfig.Servers {
		if GlobalConfig.Servers[i].Name == name {
			return &GlobalConfig.Servers[i]
		}
	}
	return nil
}
