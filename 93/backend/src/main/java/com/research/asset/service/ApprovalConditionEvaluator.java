package com.research.asset.service;

import com.research.asset.entity.ApprovalInstance;
import com.research.asset.entity.Asset;
import com.research.asset.entity.User;
import com.research.asset.repository.AssetRepository;
import com.research.asset.repository.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
@RequiredArgsConstructor
public class ApprovalConditionEvaluator {

    private final AssetRepository assetRepository;
    private final UserRepository userRepository;

    private static final Pattern VARIABLE_PATTERN = Pattern.compile("\\$\\{([^}]+)}");

    public boolean evaluate(String expression, ApprovalInstance instance) {
        if (expression == null || expression.trim().isEmpty()) {
            return true;
        }

        Map<String, Object> variables = buildVariables(instance);
        String parsedExpression = replaceVariables(expression, variables);

        return evaluateExpression(parsedExpression);
    }

    private Map<String, Object> buildVariables(ApprovalInstance instance) {
        Map<String, Object> variables = new HashMap<>();

        Asset asset = assetRepository.findById(instance.getAsset().getId())
                .orElseThrow(() -> new EntityNotFoundException("资产不存在"));
        variables.put("asset.type", asset.getAssetType() != null ? asset.getAssetType().name() : null);
        variables.put("asset.amount", asset.getVersion());
        variables.put("asset.title", asset.getTitle());
        variables.put("asset.department", asset.getDepartment());
        variables.put("asset.classificationLevel", asset.getClassificationLevel() != null ? asset.getClassificationLevel().name() : null);

        User initiator = userRepository.findById(instance.getInitiatorId())
                .orElseThrow(() -> new EntityNotFoundException("发起人不存在"));
        variables.put("initiator.department", initiator.getDepartment());
        variables.put("initiator.name", initiator.getRealName());
        variables.put("initiator.username", initiator.getUsername());

        variables.put("flow.type", instance.getFlow().getFlowType() != null ? instance.getFlow().getFlowType().name() : null);
        variables.put("instance.createdAt", instance.getCreatedAt());

        return variables;
    }

    private String replaceVariables(String expression, Map<String, Object> variables) {
        Matcher matcher = VARIABLE_PATTERN.matcher(expression);
        StringBuffer sb = new StringBuffer();

        while (matcher.find()) {
            String varName = matcher.group(1).trim();
            Object value = variables.get(varName);

            if (value == null) {
                matcher.appendReplacement(sb, "null");
            } else if (value instanceof String) {
                matcher.appendReplacement(sb, "'" + escapeString((String) value) + "'");
            } else if (value instanceof Number) {
                matcher.appendReplacement(sb, value.toString());
            } else if (value instanceof Boolean) {
                matcher.appendReplacement(sb, value.toString());
            } else {
                matcher.appendReplacement(sb, "'" + value.toString() + "'");
            }
        }
        matcher.appendTail(sb);

        return sb.toString();
    }

    private String escapeString(String str) {
        return str.replace("'", "\\'");
    }

    private boolean evaluateExpression(String expression) {
        expression = expression.trim();

        if (expression.contains("||")) {
            String[] parts = expression.split("\\|\\|");
            for (String part : parts) {
                if (evaluateExpression(part.trim())) {
                    return true;
                }
            }
            return false;
        }

        if (expression.contains("&&")) {
            String[] parts = expression.split("&&");
            for (String part : parts) {
                if (!evaluateExpression(part.trim())) {
                    return false;
                }
            }
            return true;
        }

        return evaluateComparison(expression);
    }

    private boolean evaluateComparison(String expression) {
        expression = expression.trim();

        String[] operators = {">=", "<=", "==", "!=", ">", "<"};

        for (String op : operators) {
            int idx = expression.indexOf(op);
            if (idx > 0) {
                String left = expression.substring(0, idx).trim();
                String right = expression.substring(idx + op.length()).trim();

                Comparable leftVal = parseValue(left);
                Comparable rightVal = parseValue(right);

                if (leftVal == null || rightVal == null) {
                    return false;
                }

                return compareValues(leftVal, rightVal, op);
            }
        }

        if ("true".equalsIgnoreCase(expression)) {
            return true;
        }
        if ("false".equalsIgnoreCase(expression) || "null".equalsIgnoreCase(expression)) {
            return false;
        }

        throw new IllegalArgumentException("无法解析表达式: " + expression);
    }

    private Comparable parseValue(String str) {
        str = str.trim();

        if (str.startsWith("'") && str.endsWith("'")) {
            return str.substring(1, str.length() - 1);
        }

        if ("null".equalsIgnoreCase(str)) {
            return null;
        }

        if ("true".equalsIgnoreCase(str)) {
            return Boolean.TRUE;
        }
        if ("false".equalsIgnoreCase(str)) {
            return Boolean.FALSE;
        }

        try {
            if (str.contains(".")) {
                return new BigDecimal(str);
            }
            return Long.parseLong(str);
        } catch (NumberFormatException e) {
            return str;
        }
    }

    @SuppressWarnings("unchecked")
    private boolean compareValues(Comparable left, Comparable right, String op) {
        try {
            if (left instanceof Number && right instanceof Number) {
                BigDecimal leftDec = new BigDecimal(left.toString());
                BigDecimal rightDec = new BigDecimal(right.toString());
                int cmp = leftDec.compareTo(rightDec);
                return applyComparison(cmp, op);
            }

            if (left instanceof String && right instanceof String) {
                int cmp = left.compareTo(right);
                return applyComparison(cmp, op);
            }

            if (left instanceof Boolean && right instanceof Boolean) {
                int cmp = ((Boolean) left ? 1 : 0) - ((Boolean) right ? 1 : 0);
                return applyComparison(cmp, op);
            }

            int cmp = left.compareTo(right);
            return applyComparison(cmp, op);
        } catch (Exception e) {
            return false;
        }
    }

    private boolean applyComparison(int cmp, String op) {
        switch (op) {
            case ">":
                return cmp > 0;
            case "<":
                return cmp < 0;
            case ">=":
                return cmp >= 0;
            case "<=":
                return cmp <= 0;
            case "==":
                return cmp == 0;
            case "!=":
                return cmp != 0;
            default:
                throw new IllegalArgumentException("不支持的操作符: " + op);
        }
    }
}
