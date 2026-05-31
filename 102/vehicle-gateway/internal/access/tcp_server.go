package access

import (
	"context"
	"net"
	"sync"
	"sync/atomic"
	"time"
	"vehicle-gateway/internal/models"
	"vehicle-gateway/pkg/logger"

	"go.uber.org/zap"
)

type Connection struct {
	net.Conn
	DeviceID     string
	ProtocolType string
	RemoteIP     string
	ConnectTime time.Time
	LastActive time.Time
	closed     int32
}

func NewConnection(conn net.Conn) *Connection {
	return &Connection{
		Conn:        conn,
		RemoteIP:    conn.RemoteAddr().String(),
		ConnectTime: time.Now(),
		LastActive: time.Now(),
	}
}

func (c *Connection) SetDevice(deviceID, protocolType string) {
	c.DeviceID = deviceID
	c.ProtocolType = protocolType
}

func (c *Connection) Close() error {
	if atomic.CompareAndSwapInt32(&c.closed, 0, 1) {
		return c.Conn.Close()
	}
	return nil
}

func (c *Connection) IsClosed() bool {
	return atomic.LoadInt32(&c.closed) == 1
}

type ConnectionManager struct {
	connections map[string]*Connection
	deviceMap   map[string]*Connection
	mu          sync.RWMutex
	maxConns    int
	count       int64
	connCount   int64
}

func NewConnectionManager(maxConns int) *ConnectionManager {
	return &ConnectionManager{
		connections: make(map[string]*Connection),
		deviceMap:   make(map[string]*Connection),
		maxConns:    maxConns,
	}
}

func (cm *ConnectionManager) Add(conn *Connection) bool {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	if len(cm.connections) >= cm.maxConns {
		return false
	}

	cm.connections[conn.RemoteAddr().String()] = conn
	atomic.AddInt64(&cm.count, 1)
	return true
}

func (cm *ConnectionManager) Remove(remoteAddr string) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	if conn, ok := cm.connections[remoteAddr]; ok {
		delete(cm.connections, remoteAddr)
		if conn.DeviceID != "" {
			delete(cm.deviceMap, conn.DeviceID)
		}
		atomic.AddInt64(&cm.count, -1)
	}
}

func (cm *ConnectionManager) BindDevice(deviceID string, conn *Connection) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	if oldConn, ok := cm.deviceMap[deviceID]; ok {
		oldConn.Close()
	}
	cm.deviceMap[deviceID] = conn
}

func (cm *ConnectionManager) GetByDevice(deviceID string) (*Connection, bool) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	conn, ok := cm.deviceMap[deviceID]
	return conn, ok
}

func (cm *ConnectionManager) Count() int64 {
	return atomic.LoadInt64(&cm.count)
}

func (cm *ConnectionManager) DeviceCount() int {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	return len(cm.deviceMap)
}

func (cm *ConnectionManager) CloseAll() {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	for _, conn := range cm.connections {
		conn.Close()
	}
	cm.connections = make(map[string]*Connection)
	cm.deviceMap = make(map[string]*Connection)
	atomic.StoreInt64(&cm.count, 0)
}

type TCPServer struct {
	addr        string
	connManager *ConnectionManager
	handler     func(*Connection, []byte)
	ln          net.Listener
	ctx         context.Context
	cancel      context.CancelFunc
	wg          sync.WaitGroup
}

func NewTCPServer(addr string, maxConns int) *TCPServer {
	ctx, cancel := context.WithCancel(context.Background())
	return &TCPServer{
		addr:        addr,
		connManager: NewConnectionManager(maxConns),
		ctx:         ctx,
		cancel:      cancel,
	}
}

func (s *TCPServer) SetHandler(handler func(*Connection, []byte)) {
	s.handler = handler
}

func (s *TCPServer) Start() error {
	ln, err := net.Listen("tcp", s.addr)
	if err != nil {
		return err
	}
	s.ln = ln

	logger.Info("TCP server started", zap.String("addr", s.addr))

	s.wg.Add(1)
	go s.acceptLoop()

	return nil
}

func (s *TCPServer) acceptLoop() {
	defer s.wg.Done()

	for {
		select {
		case <-s.ctx.Done():
			return
		default:
		}

		conn, err := s.ln.Accept()
		if err != nil {
			if ne, ok := err.(net.Error); ok && ne.Temporary() {
				continue
			}
			logger.Error("TCP accept error", zap.Error(err))
			return
		}

		clientConn := NewConnection(conn)
		if !s.connManager.Add(clientConn) {
			logger.Warn("Connection limit reached, rejecting",
				zap.String("remote", conn.RemoteAddr().String()))
			conn.Close()
			continue
		}

		s.wg.Add(1)
		go s.handleConnection(clientConn)
	}
}

func (s *TCPServer) handleConnection(conn *Connection) {
	defer s.wg.Done()
	defer conn.Close()
	defer s.connManager.Remove(conn.RemoteAddr().String())

	buf := make([]byte, 4096)
	for {
		select {
		case <-s.ctx.Done():
			return
		default:
		}

		conn.SetReadDeadline(time.Now().Add(30 * time.Second)
		n, err := conn.Read(buf)
		if err != nil {
			logger.Debug("Connection read error", zap.Error(err))
			return
		}

		conn.LastActive = time.Now()

		if s.handler != nil {
			data := make([]byte, n)
			copy(data, buf[:n])
			s.handler(conn, data)
		}
	}
}

func (s *TCPServer) Stop() {
	s.cancel()
	if s.ln != nil {
		s.ln.Close()
	}
	s.wg.Wait()
	s.connManager.CloseAll()
}

func (s *TCPServer) ConnectionCount() int64 {
	return s.connManager.Count()
}

func (s *TCPServer) GetConnectionManager() *ConnectionManager {
	return s.connManager
}
