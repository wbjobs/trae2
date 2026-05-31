extends Node

signal fault_triggered(equipment_id, fault_type)
signal fault_resolved(equipment_id)
signal simulation_started()
signal simulation_stopped()
signal chain_fault_triggered(parent_fault_id, child_equipment_id, child_fault_type)
signal fault_scene_started(scene_id, scene_data)
signal fault_scene_completed(scene_id, success)
signal all_faults_cleared()

const FaultType := {
    "OVERHEAT": "overheat",
    "LEAK": "leak",
    "POWER_FAILURE": "power_failure",
    "MECHANICAL_FAILURE": "mechanical_failure",
    "CONTROL_FAILURE": "control_failure",
    "VENTILATION_FAILURE": "ventilation_failure",
    "PUMP_FAILURE": "pump_failure",
    "CONVEYOR_JAM": "conveyor_jam"
}

const FaultSeverity := {
    "LOW": "low",
    "MEDIUM": "medium",
    "HIGH": "high",
    "CRITICAL": "critical"
}

var registered_equipment: Dictionary = {}
var active_faults: Dictionary = {}
var fault_history: Array = []
var is_simulating: bool = false
var simulation_timer: float = 0.0
var min_fault_interval: float = 10.0
var max_fault_interval: float = 30.0
var next_fault_time: float = 0.0
var max_active_faults: int = 2
var fault_probability: float = 0.7

var pending_chain_faults: Array = []
var active_fault_scenes: Dictionary = {}
var completed_scenes: Array = []
var chain_enabled: bool = true
var scene_enabled: bool = true

const FAULT_DEFINITIONS := {
    FaultType.OVERHEAT: {
        "name": "设备过热",
        "severity": FaultSeverity.HIGH,
        "description": "设备温度异常升高，可能导致烧毁",
        "symptoms": ["温度报警", "烟雾", "异味"],
        "time_limit": 120.0
    },
    FaultType.LEAK: {
        "name": "管道泄漏",
        "severity": FaultSeverity.MEDIUM,
        "description": "液压或水管路发生泄漏",
        "symptoms": ["液体滴落", "压力下降", "地面湿滑"],
        "time_limit": 180.0
    },
    FaultType.POWER_FAILURE: {
        "name": "电力故障",
        "severity": FaultSeverity.CRITICAL,
        "description": "设备供电中断或异常",
        "symptoms": ["停电", "指示灯熄灭", "电机停止"],
        "time_limit": 90.0
    },
    FaultType.MECHANICAL_FAILURE: {
        "name": "机械故障",
        "severity": FaultSeverity.HIGH,
        "description": "机械设备部件损坏或卡滞",
        "symptoms": ["异常噪音", "振动增大", "动作卡顿"],
        "time_limit": 150.0
    },
    FaultType.CONTROL_FAILURE: {
        "name": "控制故障",
        "severity": FaultSeverity.MEDIUM,
        "description": "控制系统失灵或误报",
        "symptoms": ["按钮无响应", "显示异常", "误报警"],
        "time_limit": 120.0
    },
    FaultType.VENTILATION_FAILURE: {
        "name": "通风故障",
        "severity": FaultSeverity.CRITICAL,
        "description": "通风系统停止工作，可能导致瓦斯积聚",
        "symptoms": ["风量下降", "瓦斯报警", "温度升高"],
        "time_limit": 60.0
    },
    FaultType.PUMP_FAILURE: {
        "name": "水泵故障",
        "severity": FaultSeverity.HIGH,
        "description": "排水泵停止工作，可能导致积水",
        "symptoms": ["水位上升", "泵体异响", "流量为零"],
        "time_limit": 100.0
    },
    FaultType.CONVEYOR_JAM: {
        "name": "输送机卡滞",
        "severity": FaultSeverity.MEDIUM,
        "description": "胶带输送机被物料卡住",
        "symptoms": ["电机过载", "胶带打滑", "异常声响"],
        "time_limit": 150.0
    }
}

const FAULT_CHAIN_RULES := {
    "overheat": [
        {
            "target_equipment": ["hydraulic_001", "pump_001"],
            "result_fault": "mechanical_failure",
            "delay": 15.0,
            "probability": 0.6,
            "condition": "not_resolved_in_10s",
            "description": "过热未及时处理导致机械损坏"
        },
        {
            "target_equipment": ["monitor_001"],
            "result_fault": "control_failure",
            "delay": 25.0,
            "probability": 0.4,
            "condition": "temperature_exceeds_threshold",
            "description": "高温影响控制系统"
        }
    ],
    "power_failure": [
        {
            "target_equipment": ["vent_001"],
            "result_fault": "ventilation_failure",
            "delay": 5.0,
            "probability": 0.8,
            "condition": "power_lost",
            "description": "停电导致通风系统停止"
        },
        {
            "target_equipment": ["pump_001"],
            "result_fault": "pump_failure",
            "delay": 8.0,
            "probability": 0.7,
            "condition": "power_lost",
            "description": "停电导致水泵停止"
        },
        {
            "target_equipment": ["conveyor_001"],
            "result_fault": "conveyor_jam",
            "delay": 10.0,
            "probability": 0.5,
            "condition": "sudden_stop",
            "description": "突然停机导致输送机卡滞"
        }
    ],
    "ventilation_failure": [
        {
            "target_equipment": ["monitor_001"],
            "result_fault": "control_failure",
            "delay": 20.0,
            "probability": 0.5,
            "condition": "gas_accumulation",
            "description": "瓦斯积聚影响传感器"
        },
        {
            "target_equipment": ["hydraulic_001"],
            "result_fault": "overheat",
            "delay": 30.0,
            "probability": 0.4,
            "condition": "poor_ventilation",
            "description": "通风不良导致液压站过热"
        }
    ],
    "leak": [
        {
            "target_equipment": ["substation_001"],
            "result_fault": "power_failure",
            "delay": 20.0,
            "probability": 0.3,
            "condition": "liquid_reaches_electrical",
            "description": "泄漏液体进入变电所导致短路"
        },
        {
            "target_equipment": ["pump_001"],
            "result_fault": "pump_failure",
            "delay": 25.0,
            "probability": 0.4,
            "condition": "pressure_loss",
            "description": "压力损失导致水泵过载"
        }
    ],
    "conveyor_jam": [
        {
            "target_equipment": ["conveyor_001"],
            "result_fault": "overheat",
            "delay": 12.0,
            "probability": 0.7,
            "condition": "motor_overload",
            "description": "电机过载导致过热"
        },
        {
            "target_equipment": ["conveyor_001"],
            "result_fault": "mechanical_failure",
            "delay": 20.0,
            "probability": 0.5,
            "condition": "prolonged_jam",
            "description": "长时间卡滞导致机械损坏"
        }
    ],
    "pump_failure": [
        {
            "target_equipment": ["hydraulic_001"],
            "result_fault": "leak",
            "delay": 15.0,
            "probability": 0.3,
            "condition": "water_damage",
            "description": "积水导致液压站泄漏"
        },
        {
            "target_equipment": ["vent_001"],
            "result_fault": "overheat",
            "delay": 10.0,
            "probability": 0.2,
            "condition": "humidity_increase",
            "description": "湿度增加导致通风机过热"
        }
    ]
}

const FAULT_SCENES := {
    "power_outage_cascade": {
        "name": "大面积停电连锁事故",
        "description": "井下突发大面积停电，引发通风、排水、运输等多系统故障",
        "difficulty": "critical",
        "sequence": [
            {
                "time": 0.0,
                "equipment": "substation_001",
                "fault_type": "power_failure",
                "action": "trigger"
            },
            {
                "time": 5.0,
                "equipment": "vent_001",
                "fault_type": "ventilation_failure",
                "action": "trigger"
            },
            {
                "time": 8.0,
                "equipment": "pump_001",
                "fault_type": "pump_failure",
                "action": "trigger"
            },
            {
                "time": 12.0,
                "equipment": "conveyor_001",
                "fault_type": "conveyor_jam",
                "action": "trigger"
            }
        ],
        "objectives": ["紧急撤离", "启动应急电源", "恢复通风"]
    },
    "fire_evacuation": {
        "name": "井下火灾应急处置",
        "description": "设备过热引发火灾，需要紧急处置和人员疏散",
        "difficulty": "high",
        "sequence": [
            {
                "time": 0.0,
                "equipment": "hydraulic_001",
                "fault_type": "overheat",
                "action": "trigger"
            },
            {
                "time": 10.0,
                "equipment": "hydraulic_001",
                "fault_type": "leak",
                "action": "trigger",
                "condition": "parent_not_resolved"
            },
            {
                "time": 20.0,
                "equipment": "vent_001",
                "fault_type": "ventilation_failure",
                "action": "trigger",
                "condition": "parent_not_resolved"
            }
        ],
        "objectives": ["切断电源", "灭火", "疏散人员"]
    },
    "water_inrush": {
        "name": "透水事故应急处置",
        "description": "排水系统故障导致井下水位上升，需要紧急处置",
        "difficulty": "high",
        "sequence": [
            {
                "time": 0.0,
                "equipment": "pump_001",
                "fault_type": "pump_failure",
                "action": "trigger"
            },
            {
                "time": 15.0,
                "equipment": "hydraulic_001",
                "fault_type": "leak",
                "action": "trigger",
                "condition": "parent_not_resolved"
            },
            {
                "time": 25.0,
                "equipment": "substation_001",
                "fault_type": "power_failure",
                "action": "trigger",
                "condition": "parent_not_resolved"
            }
        ],
        "objectives": ["启动备用水泵", "切断危险区域电源", "组织撤离"]
    },
    "gas_accumulation": {
        "name": "瓦斯积聚应急处置",
        "description": "通风系统故障导致瓦斯浓度超标，存在爆炸危险",
        "difficulty": "critical",
        "sequence": [
            {
                "time": 0.0,
                "equipment": "vent_001",
                "fault_type": "ventilation_failure",
                "action": "trigger"
            },
            {
                "time": 8.0,
                "equipment": "monitor_001",
                "fault_type": "control_failure",
                "action": "trigger",
                "condition": "parent_not_resolved"
            },
            {
                "time": 15.0,
                "equipment": "substation_001",
                "fault_type": "power_failure",
                "action": "trigger",
                "condition": "parent_not_resolved"
            }
        ],
        "objectives": ["触发瓦斯警报", "停止所有作业", "紧急撤离"]
    },
    "conveyor_fire": {
        "name": "胶带输送机火灾",
        "description": "输送机卡滞引发过热，最终导致胶带起火",
        "difficulty": "high",
        "sequence": [
            {
                "time": 0.0,
                "equipment": "conveyor_001",
                "fault_type": "conveyor_jam",
                "action": "trigger"
            },
            {
                "time": 12.0,
                "equipment": "conveyor_001",
                "fault_type": "overheat",
                "action": "trigger",
                "condition": "parent_not_resolved"
            },
            {
                "time": 25.0,
                "equipment": "hydraulic_001",
                "fault_type": "overheat",
                "action": "trigger",
                "condition": "parent_not_resolved"
            }
        ],
        "objectives": ["停机断电", "灭火", "清理堵塞"]
    },
    "hydraulic_system_failure": {
        "name": "液压系统连锁故障",
        "description": "液压站泄漏引发多设备液压系统故障",
        "difficulty": "medium",
        "sequence": [
            {
                "time": 0.0,
                "equipment": "hydraulic_001",
                "fault_type": "leak",
                "action": "trigger"
            },
            {
                "time": 20.0,
                "equipment": "substation_001",
                "fault_type": "power_failure",
                "action": "trigger",
                "condition": "parent_not_resolved",
                "probability": 0.5
            }
        ],
        "objectives": ["关闭阀门", "围堵泄漏", "启动备用系统"]
    }
}

func _ready():
    randomize()

func _process(delta):
    if is_simulating:
        simulation_timer += delta
        _check_fault_trigger(delta)
        _update_active_faults(delta)
        _process_pending_chain_faults(delta)
        _process_fault_scenes(delta)

func register_equipment(equipment_id: String, equipment_data: Dictionary) -> void:
    registered_equipment[equipment_id] = equipment_data
    print("已注册设备: ", equipment_id, " - ", equipment_data.get("name", "未知"))

func unregister_equipment(equipment_id: String) -> void:
    if equipment_id in registered_equipment:
        registered_equipment.erase(equipment_id)
    if equipment_id in active_faults:
        active_faults.erase(equipment_id)

func start_fault_simulation() -> void:
    is_simulating = true
    simulation_timer = 0.0
    next_fault_time = _get_next_fault_interval()
    active_faults.clear()
    simulation_started.emit()
    print("故障模拟已启动")

func stop_fault_simulation() -> void:
    is_simulating = false
    simulation_stopped.emit()
    print("故障模拟已停止")

func trigger_fault(equipment_id: String = "", fault_type: String = "") -> Dictionary:
    if equipment_id.is_empty():
        equipment_id = _select_random_equipment()
    
    if equipment_id.is_empty():
        return {}
    
    if fault_type.is_empty():
        fault_type = _select_random_fault_type()
    
    if equipment_id in active_faults:
        return active_faults[equipment_id]
    
    var fault_def = FAULT_DEFINITIONS.get(fault_type, {})
    if fault_def.is_empty():
        return {}
    
    var fault_data = {
        "equipment_id": equipment_id,
        "equipment_name": registered_equipment.get(equipment_id, {}).get("name", "未知设备"),
        "fault_type": fault_type,
        "fault_name": fault_def.get("name", "未知故障"),
        "severity": fault_def.get("severity", FaultSeverity.MEDIUM),
        "description": fault_def.get("description", ""),
        "symptoms": fault_def.get("symptoms", []),
        "trigger_time": Time.get_ticks_msec(),
        "time_limit": fault_def.get("time_limit", 120.0),
        "time_remaining": fault_def.get("time_limit", 120.0),
        "status": "active"
    }
    
    active_faults[equipment_id] = fault_data
    
    var history_record = fault_data.duplicate()
    history_record["action"] = "triggered"
    history_record["timestamp"] = Time.get_datetime_string_from_system()
    fault_history.append(history_record)
    
    fault_triggered.emit(equipment_id, fault_type)
    print("故障触发: ", equipment_id, " - ", fault_def.get("name", ""))
    
    if chain_enabled:
        _register_chain_faults(equipment_id, fault_type)
    
    return fault_data

func resolve_fault(equipment_id: String) -> bool:
    if equipment_id in active_faults:
        var fault_data = active_faults[equipment_id]
        fault_data["status"] = "resolved"
        fault_data["resolve_time"] = Time.get_ticks_msec()
        
        var history_record = fault_data.duplicate()
        history_record["action"] = "resolved"
        history_record["timestamp"] = Time.get_datetime_string_from_system()
        fault_history.append(history_record)
        
        active_faults.erase(equipment_id)
        fault_resolved.emit(equipment_id)
        print("故障已解决: ", equipment_id)
        return true
    return false

func _check_fault_trigger(delta: float) -> void:
    if active_faults.size() >= max_active_faults:
        return
    
    if simulation_timer >= next_fault_time:
        if randf() < fault_probability:
            trigger_fault()
        next_fault_time = simulation_timer + _get_next_fault_interval()

func _update_active_faults(delta: float) -> void:
    var expired = []
    for equipment_id in active_faults.keys():
        var fault_data = active_faults[equipment_id]
        fault_data["time_remaining"] -= delta
        
        if fault_data["time_remaining"] <= 0:
            expired.append(equipment_id)
    
    for equipment_id in expired:
        var fault_data = active_faults[equipment_id]
        fault_data["status"] = "timeout"
        
        var history_record = fault_data.duplicate()
        history_record["action"] = "timeout"
        history_record["timestamp"] = Time.get_datetime_string_from_system()
        fault_history.append(history_record)
        
        active_faults.erase(equipment_id)

func _get_next_fault_interval() -> float:
    return randf_range(min_fault_interval, max_fault_interval)

func _select_random_equipment() -> String:
    if registered_equipment.is_empty():
        return ""
    
    var available = []
    for id in registered_equipment.keys():
        if id not in active_faults:
            available.append(id)
    
    if available.is_empty():
        return ""
    
    return available[randi() % available.size()]

func _select_random_fault_type() -> String:
    var types = FaultType.values()
    return types[randi() % types.size()]

func get_active_faults() -> Dictionary:
    return active_faults.duplicate()

func get_active_fault_list() -> Array:
    var list = []
    for id in active_faults.keys():
        list.append(active_faults[id].duplicate())
    return list

func get_fault_info(fault_type: String) -> Dictionary:
    return FAULT_DEFINITIONS.get(fault_type, {}).duplicate()

func get_equipment_fault(equipment_id: String) -> Dictionary:
    if equipment_id in active_faults:
        return active_faults[equipment_id].duplicate()
    return {}

func has_active_fault(equipment_id: String) -> bool:
    return equipment_id in active_faults

func set_simulation_parameters(params: Dictionary) -> void:
    if params.has("min_interval"):
        min_fault_interval = params["min_interval"]
    if params.has("max_interval"):
        max_fault_interval = params["max_interval"]
    if params.has("max_active_faults"):
        max_active_faults = params["max_active_faults"]
    if params.has("fault_probability"):
        fault_probability = params["fault_probability"]

func get_fault_history() -> Array:
    return fault_history.duplicate()

func clear_all_faults() -> void:
    for equipment_id in active_faults.keys():
        fault_resolved.emit(equipment_id)
    active_faults.clear()
    pending_chain_faults.clear()
    active_fault_scenes.clear()

func _register_chain_faults(parent_equipment_id: String, fault_type: String) -> void:
    var chain_rules = FAULT_CHAIN_RULES.get(fault_type, [])
    
    for rule in chain_rules:
        var target_equipments = rule.get("target_equipment", [])
        for target_equip in target_equipments:
            if target_equip == parent_equipment_id or target_equip in active_faults:
                continue
            
            if not target_equip in registered_equipment:
                continue
            
            var probability = rule.get("probability", 0.5)
            if randf() > probability:
                continue
            
            var pending_fault = {
                "parent_id": parent_equipment_id,
                "parent_fault": fault_type,
                "target_equipment": target_equip,
                "result_fault": rule.get("result_fault", ""),
                "delay": rule.get("delay", 10.0),
                "elapsed": 0.0,
                "condition": rule.get("condition", ""),
                "description": rule.get("description", ""),
                "triggered": false
            }
            pending_chain_faults.append(pending_fault)
            print("注册联动故障: ", parent_equipment_id, " -> ", target_equip, ":", pending_fault["result_fault"])

func _process_pending_chain_faults(delta: float) -> void:
    var to_remove = []
    
    for i in range(len(pending_chain_faults)):
        var pending = pending_chain_faults[i]
        
        if pending.get("triggered", false):
            to_remove.append(i)
            continue
        
        var parent_equip = pending.get("parent_id", "")
        if parent_equip not in active_faults:
            to_remove.append(i)
            continue
        
        var condition = pending.get("condition", "")
        if not _check_chain_condition(condition, parent_equip, pending):
            pending["elapsed"] += delta
            continue
        
        pending["elapsed"] += delta
        
        if pending["elapsed"] >= pending["delay"]:
            if active_faults.size() < max_active_faults + 2:
                var result = trigger_fault(pending["target_equipment"], pending["result_fault"])
                if not result.is_empty():
                    pending["triggered"] = true
                    chain_fault_triggered.emit(
                        pending["parent_id"],
                        pending["target_equipment"],
                        pending["result_fault"]
                    )
                    print("联动故障触发: ", pending["target_equipment"], ":", pending["result_fault"])
            to_remove.append(i)
    
    for i in range(len(to_remove) - 1, -1, -1):
        pending_chain_faults.remove_at(to_remove[i])

func _check_chain_condition(condition: String, parent_equip: String, pending: Dictionary) -> bool:
    if condition.is_empty():
        return true
    
    var parent_fault = active_faults.get(parent_equip, {})
    if parent_fault.is_empty():
        return false
    
    var elapsed = (Time.get_ticks_msec() - parent_fault.get("trigger_time", 0)) / 1000.0
    
    match condition:
        "not_resolved_in_10s":
            return elapsed >= 10.0
        "not_resolved_in_15s":
            return elapsed >= 15.0
        "parent_not_resolved":
            return true
        "power_lost":
            return true
        "temperature_exceeds_threshold":
            return elapsed >= 15.0
        "motor_overload":
            return elapsed >= 8.0
        "prolonged_jam":
            return elapsed >= 15.0
        "gas_accumulation":
            return elapsed >= 15.0
        "liquid_reaches_electrical":
            return elapsed >= 15.0
        "pressure_loss":
            return elapsed >= 10.0
        "water_damage":
            return elapsed >= 10.0
        "poor_ventilation":
            return elapsed >= 20.0
        "humidity_increase":
            return elapsed >= 8.0
        "sudden_stop":
            return true
        _:
            return true

func start_fault_scene(scene_id: String) -> bool:
    if not scene_enabled:
        return false
    
    var scene_data = FAULT_SCENES.get(scene_id, {})
    if scene_data.is_empty():
        push_warning("未找到故障场景: " + scene_id)
        return false
    
    var active_scene = {
        "scene_id": scene_id,
        "scene_data": scene_data,
        "start_time": simulation_timer,
        "current_step": 0,
        "completed": false,
        "triggered_faults": []
    }
    
    active_fault_scenes[scene_id] = active_scene
    fault_scene_started.emit(scene_id, scene_data)
    
    print("启动故障场景: ", scene_data.get("name", scene_id))
    return true

func _process_fault_scenes(delta: float) -> void:
    var completed_scenes_list = []
    
    for scene_id in active_fault_scenes.keys():
        var scene = active_fault_scenes[scene_id]
        if scene.get("completed", false):
            continue
        
        var scene_data = scene.get("scene_data", {})
        var sequence = scene_data.get("sequence", [])
        var scene_time = simulation_timer - scene.get("start_time", 0)
        
        for i in range(scene.get("current_step", 0), len(sequence)):
            var step = sequence[i]
            var step_time = step.get("time", 0.0)
            
            if scene_time >= step_time:
                var condition = step.get("condition", "")
                var probability = step.get("probability", 1.0)
                
                var should_trigger = true
                if condition == "parent_not_resolved":
                    var prev_step = sequence[i - 1] if i > 0 else null
                    if prev_step and prev_step.get("equipment", "") in active_faults:
                        should_trigger = true
                    else:
                        should_trigger = false
                
                if should_trigger and randf() <= probability:
                    var equipment = step.get("equipment", "")
                    var fault_type = step.get("fault_type", "")
                    
                    if equipment not in active_faults:
                        trigger_fault(equipment, fault_type)
                        scene["triggered_faults"].append({"equipment": equipment, "fault_type": fault_type, "time": scene_time})
                
                scene["current_step"] = i + 1
            else:
                break
        
        if scene.get("current_step", 0) >= len(sequence):
            scene["completed"] = true
            completed_scenes_list.append(scene_id)
    
    for scene_id in completed_scenes_list:
        completed_scenes.append(scene_id)
        fault_scene_completed.emit(scene_id, true)
        active_fault_scenes.erase(scene_id)

func get_available_scenes() -> Array:
    var scenes = []
    for scene_id in FAULT_SCENES.keys():
        var scene_data = FAULT_SCENES[scene_id]
        scenes.append({
            "id": scene_id,
            "name": scene_data.get("name", scene_id),
            "description": scene_data.get("description", ""),
            "difficulty": scene_data.get("difficulty", "medium"),
            "step_count": scene_data.get("sequence", []).size(),
            "objectives": scene_data.get("objectives", [])
        })
    return scenes

func get_active_scenes() -> Array:
    var scenes = []
    for scene_id in active_fault_scenes.keys():
        scenes.append(active_fault_scenes[scene_id].duplicate(true))
    return scenes

func get_chain_rules() -> Dictionary:
    return FAULT_CHAIN_RULES.duplicate(true)

func set_chain_enabled(enabled: bool) -> void:
    chain_enabled = enabled

func set_scene_enabled(enabled: bool) -> void:
    scene_enabled = enabled

func get_pending_chain_faults() -> Array:
    return pending_chain_faults.duplicate(true)

func cancel_pending_chains() -> void:
    pending_chain_faults.clear()

func stop_scene(scene_id: String) -> void:
    if scene_id in active_fault_scenes:
        active_fault_scenes.erase(scene_id)
        fault_scene_completed.emit(scene_id, false)

func has_active_fault(equipment_id: String) -> bool:
    return equipment_id in active_faults

func get_active_faults() -> Dictionary:
    var result = {}
    for equip_id in active_faults.keys():
        result[equip_id] = active_faults[equip_id].duplicate(true)
    return result

func clear_all_faults() -> void:
    active_faults.clear()
    pending_chain_faults.clear()
    for scene_id in active_fault_scenes.keys():
        fault_scene_completed.emit(scene_id, false)
    active_fault_scenes.clear()
    all_faults_cleared.emit()
