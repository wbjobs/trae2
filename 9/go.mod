module workflow-engine

go 1.21

require (
	github.com/gin-gonic/gin v1.9.1
	github.com/google/uuid v1.5.0
	github.com/PaesslerAG/jsonpath v0.1.1
	github.com/PaesslerAG/gval v1.2.2
	google.golang.org/grpc v1.61.0
	google.golang.org/protobuf v1.32.0
	go.opentelemetry.io/otel v1.22.0
	go.opentelemetry.io/otel/trace v1.22.0
	go.opentelemetry.io/otel/exporters/jaeger v1.17.0
	go.opentelemetry.io/otel/sdk v1.22.0
	gorm.io/gorm v1.25.5
	gorm.io/driver/postgres v1.5.5
	github.com/robfig/cron/v3 v3.0.1
)
