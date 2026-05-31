package protocol

import (
	"encoding/binary"
	"errors"
	"time"

	"github.com/tarm/serial"
)

type SerialParser struct {
	config *SerialConfig
	port   *serial.Port
}

type SerialConfig struct {
	PortName  string `mapstructure:"port_name"`
	BaudRate  int    `mapstructure:"baud_rate"`
	DataBits  int    `mapstructure:"data_bits"`
	StopBits  int    `mapstructure:"stop_bits"`
	Parity    string `mapstructure:"parity"`
	TimeoutMs int    `mapstructure:"timeout_ms"`
}

type SerialMessage struct {
	Header     byte
	Length     uint16
	Command    byte
	Payload    []byte
	Checksum   byte
	Timestamp  time.Time
	RawData    []byte
}

func NewSerialParser(config *SerialConfig) *SerialParser {
	return &SerialParser{
		config: config,
	}
}

func (sp *SerialParser) Open() error {
	c := &serial.Config{
		Name:        sp.config.PortName,
		Baud:        sp.config.BaudRate,
		Size:        byte(sp.config.DataBits),
		ReadTimeout: time.Duration(sp.config.TimeoutMs) * time.Millisecond,
	}

	switch sp.config.Parity {
	case "N":
		c.Parity = serial.ParityNone
	case "O":
		c.Parity = serial.ParityOdd
	case "E":
		c.Parity = serial.ParityEven
	}

	switch sp.config.StopBits {
	case 1:
		c.StopBits = serial.Stop1
	case 2:
		c.StopBits = serial.Stop2
	}

	port, err := serial.OpenPort(c)
	if err != nil {
		return err
	}
	sp.port = port
	return nil
}

func (sp *SerialParser) Close() error {
	if sp.port != nil {
		return sp.port.Close()
	}
	return nil
}

func (sp *SerialParser) Read() ([]byte, error) {
	if sp.port == nil {
		return nil, errors.New("serial port not opened")
	}
	
	buf := make([]byte, 256)
	n, err := sp.port.Read(buf)
	if err != nil {
		return nil, err
	}
	return buf[:n], nil
}

func (sp *SerialParser) Parse(data []byte) (*SerialMessage, error) {
	if len(data) < 4 {
		return nil, errors.New("data too short")
	}

	msg := &SerialMessage{
		Header:    data[0],
		Length:    binary.BigEndian.Uint16(data[1:3]),
		Command:   data[3],
		Timestamp: time.Now(),
		RawData:   make([]byte, len(data)),
	}
	copy(msg.RawData, data)

	if len(data) < int(msg.Length)+4 {
		return nil, errors.New("incomplete message")
	}

	msg.Payload = make([]byte, msg.Length)
	copy(msg.Payload, data[4:4+msg.Length])

	if len(data) >= int(msg.Length)+5 {
		msg.Checksum = data[4+msg.Length]
	}

	return msg, nil
}

func (sp *SerialParser) Write(data []byte) error {
	if sp.port == nil {
		return errors.New("serial port not opened")
	}
	_, err := sp.port.Write(data)
	return err
}
