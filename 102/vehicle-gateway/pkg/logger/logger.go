package logger

import (
	"os"
	"vehicle-gateway/internal/models"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"gopkg.in/natefinch/lumberjack.v2"
)

var log *zap.Logger
var sugar *zap.SugaredLogger

func Init(cfg models.LogConfig) error {
	var writer zapcore.WriteSyncer
	if cfg.Output == "file" {
		writer = zapcore.AddSync(&lumberjack.Logger{
			Filename:   cfg.Filename,
			MaxSize:    cfg.MaxSize,
			MaxBackups: cfg.MaxBackups,
			MaxAge:     cfg.MaxAge,
			Compress:   cfg.Compress,
		})
	} else {
		writer = zapcore.AddSync(os.Stdout)
	}

	level, err := zapcore.ParseLevel(cfg.Level)
	if err != nil {
		level = zapcore.InfoLevel
	}

	var encoderConfig zapcore.EncoderConfig
	if cfg.Format == "json" {
		encoderConfig = zap.NewProductionEncoderConfig()
	} else {
		encoderConfig = zap.NewDevelopmentEncoderConfig()
	}
	encoderConfig.TimeKey = "timestamp"
	encoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
	encoderConfig.EncodeLevel = zapcore.CapitalLevelEncoder

	var encoder zapcore.Encoder
	if cfg.Format == "json" {
		encoder = zapcore.NewJSONEncoder(encoderConfig)
	} else {
		encoder = zapcore.NewConsoleEncoder(encoderConfig)
	}

	core := zapcore.NewCore(encoder, writer, level)
	log = zap.New(core, zap.AddCaller(), zap.AddCallerSkip(1))
	sugar = log.Sugar()

	return nil
}

func GetLogger() *zap.Logger {
	if log == nil {
		log, _ = zap.NewProduction()
	}
	return log
}

func GetSugar() *zap.SugaredLogger {
	if sugar == nil {
		if log == nil {
			log, _ = zap.NewProduction()
		}
		sugar = log.Sugar()
	}
	return sugar
}

func Debug(msg string, fields ...zap.Field) {
	GetLogger().Debug(msg, fields...)
}

func Info(msg string, fields ...zap.Field) {
	GetLogger().Info(msg, fields...)
}

func Warn(msg string, fields ...zap.Field) {
	GetLogger().Warn(msg, fields...)
}

func Error(msg string, fields ...zap.Field) {
	GetLogger().Error(msg, fields...)
}

func Fatal(msg string, fields ...zap.Field) {
	GetLogger().Fatal(msg, fields...)
}

func Debugf(template string, args ...interface{}) {
	GetSugar().Debugf(template, args...)
}

func Infof(template string, args ...interface{}) {
	GetSugar().Infof(template, args...)
}

func Warnf(template string, args ...interface{}) {
	GetSugar().Warnf(template, args...)
}

func Errorf(template string, args ...interface{}) {
	GetSugar().Errorf(template, args...)
}

func Fatalf(template string, args ...interface{}) {
	GetSugar().Fatalf(template, args...)
}

func Sync() {
	if log != nil {
		_ = log.Sync()
	}
}
