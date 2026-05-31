package workflowpb

type StepType int32

const (
	StepTypeUnspecified StepType = 0
	StepTypeShell       StepType = 1
	StepTypeHTTP        StepType = 2
)

type StepStatus int32

const (
	StepStatusUnspecified StepStatus = 0
	StepStatusPending     StepStatus = 1
	StepStatusRunning     StepStatus = 2
	StepStatusCompleted   StepStatus = 3
	StepStatusFailed      StepStatus = 4
	StepStatusSkipped     StepStatus = 5
)

type Condition struct {
	If       string      `json:"if"`
	Equals   interface{} `json:"equals,omitempty"`
	Contains string      `json:"contains,omitempty"`
	GT       float64     `json:"gt,omitempty"`
	LT       float64     `json:"lt,omitempty"`
	Exists   *bool       `json:"exists,omitempty"`
}

type HTTPConfig struct {
	Url            string            `json:"url"`
	Method         string            `json:"method"`
	Headers        map[string]string `json:"headers"`
	Body           string            `json:"body"`
	TimeoutSeconds int32             `json:"timeout_seconds"`
}

type ShellConfig struct {
	Command        string   `json:"command"`
	Args           []string `json:"args"`
	WorkingDir     string   `json:"working_dir"`
	TimeoutSeconds int32    `json:"timeout_seconds"`
}

type StepDefinition struct {
	StepId       string            `json:"step_id"`
	Name         string            `json:"name"`
	Type         StepType          `json:"type"`
	ShellConfig  *ShellConfig      `json:"shell_config,omitempty"`
	HttpConfig   *HTTPConfig       `json:"http_config,omitempty"`
	Dependencies []string          `json:"dependencies"`
	Condition    *Condition        `json:"condition,omitempty"`
	Metadata     map[string]string `json:"metadata"`
}

type WorkflowDefinition struct {
	WorkflowId  string            `json:"workflow_id"`
	Name        string            `json:"name"`
	Description string            `json:"description"`
	Steps       []*StepDefinition `json:"steps"`
	Metadata    map[string]string `json:"metadata"`
	CreatedAt   int64             `json:"created_at"`
}

type CreateWorkflowRequest struct {
	Name        string            `json:"name"`
	Description string            `json:"description"`
	Steps       []*StepDefinition `json:"steps"`
	Metadata    map[string]string `json:"metadata"`
}

type CreateWorkflowResponse struct {
	WorkflowId string `json:"workflow_id"`
	Status     string `json:"status"`
}

type StartInstanceRequest struct {
	WorkflowId string            `json:"workflow_id"`
	Input      map[string]string `json:"input"`
}

type StartInstanceResponse struct {
	InstanceId string `json:"instance_id"`
	TraceId    string `json:"trace_id"`
	Status     string `json:"status"`
}

type ExecuteStepRequest struct {
	InstanceId  string            `json:"instance_id"`
	StepId      string            `json:"step_id"`
	StepName    string            `json:"step_name"`
	StepType    StepType          `json:"step_type"`
	ShellConfig *ShellConfig      `json:"shell_config,omitempty"`
	HttpConfig  *HTTPConfig       `json:"http_config,omitempty"`
	Metadata    map[string]string `json:"metadata"`
}

type ExecuteStepResponse struct {
	StepId       string            `json:"step_id"`
	Status       StepStatus        `json:"status"`
	Output       string            `json:"output"`
	ErrorMessage string            `json:"error_message"`
	StartTime    int64             `json:"start_time"`
	EndTime      int64             `json:"end_time"`
	Metadata     map[string]string `json:"metadata"`
}
