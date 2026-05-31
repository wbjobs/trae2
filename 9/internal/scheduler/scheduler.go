package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"
	workflowpb "workflow-engine/api/proto"
	"workflow-engine/internal/model"
	"workflow-engine/internal/store"
	"workflow-engine/internal/telemetry"
	"workflow-engine/internal/worker"

	"github.com/google/uuid"
	"go.opentelemetry.io/otel/attribute"
	otelcodes "go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

type Scheduler struct {
	store       *store.Store
	workerPool  *worker.WorkerPool
	semaphore   chan struct{}
	maxParallel int
	evaluator   *model.ConditionEvaluator
}

func NewScheduler(s *store.Store, wp *worker.WorkerPool, maxParallel int) *Scheduler {
	if maxParallel <= 0 {
		maxParallel = 10
	}
	return &Scheduler{
		store:       s,
		workerPool:  wp,
		semaphore:   make(chan struct{}, maxParallel),
		maxParallel: maxParallel,
		evaluator:   model.NewConditionEvaluator(),
	}
}

func (s *Scheduler) CreateWorkflow(ctx context.Context, req *workflowpb.CreateWorkflowRequest) (*workflowpb.CreateWorkflowResponse, error) {
	if err := validateWorkflow(req.Steps); err != nil {
		return nil, fmt.Errorf("invalid workflow: %w", err)
	}

	wf := &model.Workflow{
		Name:        req.Name,
		Description: req.Description,
	}

	steps := make([]model.StepDefinition, len(req.Steps))
	for i, step := range req.Steps {
		steps[i] = convertStepDefinition(step)
	}

	if err := wf.SetSteps(steps); err != nil {
		return nil, fmt.Errorf("failed to serialize steps: %w", err)
	}

	if err := wf.SetMetadata(req.Metadata); err != nil {
		return nil, fmt.Errorf("failed to serialize metadata: %w", err)
	}

	if err := s.store.CreateWorkflow(ctx, wf); err != nil {
		return nil, fmt.Errorf("failed to create workflow: %w", err)
	}

	return &workflowpb.CreateWorkflowResponse{
		WorkflowId: wf.ID,
		Status:     "CREATED",
	}, nil
}

func (s *Scheduler) StartInstance(ctx context.Context, req *workflowpb.StartInstanceRequest) (*workflowpb.StartInstanceResponse, error) {
	wf, err := s.store.GetWorkflow(ctx, req.WorkflowId)
	if err != nil {
		return nil, fmt.Errorf("workflow not found: %w", err)
	}

	steps, err := wf.GetSteps()
	if err != nil {
		return nil, fmt.Errorf("failed to deserialize steps: %w", err)
	}

	traceID := generateTraceID()
	ctxWithTrace, err := telemetry.ContextFromTraceID(traceID)
	if err != nil {
		return nil, fmt.Errorf("failed to create trace context: %w", err)
	}

	ctxWithTrace, workflowSpan := telemetry.StartWorkflowSpan(ctxWithTrace, wf.ID, "")
	defer workflowSpan.End()

	contextBucket := model.NewContextBucket()
	if req.Input != nil {
		contextBucket.MergeInput(req.Input)
	}

	inst := &model.WorkflowInstance{
		WorkflowID: wf.ID,
		TraceID:    traceID,
		Status:     "RUNNING",
	}
	if err := inst.SetInput(req.Input); err != nil {
		return nil, fmt.Errorf("failed to serialize input: %w", err)
	}
	if err := inst.SetContextBucket(contextBucket); err != nil {
		return nil, fmt.Errorf("failed to serialize context bucket: %w", err)
	}

	if err := s.store.CreateInstance(ctx, inst); err != nil {
		return nil, fmt.Errorf("failed to create instance: %w", err)
	}

	workflowSpan.SetAttributes(attribute.String(telemetry.InstanceKey, inst.ID))

	go s.executeWorkflow(ctxWithTrace, inst.ID, steps)

	return &workflowpb.StartInstanceResponse{
		InstanceId: inst.ID,
		TraceId:    traceID,
		Status:     "STARTED",
	}, nil
}

func (s *Scheduler) executeWorkflow(ctx context.Context, instanceID string, steps []model.StepDefinition) {
	ctx, workflowSpan := telemetry.Tracer.Start(ctx, "workflow.execute", trace.WithAttributes(
		attribute.String(telemetry.InstanceKey, instanceID),
	))
	defer workflowSpan.End()

	contextBucket := model.NewContextBucket()
	stepStatus := make(map[string]workflowpb.StepStatus)
	stepSpanMap := make(map[string]trace.SpanID)
	for _, step := range steps {
		stepStatus[step.StepID] = workflowpb.StepStatusPending
	}

	var wg sync.WaitGroup
	completed := make(chan string, len(steps))
	failed := make(chan string, len(steps))
	contextUpdate := make(chan struct{}, 100)
	mu := sync.Mutex{}

	stepMap := make(map[string]*model.StepDefinition)
	for i := range steps {
		stepMap[steps[i].StepID] = &steps[i]
	}

	go func() {
		for {
			select {
			case stepID := <-completed:
				mu.Lock()
				if stepStatus[stepID] == workflowpb.StepStatusCompleted {
					mu.Unlock()
					continue
				}
				stepStatus[stepID] = workflowpb.StepStatusCompleted
				mu.Unlock()

				s.scheduleReadySteps(ctx, instanceID, steps, stepStatus, stepSpanMap, stepMap,
					contextBucket, &wg, completed, failed, contextUpdate, &mu)

				if allStepsDone(stepStatus) {
					return
				}
			case stepID := <-failed:
				mu.Lock()
				stepStatus[stepID] = workflowpb.StepStatusFailed
				mu.Unlock()

				s.failDependentSteps(ctx, instanceID, steps, stepID, stepStatus, stepSpanMap, &mu)

				if allStepsDone(stepStatus) {
					return
				}
			case <-contextUpdate:
				mu.Lock()
				s.store.UpdateInstanceContext(ctx, instanceID, contextBucket)
				mu.Unlock()
			}
		}
	}()

	s.scheduleReadySteps(ctx, instanceID, steps, stepStatus, stepSpanMap, stepMap,
		contextBucket, &wg, completed, failed, contextUpdate, &mu)

	wg.Wait()

	hasFailed := false
	for _, status := range stepStatus {
		if status == workflowpb.StepStatusFailed {
			hasFailed = true
			break
		}
	}

	finalStatus := "COMPLETED"
	if hasFailed {
		finalStatus = "FAILED"
		workflowSpan.SetStatus(otelcodes.Error, "workflow failed")
	} else {
		workflowSpan.SetStatus(otelcodes.Ok, "workflow completed")
	}

	s.store.UpdateInstanceStatus(ctx, instanceID, finalStatus)
	s.store.UpdateInstanceContext(ctx, instanceID, contextBucket)
}

func (s *Scheduler) scheduleReadySteps(
	ctx context.Context,
	instanceID string,
	steps []model.StepDefinition,
	stepStatus map[string]workflowpb.StepStatus,
	stepSpanMap map[string]trace.SpanID,
	stepMap map[string]*model.StepDefinition,
	contextBucket *model.ContextBucket,
	wg *sync.WaitGroup,
	completed chan<- string,
	failed chan<- string,
	contextUpdate chan<- struct{},
	mu *sync.Mutex,
) {
	mu.Lock()
	defer mu.Unlock()

	for _, step := range steps {
		if stepStatus[step.StepID] != workflowpb.StepStatusPending {
			continue
		}

		depsCompleted := true
		var failedDep string
		for _, dep := range step.Dependencies {
			if status, ok := stepStatus[dep]; !ok || status != workflowpb.StepStatusCompleted {
				depsCompleted = false
				if status == workflowpb.StepStatusFailed {
					failedDep = dep
				}
				break
			}
		}

		if failedDep != "" {
			stepStatus[step.StepID] = workflowpb.StepStatusSkipped
			s.recordSkippedStep(ctx, instanceID, step, stepSpanMap)
			continue
		}

		if !depsCompleted {
			continue
		}

		if step.Condition != nil {
			decisionResult, err := s.evaluateCondition(ctx, instanceID, step, stepSpanMap, contextBucket, mu)
			if err != nil {
				stepStatus[step.StepID] = workflowpb.StepStatusFailed
				failed <- step.StepID
				continue
			}

			if !decisionResult {
				stepStatus[step.StepID] = workflowpb.StepStatusSkipped
				s.recordConditionSkippedStep(ctx, instanceID, step, stepSpanMap)
				continue
			}
		}

		stepStatus[step.StepID] = workflowpb.StepStatusRunning
		wg.Add(1)

		parentSpanID := trace.SpanID{}
		if len(step.Dependencies) > 0 {
			if spanID, ok := stepSpanMap[step.Dependencies[0]]; ok {
				parentSpanID = spanID
			}
		}

		go s.executeStep(ctx, instanceID, step, parentSpanID, stepSpanMap,
			contextBucket, wg, completed, failed, contextUpdate, mu)
	}
}

func (s *Scheduler) evaluateCondition(
	ctx context.Context,
	instanceID string,
	step model.StepDefinition,
	stepSpanMap map[string]trace.SpanID,
	contextBucket *model.ContextBucket,
	mu *sync.Mutex,
) (bool, error) {
	parentSpanID := trace.SpanID{}
	if len(step.Dependencies) > 0 {
		if spanID, ok := stepSpanMap[step.Dependencies[0]]; ok {
			parentSpanID = spanID
		}
	}

	spanCtx := ctx
	if parentSpanID.IsValid() {
		sc := trace.SpanContextFromContext(ctx)
		newSc := trace.NewSpanContext(trace.SpanContextConfig{
			TraceID:    sc.TraceID(),
			SpanID:     parentSpanID,
			TraceFlags: sc.TraceFlags(),
			Remote:     true,
		})
		spanCtx = trace.ContextWithSpanContext(ctx, newSc)
	}

	decisionCtx, decisionSpan := telemetry.StartDecisionSpan(spanCtx, step.StepID, step.Condition.If)
	defer decisionSpan.End()

	startTime := time.Now()

	evalResult, err := s.evaluator.Evaluate(step.Condition, contextBucket)
	endTime := time.Now()

	telemetry.SetDecisionResult(decisionSpan, evalResult.ExpectedValue, evalResult.ActualValue, evalResult.Passed)

	spanID := trace.SpanContextFromContext(decisionCtx).SpanID()
	mu.Lock()
	stepSpanMap[step.StepID] = spanID
	mu.Unlock()

	parentSpanIDStr := ""
	if parentSpanID.IsValid() {
		parentSpanIDStr = parentSpanID.String()
	}

	condJSON, _ := json.Marshal(step.Condition)
	contextJSON, _ := json.Marshal(contextBucket.GetAll())

	decisionExec := &model.DecisionExecution{
		InstanceID:      instanceID,
		StepID:          step.StepID,
		TraceID:         telemetry.GetTraceID(decisionCtx),
		SpanID:          spanID.String(),
		ParentSpanID:    parentSpanIDStr,
		ConditionJSON:   string(condJSON),
		ContextSnapshot: string(contextJSON),
		Result:          evalResult.Passed,
		Expression:      step.Condition.If,
		ExpectedValue:   evalResult.ExpectedValue,
		ActualValue:     evalResult.ActualValue,
		StartTime:       startTime,
		EndTime:         endTime,
		DurationMs:      endTime.Sub(startTime).Milliseconds(),
	}

	s.store.CreateDecisionExecution(ctx, decisionExec)

	if err != nil {
		decisionSpan.SetStatus(otelcodes.Error, err.Error())
		return false, err
	}

	decisionSpan.SetStatus(otelcodes.Ok, "evaluated")
	return evalResult.Passed, nil
}

func (s *Scheduler) executeStep(
	ctx context.Context,
	instanceID string,
	step model.StepDefinition,
	parentSpanID trace.SpanID,
	stepSpanMap map[string]trace.SpanID,
	contextBucket *model.ContextBucket,
	wg *sync.WaitGroup,
	completed chan<- string,
	failed chan<- string,
	contextUpdate chan<- struct{},
	mu *sync.Mutex,
) {
	defer wg.Done()

	s.semaphore <- struct{}{}
	defer func() { <-s.semaphore }()

	spanCtx := ctx
	if parentSpanID.IsValid() {
		sc := trace.SpanContextFromContext(ctx)
		newSc := trace.NewSpanContext(trace.SpanContextConfig{
			TraceID:    sc.TraceID(),
			SpanID:     parentSpanID,
			TraceFlags: sc.TraceFlags(),
			Remote:     true,
		})
		spanCtx = trace.ContextWithSpanContext(ctx, newSc)
	}

	stepCtx, stepSpan := telemetry.StartStepSpan(spanCtx, step.StepID, step.Name, step.Type)
	defer stepSpan.End()

	spanID := trace.SpanContextFromContext(stepCtx).SpanID()
	mu.Lock()
	stepSpanMap[step.StepID] = spanID
	mu.Unlock()

	parentSpanIDStr := ""
	if parentSpanID.IsValid() {
		parentSpanIDStr = parentSpanID.String()
	}

	exec := &model.StepExecution{
		InstanceID:   instanceID,
		StepID:       step.StepID,
		StepName:     step.Name,
		TraceID:      telemetry.GetTraceID(stepCtx),
		SpanID:       spanID.String(),
		ParentSpanID: parentSpanIDStr,
		Status:       int32(workflowpb.StepStatusRunning),
		StartTime:    time.Now(),
	}
	s.store.CreateStepExecution(ctx, exec)

	workerClient := s.workerPool.GetWorker()
	if workerClient == nil {
		s.failStep(exec, step, fmt.Errorf("no available workers"), stepSpan, failed)
		return
	}

	req := &workflowpb.ExecuteStepRequest{
		InstanceId: instanceID,
		StepId:     step.StepID,
		StepName:   step.Name,
		StepType:   workflowpb.StepType(step.Type),
		Metadata:   step.Metadata,
	}

	if step.ShellConfig != nil {
		req.ShellConfig = &workflowpb.ShellConfig{
			Command:        step.ShellConfig.Command,
			Args:           step.ShellConfig.Args,
			WorkingDir:     step.ShellConfig.WorkingDir,
			TimeoutSeconds: step.ShellConfig.TimeoutSeconds,
		}
	}
	if step.HTTPConfig != nil {
		req.HttpConfig = &workflowpb.HTTPConfig{
			Url:            step.HTTPConfig.URL,
			Method:         step.HTTPConfig.Method,
			Headers:        step.HTTPConfig.Headers,
			Body:           step.HTTPConfig.Body,
			TimeoutSeconds: step.HTTPConfig.TimeoutSeconds,
		}
	}

	resp, err := workerClient.ExecuteStep(stepCtx, req)
	exec.EndTime = time.Now()
	exec.DurationMs = exec.EndTime.Sub(exec.StartTime).Milliseconds()

	if err != nil {
		s.failStep(exec, step, err, stepSpan, failed)
		return
	}

	exec.Status = int32(resp.Status)
	exec.Output = resp.Output
	exec.ErrorMessage = resp.ErrorMessage
	exec.SetMetadata(resp.Metadata)

	if resp.Output != "" {
		var outputData interface{}
		if err := json.Unmarshal([]byte(resp.Output), &outputData); err == nil {
			contextBucket.Set(step.StepID, outputData)
			exec.SetOutputJSON(outputData)
		} else {
			contextBucket.Set(step.StepID, resp.Output)
		}
		select {
		case contextUpdate <- struct{}{}:
		default:
		}
	}

	s.store.UpdateStepExecution(ctx, exec)

	telemetry.SetSpanStatus(stepSpan, resp.Status, nil)
	if resp.Status == workflowpb.StepStatusCompleted {
		stepSpan.SetStatus(otelcodes.Ok, "completed")
		completed <- step.StepID
	} else {
		stepSpan.SetStatus(otelcodes.Error, resp.ErrorMessage)
		failed <- step.StepID
	}
}

func (s *Scheduler) failStep(
	exec *model.StepExecution,
	step model.StepDefinition,
	err error,
	span trace.Span,
	failed chan<- string,
) {
	exec.Status = int32(workflowpb.StepStatusFailed)
	exec.ErrorMessage = err.Error()
	exec.EndTime = time.Now()
	exec.DurationMs = exec.EndTime.Sub(exec.StartTime).Milliseconds()
	s.store.UpdateStepExecution(context.Background(), exec)

	telemetry.SetSpanStatus(span, int32(workflowpb.StepStatusFailed), err)
	span.SetStatus(otelcodes.Error, err.Error())
	failed <- step.StepID
}

func (s *Scheduler) failDependentSteps(
	ctx context.Context,
	instanceID string,
	steps []model.StepDefinition,
	failedStepID string,
	stepStatus map[string]workflowpb.StepStatus,
	stepSpanMap map[string]trace.SpanID,
	mu *sync.Mutex,
) {
	mu.Lock()
	defer mu.Unlock()

	changed := true
	for changed {
		changed = false
		for _, step := range steps {
			if stepStatus[step.StepID] != workflowpb.StepStatusPending {
				continue
			}

			for _, dep := range step.Dependencies {
				if stepStatus[dep] == workflowpb.StepStatusFailed || stepStatus[dep] == workflowpb.StepStatusSkipped {
					stepStatus[step.StepID] = workflowpb.StepStatusSkipped
					s.recordSkippedStep(ctx, instanceID, step, stepSpanMap)
					changed = true
					break
				}
			}
		}
	}
}

func (s *Scheduler) recordSkippedStep(
	ctx context.Context,
	instanceID string,
	step model.StepDefinition,
	stepSpanMap map[string]trace.SpanID,
) {
	_, stepSpan := telemetry.StartStepSpan(ctx, step.StepID, step.Name, step.Type)
	defer stepSpan.End()

	spanID := trace.SpanContextFromContext(ctx).SpanID()
	stepSpanMap[step.StepID] = spanID

	exec := &model.StepExecution{
		InstanceID: instanceID,
		StepID:     step.StepID,
		StepName:   step.Name,
		TraceID:    telemetry.GetTraceID(ctx),
		SpanID:     spanID.String(),
		Status:     int32(workflowpb.StepStatusSkipped),
		StartTime:  time.Now(),
		EndTime:    time.Now(),
	}
	s.store.CreateStepExecution(ctx, exec)

	stepSpan.SetAttributes(attribute.String("step.status", "SKIPPED"))
}

func (s *Scheduler) recordConditionSkippedStep(
	ctx context.Context,
	instanceID string,
	step model.StepDefinition,
	stepSpanMap map[string]trace.SpanID,
) {
	_, stepSpan := telemetry.StartStepSpan(ctx, step.StepID, step.Name, step.Type)
	defer stepSpan.End()

	spanID := trace.SpanContextFromContext(ctx).SpanID()
	stepSpanMap[step.StepID] = spanID

	exec := &model.StepExecution{
		InstanceID:   instanceID,
		StepID:       step.StepID,
		StepName:     step.Name,
		TraceID:      telemetry.GetTraceID(ctx),
		SpanID:       spanID.String(),
		Status:       int32(workflowpb.StepStatusSkipped),
		ErrorMessage: "skipped due to condition",
		StartTime:    time.Now(),
		EndTime:      time.Now(),
	}
	s.store.CreateStepExecution(ctx, exec)

	stepSpan.SetAttributes(attribute.String("step.status", "SKIPPED"))
	stepSpan.SetAttributes(attribute.String("skip.reason", "condition not met"))
}

func validateWorkflow(steps []*workflowpb.StepDefinition) error {
	if len(steps) == 0 {
		return fmt.Errorf("workflow must have at least one step")
	}

	stepIDs := make(map[string]bool)
	for _, step := range steps {
		if step.StepId == "" {
			return fmt.Errorf("step id cannot be empty")
		}
		if stepIDs[step.StepId] {
			return fmt.Errorf("duplicate step id: %s", step.StepId)
		}
		stepIDs[step.StepId] = true
	}

	for _, step := range steps {
		for _, dep := range step.Dependencies {
			if !stepIDs[dep] {
				return fmt.Errorf("step %s depends on non-existent step %s", step.StepId, dep)
			}
		}
	}

	if hasCycle(steps) {
		return fmt.Errorf("workflow has cyclic dependencies")
	}

	return nil
}

func hasCycle(steps []*workflowpb.StepDefinition) bool {
	stepMap := make(map[string]*workflowpb.StepDefinition)
	for _, step := range steps {
		stepMap[step.StepId] = step
	}

	visited := make(map[string]bool)
	recStack := make(map[string]bool)

	var dfs func(string) bool
	dfs = func(stepID string) bool {
		visited[stepID] = true
		recStack[stepID] = true

		step := stepMap[stepID]
		for _, dep := range step.Dependencies {
			if !visited[dep] {
				if dfs(dep) {
					return true
				}
			} else if recStack[dep] {
				return true
			}
		}

		recStack[stepID] = false
		return false
	}

	for _, step := range steps {
		if !visited[step.StepId] {
			if dfs(step.StepId) {
				return true
			}
		}
	}

	return false
}

func allStepsDone(stepStatus map[string]workflowpb.StepStatus) bool {
	for _, status := range stepStatus {
		if status == workflowpb.StepStatusPending || status == workflowpb.StepStatusRunning {
			return false
		}
	}
	return true
}

func convertStepDefinition(pbStep *workflowpb.StepDefinition) model.StepDefinition {
	step := model.StepDefinition{
		StepID:       pbStep.StepId,
		Name:         pbStep.Name,
		Type:         int32(pbStep.Type),
		Dependencies: pbStep.Dependencies,
		Metadata:     pbStep.Metadata,
	}

	if pbStep.Condition != nil {
		step.Condition = &model.Condition{
			If:       pbStep.Condition.If,
			Equals:   pbStep.Condition.Equals,
			Contains: pbStep.Condition.Contains,
			GT:       pbStep.Condition.GT,
			LT:       pbStep.Condition.LT,
			Exists:   pbStep.Condition.Exists,
		}
	}

	if pbStep.ShellConfig != nil {
		step.ShellConfig = &model.ShellConfig{
			Command:        pbStep.ShellConfig.Command,
			Args:           pbStep.ShellConfig.Args,
			WorkingDir:     pbStep.ShellConfig.WorkingDir,
			TimeoutSeconds: pbStep.ShellConfig.TimeoutSeconds,
		}
	}

	if pbStep.HttpConfig != nil {
		step.HTTPConfig = &model.HTTPConfig{
			URL:            pbStep.HttpConfig.Url,
			Method:         pbStep.HttpConfig.Method,
			Headers:        pbStep.HttpConfig.Headers,
			Body:           pbStep.HttpConfig.Body,
			TimeoutSeconds: pbStep.HttpConfig.TimeoutSeconds,
		}
	}

	return step
}

func generateTraceID() string {
	uuidBytes, _ := uuid.New().MarshalBinary()
	hexChars := "0123456789abcdef"
	result := make([]byte, 32)
	for i := 0; i < 16; i++ {
		result[i*2] = hexChars[uuidBytes[i]>>4]
		result[i*2+1] = hexChars[uuidBytes[i]&0x0f]
	}
	return string(result)
}
