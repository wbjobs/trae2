package model

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strconv"
	"strings"
)

type ConditionEvaluator struct{}

func NewConditionEvaluator() *ConditionEvaluator {
	return &ConditionEvaluator{}
}

type EvalResult struct {
	Passed       bool
	ActualValue  string
	ExpectedValue string
	Error        error
}

func (e *ConditionEvaluator) Evaluate(cond *Condition, context *ContextBucket) (*EvalResult, error) {
	if cond == nil {
		return &EvalResult{Passed: true}, nil
	}

	actualValue, err := context.GetJSONPath(cond.If)
	if err != nil {
		return &EvalResult{
			Passed:       false,
			ActualValue:  fmt.Sprintf("error: %v", err),
			ExpectedValue: fmt.Sprintf("%v", cond.Equals),
			Error:        err,
		}, nil
	}

	actualStr := valueToString(actualValue)

	switch {
	case cond.Exists != nil:
		exists := err == nil
		passed := exists == *cond.Exists
		return &EvalResult{
			Passed:       passed,
			ActualValue:  fmt.Sprintf("%v", exists),
			ExpectedValue: fmt.Sprintf("%v", *cond.Exists),
		}, nil

	case cond.Equals != nil:
		expectedStr := valueToString(cond.Equals)
		passed := valuesEqual(actualValue, cond.Equals)
		return &EvalResult{
			Passed:       passed,
			ActualValue:  actualStr,
			ExpectedValue: expectedStr,
		}, nil

	case cond.Contains != "":
		contains := strings.Contains(actualStr, cond.Contains)
		return &EvalResult{
			Passed:       contains,
			ActualValue:  actualStr,
			ExpectedValue: fmt.Sprintf("contains '%s'", cond.Contains),
		}, nil

	case cond.GT != 0:
		actualNum, ok := toFloat64(actualValue)
		if !ok {
			return &EvalResult{
				Passed:       false,
				ActualValue:  actualStr,
				ExpectedValue: fmt.Sprintf("number > %v", cond.GT),
				Error:        fmt.Errorf("value is not a number"),
			}, nil
		}
		return &EvalResult{
			Passed:       actualNum > cond.GT,
			ActualValue:  fmt.Sprintf("%v", actualNum),
			ExpectedValue: fmt.Sprintf("> %v", cond.GT),
		}, nil

	case cond.LT != 0:
		actualNum, ok := toFloat64(actualValue)
		if !ok {
			return &EvalResult{
				Passed:       false,
				ActualValue:  actualStr,
				ExpectedValue: fmt.Sprintf("number < %v", cond.LT),
				Error:        fmt.Errorf("value is not a number"),
			}, nil
		}
		return &EvalResult{
			Passed:       actualNum < cond.LT,
			ActualValue:  fmt.Sprintf("%v", actualNum),
			ExpectedValue: fmt.Sprintf("< %v", cond.LT),
		}, nil
	}

	return &EvalResult{
		Passed:       true,
		ActualValue:  actualStr,
		ExpectedValue: "any",
	}, nil
}

func valueToString(v interface{}) string {
	switch val := v.(type) {
	case string:
		return val
	case int, int32, int64, float32, float64:
		return fmt.Sprintf("%v", val)
	case bool:
		return strconv.FormatBool(val)
	default:
		jsonBytes, err := json.Marshal(v)
		if err != nil {
			return fmt.Sprintf("%v", v)
		}
		return string(jsonBytes)
	}
}

func valuesEqual(a, b interface{}) bool {
	if a == nil || b == nil {
		return a == b
	}

	if reflect.TypeOf(a) == reflect.TypeOf(b) {
		return reflect.DeepEqual(a, b)
	}

	aStr := valueToString(a)
	bStr := valueToString(b)
	return aStr == bStr
}

func toFloat64(v interface{}) (float64, bool) {
	switch val := v.(type) {
	case float64:
		return val, true
	case float32:
		return float64(val), true
	case int:
		return float64(val), true
	case int32:
		return float64(val), true
	case int64:
		return float64(val), true
	case string:
		f, err := strconv.ParseFloat(val, 64)
		return f, err == nil
	default:
		return 0, false
	}
}
