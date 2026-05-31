package protocol

import (
	"encoding/binary"
	"errors"
	"time"
)

type PrivateProtocolParser struct {
	config *PrivateConfig
}

type PrivateConfig struct {
	HeaderLen    int `mapstructure:"header_len"`
	MaxPacketLen int `mapstructure:"max_packet_len"`
}

type PrivateMessage struct {
	FrameHeader uint16
	ProtocolVer byte
	DeviceType  uint16
	DeviceID    uint32
	CmdID       uint16
	DataLen     uint16
	Data        []byte
	CRC16       uint16
	FrameTail   uint16
	Timestamp   time.Time
	RawData     []byte
}

const (
	PrivateFrameHeader = 0xAA55
	PrivateFrameTail   = 0x55AA
)

func NewPrivateProtocolParser(config *PrivateConfig) *PrivateProtocolParser {
	return &PrivateProtocolParser{
		config: config,
	}
}

func (pp *PrivateProtocolParser) Parse(data []byte) (*PrivateMessage, error) {
	minLen := 17
	if len(data) < minLen {
		return nil, errors.New("data too short for private protocol")
	}

	msg := &PrivateMessage{
		Timestamp: time.Now(),
		RawData:   make([]byte, len(data)),
	}
	copy(msg.RawData, data)

	msg.FrameHeader = binary.LittleEndian.Uint16(data[0:2])
	if msg.FrameHeader != PrivateFrameHeader {
		return nil, errors.New("invalid private protocol frame header")
	}

	msg.ProtocolVer = data[2]
	msg.DeviceType = binary.LittleEndian.Uint16(data[3:5])
	msg.DeviceID = binary.LittleEndian.Uint32(data[5:9])
	msg.CmdID = binary.LittleEndian.Uint16(data[9:11])
	msg.DataLen = binary.LittleEndian.Uint16(data[11:13])

	if msg.DataLen > uint16(pp.config.MaxPacketLen) {
		return nil, errors.New("packet length exceeds maximum")
	}

	totalLen := 13 + int(msg.DataLen) + 4
	if len(data) < totalLen {
		return nil, errors.New("incomplete private protocol message")
	}

	msg.Data = make([]byte, msg.DataLen)
	copy(msg.Data, data[13:13+msg.DataLen])
	crcStart := 13 + int(msg.DataLen)
	msg.CRC16 = binary.LittleEndian.Uint16(data[crcStart:crcStart+2])
	tailStart := crcStart + 2
	msg.FrameTail = binary.LittleEndian.Uint16(data[tailStart:tailStart+2])

	if msg.FrameTail != PrivateFrameTail {
		return nil, errors.New("invalid private protocol frame tail")
	}

	return msg, nil
}

func (pp *PrivateProtocolParser) Build(msg *PrivateMessage) ([]byte, error) {
	dataLen := len(msg.Data)
	totalLen := 13 + dataLen + 4
	buf := make([]byte, totalLen)

	binary.LittleEndian.PutUint16(buf[0:2], PrivateFrameHeader)
	buf[2] = msg.ProtocolVer
	binary.LittleEndian.PutUint16(buf[3:5], msg.DeviceType)
	binary.LittleEndian.PutUint32(buf[5:9], msg.DeviceID)
	binary.LittleEndian.PutUint16(buf[9:11], msg.CmdID)
	binary.LittleEndian.PutUint16(buf[11:13], uint16(dataLen))
	copy(buf[13:13+dataLen], msg.Data)
	crcStart := 13 + dataLen
	binary.LittleEndian.PutUint16(buf[crcStart:crcStart+2], msg.CRC16)
	tailStart := crcStart + 2
	binary.LittleEndian.PutUint16(buf[tailStart:tailStart+2], PrivateFrameTail)

	return buf, nil
}

func (pp *PrivateProtocolParser) GetMetadata(msg *PrivateMessage) map[string]interface{} {
	return map[string]interface{}{
		"protocol_ver": msg.ProtocolVer,
		"device_type":  msg.DeviceType,
		"device_id":    msg.DeviceID,
		"cmd_id":       msg.CmdID,
		"data_len":     msg.DataLen,
		"timestamp":    msg.Timestamp,
		"crc16":        msg.CRC16,
	}
}
