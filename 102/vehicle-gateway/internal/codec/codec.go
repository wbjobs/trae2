package codec

import (
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"
	"vehicle-gateway/internal/models"

	"github.com/google/uuid"
)

type JT808Message struct {
	MsgID       uint16
	MsgBodyProps uint16
	TerminalID  string
	MsgSerialNo uint16
	MsgBody     []byte
	CheckSum    byte
}

type JT808Decoder struct {
}

func NewJT808Decoder() *JT808Decoder {
	return &JT808Decoder{}
}

func (d *JT808Decoder) Decode(data []byte) (*JT808Message, error) {
	if len(data) < 15 {
		return nil, errors.New("data too short")
	}

	if data[0] != 0x7E {
		return nil, errors.New("invalid start flag")
	}

	escapeData := d.escape(data[1 : len(data)-2])

	msg := &JT808Message{}
	offset := 0

	msg.MsgID = binary.BigEndian.Uint16(escapeData[offset : offset+2])
	offset += 2

	msg.MsgBodyProps = binary.BigEndian.Uint16(escapeData[offset : offset+2])
	offset += 2

	terminalIDBytes := make([]byte, 6)
	copy(terminalIDBytes, escapeData[offset:offset+6])
	msg.TerminalID = hex.EncodeToString(terminalIDBytes)
	offset += 6

	msg.MsgSerialNo = binary.BigEndian.Uint16(escapeData[offset : offset+2])
	offset += 2

	bodyLen := int(msg.MsgBodyProps & 0x03FF)
	if offset+bodyLen > len(escapeData) {
		return nil, errors.New("invalid body length")
	}
	msg.MsgBody = escapeData[offset : offset+bodyLen]

	msg.CheckSum = escapeData[len(escapeData)-1]

	if !d.verifyCheckSum(escapeData[:len(escapeData)-1], msg.CheckSum) {
		return nil, errors.New("checksum verification failed")
	}

	return msg, nil
}

func (d *JT808Decoder) escape(data []byte) []byte {
	var result []byte
	for i := 0; i < len(data); i++ {
		if data[i] == 0x7D {
			if i+1 < len(data) {
				if data[i+1] == 0x01 {
					result = append(result, 0x7D)
				} else if data[i+1] == 0x02 {
					result = append(result, 0x7E)
				}
				i++
			}
		} else {
			result = append(result, data[i])
		}
	}
	return result
}

func (d *JT808Decoder) verifyCheckSum(data []byte, checkSum byte) bool {
	var sum byte
	for _, b := range data {
		sum ^= b
	}
	return sum == checkSum
}

type LocationExtra struct {
	AlarmFlags uint32
	Status     uint32
	Mileage    uint32
	Fuel       uint16
	OilPressure uint16
	EngineRPM  uint16
	EngineTemp int16
	SignalStrength uint8
	GPSCount   uint8
	BatteryVoltage uint16
	ExternalVoltage uint16
	SpeedLimit uint8
}

func (d *JT808Decoder) ParseLocation(body []byte) (*models.LocationData, *LocationExtra, error) {
	if len(body) < 28 {
		return nil, nil, errors.New("location body too short")
	}

	loc := &models.LocationData{}
	extra := &LocationExtra{}
	offset := 0

	extra.AlarmFlags = binary.BigEndian.Uint32(body[offset : offset+4])
	offset += 4

	extra.Status = binary.BigEndian.Uint32(body[offset : offset+4])
	offset += 4

	lat := binary.BigEndian.Uint32(body[offset : offset+4])
	loc.Latitude = float64(lat) / 1000000.0
	if (extra.Status & 0x02) == 0 {
		loc.Latitude = -loc.Latitude
	}
	offset += 4

	lon := binary.BigEndian.Uint32(body[offset : offset+4])
	loc.Longitude = float64(lon) / 1000000.0
	if (extra.Status & 0x01) == 0 {
		loc.Longitude = -loc.Longitude
	}
	offset += 4

	alt := binary.BigEndian.Uint16(body[offset : offset+2])
	loc.Altitude = float64(int16(alt))
	offset += 2

	speed := binary.BigEndian.Uint16(body[offset : offset+2])
	loc.Speed = float64(speed) / 10.0
	offset += 2

	dir := binary.BigEndian.Uint16(body[offset : offset+2])
	loc.Direction = float64(dir)
	offset += 2

	if offset+6 <= len(body) {
		year := int(body[offset]) + 2000
		month := int(body[offset+1])
		day := int(body[offset+2])
		hour := int(body[offset+3])
		minute := int(body[offset+4])
		second := int(body[offset+5])
		_ = time.Date(year, time.Month(month), day, hour, minute, second, 0, time.UTC)
		offset += 6
	}

	for offset < len(body) {
		if offset+2 > len(body) {
			break
		}
		extraID := body[offset]
		extraLen := int(body[offset+1])
		offset += 2

		if offset+extraLen > len(body) {
			break
		}

		switch extraID {
		case 0x01:
			if extraLen >= 4 {
				extra.Mileage = binary.BigEndian.Uint32(body[offset : offset+4])
				loc.Mileage = float64(extra.Mileage) / 10.0
			}
		case 0x02:
			if extraLen >= 2 {
				extra.OilPressure = binary.BigEndian.Uint16(body[offset : offset+2])
			}
		case 0x03:
			if extraLen >= 2 {
				extra.EngineRPM = binary.BigEndian.Uint16(body[offset : offset+2])
			}
		case 0x04:
			if extraLen >= 1 {
				extra.SpeedLimit = uint8(body[offset])
			}
		case 0x05:
			if extraLen >= 1 {
				extra.GPSCount = uint8(body[offset])
			}
		case 0x2C:
			if extraLen >= 2 {
				extra.Fuel = binary.BigEndian.Uint16(body[offset : offset+2])
			}
		case 0x2D:
			if extraLen >= 2 {
				extra.BatteryVoltage = binary.BigEndian.Uint16(body[offset : offset+2])
			}
		case 0x2E:
			if extraLen >= 2 {
				extra.ExternalVoltage = binary.BigEndian.Uint16(body[offset : offset+2])
			}
		case 0x2F:
			if extraLen >= 1 {
				extra.SignalStrength = uint8(body[offset])
			}
		case 0x30:
			if extraLen >= 2 {
				extra.EngineTemp = int16(binary.BigEndian.Uint16(body[offset : offset+2]))
			}
		}

		offset += extraLen
	}

	return loc, extra, nil
}

type MessageConverter struct {
}

func NewMessageConverter() *MessageConverter {
	return &MessageConverter{}
}

type ParsedLocation struct {
	Location     *models.LocationData
	Extra        *LocationExtra
	RawBody      []byte
}

func (c *MessageConverter) ToUnifiedMessage(jtMsg *JT808Message, device *models.TerminalDevice) (*models.UnifiedMessage, error) {
	msg := &models.UnifiedMessage{
		Header: models.MessageHeader{
			MessageID:    generateMessageID(),
			DeviceID:     jtMsg.TerminalID,
			PlateNumber:  device.PlateNumber,
			Region:       device.Region,
			ProtocolType: models.ProtocolJT808,
			Timestamp:    time.Now(),
			Version:      models.CurrentVersion,
			Priority:     0,
		},
	}

	switch jtMsg.MsgID {
	case 0x0002:
		msg.Header.MsgType = models.MsgTypeHeartbeat
	case 0x0200:
		msg.Header.MsgType = models.MsgTypeLocation
		loc, extra, err := NewJT808Decoder().ParseLocation(jtMsg.MsgBody)
		if err != nil {
			return nil, err
		}
		msg.Body = &ParsedLocation{
			Location: loc,
			Extra:    extra,
			RawBody:  jtMsg.MsgBody,
		}
	case 0x0100:
		msg.Header.MsgType = models.MsgTypeLogin
	case 0x0003:
		msg.Header.MsgType = models.MsgTypeLogout
	case 0x0201:
		msg.Header.MsgType = models.MsgTypeAlarm
		loc, extra, _ := NewJT808Decoder().ParseLocation(jtMsg.MsgBody)
		if loc != nil {
			msg.Body = &ParsedLocation{
				Location: loc,
				Extra:    extra,
				RawBody:  jtMsg.MsgBody,
			}
		}
	case 0x0001:
		msg.Header.MsgType = "TERMINAL_RESPONSE"
	case 0x0102:
		msg.Header.MsgType = "TERMINAL_AUTH"
	case 0x0104:
		msg.Header.MsgType = "QUERY_PARAMS_RESPONSE"
	case 0x0107:
		msg.Header.MsgType = "QUERY_ATTRS_RESPONSE"
	case 0x0108:
		msg.Header.MsgType = "UPGRADE_RESPONSE"
	case 0x0202:
		msg.Header.MsgType = "LOCATION_BATCH"
	case 0x0301:
		msg.Header.MsgType = "EVENT_REPORT"
	case 0x0302:
		msg.Header.MsgType = "QUESTION_ANSWER"
	case 0x0303:
		msg.Header.MsgType = "MSG_ACK"
	case 0x0500:
		msg.Header.MsgType = "CONTROL_ACK"
	case 0x0608:
		msg.Header.MsgType = "MULTIMEDIA_EVENT"
	case 0x0700:
		msg.Header.MsgType = "WAYBILL_REPORT"
	case 0x0701:
		msg.Header.MsgType = "DRIVER_ID_CARD"
	case 0x0800:
		msg.Header.MsgType = "MULTIMEDIA_UPLOAD"
	case 0x0801:
		msg.Header.MsgType = "MULTIMEDIA_DATA"
	case 0x0900:
		msg.Header.MsgType = "PASS_THROUGH_UP"
	case 0x0A00:
		msg.Header.MsgType = "RSA_NEGOTIATION"
	default:
		msg.Header.MsgType = models.MsgTypeInfo
	}

	return msg, nil
}

func (c *MessageConverter) ToVehicleData(msg *models.UnifiedMessage) (*models.VehicleData, error) {
	vehicleData := &models.VehicleData{
		ID:           msg.Header.MessageID,
		DeviceID:     msg.Header.DeviceID,
		PlateNumber:  msg.Header.PlateNumber,
		Region:       msg.Header.Region,
		ProtocolType: msg.Header.ProtocolType,
		MsgType:      msg.Header.MsgType,
		Timestamp:    msg.Header.Timestamp,
	}

	if parsed, ok := msg.Body.(*ParsedLocation); ok {
		if parsed.Location != nil {
			vehicleData.Latitude = parsed.Location.Latitude
			vehicleData.Longitude = parsed.Location.Longitude
			vehicleData.Speed = parsed.Location.Speed
			vehicleData.Direction = parsed.Location.Direction
			vehicleData.Altitude = parsed.Location.Altitude
			vehicleData.Mileage = parsed.Location.Mileage
		}
		if parsed.Extra != nil {
			vehicleData.Status = int32(parsed.Extra.Status)
			vehicleData.AlarmFlags = uint64(parsed.Extra.AlarmFlags)
			vehicleData.FuelLevel = float64(parsed.Extra.Fuel)
			extraJSON, _ := json.Marshal(parsed.Extra)
			vehicleData.ExtraData = string(extraJSON)
		}
		if len(parsed.RawBody) > 0 {
			vehicleData.RawData = parsed.RawBody
		}
	}

	return vehicleData, nil
}

type CodecService struct {
	jt808Decoder  *JT808Decoder
	converter     *MessageConverter
}

func NewCodecService() *CodecService {
	return &CodecService{
		jt808Decoder:  NewJT808Decoder(),
		converter:     NewMessageConverter(),
	}
}

func (s *CodecService) DecodeJT808(data []byte) (*JT808Message, error) {
	return s.jt808Decoder.Decode(data)
}

func (s *CodecService) ConvertToUnified(jtMsg *JT808Message, device *models.TerminalDevice) (*models.UnifiedMessage, error) {
	return s.converter.ToUnifiedMessage(jtMsg, device)
}

func (s *CodecService) ConvertToVehicleData(msg *models.UnifiedMessage) (*models.VehicleData, error) {
	return s.converter.ToVehicleData(msg)
}

func generateMessageID() string {
	return uuid.New().String()
}
