package model

import "time"

type DeviceType string

const (
	DeviceTypePLC        DeviceType = "plc"
	DeviceTypeSensor     DeviceType = "sensor"
	DeviceTypeInstrument DeviceType = "instrument"
)

type DeviceStatus string

const (
	DeviceStatusOnline  DeviceStatus = "online"
	DeviceStatusOffline DeviceStatus = "offline"
	DeviceStatusError   DeviceStatus = "error"
	DeviceStatusBusy    DeviceStatus = "busy"
)

type Device struct {
	ID           string            `json:"id"`
	Name         string            `json:"name"`
	Type         DeviceType        `json:"type"`
	Status       DeviceStatus      `json:"status"`
	Address      string            `json:"address"`
	Port         int               `json:"port"`
	Protocol     string            `json:"protocol"`
	Params       map[string]string `json:"params"`
	TemplateID   string            `json:"template_id,omitempty"`
	LastSeen     time.Time         `json:"last_seen"`
	CreatedAt    time.Time         `json:"created_at"`
	UpdatedAt    time.Time         `json:"updated_at"`
}

type Command struct {
	ID        string                 `json:"id"`
	DeviceID  string                 `json:"device_id"`
	Action    string                 `json:"action"`
	Params    map[string]interface{} `json:"params"`
	Priority  int                    `json:"priority"`
	Status    CommandStatus          `json:"status"`
	Result    interface{}            `json:"result,omitempty"`
	Error     string                 `json:"error,omitempty"`
	CreatedAt time.Time              `json:"created_at"`
	ExecutedAt *time.Time            `json:"executed_at,omitempty"`
}

type CommandStatus string

const (
	CommandStatusPending   CommandStatus = "pending"
	CommandStatusRunning   CommandStatus = "running"
	CommandStatusCompleted CommandStatus = "completed"
	CommandStatusFailed    CommandStatus = "failed"
)

type DeviceStatusReport struct {
	DeviceID  string            `json:"device_id"`
	Status    DeviceStatus      `json:"status"`
	Metrics   map[string]float64 `json:"metrics"`
	Timestamp time.Time         `json:"timestamp"`
}

type Template struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	DeviceType  DeviceType        `json:"device_type"`
	Protocol    string            `json:"protocol"`
	Params      map[string]string `json:"params"`
	Description string            `json:"description"`
	CreatedAt   time.Time         `json:"created_at"`
	UpdatedAt   time.Time         `json:"updated_at"`
}

type APIResponse struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

type PaginatedResponse struct {
	Items      interface{} `json:"items"`
	Total      int64       `json:"total"`
	Page       int         `json:"page"`
	PageSize   int         `json:"page_size"`
}

type AlertLevel string

const (
	AlertLevelInfo     AlertLevel = "info"
	AlertLevelWarning  AlertLevel = "warning"
	AlertLevelCritical AlertLevel = "critical"
)

type AlertType string

const (
	AlertTypeStatus    AlertType = "status"
	AlertTypeMetric    AlertType = "metric"
	AlertTypeCommand   AlertType = "command"
	AlertTypeSystem    AlertType = "system"
)

type Alert struct {
	ID           string     `json:"id"`
	DeviceID     string     `json:"device_id"`
	DeviceName   string     `json:"device_name"`
	Level        AlertLevel `json:"level"`
	Type         AlertType  `json:"type"`
	Title        string     `json:"title"`
	Message      string     `json:"message"`
	Timestamp    time.Time  `json:"timestamp"`
	Acknowledged bool       `json:"acknowledged"`
}

type ScheduledCommand struct {
	ID         string                 `json:"id"`
	Name       string                 `json:"name"`
	DeviceID   string                 `json:"device_id"`
	Action     string                 `json:"action"`
	Params     map[string]interface{} `json:"params"`
	CronExpr   string                 `json:"cron_expr"`
	Interval   time.Duration          `json:"interval"`
	Enabled    bool                   `json:"enabled"`
	LastRunAt  *time.Time             `json:"last_run_at,omitempty"`
	NextRunAt  time.Time              `json:"next_run_at"`
	CreatedAt  time.Time              `json:"created_at"`
	UpdatedAt  time.Time              `json:"updated_at"`
}
