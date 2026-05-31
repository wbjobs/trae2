package models

import (
	"time"
)

type VehicleData struct {
	ID           string    `json:"id" gorm:"primaryKey;size:64"`
	DeviceID     string    `json:"device_id" gorm:"size:64;index;comment:设备ID"`
	PlateNumber  string    `json:"plate_number" gorm:"size:32;index;comment:车牌号"`
	Region       string    `json:"region" gorm:"size:32;index;comment:所属区域"`
	ProtocolType string    `json:"protocol_type" gorm:"size:32;comment:协议类型:JT808,GB32960等"`
	MsgType      string    `json:"msg_type" gorm:"size:32;comment:消息类型"`
	Timestamp    time.Time `json:"timestamp" gorm:"index;comment:上报时间"`
	Latitude     float64   `json:"latitude" gorm:"comment:纬度"`
	Longitude    float64   `json:"longitude" gorm:"comment:经度"`
	Speed        float64   `json:"speed" gorm:"comment:速度 km/h"`
	Direction    float64   `json:"direction" gorm:"comment:方向角度"`
	Altitude     float64   `json:"altitude" gorm:"comment:海拔"`
	Mileage      float64   `json:"mileage" gorm:"comment:里程 km"`
	FuelLevel    float64   `json:"fuel_level" gorm:"comment:油量"`
	Status       int32     `json:"status" gorm:"comment:车辆状态"`
	AlarmFlags   uint64    `json:"alarm_flags" gorm:"comment:报警标志位"`
	RawData      []byte    `json:"raw_data,omitempty" gorm:"type:blob;comment:原始数据"`
	ExtraData    string    `json:"extra_data,omitempty" gorm:"type:text;comment:扩展数据JSON"`
	CreatedAt    time.Time `json:"created_at" gorm:"autoCreateTime;index"`
}

type TerminalDevice struct {
	ID            string    `json:"id" gorm:"primaryKey;size:64"`
	DeviceID      string    `json:"device_id" gorm:"size:64;uniqueIndex"`
	PlateNumber   string    `json:"plate_number" gorm:"size:32;index"`
	Region        string    `json:"region" gorm:"size:32;index"`
	DeviceType    string    `json:"device_type" gorm:"size:32"`
	ProtocolType  string    `json:"protocol_type" gorm:"size:32"`
	Iccid         string    `json:"iccid" gorm:"size:32"`
	Imsi          string    `json:"imsi" gorm:"size:32"`
	Manufacturer  string    `json:"manufacturer" gorm:"size:64"`
	Model         string    `json:"model" gorm:"size:64"`
	FirmwareVer   string    `json:"firmware_ver" gorm:"size:32"`
	AuthToken     string    `json:"-" gorm:"size:128"`
	Status        int32     `json:"status" gorm:"default:1;index"`
	OnlineStatus  int32     `json:"online_status" gorm:"default:0;index"`
	LastOnlineAt  time.Time `json:"last_online_at"`
	LastHeartbeat time.Time `json:"last_heartbeat"`
	CreatedAt     time.Time `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt     time.Time `json:"updated_at" gorm:"autoUpdateTime"`
}

type UnifiedMessage struct {
	Header MessageHeader `json:"header"`
	Body   interface{}   `json:"body"`
}

type MessageHeader struct {
	MessageID    string    `json:"message_id"`
	DeviceID     string    `json:"device_id"`
	PlateNumber  string    `json:"plate_number"`
	Region       string    `json:"region"`
	ProtocolType string    `json:"protocol_type"`
	MsgType      string    `json:"msg_type"`
	Timestamp    time.Time `json:"timestamp"`
	Version      string    `json:"version"`
	Priority     int32     `json:"priority"`
	RetryCount   int32     `json:"retry_count"`
}

type LocationData struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Speed     float64 `json:"speed"`
	Direction float64 `json:"direction"`
	Altitude  float64 `json:"altitude"`
	Mileage   float64 `json:"mileage"`
}

type AlarmData struct {
	AlarmType  string    `json:"alarm_type"`
	AlarmLevel int32     `json:"alarm_level"`
	AlarmTime  time.Time `json:"alarm_time"`
	Location   LocationData
}
