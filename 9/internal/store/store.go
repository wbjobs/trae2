package store

import (
	"context"
	"fmt"
	"time"
	"workflow-engine/internal/model"

	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type Store struct {
	db *gorm.DB
}

func NewStore(dsn string) (*Store, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("failed to get sql.DB: %w", err)
	}
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetMaxOpenConns(100)
	sqlDB.SetConnMaxLifetime(time.Hour)

	if err := db.AutoMigrate(&model.Workflow{}, &model.WorkflowInstance{}, &model.StepExecution{}, &model.DecisionExecution{}); err != nil {
		return nil, fmt.Errorf("failed to migrate database: %w", err)
	}

	return &Store{db: db}, nil
}

func (s *Store) CreateWorkflow(ctx context.Context, wf *model.Workflow) error {
	if wf.ID == "" {
		wf.ID = uuid.New().String()
	}
	now := time.Now()
	wf.CreatedAt = now
	wf.UpdatedAt = now
	return s.db.WithContext(ctx).Create(wf).Error
}

func (s *Store) GetWorkflow(ctx context.Context, id string) (*model.Workflow, error) {
	var wf model.Workflow
	if err := s.db.WithContext(ctx).Where("id = ?", id).First(&wf).Error; err != nil {
		return nil, err
	}
	return &wf, nil
}

func (s *Store) CreateInstance(ctx context.Context, inst *model.WorkflowInstance) error {
	if inst.ID == "" {
		inst.ID = uuid.New().String()
	}
	now := time.Now()
	inst.CreatedAt = now
	inst.UpdatedAt = now
	return s.db.WithContext(ctx).Create(inst).Error
}

func (s *Store) GetInstance(ctx context.Context, id string) (*model.WorkflowInstance, error) {
	var inst model.WorkflowInstance
	if err := s.db.WithContext(ctx).Where("id = ?", id).First(&inst).Error; err != nil {
		return nil, err
	}
	return &inst, nil
}

func (s *Store) GetInstanceByTraceID(ctx context.Context, traceID string) (*model.WorkflowInstance, error) {
	var inst model.WorkflowInstance
	if err := s.db.WithContext(ctx).Where("trace_id = ?", traceID).First(&inst).Error; err != nil {
		return nil, err
	}
	return &inst, nil
}

func (s *Store) UpdateInstanceStatus(ctx context.Context, id string, status string) error {
	return s.db.WithContext(ctx).Model(&model.WorkflowInstance{}).
		Where("id = ?", id).
		Updates(map[string]interface{}{
			"status":     status,
			"updated_at": time.Now(),
		}).Error
}

func (s *Store) UpdateInstanceContext(ctx context.Context, id string, bucket *model.ContextBucket) error {
	if bucket == nil {
		return nil
	}
	data := bucket.GetAll()
	jsonData, err := model.MarshalJSON(data)
	if err != nil {
		return err
	}
	return s.db.WithContext(ctx).Model(&model.WorkflowInstance{}).
		Where("id = ?", id).
		Updates(map[string]interface{}{
			"context_data": string(jsonData),
			"updated_at":   time.Now(),
		}).Error
}

func (s *Store) CreateStepExecution(ctx context.Context, se *model.StepExecution) error {
	if se.ID == "" {
		se.ID = uuid.New().String()
	}
	now := time.Now()
	se.CreatedAt = now
	se.UpdatedAt = now
	return s.db.WithContext(ctx).Create(se).Error
}

func (s *Store) UpdateStepExecution(ctx context.Context, se *model.StepExecution) error {
	se.UpdatedAt = time.Now()
	return s.db.WithContext(ctx).Save(se).Error
}

func (s *Store) GetStepExecutionsByTraceID(ctx context.Context, traceID string) ([]*model.StepExecution, error) {
	var executions []*model.StepExecution
	if err := s.db.WithContext(ctx).
		Where("trace_id = ?", traceID).
		Order("start_time ASC").
		Find(&executions).Error; err != nil {
		return nil, err
	}
	return executions, nil
}

func (s *Store) GetStepExecutionsByInstanceID(ctx context.Context, instanceID string) ([]*model.StepExecution, error) {
	var executions []*model.StepExecution
	if err := s.db.WithContext(ctx).
		Where("instance_id = ?", instanceID).
		Order("start_time ASC").
		Find(&executions).Error; err != nil {
		return nil, err
	}
	return executions, nil
}

func (s *Store) CreateDecisionExecution(ctx context.Context, de *model.DecisionExecution) error {
	if de.ID == "" {
		de.ID = uuid.New().String()
	}
	now := time.Now()
	de.CreatedAt = now
	return s.db.WithContext(ctx).Create(de).Error
}

func (s *Store) GetDecisionExecutionsByTraceID(ctx context.Context, traceID string) ([]*model.DecisionExecution, error) {
	var decisions []*model.DecisionExecution
	if err := s.db.WithContext(ctx).
		Where("trace_id = ?", traceID).
		Order("start_time ASC").
		Find(&decisions).Error; err != nil {
		return nil, err
	}
	return decisions, nil
}

func (s *Store) GetTraceTree(ctx context.Context, traceID string) (*model.SpanNode, error) {
	stepExecutions, err := s.GetStepExecutionsByTraceID(ctx, traceID)
	if err != nil {
		return nil, err
	}

	decisionExecutions, err := s.GetDecisionExecutionsByTraceID(ctx, traceID)
	if err != nil {
		return nil, err
	}

	if len(stepExecutions) == 0 && len(decisionExecutions) == 0 {
		return nil, fmt.Errorf("no trace found for trace_id: %s", traceID)
	}

	spanMap := make(map[string]*model.SpanNode)

	for _, exec := range stepExecutions {
		metadata, _ := exec.GetMetadata()
		status := statusToString(exec.Status)
		node := &model.SpanNode{
			TraceID:      exec.TraceID,
			SpanID:       exec.SpanID,
			ParentSpanID: exec.ParentSpanID,
			StepID:       exec.StepID,
			StepName:     exec.StepName,
			SpanType:     "step",
			Status:       status,
			StartTime:    exec.StartTime,
			EndTime:      exec.EndTime,
			DurationMs:   exec.DurationMs,
			Output:       exec.Output,
			ErrorMessage: exec.ErrorMessage,
			Metadata:     metadata,
			Children:     []*model.SpanNode{},
		}
		spanMap[exec.SpanID] = node
	}

	for _, dec := range decisionExecutions {
		node := &model.SpanNode{
			TraceID:      dec.TraceID,
			SpanID:       dec.SpanID,
			ParentSpanID: dec.ParentSpanID,
			StepID:       dec.StepID,
			StepName:     fmt.Sprintf("decision:%s", dec.StepID),
			SpanType:     "decision",
			Status:       "COMPLETED",
			StartTime:    dec.StartTime,
			EndTime:      dec.EndTime,
			DurationMs:   dec.DurationMs,
			DecisionInfo: &model.DecisionInfo{
				Expression:    dec.Expression,
				ExpectedValue: dec.ExpectedValue,
				ActualValue:   dec.ActualValue,
				Result:        dec.Result,
			},
			Children: []*model.SpanNode{},
		}
		spanMap[dec.SpanID] = node
	}

	var root *model.SpanNode
	for _, node := range spanMap {
		if node.ParentSpanID == "" || node.ParentSpanID == node.TraceID {
			root = node
		} else if parent, ok := spanMap[node.ParentSpanID]; ok {
			parent.Children = append(parent.Children, node)
		}
	}

	if root == nil {
		for _, node := range spanMap {
			root = node
			break
		}
	}

	return root, nil
}

func statusToString(status int32) string {
	switch status {
	case 0:
		return "UNSPECIFIED"
	case 1:
		return "PENDING"
	case 2:
		return "RUNNING"
	case 3:
		return "COMPLETED"
	case 4:
		return "FAILED"
	case 5:
		return "SKIPPED"
	default:
		return "UNKNOWN"
	}
}
