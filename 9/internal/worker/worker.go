package worker

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"time"
	workflowpb "workflow-engine/api/proto"
	"workflow-engine/internal/telemetry"

	"go.opentelemetry.io/otel/attribute"
	otelcodes "go.opentelemetry.io/otel/codes"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

type WorkerServer struct {
	workflowpb.UnimplementedWorkerServiceServer
	workerID string
}

func NewWorkerServer(workerID string) *WorkerServer {
	return &WorkerServer{
		workerID: workerID,
	}
}

func (w *WorkerServer) ExecuteStep(ctx context.Context, req *workflowpb.ExecuteStepRequest) (*workflowpb.ExecuteStepResponse, error) {
	ctx, span := telemetry.Tracer.Start(ctx, fmt.Sprintf("worker.execute:%s", req.StepName))
	defer span.End()

	span.SetAttributes(
		attribute.String("worker.id", w.workerID),
		attribute.String("step.id", req.StepId),
		attribute.String("step.name", req.StepName),
		attribute.Int64("step.type", int64(req.StepType)),
	)

	startTime := time.Now()
	response := &workflowpb.ExecuteStepResponse{
		StepId:    req.StepId,
		Status:    workflowpb.StepStatusRunning,
		StartTime: startTime.UnixNano(),
		Metadata:  make(map[string]string),
	}
	response.Metadata["worker_id"] = w.workerID

	var execErr error
	var output string

	switch req.StepType {
	case workflowpb.StepTypeShell:
		output, execErr = w.executeShell(ctx, req.ShellConfig)
	case workflowpb.StepTypeHTTP:
		output, execErr = w.executeHTTP(ctx, req.HttpConfig)
	default:
		execErr = fmt.Errorf("unknown step type: %d", req.StepType)
	}

	endTime := time.Now()
	response.EndTime = endTime.UnixNano()
	response.Output = output

	if execErr != nil {
		response.Status = workflowpb.StepStatusFailed
		response.ErrorMessage = execErr.Error()
		span.SetStatus(otelcodes.Error, execErr.Error())
		span.RecordError(execErr)
	} else {
		response.Status = workflowpb.StepStatusCompleted
		span.SetStatus(otelcodes.Ok, "completed")
	}

	span.SetAttributes(
		attribute.String("step.status", statusToString(response.Status)),
		attribute.Int64("duration_ms", endTime.Sub(startTime).Milliseconds()),
	)

	return response, nil
}

func (w *WorkerServer) executeShell(ctx context.Context, config *workflowpb.ShellConfig) (string, error) {
	if config == nil {
		return "", fmt.Errorf("shell config is nil")
	}

	timeout := time.Duration(config.TimeoutSeconds) * time.Second
	if timeout == 0 {
		timeout = 30 * time.Second
	}

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	var cmd *exec.Cmd
	if len(config.Args) > 0 {
		cmd = exec.CommandContext(ctx, config.Command, config.Args...)
	} else {
		cmd = exec.CommandContext(ctx, "sh", "-c", config.Command)
	}

	if config.WorkingDir != "" {
		cmd.Dir = config.WorkingDir
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		return stderr.String(), fmt.Errorf("shell command failed: %w, stderr: %s", err, stderr.String())
	}

	return stdout.String(), nil
}

func (w *WorkerServer) executeHTTP(ctx context.Context, config *workflowpb.HTTPConfig) (string, error) {
	if config == nil {
		return "", fmt.Errorf("http config is nil")
	}

	timeout := time.Duration(config.TimeoutSeconds) * time.Second
	if timeout == 0 {
		timeout = 30 * time.Second
	}

	client := &http.Client{
		Timeout: timeout,
	}

	method := config.Method
	if method == "" {
		method = "GET"
	}

	var bodyReader io.Reader
	if config.Body != "" {
		bodyReader = bytes.NewBufferString(config.Body)
	}

	req, err := http.NewRequestWithContext(ctx, method, config.Url, bodyReader)
	if err != nil {
		return "", fmt.Errorf("failed to create http request: %w", err)
	}

	for k, v := range config.Headers {
		req.Header.Set(k, v)
	}

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("http request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return string(body), fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode >= 400 {
		return string(body), fmt.Errorf("http request returned status %d: %s", resp.StatusCode, string(body))
	}

	return string(body), nil
}

func statusToString(status workflowpb.StepStatus) string {
	switch status {
	case workflowpb.StepStatusUnspecified:
		return "UNSPECIFIED"
	case workflowpb.StepStatusPending:
		return "PENDING"
	case workflowpb.StepStatusRunning:
		return "RUNNING"
	case workflowpb.StepStatusCompleted:
		return "COMPLETED"
	case workflowpb.StepStatusFailed:
		return "FAILED"
	case workflowpb.StepStatusSkipped:
		return "SKIPPED"
	default:
		return "UNKNOWN"
	}
}

type WorkerClient struct {
	conn   *grpc.ClientConn
	client workflowpb.WorkerServiceClient
	addr   string
}

func NewWorkerClient(addr string) (*WorkerClient, error) {
	conn, err := grpc.Dial(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("failed to connect to worker %s: %w", addr, err)
	}

	return &WorkerClient{
		conn:   conn,
		client: workflowpb.NewWorkerServiceClient(conn),
		addr:   addr,
	}, nil
}

func (wc *WorkerClient) ExecuteStep(ctx context.Context, req *workflowpb.ExecuteStepRequest) (*workflowpb.ExecuteStepResponse, error) {
	return wc.client.ExecuteStep(ctx, req)
}

func (wc *WorkerClient) Close() error {
	return wc.conn.Close()
}

type WorkerPool struct {
	clients []*WorkerClient
	next    int
}

func NewWorkerPool(addresses []string) (*WorkerPool, error) {
	pool := &WorkerPool{
		clients: make([]*WorkerClient, 0, len(addresses)),
	}

	for _, addr := range addresses {
		client, err := NewWorkerClient(addr)
		if err != nil {
			return nil, err
		}
		pool.clients = append(pool.clients, client)
	}

	return pool, nil
}

func (wp *WorkerPool) GetWorker() *WorkerClient {
	if len(wp.clients) == 0 {
		return nil
	}
	client := wp.clients[wp.next]
	wp.next = (wp.next + 1) % len(wp.clients)
	return client
}

func (wp *WorkerPool) Close() {
	for _, client := range wp.clients {
		client.Close()
	}
}
