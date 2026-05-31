package logger

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/sirupsen/logrus"
)

type LogConfig struct {
	LogLevel      string `mapstructure:"log_level"`
	LogDir        string `mapstructure:"log_dir"`
	MaxFileSize   int64  `mapstructure:"max_file_size"`
	MaxBackups    int    `mapstructure:"max_backups"`
	Compress      bool   `mapstructure:"compress"`
	ConsoleOutput bool   `mapstructure:"console_output"`
}

type RotatingFileWriter struct {
	config      *LogConfig
	currentFile *os.File
	currentSize int64
	mu          sync.Mutex
	baseName    string
	cleanOnce   sync.Once
}

func NewRotatingFileWriter(config *LogConfig) (*RotatingFileWriter, error) {
	if err := os.MkdirAll(config.LogDir, 0755); err != nil {
		return nil, err
	}

	rfw := &RotatingFileWriter{
		config:   config,
		baseName: "parser",
	}

	if err := rfw.openNewFile(); err != nil {
		return nil, err
	}

	return rfw, nil
}

func (rfw *RotatingFileWriter) openNewFile() error {
	timestamp := time.Now().Format("20060102-150405")
	filename := filepath.Join(rfw.config.LogDir, fmt.Sprintf("%s-%s.log", rfw.baseName, timestamp))

	file, err := os.OpenFile(filename, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return err
	}

	stat, err := file.Stat()
	if err != nil {
		file.Close()
		return err
	}

	rfw.currentFile = file
	rfw.currentSize = stat.Size()

	rfw.cleanOnce.Do(func() {
		go rfw.cleanupLoop()
	})

	return nil
}

func (rfw *RotatingFileWriter) cleanupLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		rfw.cleanupOldLogs()
	}
}

func (rfw *RotatingFileWriter) Write(p []byte) (n int, err error) {
	rfw.mu.Lock()
	defer rfw.mu.Unlock()

	writeLen := int64(len(p))
	if writeLen == 0 {
		return 0, nil
	}

	if rfw.currentSize+writeLen > rfw.config.MaxFileSize {
		if err := rfw.currentFile.Close(); err != nil {
			return 0, err
		}
		if err := rfw.openNewFile(); err != nil {
			return 0, err
		}
	}

	if rfw.currentSize+writeLen > rfw.config.MaxFileSize {
		chunk := rfw.config.MaxFileSize - rfw.currentSize
		if chunk > 0 {
			n, err = rfw.currentFile.Write(p[:chunk])
			rfw.currentSize += int64(n)
			if err != nil {
				return n, err
			}
		}
		if err := rfw.currentFile.Close(); err != nil {
			return n, err
		}
		if err := rfw.openNewFile(); err != nil {
			return n, err
		}
		remaining, err2 := rfw.currentFile.Write(p[n:])
		n += remaining
		rfw.currentSize += int64(remaining)
		return n, err2
	}

	n, err = rfw.currentFile.Write(p)
	rfw.currentSize += int64(n)
	return n, err
}

func (rfw *RotatingFileWriter) Close() error {
	rfw.mu.Lock()
	defer rfw.mu.Unlock()

	if rfw.currentFile != nil {
		return rfw.currentFile.Close()
	}
	return nil
}

func (rfw *RotatingFileWriter) cleanupOldLogs() {
	files, err := filepath.Glob(filepath.Join(rfw.config.LogDir, fmt.Sprintf("%s-*.log", rfw.baseName)))
	if err != nil {
		return
	}

	if len(files) <= rfw.config.MaxBackups {
		return
	}

	type fileInfo struct {
		path string
		time time.Time
	}

	var fileList []fileInfo
	for _, f := range files {
		info, err := os.Stat(f)
		if err != nil {
			continue
		}
		fileList = append(fileList, fileInfo{
			path: f,
			time: info.ModTime(),
		})
	}

	sort.Slice(fileList, func(i, j int) bool {
		return fileList[i].time.Before(fileList[j].time)
	})

	for i := 0; i < len(fileList)-rfw.config.MaxBackups; i++ {
		os.Remove(fileList[i].path)
	}
}

type PacketLogger struct {
	logger    *logrus.Logger
	errorLog  *logrus.Logger
	config    *LogConfig
}

func NewPacketLogger(config *LogConfig) (*PacketLogger, error) {
	level, err := logrus.ParseLevel(config.LogLevel)
	if err != nil {
		level = logrus.InfoLevel
	}

	rfw, err := NewRotatingFileWriter(config)
	if err != nil {
		return nil, err
	}

	var writers []io.Writer
	writers = append(writers, rfw)
	if config.ConsoleOutput {
		writers = append(writers, os.Stdout)
	}

	multiWriter := io.MultiWriter(writers...)

	logger := logrus.New()
	logger.SetOutput(multiWriter)
	logger.SetLevel(level)
	logger.SetFormatter(&logrus.JSONFormatter{
		TimestampFormat: time.RFC3339Nano,
	})

	errorRfw, err := NewRotatingFileWriter(&LogConfig{
		LogDir:      filepath.Join(config.LogDir, "error"),
		MaxFileSize: config.MaxFileSize,
		MaxBackups:  config.MaxBackups,
	})
	if err != nil {
		return nil, err
	}

	var errorWriters []io.Writer
	errorWriters = append(errorWriters, errorRfw)
	if config.ConsoleOutput {
		errorWriters = append(errorWriters, os.Stderr)
	}

	errorMultiWriter := io.MultiWriter(errorWriters...)
	errorLog := logrus.New()
	errorLog.SetOutput(errorMultiWriter)
	errorLog.SetLevel(logrus.ErrorLevel)
	errorLog.SetFormatter(&logrus.JSONFormatter{
		TimestampFormat: time.RFC3339Nano,
	})

	return &PacketLogger{
		logger:   logger,
		errorLog: errorLog,
		config:   config,
	}, nil
}

func (pl *PacketLogger) Info(packetType string, data []byte, metadata map[string]interface{}) {
	pl.logger.WithFields(logrus.Fields{
		"packet_type": packetType,
		"data_len":    len(data),
		"data":        fmt.Sprintf("%x", data),
		"metadata":    metadata,
	}).Info("packet received")
}

func (pl *PacketLogger) Error(packetType string, data []byte, err error, metadata map[string]interface{}) {
	pl.errorLog.WithFields(logrus.Fields{
		"packet_type": packetType,
		"data_len":    len(data),
		"data":        fmt.Sprintf("%x", data),
		"error":       err.Error(),
		"metadata":    metadata,
	}).Error("invalid packet")
}

func (pl *PacketLogger) Debug(msg string, fields map[string]interface{}) {
	pl.logger.WithFields(fields).Debug(msg)
}

func (pl *PacketLogger) Warn(msg string, fields map[string]interface{}) {
	pl.logger.WithFields(fields).Warn(msg)
}

func (pl *PacketLogger) Fatal(msg string, err error) {
	pl.logger.WithError(err).Fatal(msg)
}

type AuditLogger struct {
	logger *logrus.Logger
	config *LogConfig
}

func NewAuditLogger(config *LogConfig) (*AuditLogger, error) {
	level, _ := logrus.ParseLevel(config.LogLevel)

	auditConfig := &LogConfig{
		LogDir:      filepath.Join(config.LogDir, "audit"),
		MaxFileSize: config.MaxFileSize,
		MaxBackups:  config.MaxBackups,
	}

	rfw, err := NewRotatingFileWriter(auditConfig)
	if err != nil {
		return nil, err
	}

	logger := logrus.New()
	logger.SetOutput(rfw)
	logger.SetLevel(level)
	logger.SetFormatter(&logrus.JSONFormatter{
		TimestampFormat: time.RFC3339Nano,
	})

	return &AuditLogger{
		logger: logger,
		config: config,
	}, nil
}

func (al *AuditLogger) Log(action, user, resource string, details map[string]interface{}) {
	al.logger.WithFields(logrus.Fields{
		"action":   action,
		"user":     user,
		"resource": resource,
		"details":  details,
	}).Info("audit log")
}
