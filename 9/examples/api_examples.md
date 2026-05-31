# Workflow Engine API Examples

## 1. 创建工作流定义 (带条件分支)

POST /api/v1/workflow

```json
{
  "name": "conditional-workflow",
  "description": "A workflow with conditional branching",
  "steps": [
    {
      "step_id": "step-1",
      "name": "Check Status",
      "type": "SHELL",
      "shell_config": {
        "command": "echo",
        "args": ["{\"status\": \"success\", \"data\": {\"value\": 42}}"],
        "timeout_seconds": 30
      },
      "dependencies": [],
      "metadata": {
        "phase": "initialization"
      }
    },
    {
      "step_id": "step-2-success",
      "name": "Handle Success",
      "type": "SHELL",
      "shell_config": {
        "command": "echo",
        "args": ["Success path executed"],
        "timeout_seconds": 30
      },
      "dependencies": ["step-1"],
      "condition": {
        "if": "$.step-1.status",
        "equals": "success"
      },
      "metadata": {
        "phase": "success-branch"
      }
    },
    {
      "step_id": "step-2-failure",
      "name": "Handle Failure",
      "type": "SHELL",
      "shell_config": {
        "command": "echo",
        "args": ["Failure path executed"],
        "timeout_seconds": 30
      },
      "dependencies": ["step-1"],
      "condition": {
        "if": "$.step-1.status",
        "equals": "failed"
      },
      "metadata": {
        "phase": "failure-branch"
      }
    },
    {
      "step_id": "step-3",
      "name": "Final Step",
      "type": "SHELL",
      "shell_config": {
        "command": "echo",
        "args": ["Workflow completed"],
        "timeout_seconds": 30
      },
      "dependencies": ["step-2-success", "step-2-failure"],
      "metadata": {
        "phase": "finalization"
      }
    }
  ],
  "metadata": {
    "team": "platform",
    "environment": "production"
  }
}
```

Response:
```json
{
  "workflow_id": "uuid-workflow-id",
  "status": "CREATED"
}
```

## 2. 条件类型说明

### 等于判断 (equals)
```json
{
  "condition": {
    "if": "$.step1.result.status",
    "equals": "success"
  }
}
```

### 包含判断 (contains)
```json
{
  "condition": {
    "if": "$.step1.result.message",
    "contains": "error"
  }
}
```

### 大于判断 (gt)
```json
{
  "condition": {
    "if": "$.step1.result.value",
    "gt": 100
  }
}
```

### 小于判断 (lt)
```json
{
  "condition": {
    "if": "$.step1.result.value",
    "lt": 50
  }
}
```

### 存在性判断 (exists)
```json
{
  "condition": {
    "if": "$.step1.result.data",
    "exists": true
  }
}
```

## 3. JSONPath 语法示例

上下文数据桶结构示例：
```json
{
  "step1": {
    "status": "completed",
    "data": {
      "count": 42,
      "items": ["a", "b", "c"]
    }
  },
  "step2": {
    "result": {
      "success": true
    }
  }
}
```

常用JSONPath:
- `$.step1.status` → `"completed"`
- `$.step1.data.count` → `42`
- `$.step1.data.items[0]` → `"a"`
- `$.step2.result.success` → `true`

## 4. 启动工作流实例

POST /api/v1/instance

```json
{
  "workflow_id": "uuid-workflow-id",
  "input": {
    "initial_data": "value",
    "config": {
      "param1": "test"
    }
  },
  "metadata": {
    "trigger": "manual"
  }
}
```

Response:
```json
{
  "instance_id": "uuid-instance-id",
  "trace_id": "32-character-hex-trace-id",
  "status": "STARTED"
}
```

## 5. 获取追踪树 (含决策节点)

GET /api/v1/trace/{traceID}

Response:
```json
{
  "trace_id": "32-character-hex-trace-id",
  "root": {
    "span_id": "span-1",
    "name": "workflow:workflow-id",
    "start_time": "2024-01-01T00:00:00Z",
    "end_time": "2024-01-01T00:00:10Z",
    "duration_ms": 10000,
    "status": "COMPLETED",
    "attributes": {
      "workflow.id": "workflow-id",
      "instance.id": "instance-id"
    },
    "children": [
      {
        "span_id": "span-2",
        "name": "step:step-1",
        "start_time": "2024-01-01T00:00:00Z",
        "end_time": "2024-01-01T00:00:02Z",
        "duration_ms": 2000,
        "status": "COMPLETED",
        "attributes": {
          "step.id": "step-1",
          "step.type": "SHELL"
        },
        "children": [
          {
            "span_id": "span-3",
            "name": "decision.evaluate:step-2-success",
            "start_time": "2024-01-01T00:00:02Z",
            "end_time": "2024-01-01T00:00:02.1Z",
            "duration_ms": 100,
            "status": "COMPLETED",
            "attributes": {
              "decision.step_id": "step-2-success",
              "decision.expression": "$.step-1.status",
              "decision.expected": "\"success\"",
              "decision.actual": "\"success\"",
              "decision.result": "true"
            },
            "children": [
              {
                "span_id": "span-4",
                "name": "step:step-2-success",
                "start_time": "2024-01-01T00:00:02.1Z",
                "end_time": "2024-01-01T00:00:04Z",
                "duration_ms": 1900,
                "status": "COMPLETED",
                "attributes": {
                  "step.id": "step-2-success",
                  "step.type": "SHELL"
                }
              }
            ]
          },
          {
            "span_id": "span-5",
            "name": "decision.evaluate:step-2-failure",
            "start_time": "2024-01-01T00:00:02Z",
            "end_time": "2024-01-01T00:00:02.1Z",
            "duration_ms": 100,
            "status": "COMPLETED",
            "attributes": {
              "decision.step_id": "step-2-failure",
              "decision.expression": "$.step-1.status",
              "decision.expected": "\"failed\"",
              "decision.actual": "\"success\"",
              "decision.result": "false"
            },
            "children": [
              {
                "span_id": "span-6",
                "name": "step:step-2-failure",
                "start_time": "2024-01-01T00:00:02.1Z",
                "end_time": "2024-01-01T00:00:02.2Z",
                "duration_ms": 100,
                "status": "SKIPPED",
                "attributes": {
                  "step.id": "step-2-failure",
                  "step.status": "SKIPPED",
                  "skip.reason": "condition not met"
                }
              }
            ]
          }
        ]
      },
      {
        "span_id": "span-7",
        "name": "step:step-3",
        "start_time": "2024-01-01T00:00:04Z",
        "end_time": "2024-01-01T00:00:06Z",
        "duration_ms": 2000,
        "status": "COMPLETED",
        "attributes": {
          "step.id": "step-3",
          "step.type": "SHELL"
        }
      }
    ]
  }
}
```

## 6. 创建线性工作流 (简单示例)

POST /api/v1/workflow

```json
{
  "name": "simple-workflow",
  "description": "A simple linear workflow",
  "steps": [
    {
      "step_id": "step-1",
      "name": "First Step",
      "type": "SHELL",
      "shell_config": {
        "command": "echo",
        "args": ["{\"value\": \"hello\"}"],
        "timeout_seconds": 30
      },
      "dependencies": []
    },
    {
      "step_id": "step-2",
      "name": "Second Step",
      "type": "HTTP",
      "http_config": {
        "url": "https://httpbin.org/post",
        "method": "POST",
        "headers": {
          "Content-Type": "application/json"
        },
        "body": "{\"data\": \"test\"}",
        "timeout_seconds": 30
      },
      "dependencies": ["step-1"]
    }
  ]
}
```
