package handler

import (
	"context"
	"net/http"
	workflowpb "workflow-engine/api/proto"
	"workflow-engine/internal/scheduler"
	"workflow-engine/internal/store"
	"workflow-engine/internal/telemetry"

	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/otel/attribute"
	otelcodes "go.opentelemetry.io/otel/codes"
)

type Handler struct {
	store     *store.Store
	scheduler *scheduler.Scheduler
}

func NewHandler(s *store.Store, sch *scheduler.Scheduler) *Handler {
	return &Handler{
		store:     s,
		scheduler: sch,
	}
}

type CreateWorkflowRequest struct {
	Name        string                      `json:"name" binding:"required"`
	Description string                      `json:"description"`
	Steps       []*workflowpb.StepDefinition `json:"steps" binding:"required,dive"`
	Metadata    map[string]string           `json:"metadata"`
}

type CreateWorkflowResponse struct {
	WorkflowID string `json:"workflow_id"`
	Status     string `json:"status"`
}

func (h *Handler) CreateWorkflow(c *gin.Context) {
	ctx, span := telemetry.Tracer.Start(c.Request.Context(), "handler.create_workflow")
	defer span.End()

	var req CreateWorkflowRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		span.SetStatus(otelcodes.Error, "invalid request")
		span.RecordError(err)
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "invalid request body",
			"details": err.Error(),
		})
		return
	}

	span.SetAttributes(
		attribute.String("workflow.name", req.Name),
		attribute.Int("workflow.step_count", len(req.Steps)),
	)

	pbReq := &workflowpb.CreateWorkflowRequest{
		Name:        req.Name,
		Description: req.Description,
		Steps:       req.Steps,
		Metadata:    req.Metadata,
	}

	resp, err := h.scheduler.CreateWorkflow(ctx, pbReq)
	if err != nil {
		span.SetStatus(otelcodes.Error, "failed to create workflow")
		span.RecordError(err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "failed to create workflow",
			"details": err.Error(),
		})
		return
	}

	span.SetAttributes(attribute.String("workflow.id", resp.WorkflowId))
	span.SetStatus(otelcodes.Ok, "workflow created")

	c.JSON(http.StatusCreated, CreateWorkflowResponse{
		WorkflowID: resp.WorkflowId,
		Status:     resp.Status,
	})
}

type StartInstanceRequest struct {
	WorkflowID string            `json:"workflow_id" binding:"required"`
	Input      map[string]string `json:"input"`
}

type StartInstanceResponse struct {
	InstanceID string `json:"instance_id"`
	TraceID    string `json:"trace_id"`
	Status     string `json:"status"`
}

func (h *Handler) StartInstance(c *gin.Context) {
	ctx, span := telemetry.Tracer.Start(c.Request.Context(), "handler.start_instance")
	defer span.End()

	var req StartInstanceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		span.SetStatus(otelcodes.Error, "invalid request")
		span.RecordError(err)
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "invalid request body",
			"details": err.Error(),
		})
		return
	}

	span.SetAttributes(attribute.String("workflow.id", req.WorkflowID))

	pbReq := &workflowpb.StartInstanceRequest{
		WorkflowId: req.WorkflowID,
		Input:      req.Input,
	}

	resp, err := h.scheduler.StartInstance(ctx, pbReq)
	if err != nil {
		span.SetStatus(otelcodes.Error, "failed to start instance")
		span.RecordError(err)
		if err.Error() == "workflow not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"error":   "workflow not found",
				"details": err.Error(),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "failed to start instance",
			"details": err.Error(),
		})
		return
	}

	span.SetAttributes(
		attribute.String("instance.id", resp.InstanceId),
		attribute.String("trace.id", resp.TraceId),
	)
	span.SetStatus(otelcodes.Ok, "instance started")

	c.JSON(http.StatusAccepted, StartInstanceResponse{
		InstanceID: resp.InstanceId,
		TraceID:    resp.TraceId,
		Status:     resp.Status,
	})
}

type TraceResponse struct {
	TraceID string                 `json:"trace_id"`
	Status  string                 `json:"status"`
	Root    map[string]interface{} `json:"root"`
}

func (h *Handler) GetTrace(c *gin.Context) {
	ctx, span := telemetry.Tracer.Start(c.Request.Context(), "handler.get_trace")
	defer span.End()

	traceID := c.Param("traceID")
	if traceID == "" {
		span.SetStatus(otelcodes.Error, "trace id required")
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "trace_id is required",
		})
		return
	}

	span.SetAttributes(attribute.String("trace.id", traceID))

	tree, err := h.store.GetTraceTree(ctx, traceID)
	if err != nil {
		span.SetStatus(otelcodes.Error, "trace not found")
		span.RecordError(err)
		c.JSON(http.StatusNotFound, gin.H{
			"error":   "trace not found",
			"details": err.Error(),
		})
		return
	}

	instance, err := h.store.GetInstanceByTraceID(ctx, traceID)
	if err != nil {
		span.SetStatus(otelcodes.Error, "instance not found")
		span.RecordError(err)
	}

	span.SetStatus(otelcodes.Ok, "trace retrieved")

	response := TraceResponse{
		TraceID: traceID,
		Status:  "FOUND",
		Root:    convertSpanNodeToMap(tree),
	}

	if instance != nil {
		response.Status = instance.Status
	}

	c.JSON(http.StatusOK, response)
}

func convertSpanNodeToMap(node interface{}) map[string]interface{} {
	if node == nil {
		return nil
	}

	type withMap interface {
		ToMap() map[string]interface{}
	}
	if m, ok := node.(withMap); ok {
		return m.ToMap()
	}

	result := make(map[string]interface{})
	return result
}
