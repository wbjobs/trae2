extends Node

signal emergency_started(equipment_id, fault_type, procedure)
signal emergency_completed(success, score)
signal step_completed(step_index, step_data, correct, player_id)
signal operation_recorded(operation_data)
signal timer_updated(time_remaining)
signal operation_verified(operation_id, player_id, result)

const ProcedureType := {
    "OVERHEAT": "overheat",
    "LEAK": "leak",
    "POWER_FAILURE": "power_failure",
    "MECHANICAL_FAILURE": "mechanical_failure",
    "CONTROL_FAILURE": "control_failure",
    "VENTILATION_FAILURE": "ventilation_failure",
    "PUMP_FAILURE": "pump_failure",
    "CONVEYOR_JAM": "conveyor_jam"
}

var active_procedure: Dictionary = {}
var current_step_index: int = 0
var is_procedure_active: bool = false
var operation_records: Array = []
var step_start_time: float = 0.0
var procedure_start_time: float = 0.0
var total_score: int = 0
var max_score: int = 100
var mistake_count: int = 0
var max_mistakes: int = 3

const EMERGENCY_PROCEDURES := {
    ProcedureType.OVERHEAT: {
        "name": "设备过热处置流程",
        "description": "设备温度过高时的应急处置步骤",
        "time_limit": 120.0,
        "steps": [
            {
                "id": "power_off",
                "name": "切断设备电源",
                "description": "立即按下紧急停止按钮，切断设备主电源",
                "required": true,
                "score": 15,
                "time_bonus": 10,
                "correct_actions": ["press_emergency_stop", "cut_power"]
            },
            {
                "id": "evacuate",
                "name": "疏散周边人员",
                "description": "大声警示，确保周边人员撤离到安全区域",
                "required": true,
                "score": 10,
                "time_bonus": 5,
                "correct_actions": ["warn_personnel", "evacuate_area"]
            },
            {
                "id": "check_temperature",
                "name": "检测温度情况",
                "description": "使用测温仪检测设备温度，确认过热程度",
                "required": true,
                "score": 10,
                "time_bonus": 5,
                "correct_actions": ["measure_temperature", "check_gauge"]
            },
            {
                "id": "cooling",
                "name": "实施冷却措施",
                "description": "使用消防水或冷却设备进行降温，注意防止触电",
                "required": true,
                "score": 20,
                "time_bonus": 15,
                "correct_actions": ["apply_water", "use_fire_extinguisher", "activate_cooling"]
            },
            {
                "id": "ventilate",
                "name": "加强通风换气",
                "description": "开启局部通风机，驱散烟雾和热量",
                "required": true,
                "score": 15,
                "time_bonus": 5,
                "correct_actions": ["turn_on_ventilation", "open_damper"]
            },
            {
                "id": "report",
                "name": "上报调度室",
                "description": "向调度室汇报故障情况、位置和已采取的措施",
                "required": true,
                "score": 10,
                "time_bonus": 5,
                "correct_actions": ["call_dispatch", "report_status"]
            },
            {
                "id": "isolate",
                "name": "设置警示隔离",
                "description": "在设备周围设置警戒线，禁止无关人员靠近",
                "required": true,
                "score": 10,
                "time_bonus": 5,
                "correct_actions": ["set_warning_sign", "isolate_area"]
            },
            {
                "id": "confirm",
                "name": "确认处置完成",
                "description": "确认设备温度恢复正常，无复燃风险",
                "required": true,
                "score": 10,
                "time_bonus": 5,
                "correct_actions": ["confirm_safe", "verify_temperature"]
            }
        ]
    },
    ProcedureType.POWER_FAILURE: {
        "name": "电力故障处置流程",
        "description": "突发停电或电力异常时的应急处置步骤",
        "time_limit": 90.0,
        "steps": [
            {
                "id": "safety_check",
                "name": "确保自身安全",
                "description": "在黑暗中保持冷静，使用随身携带的照明设备",
                "required": true,
                "score": 15,
                "time_bonus": 10,
                "correct_actions": ["turn_on_headlamp", "stay_calm"]
            },
            {
                "id": "stop_equipment",
                "name": "停止运行设备",
                "description": "将所有运行中的设备切换到停止状态",
                "required": true,
                "score": 15,
                "time_bonus": 10,
                "correct_actions": ["stop_machines", "set_to_neutral"]
            },
            {
                "id": "check_circuit",
                "name": "检查供电线路",
                "description": "检查开关柜和线路，判断故障范围",
                "required": true,
                "score": 15,
                "time_bonus": 10,
                "correct_actions": ["check_switch_gear", "inspect_cables"]
            },
            {
                "id": "emergency_power",
                "name": "启动应急电源",
                "description": "启动备用发电机或应急电源系统",
                "required": true,
                "score": 20,
                "time_bonus": 15,
                "correct_actions": ["start_generator", "activate_ups"]
            },
            {
                "id": "evacuate_safe",
                "name": "疏散人员到安全出口",
                "description": "组织人员沿安全通道有序撤离",
                "required": true,
                "score": 15,
                "time_bonus": 10,
                "correct_actions": ["guide_evacuation", "check_exit"]
            },
            {
                "id": "report_dispatch",
                "name": "上报调度室",
                "description": "汇报停电情况和影响范围",
                "required": true,
                "score": 10,
                "time_bonus": 5,
                "correct_actions": ["call_dispatch", "report_blackout"]
            },
            {
                "id": "confirm_safe",
                "name": "确认人员安全",
                "description": "清点人数，确认所有人员安全撤离",
                "required": true,
                "score": 10,
                "time_bonus": 5,
                "correct_actions": ["headcount", "confirm_all_safe"]
            }
        ]
    },
    ProcedureType.VENTILATION_FAILURE: {
        "name": "通风故障处置流程",
        "description": "通风系统停止时的应急处置步骤",
        "time_limit": 60.0,
        "steps": [
            {
                "id": "safety_warning",
                "name": "发出瓦斯警报",
                "description": "立即触发瓦斯报警装置，警示所有人员",
                "required": true,
                "score": 20,
                "time_bonus": 15,
                "correct_actions": ["trigger_gas_alarm", "shout_warning"]
            },
            {
                "id": "stop_work",
                "name": "停止所有作业",
                "description": "通知所有工作面立即停止作业",
                "required": true,
                "score": 15,
                "time_bonus": 10,
                "correct_actions": ["stop_all_work", "notify_workers"]
            },
            {
                "id": "check_gas",
                "name": "检测瓦斯浓度",
                "description": "使用瓦斯检测仪检测瓦斯浓度",
                "required": true,
                "score": 15,
                "time_bonus": 10,
                "correct_actions": ["measure_gas", "read_detector"]
            },
            {
                "id": "evacuate_immediately",
                "name": "立即组织撤离",
                "description": "组织人员沿进风巷道迅速撤离",
                "required": true,
                "score": 25,
                "time_bonus": 15,
                "correct_actions": ["evacuate_to_intake", "lead_escape"]
            },
            {
                "id": "report_emergency",
                "name": "紧急上报",
                "description": "立即向调度室和救护队报告",
                "required": true,
                "score": 15,
                "time_bonus": 10,
                "correct_actions": ["call_rescue", "report_emergency"]
            },
            {
                "id": "close_damper",
                "name": "关闭通风设施",
                "description": "在安全前提下关闭相关风门，控制风流",
                "required": false,
                "score": 10,
                "time_bonus": 5,
                "correct_actions": ["close_damper", "seal_area"]
            }
        ]
    },
    ProcedureType.LEAK: {
        "name": "管道泄漏处置流程",
        "description": "液压或水管泄漏时的应急处置步骤",
        "time_limit": 180.0,
        "steps": [
            {
                "id": "identify_leak",
                "name": "确定泄漏位置",
                "description": "查找泄漏点，判断泄漏介质",
                "required": true,
                "score": 15,
                "time_bonus": 5,
                "correct_actions": ["locate_leak", "identify_fluid"]
            },
            {
                "id": "shut_off_valve",
                "name": "关闭相关阀门",
                "description": "关闭泄漏点前后的控制阀门",
                "required": true,
                "score": 20,
                "time_bonus": 15,
                "correct_actions": ["close_valve", "shut_off_supply"]
            },
            {
                "id": "relieve_pressure",
                "name": "释放系统压力",
                "description": "开启泄压阀，释放管道内残余压力",
                "required": true,
                "score": 15,
                "time_bonus": 10,
                "correct_actions": ["open_relief_valve", "depressurize"]
            },
            {
                "id": "contain_spill",
                "name": "围堵泄漏液体",
                "description": "使用防漏材料围堵收集泄漏液体",
                "required": true,
                "score": 15,
                "time_bonus": 5,
                "correct_actions": ["contain_spill", "use_absorbent"]
            },
            {
                "id": "place_warning",
                "name": "设置防滑警示",
                "description": "在湿滑区域设置警示标志",
                "required": true,
                "score": 10,
                "time_bonus": 5,
                "correct_actions": ["set_slippery_sign", "warn_others"]
            },
            {
                "id": "temporary_repair",
                "name": "实施临时堵漏",
                "description": "使用堵漏工具进行临时封堵",
                "required": true,
                "score": 15,
                "time_bonus": 10,
                "correct_actions": ["apply_patch", "use_clamp"]
            },
            {
                "id": "report_maintenance",
                "name": "上报维修",
                "description": "通知维修人员进行正式维修",
                "required": true,
                "score": 10,
                "time_bonus": 5,
                "correct_actions": ["call_maintenance", "report_leak"]
            }
        ]
    }
}

func _ready():
    pass

func start_emergency_procedure(equipment_id: String, fault_type: String) -> bool:
    var procedure_key = _map_fault_to_procedure(fault_type)
    if not procedure_key or procedure_key not in EMERGENCY_PROCEDURES:
        push_warning("未找到故障类型对应的处置流程: " + fault_type)
        return false
    
    var procedure = EMERGENCY_PROCEDURES[procedure_key].duplicate(true)
    
    active_procedure = {
        "equipment_id": equipment_id,
        "fault_type": fault_type,
        "procedure_key": procedure_key,
        "procedure": procedure,
        "time_remaining": procedure["time_limit"]
    }
    
    current_step_index = 0
    is_procedure_active = true
    total_score = 0
    mistake_count = 0
    operation_records.clear()
    procedure_start_time = Time.get_ticks_msec()
    step_start_time = procedure_start_time
    
    emergency_started.emit(equipment_id, fault_type, procedure)
    print("启动应急处置流程: ", procedure["name"])
    
    return true

func submit_operation(operation_id: String, player_id: String = "", is_authoritative: bool = true) -> Dictionary:
    if not is_procedure_active or active_procedure.is_empty():
        return {"success": false, "error": "没有活动的处置流程"}
    
    var steps = active_procedure["procedure"]["steps"]
    if current_step_index >= steps.size():
        _complete_procedure(true)
        return {"success": true, "completed": true}
    
    var current_step = steps[current_step_index]
    var correct_actions = current_step.get("correct_actions", [])
    var is_correct = operation_id in correct_actions
    
    if not is_authoritative:
        return {"pending": true, "message": "等待主机验证"}
    
    var time_spent = (Time.get_ticks_msec() - step_start_time) / 1000.0
    
    var operation_record = {
        "step_index": current_step_index,
        "step_name": current_step["name"],
        "operation": operation_id,
        "correct": is_correct,
        "time_spent": time_spent,
        "player_id": player_id,
        "timestamp": Time.get_datetime_string_from_system()
    }
    
    operation_records.append(operation_record)
    operation_recorded.emit(operation_record)
    
    var result = {}
    
    if is_correct:
        var step_score = current_step.get("score", 10)
        if time_spent < 10.0:
            step_score += current_step.get("time_bonus", 0)
        total_score += step_score
        
        step_completed.emit(current_step_index, current_step, true, player_id)
        current_step_index += 1
        step_start_time = Time.get_ticks_msec()
        
        result = {
            "success": true,
            "correct": true,
            "score": step_score,
            "total_score": total_score,
            "step_index": current_step_index,
            "mistakes": mistake_count
        }
        
        if current_step_index >= steps.size():
            _complete_procedure(true)
            result["completed"] = true
            return result
        
        result["completed"] = false
        result["next_step"] = steps[current_step_index] if current_step_index < steps.size() else null
        
    else:
        mistake_count += 1
        step_completed.emit(current_step_index, current_step, false, player_id)
        
        result = {
            "success": false,
            "correct": false,
            "mistakes": mistake_count,
            "step_index": current_step_index,
            "total_score": total_score
        }
        
        if mistake_count >= max_mistakes:
            _complete_procedure(false)
            result["completed"] = true
            result["error"] = "错误次数过多，处置失败"
            return result
        
        result["completed"] = false
        result["error"] = "操作不正确，请重试"
    
    operation_verified.emit(operation_id, player_id, result)
    
    return result

func apply_operation_result(result: Dictionary) -> void:
    if not is_procedure_active:
        return
    
    var step_idx = result.get("step_index", current_step_index)
    var new_score = result.get("total_score", total_score)
    var new_mistakes = result.get("mistakes", mistake_count)
    var is_correct = result.get("correct", false)
    
    current_step_index = step_idx
    total_score = new_score
    mistake_count = new_mistakes
    
    if result.get("completed", false):
        var success = result.get("success", false)
        _complete_procedure(success)

func _validate_operation(operation_id: String, step_data: Dictionary) -> bool:
    if not step_data:
        return false
    
    var correct_actions = step_data.get("correct_actions", [])
    if correct_actions.is_empty():
        return false
    
    return operation_id in correct_actions

func get_current_step() -> Dictionary:
    if not is_procedure_active or active_procedure.is_empty():
        return {}
    
    var steps = active_procedure["procedure"]["steps"]
    if current_step_index < steps.size():
        return steps[current_step_index].duplicate()
    return {}

func get_procedure_progress() -> Dictionary:
    if not is_procedure_active or active_procedure.is_empty():
        return {}
    
    var steps = active_procedure["procedure"]["steps"]
    return {
        "current_step": current_step_index,
        "total_steps": steps.size(),
        "completed_steps": current_step_index,
        "progress": float(current_step_index) / float(steps.size()) * 100.0,
        "time_remaining": active_procedure["time_remaining"],
        "score": total_score,
        "max_score": max_score,
        "mistakes": mistake_count,
        "max_mistakes": max_mistakes
    }

func get_available_operations() -> Array:
    var step = get_current_step()
    if step.is_empty():
        return []
    return step.get("correct_actions", [])

func _complete_procedure(success: bool):
    is_procedure_active = false
    
    var final_score = total_score
    if success and active_procedure["time_remaining"] > 30:
        final_score += int(active_procedure["time_remaining"] * 0.1)
    
    final_score = min(final_score, max_score)
    
    var summary = {
        "success": success,
        "score": final_score,
        "max_score": max_score,
        "time_spent": (Time.get_ticks_msec() - procedure_start_time) / 1000.0,
        "mistakes": mistake_count,
        "steps_completed": current_step_index,
        "total_steps": active_procedure["procedure"]["steps"].size()
    }
    
    operation_records.append({
        "step_index": -1,
        "step_name": "流程结束",
        "operation": "complete",
        "correct": success,
        "time_spent": 0,
        "summary": summary,
        "timestamp": Time.get_datetime_string_from_system()
    })
    
    emergency_completed.emit(success, final_score)
    print("应急处置流程结束，成功: ", success, "，得分: ", final_score)

func cancel_procedure():
    if is_procedure_active:
        is_procedure_active = false
        active_procedure.clear()
        current_step_index = 0
        total_score = 0
        mistake_count = 0

func _process(delta):
    if is_procedure_active and not active_procedure.is_empty():
        active_procedure["time_remaining"] -= delta
        timer_updated.emit(active_procedure["time_remaining"])
        
        if active_procedure["time_remaining"] <= 0:
            _complete_procedure(false)

func _map_fault_to_procedure(fault_type: String) -> String:
    var mapping = {
        "overheat": ProcedureType.OVERHEAT,
        "leak": ProcedureType.LEAK,
        "power_failure": ProcedureType.POWER_FAILURE,
        "mechanical_failure": ProcedureType.MECHANICAL_FAILURE,
        "control_failure": ProcedureType.CONTROL_FAILURE,
        "ventilation_failure": ProcedureType.VENTILATION_FAILURE,
        "pump_failure": ProcedureType.PUMP_FAILURE,
        "conveyor_jam": ProcedureType.CONVEYOR_JAM
    }
    return mapping.get(fault_type, "")

func get_operation_records() -> Array:
    return operation_records.duplicate()

func get_procedure_list() -> Array:
    var list = []
    for key in EMERGENCY_PROCEDURES.keys():
        var proc = EMERGENCY_PROCEDURES[key]
        list.append({
            "key": key,
            "name": proc["name"],
            "description": proc["description"],
            "step_count": proc["steps"].size(),
            "time_limit": proc["time_limit"]
        })
    return list

func calculate_score() -> int:
    return min(total_score, max_score)

func get_procedure_progress() -> Dictionary:
    if not is_procedure_active or active_procedure.is_empty():
        return {}
    
    var steps = active_procedure["procedure"]["steps"]
    return {
        "equipment_id": active_procedure["equipment_id"],
        "fault_type": active_procedure["fault_type"],
        "procedure_key": active_procedure["procedure_key"],
        "current_step": current_step_index,
        "total_steps": steps.size(),
        "score": total_score,
        "max_score": max_score,
        "mistakes": mistake_count,
        "time_remaining": active_procedure["time_remaining"],
        "time_limit": active_procedure["procedure"]["time_limit"],
        "step_name": steps[current_step_index]["name"] if current_step_index < steps.size() else "completed",
        "is_active": is_procedure_active
    }
