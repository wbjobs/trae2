FROM golang:1.21-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o gateway-server cmd/server/main.go

FROM alpine:latest

RUN apk --no-cache add ca-certificates tzdata

WORKDIR /app

COPY --from=builder /app/gateway-server .
COPY configs/config.yaml ./configs/

EXPOSE 8080 8081 8082 9090

CMD ["./gateway-server", "-config", "configs/config.yaml"]
