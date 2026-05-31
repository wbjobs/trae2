package telemetry

import (
	"context"
	"fmt"
	"os"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/jaeger"
	"go.opentelemetry.io/otel/sdk/resource"
	tracesdk "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.17.0"
	"go.opentelemetry.io/otel/trace"
)

const (
	ServiceName          = "workflow-engine"
	TracerName           = "workflow-engine/tracer"
	WorkflowKey          = "workflow.id"
	InstanceKey          = "instance.id"
	StepKey              = "step.id"
	StepNameKey          = "step.name"
	StepTypeKey          = "step.type"
	DecisionKey          = "decision.id"
	DecisionExpression   = "decision.expression"
	DecisionExpected     = "decision.expected"
	DecisionActual       = "decision.actual"
	DecisionResult       = "decision.result"
)

var Tracer trace.Tracer

func InitTracer(jaegerEndpoint string) (*tracesdk.TracerProvider, error) {
	var exporter tracesdk.SpanExporter
	var err error

	if jaegerEndpoint != "" {
		exporter, err = jaeger.New(jaeger.WithCollectorEndpoint(jaeger.WithEndpoint(jaegerEndpoint)))
		if err != nil {
			return nil, fmt.Errorf("failed to create jaeger exporter: %w", err)
		}
	} else {
		exporter = &noopExporter{}
	}

	tp := tracesdk.NewTracerProvider(
		tracesdk.WithBatcher(exporter),
		tracesdk.WithResource(resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceNameKey.String(ServiceName),
			attribute.String("environment", getEnv("ENV", "development")),
		)),
	)

	otel.SetTracerProvider(tp)
	Tracer = otel.Tracer(TracerName)

	return tp, nil
}

type noopExporter struct{}

func (n *noopExporter) ExportSpans(ctx context.Context, spans []tracesdk.ReadOnlySpan) error {
	return nil
}

func (n *noopExporter) Shutdown(ctx context.Context) error {
	return nil
}

func StartWorkflowSpan(ctx context.Context, workflowID, instanceID string) (context.Context, trace.Span) {
	return Tracer.Start(ctx, "workflow.execute",
		trace.WithAttributes(
			attribute.String(WorkflowKey, workflowID),
			attribute.String(InstanceKey, instanceID),
		),
		trace.WithSpanKind(trace.SpanKindInternal),
	)
}

func StartStepSpan(ctx context.Context, stepID, stepName string, stepType int32) (context.Context, trace.Span) {
	return Tracer.Start(ctx, fmt.Sprintf("step.execute:%s", stepName),
		trace.WithAttributes(
			attribute.String(StepKey, stepID),
			attribute.String(StepNameKey, stepName),
			attribute.Int64(StepTypeKey, int64(stepType)),
		),
		trace.WithSpanKind(trace.SpanKindClient),
	)
}

func StartDecisionSpan(ctx context.Context, stepID, expression string) (context.Context, trace.Span) {
	return Tracer.Start(ctx, fmt.Sprintf("decision.evaluate:%s", stepID),
		trace.WithAttributes(
			attribute.String(DecisionKey, stepID),
			attribute.String(DecisionExpression, expression),
		),
		trace.WithSpanKind(trace.SpanKindInternal),
	)
}

func SetDecisionResult(span trace.Span, expected, actual string, result bool) {
	span.SetAttributes(
		attribute.String(DecisionExpected, expected),
		attribute.String(DecisionActual, actual),
		attribute.Bool(DecisionResult, result),
	)
}

func GetTraceID(ctx context.Context) string {
	spanCtx := trace.SpanContextFromContext(ctx)
	if spanCtx.IsValid() {
		return spanCtx.TraceID().String()
	}
	return ""
}

func GetSpanID(ctx context.Context) string {
	spanCtx := trace.SpanContextFromContext(ctx)
	if spanCtx.IsValid() {
		return spanCtx.SpanID().String()
	}
	return ""
}

func ContextFromTraceID(traceID string) (context.Context, error) {
	tid, err := trace.TraceIDFromHex(traceID)
	if err != nil {
		return context.Background(), err
	}

	spanCtx := trace.NewSpanContext(trace.SpanContextConfig{
		TraceID:    tid,
		SpanID:     trace.SpanID{},
		TraceFlags: trace.FlagsSampled,
		Remote:     true,
	})
	return trace.ContextWithSpanContext(context.Background(), spanCtx), nil
}

func SetSpanStatus(span trace.Span, status int32, err error) {
	if err != nil {
		span.RecordError(err)
		span.SetAttributes(attribute.String("step.status", "FAILED"))
	} else {
		switch status {
		case 3:
			span.SetAttributes(attribute.String("step.status", "COMPLETED"))
		case 4:
			span.SetAttributes(attribute.String("step.status", "FAILED"))
		case 5:
			span.SetAttributes(attribute.String("step.status", "SKIPPED"))
		default:
			span.SetAttributes(attribute.String("step.status", "PENDING"))
		}
	}
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}
