package protocol

import (
	"encoding/binary"
	"errors"
	"net"
	"strconv"
	"time"
)

type TCPParser struct {
	config     *TCPConfig
	conn       net.Conn
	listener   net.Listener
}

type TCPConfig struct {
	Host        string `mapstructure:"host"`
	Port        int    `mapstructure:"port"`
	TimeoutMs   int    `mapstructure:"timeout_ms"`
	BufferSize  int    `mapstructure:"buffer_size"`
	IsServer    bool   `mapstructure:"is_server"`
}

type TCPMessage struct {
	Magic      uint32
	Version    byte
	MsgType    uint16
	SeqNum     uint32
	Length     uint32
	Payload    []byte
	CRC32      uint32
	Timestamp  time.Time
	SourceAddr string
	RawData    []byte
}

func NewTCPParser(config *TCPConfig) *TCPParser {
	return &TCPParser{
		config: config,
	}
}

func (tp *TCPParser) Connect() error {
	if tp.config.IsServer {
		return tp.startServer()
	}
	return tp.connectClient()
}

func (tp *TCPParser) connectClient() error {
	addr := net.JoinHostPort(tp.config.Host, strconv.Itoa(tp.config.Port))
	conn, err := net.DialTimeout("tcp", addr, time.Duration(tp.config.TimeoutMs)*time.Millisecond)
	if err != nil {
		return err
	}
	tp.conn = conn
	return nil
}

func (tp *TCPParser) startServer() error {
	addr := net.JoinHostPort(tp.config.Host, strconv.Itoa(tp.config.Port))
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	tp.listener = listener
	return nil
}

func (tp *TCPParser) Accept() (net.Conn, error) {
	if tp.listener == nil {
		return nil, errors.New("listener not started")
	}
	return tp.listener.Accept()
}

func (tp *TCPParser) Close() error {
	if tp.conn != nil {
		tp.conn.Close()
	}
	if tp.listener != nil {
		tp.listener.Close()
	}
	return nil
}

func (tp *TCPParser) Read(conn net.Conn) ([]byte, error) {
	if conn == nil {
		conn = tp.conn
	}
	if conn == nil {
		return nil, errors.New("no connection")
	}

	buf := make([]byte, tp.config.BufferSize)
	conn.SetReadDeadline(time.Now().Add(time.Duration(tp.config.TimeoutMs) * time.Millisecond))
	n, err := conn.Read(buf)
	if err != nil {
		return nil, err
	}
	return buf[:n], nil
}

func (tp *TCPParser) Parse(data []byte) (*TCPMessage, error) {
	if len(data) < 17 {
		return nil, errors.New("data too short for TCP header")
	}

	msg := &TCPMessage{
		Magic:      binary.BigEndian.Uint32(data[0:4]),
		Version:    data[4],
		MsgType:    binary.BigEndian.Uint16(data[5:7]),
		SeqNum:     binary.BigEndian.Uint32(data[7:11]),
		Length:     binary.BigEndian.Uint32(data[11:15]),
		Timestamp:  time.Now(),
		RawData:    make([]byte, len(data)),
	}
	copy(msg.RawData, data)

	if msg.Magic != 0x5A5A5A5A {
		return nil, errors.New("invalid magic number")
	}

	totalLen := 15 + int(msg.Length) + 4
	if len(data) < totalLen {
		return nil, errors.New("incomplete TCP message")
	}

	msg.Payload = make([]byte, msg.Length)
	copy(msg.Payload, data[15:15+msg.Length])
	msg.CRC32 = binary.BigEndian.Uint32(data[15+msg.Length : 15+msg.Length+4])

	return msg, nil
}

func (tp *TCPParser) Write(conn net.Conn, data []byte) error {
	if conn == nil {
		conn = tp.conn
	}
	if conn == nil {
		return errors.New("no connection")
	}
	_, err := conn.Write(data)
	return err
}
