package protocol

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sync"
	"time"
)

type FieldType string

const (
	FieldTypeUint8  FieldType = "uint8"
	FieldTypeUint16 FieldType = "uint16"
	FieldTypeUint32 FieldType = "uint32"
	FieldTypeInt8   FieldType = "int8"
	FieldTypeInt16  FieldType = "int16"
	FieldTypeInt32  FieldType = "int32"
	FieldTypeBytes  FieldType = "bytes"
	FieldTypeString FieldType = "string"
)

type EndianType string

const (
	EndianBig    EndianType = "big"
	EndianLittle EndianType = "little"
)

type ProtocolField struct {
	Name     string     `json:"name" yaml:"name"`
	Type     FieldType  `json:"type" yaml:"type"`
	Offset   int        `json:"offset" yaml:"offset"`
	Length   int        `json:"length,omitempty" yaml:"length,omitempty"`
	Endian   EndianType `json:"endian,omitempty" yaml:"endian,omitempty"`
	Optional bool       `json:"optional,omitempty" yaml:"optional,omitempty"`
}

type ProtocolConfig struct {
	Name          string          `json:"name" yaml:"name"`
	Version       string          `json:"version" yaml:"version"`
	HeaderPattern []byte          `json:"header_pattern" yaml:"header_pattern"`
	MinLength     int             `json:"min_length" yaml:"min_length"`
	MaxLength     int             `json:"max_length" yaml:"max_length"`
	Endian        EndianType      `json:"endian" yaml:"endian"`
	Fields        []ProtocolField `json:"fields" yaml:"fields"`
	CRCField      string          `json:"crc_field,omitempty" yaml:"crc_field,omitempty"`
	CRCOffset     int             `json:"crc_offset,omitempty" yaml:"crc_offset,omitempty"`
	CRCType       string          `json:"crc_type,omitempty" yaml:"crc_type,omitempty"`
}

type DynamicProtocolParser struct {
	configs     map[string]*ProtocolConfig
	configFile  string
	mu          sync.RWMutex
	lastModTime time.Time
}

func NewDynamicProtocolParser(configFile string) (*DynamicProtocolParser, error) {
	dpp := &DynamicProtocolParser{
		configs:    make(map[string]*ProtocolConfig),
		configFile: configFile,
	}

	if err := dpp.LoadConfigs(); err != nil {
		return nil, err
	}

	return dpp, nil
}

func (dpp *DynamicProtocolParser) LoadConfigs() error {
	dpp.mu.Lock()
	defer dpp.mu.Unlock()

	data, err := os.ReadFile(dpp.configFile)
	if err != nil {
		if os.IsNotExist(err) {
			dpp.configs = dpp.getDefaultConfigs()
			return dpp.saveConfigsLocked()
		}
		return err
	}

	var configs []ProtocolConfig
	if err := json.Unmarshal(data, &configs); err != nil {
		return err
	}

	dpp.configs = make(map[string]*ProtocolConfig)
	for i := range configs {
		dpp.configs[configs[i].Name] = &configs[i]
	}

	stat, _ := os.Stat(dpp.configFile)
	if stat != nil {
		dpp.lastModTime = stat.ModTime()
	}

	return nil
}

func (dpp *DynamicProtocolParser) ReloadIfModified() (bool, error) {
	stat, err := os.Stat(dpp.configFile)
	if err != nil {
		return false, err
	}

	dpp.mu.RLock()
	needsReload := stat.ModTime().After(dpp.lastModTime)
	dpp.mu.RUnlock()

	if needsReload {
		if err := dpp.LoadConfigs(); err != nil {
			return false, err
		}
		return true, nil
	}
	return false, nil
}

func (dpp *DynamicProtocolParser) getDefaultConfigs() map[string]*ProtocolConfig {
	return map[string]*ProtocolConfig{
		"private_v1": {
			Name:          "private_v1",
			Version:       "1.0",
			HeaderPattern: []byte{0x55, 0xAA},
			MinLength:     17,
			MaxLength:     4096,
			Endian:        EndianLittle,
			Fields: []ProtocolField{
				{Name: "frame_header", Type: FieldTypeUint16, Offset: 0},
				{Name: "protocol_ver", Type: FieldTypeUint8, Offset: 2},
				{Name: "device_type", Type: FieldTypeUint16, Offset: 3},
				{Name: "device_id", Type: FieldTypeUint32, Offset: 5},
				{Name: "cmd_id", Type: FieldTypeUint16, Offset: 9},
				{Name: "data_len", Type: FieldTypeUint16, Offset: 11},
			},
			CRCField:  "crc16",
			CRCOffset: -4,
			CRCType:   "crc16",
		},
	}
}

func (dpp *DynamicProtocolParser) saveConfigsLocked() error {
	configs := make([]ProtocolConfig, 0, len(dpp.configs))
	for _, cfg := range dpp.configs {
		configs = append(configs, *cfg)
	}

	data, err := json.MarshalIndent(configs, "", "  ")
	if err != nil {
		return err
	}

	if err := os.WriteFile(dpp.configFile, data, 0644); err != nil {
		return err
	}

	stat, _ := os.Stat(dpp.configFile)
	if stat != nil {
		dpp.lastModTime = stat.ModTime()
	}

	return nil
}

func (dpp *DynamicProtocolParser) SaveConfigs() error {
	dpp.mu.Lock()
	defer dpp.mu.Unlock()
	return dpp.saveConfigsLocked()
}

func (dpp *DynamicProtocolParser) AddConfig(cfg *ProtocolConfig) error {
	dpp.mu.Lock()
	defer dpp.mu.Unlock()
	dpp.configs[cfg.Name] = cfg
	return dpp.saveConfigsLocked()
}

func (dpp *DynamicProtocolParser) RemoveConfig(name string) bool {
	dpp.mu.Lock()
	defer dpp.mu.Unlock()
	if _, exists := dpp.configs[name]; exists {
		delete(dpp.configs, name)
		dpp.saveConfigsLocked()
		return true
	}
	return false
}

func (dpp *DynamicProtocolParser) GetConfig(name string) (*ProtocolConfig, bool) {
	dpp.mu.RLock()
	defer dpp.mu.RUnlock()
	cfg, ok := dpp.configs[name]
	return cfg, ok
}

func (dpp *DynamicProtocolParser) ListConfigs() []*ProtocolConfig {
	dpp.mu.RLock()
	defer dpp.mu.RUnlock()
	configs := make([]*ProtocolConfig, 0, len(dpp.configs))
	for _, cfg := range dpp.configs {
		configs = append(configs, cfg)
	}
	return configs
}

func (dpp *DynamicProtocolParser) Parse(configName string, data []byte) (map[string]interface{}, error) {
	dpp.mu.RLock()
	cfg, ok := dpp.configs[configName]
	dpp.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("protocol config '%s' not found", configName)
	}

	if len(data) < cfg.MinLength {
		return nil, errors.New("data too short")
	}
	if len(data) > cfg.MaxLength {
		return nil, errors.New("data too long")
	}

	if len(cfg.HeaderPattern) > 0 {
		for i, b := range cfg.HeaderPattern {
			if i >= len(data) || data[i] != b {
				return nil, errors.New("header pattern mismatch")
			}
		}
	}

	result := make(map[string]interface{})
	for _, field := range cfg.Fields {
		val, err := dpp.parseField(data, &field, cfg.Endian)
		if err != nil {
			if !field.Optional {
				return nil, fmt.Errorf("field '%s': %w", field.Name, err)
			}
			continue
		}
		result[field.Name] = val
	}

	return result, nil
}

func (dpp *DynamicProtocolParser) parseField(data []byte, field *ProtocolField, defaultEndian EndianType) (interface{}, error) {
	endian := field.Endian
	if endian == "" {
		endian = defaultEndian
	}

	if field.Offset < 0 {
		field.Offset = len(data) + field.Offset
	}

	switch field.Type {
	case FieldTypeUint8:
		if field.Offset >= len(data) {
			return nil, errors.New("offset out of range")
		}
		return data[field.Offset], nil

	case FieldTypeUint16:
		if field.Offset+1 >= len(data) {
			return nil, errors.New("offset out of range")
		}
		if endian == EndianBig {
			return binary.BigEndian.Uint16(data[field.Offset : field.Offset+2]), nil
		}
		return binary.LittleEndian.Uint16(data[field.Offset : field.Offset+2]), nil

	case FieldTypeUint32:
		if field.Offset+3 >= len(data) {
			return nil, errors.New("offset out of range")
		}
		if endian == EndianBig {
			return binary.BigEndian.Uint32(data[field.Offset : field.Offset+4]), nil
		}
		return binary.LittleEndian.Uint32(data[field.Offset : field.Offset+4]), nil

	case FieldTypeInt8:
		if field.Offset >= len(data) {
			return nil, errors.New("offset out of range")
		}
		return int8(data[field.Offset]), nil

	case FieldTypeInt16:
		if field.Offset+1 >= len(data) {
			return nil, errors.New("offset out of range")
		}
		if endian == EndianBig {
			return int16(binary.BigEndian.Uint16(data[field.Offset : field.Offset+2])), nil
		}
		return int16(binary.LittleEndian.Uint16(data[field.Offset : field.Offset+2])), nil

	case FieldTypeInt32:
		if field.Offset+3 >= len(data) {
			return nil, errors.New("offset out of range")
		}
		if endian == EndianBig {
			return int32(binary.BigEndian.Uint32(data[field.Offset : field.Offset+4])), nil
		}
		return int32(binary.LittleEndian.Uint32(data[field.Offset : field.Offset+4])), nil

	case FieldTypeBytes:
		end := field.Offset + field.Length
		if end > len(data) {
			end = len(data)
		}
		return data[field.Offset:end], nil

	case FieldTypeString:
		end := field.Offset + field.Length
		if end > len(data) {
			end = len(data)
		}
		return string(data[field.Offset:end]), nil

	default:
		return nil, fmt.Errorf("unsupported field type: %s", field.Type)
	}
}

func (dpp *DynamicProtocolParser) AutoDetect(data []byte) (string, map[string]interface{}, error) {
	dpp.mu.RLock()
	defer dpp.mu.RUnlock()

	for name, cfg := range dpp.configs {
		if len(data) < cfg.MinLength {
			continue
		}

		headerMatch := true
		for i, b := range cfg.HeaderPattern {
			if i >= len(data) || data[i] != b {
				headerMatch = false
				break
			}
		}
		if !headerMatch {
			continue
		}

		result, err := dpp.Parse(name, data)
		if err == nil {
			return name, result, nil
		}
	}

	return "", nil, errors.New("no matching protocol found")
}
