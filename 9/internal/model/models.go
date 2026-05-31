package model

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"
)

type Condition struct {
	If       string      `json:"if"`
	Equals   interface{} `json:"equals,omitempty"`
	Contains string      `json:"contains,omitempty"`
	GT       float64     `json:"gt,omitempty"`
	LT       float64     `json:"lt,omitempty"`
	Exists   *bool       `json:"exists,omitempty"`
}

type StepDefinition struct {
	StepID       string            `json:"step_id"`
	Name         string            `json:"name"`
	Type         int32             `json:"type"`
	ShellConfig  *ShellConfig      `json:"shell_config,omitempty"`
	HTTPConfig   *HTTPConfig       `json:"http_config,omitempty"`
	Dependencies []string          `json:"dependencies"`
	Condition    *Condition        `json:"condition,omitempty"`
	Metadata     map[string]string `json:"metadata"`
}

type ShellConfig struct {
	Command        string   `json:"command"`
	Args           []string `json:"args"`
	WorkingDir     string   `json:"working_dir"`
	TimeoutSeconds int32    `json:"timeout_seconds"`
}

type HTTPConfig struct {
	URL            string            `json:"url"`
	Method         string            `json:"method"`
	Headers        map[string]string `json:"headers"`
	Body           string            `json:"body"`
	TimeoutSeconds int32             `json:"timeout_seconds"`
}

type Workflow struct {
	ID          string    `gorm:"primaryKey;type:uuid" json:"workflow_id"`
	Name        string    `gorm:"not null" json:"name"`
	Description string    `json:"description"`
	StepsJSON   string    `gorm:"type:jsonb;not null" json:"-"`
	Metadata    string    `gorm:"type:jsonb" json:"-"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (w *Workflow) GetSteps() ([]StepDefinition, error) {
	var steps []StepDefinition
	err := json.Unmarshal([]byte(w.StepsJSON), &steps)
	return steps, err
}

func (w *Workflow) SetSteps(steps []StepDefinition) error {
	data, err := json.Marshal(steps)
	if err != nil {
		return err
	}
	w.StepsJSON = string(data)
	return nil
}

func (w *Workflow) GetMetadata() (map[string]string, error) {
	var metadata map[string]string
	if w.Metadata == "" {
		return nil, nil
	}
	err := json.Unmarshal([]byte(w.Metadata), &metadata)
	return metadata, err
}

func (w *Workflow) SetMetadata(metadata map[string]string) error {
	if metadata == nil {
		w.Metadata = ""
		return nil
	}
	data, err := json.Marshal(metadata)
	if err != nil {
		return err
	}
	w.Metadata = string(data)
	return nil
}

type WorkflowInstance struct {
	ID           string    `gorm:"primaryKey;type:uuid" json:"instance_id"`
	WorkflowID   string    `gorm:"not null;index" json:"workflow_id"`
	TraceID      string    `gorm:"not null;uniqueIndex" json:"trace_id"`
	Status       string    `gorm:"not null;default:'PENDING'" json:"status"`
	Input        string    `gorm:"type:jsonb" json:"-"`
	Output       string    `gorm:"type:jsonb" json:"-"`
	ContextData  string    `gorm:"type:jsonb" json:"-"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
	Workflow     Workflow  `gorm:"foreignKey:WorkflowID" json:"-"`
}

func (wi *WorkflowInstance) GetInput() (map[string]string, error) {
	var input map[string]string
	if wi.Input == "" {
		return nil, nil
	}
	err := json.Unmarshal([]byte(wi.Input), &input)
	return input, err
}

func (wi *WorkflowInstance) SetInput(input map[string]string) error {
	if input == nil {
		wi.Input = ""
		return nil
	}
	data, err := json.Marshal(input)
	if err != nil {
		return err
	}
	wi.Input = string(data)
	return nil
}

func (wi *WorkflowInstance) GetContextBucket() (*ContextBucket, error) {
	var data map[string]interface{}
	if wi.ContextData == "" {
		data = make(map[string]interface{})
	} else {
		if err := json.Unmarshal([]byte(wi.ContextData), &data); err != nil {
			return nil, err
		}
	}
	return &ContextBucket{
		data: data,
	}, nil
}

func (wi *WorkflowInstance) SetContextBucket(bucket *ContextBucket) error {
	if bucket == nil {
		wi.ContextData = ""
		return nil
	}
	bucket.mu.RLock()
	defer bucket.mu.RUnlock()
	data, err := json.Marshal(bucket.data)
	if err != nil {
		return err
	}
	wi.ContextData = string(data)
	return nil
}

type StepExecution struct {
	ID           string    `gorm:"primaryKey;type:uuid" json:"id"`
	InstanceID   string    `gorm:"not null;index" json:"instance_id"`
	StepID       string    `gorm:"not null;index" json:"step_id"`
	StepName     string    `gorm:"not null" json:"step_name"`
	TraceID      string    `gorm:"not null;index" json:"trace_id"`
	SpanID       string    `gorm:"not null" json:"span_id"`
	ParentSpanID string    `json:"parent_span_id"`
	Status       int32     `gorm:"not null;default:1" json:"status"`
	Output       string    `json:"output"`
	OutputJSON   string    `gorm:"type:jsonb" json:"-"`
	ErrorMessage string    `json:"error_message"`
	StartTime    time.Time `json:"start_time"`
	EndTime      time.Time `json:"end_time"`
	DurationMs   int64     `json:"duration_ms"`
	Metadata     string    `gorm:"type:jsonb" json:"-"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

func (se *StepExecution) GetMetadata() (map[string]string, error) {
	var metadata map[string]string
	if se.Metadata == "" {
		return nil, nil
	}
	err := json.Unmarshal([]byte(se.Metadata), &metadata)
	return metadata, err
}

func (se *StepExecution) SetMetadata(metadata map[string]string) error {
	if metadata == nil {
		se.Metadata = ""
		return nil
	}
	data, err := json.Marshal(metadata)
	if err != nil {
		return err
	}
	se.Metadata = string(data)
	return nil
}

func (se *StepExecution) GetOutputJSON() (interface{}, error) {
	if se.OutputJSON == "" {
		return nil, nil
	}
	var result interface{}
	err := json.Unmarshal([]byte(se.OutputJSON), &result)
	return result, err
}

func (se *StepExecution) SetOutputJSON(data interface{}) error {
	if data == nil {
		se.OutputJSON = ""
		return nil
	}
	jsonData, err := json.Marshal(data)
	if err != nil {
		return err
	}
	se.OutputJSON = string(jsonData)
	return nil
}

type DecisionExecution struct {
	ID             string    `gorm:"primaryKey;type:uuid" json:"id"`
	InstanceID     string    `gorm:"not null;index" json:"instance_id"`
	StepID         string    `gorm:"not null" json:"step_id"`
	TraceID        string    `gorm:"not null;index" json:"trace_id"`
	SpanID         string    `gorm:"not null" json:"span_id"`
	ParentSpanID   string    `json:"parent_span_id"`
	ConditionJSON  string    `gorm:"type:jsonb;not null" json:"-"`
	ContextSnapshot string   `gorm:"type:jsonb" json:"-"`
	Result         bool      `json:"result"`
	Expression     string    `json:"expression"`
	ExpectedValue  string    `json:"expected_value"`
	ActualValue    string    `json:"actual_value"`
	StartTime      time.Time `json:"start_time"`
	EndTime        time.Time `json:"end_time"`
	DurationMs     int64     `json:"duration_ms"`
	CreatedAt      time.Time `json:"created_at"`
}

func (de *DecisionExecution) GetCondition() (*Condition, error) {
	var cond Condition
	err := json.Unmarshal([]byte(de.ConditionJSON), &cond)
	return &cond, err
}

func (de *DecisionExecution) SetCondition(cond *Condition) error {
	data, err := json.Marshal(cond)
	if err != nil {
		return err
	}
	de.ConditionJSON = string(data)
	return nil
}

type ContextBucket struct {
	data map[string]interface{}
	mu   sync.RWMutex
}

func NewContextBucket() *ContextBucket {
	return &ContextBucket{
		data: make(map[string]interface{}),
	}
}

func (cb *ContextBucket) Set(stepID string, value interface{}) {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	cb.data[stepID] = value
}

func (cb *ContextBucket) Get(stepID string) (interface{}, bool) {
	cb.mu.RLock()
	defer cb.mu.RUnlock()
	val, ok := cb.data[stepID]
	return val, ok
}

func (cb *ContextBucket) GetJSONPath(path string) (interface{}, error) {
	cb.mu.RLock()
	defer cb.mu.RUnlock()
	return jsonPathGet(cb.data, path)
}

func (cb *ContextBucket) GetAll() map[string]interface{} {
	cb.mu.RLock()
	defer cb.mu.RUnlock()
	result := make(map[string]interface{})
	for k, v := range cb.data {
		result[k] = v
	}
	return result
}

func (cb *ContextBucket) MergeInput(input map[string]string) {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	for k, v := range input {
		cb.data["$input."+k] = v
	}
}

func jsonPathGet(data map[string]interface{}, path string) (interface{}, error) {
	if path == "" {
		return nil, fmt.Errorf("empty path")
	}

	if len(path) >= 2 && path[:2] == "$." {
		path = path[2:]
	}

	parts := splitPath(path)
	current := interface{}(data)

	for _, part := range parts {
		switch v := current.(type) {
		case map[string]interface{}:
			var ok bool
			current, ok = v[part]
			if !ok {
				return nil, fmt.Errorf("key not found: %s", part)
			}
		default:
			return nil, fmt.Errorf("cannot access key '%s' on non-map type", part)
		}
	}

	return current, nil
}

func splitPath(path string) []string {
	var parts []string
	var current string
	for _, c := range path {
		if c == '.' {
			if current != "" {
				parts = append(parts, current)
				current = ""
			}
		} else {
			current += string(c)
		}
	}
	if current != "" {
		parts = append(parts, current)
	}
	return parts
}

func MarshalJSON(v interface{}) ([]byte, error) {
	return json.Marshal(v)
}

type SpanNode struct {
	TraceID      string                 `json:"trace_id"`
	SpanID       string                 `json:"span_id"`
	ParentSpanID string                 `json:"parent_span_id"`
	StepID       string                 `json:"step_id"`
	StepName     string                 `json:"step_name"`
	SpanType     string                 `json:"span_type"`
	Status       string                 `json:"status"`
	StartTime    time.Time              `json:"start_time"`
	EndTime      time.Time              `json:"end_time"`
	DurationMs   int64                  `json:"duration_ms"`
	Output       string                 `json:"output,omitempty"`
	ErrorMessage string                 `json:"error_message,omitempty"`
	Metadata     map[string]string      `json:"metadata,omitempty"`
	DecisionInfo *DecisionInfo          `json:"decision,omitempty"`
	Children     []*SpanNode            `json:"children,omitempty"`
}

type DecisionInfo struct {
	Expression    string `json:"expression"`
	ExpectedValue string `json:"expected_value"`
	ActualValue   string `json:"actual_value"`
	Result        bool   `json:"result"`
}

func (s *SpanNode) getDisplayName() string {
	if s.SpanType == "decision" {
		return fmt.Sprintf("decision.evaluate:%s", s.StepID)
	}
	if s.SpanType == "workflow" {
		return fmt.Sprintf("workflow:%s", s.StepID)
	}
	if s.StepName != "" {
		return fmt.Sprintf("step:%s", s.StepName)
	}
	if s.StepID != "" {
		return fmt.Sprintf("step:%s", s.StepID)
	}
	return "span"
}

func (s *SpanNode) ToMap() map[string]interface{} {
	result := map[string]interface{}{
		"trace_id":       s.TraceID,
		"span_id":        s.SpanID,
		"parent_span_id": s.ParentSpanID,
		"step_id":        s.StepID,
		"step_name":      s.StepName,
		"span_type":      s.SpanType,
		"status":         s.Status,
		"start_time":     s.StartTime,
		"end_time":       s.EndTime,
		"duration_ms":    s.DurationMs,
		"name":           s.getDisplayName(),
	}

	attributes := make(map[string]interface{})
	if s.StepID != "" {
		attributes["step.id"] = s.StepID
	}
	if s.SpanType != "" {
		attributes["step.type"] = s.SpanType
	}
	if s.DecisionInfo != nil {
		attributes["decision.expression"] = s.DecisionInfo.Expression
		attributes["decision.expected"] = s.DecisionInfo.ExpectedValue
		attributes["decision.actual"] = s.DecisionInfo.ActualValue
		attributes["decision.result"] = fmt.Sprintf("%v", s.DecisionInfo.Result)
	}
	result["attributes"] = attributes

	if s.Output != "" {
		result["output"] = s.Output
	}
	if s.ErrorMessage != "" {
		result["error_message"] = s.ErrorMessage
	}
	if s.Metadata != nil {
		result["metadata"] = s.Metadata
		for k, v := range s.Metadata {
			attributes[k] = v
		}
	}
	if s.DecisionInfo != nil {
		result["decision"] = map[string]interface{}{
			"expression":     s.DecisionInfo.Expression,
			"expected_value": s.DecisionInfo.ExpectedValue,
			"actual_value":   s.DecisionInfo.ActualValue,
			"result":         s.DecisionInfo.Result,
		}
	}

	if len(s.Children) > 0 {
		children := make([]map[string]interface{}, len(s.Children))
		for i, child := range s.Children {
			children[i] = child.ToMap()
		}
		result["children"] = children
	}

	return result
}
