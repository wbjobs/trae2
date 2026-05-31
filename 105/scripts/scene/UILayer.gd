extends CanvasLayer

signal operation_selected(operation_id)
signal equipment_panel_closed()

var equipment_panel: PanelContainer = null
var emergency_panel: PanelContainer = null
var hud_panel: PanelContainer = null
var fault_alert_panel: PanelContainer = null
var result_panel: PanelContainer = null
var player_list_panel: PanelContainer = null
var chain_fault_panel: PanelContainer = null
var replay_panel: PanelContainer = null
var network_status_panel: PanelContainer = null

var current_equipment_id: String = ""
var current_equipment_data: Dictionary = {}
var is_panel_open: bool = false

var chain_fault_history: Array = []
var replay_event_list: ItemList = null
var replay_progress: ProgressBar = null
var replay_play_button: Button = null
var replay_speed_option: OptionButton = null
var replay_time_label: Label = null
var replay_status_label: Label = null
var is_replay_mode: bool = false

func _ready():
    _create_hud()
    _create_equipment_panel()
    _create_emergency_panel()
    _create_fault_alert()
    _create_result_panel()
    _create_player_list()
    _create_chain_fault_panel()
    _create_replay_panel()
    _create_network_status_panel()
    
    hide_all_panels()
    hud_panel.visible = true
    network_status_panel.visible = true

func _create_hud():
    hud_panel = PanelContainer.new()
    hud_panel.name = "HUDPanel"
    add_child(hud_panel)
    
    var hb = HBoxContainer.new()
    hud_panel.add_child(hb)
    
    var status_label = Label.new()
    status_label.name = "StatusLabel"
    status_label.text = "系统状态: 正常"
    status_label.add_theme_color_override("font_color", Color(0.2, 1, 0.3))
    hb.add_child(status_label)
    
    hb.add_spacer()
    
    var score_label = Label.new()
    score_label.name = "ScoreLabel"
    score_label.text = "得分: 0"
    hb.add_child(score_label)
    
    hb.add_spacer()
    
    var timer_label = Label.new()
    timer_label.name = "TimerLabel"
    timer_label.text = "时间: --:--"
    hb.add_child(timer_label)
    
    hb.add_spacer()
    
    var fault_label = Label.new()
    fault_label.name = "FaultLabel"
    fault_label.text = "当前故障: 无"
    fault_label.add_theme_color_override("font_color", Color(1, 1, 1))
    hb.add_child(fault_label)
    
    hud_panel.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
    hud_panel.offset_top = 10
    hud_panel.offset_bottom = 50
    hud_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE

func _create_equipment_panel():
    equipment_panel = PanelContainer.new()
    equipment_panel.name = "EquipmentPanel"
    equipment_panel.custom_minimum_size = Vector2(400, 500)
    add_child(equipment_panel)
    
    var vb = VBoxContainer.new()
    equipment_panel.add_child(vb)
    
    var title_label = Label.new()
    title_label.name = "EquipmentTitle"
    title_label.text = "设备信息"
    title_label.add_theme_font_size_override("font_size", 18)
    title_label.add_theme_color_override("font_color", Color(0.8, 0.9, 1))
    vb.add_child(title_label)
    
    var desc_label = Label.new()
    desc_label.name = "EquipmentDesc"
    desc_label.text = ""
    desc_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    vb.add_child(desc_label)
    
    var status_label = Label.new()
    status_label.name = "EquipmentStatus"
    status_label.text = "状态: 正常运行"
    vb.add_child(status_label)
    
    var separator = HSeparator.new()
    vb.add_child(separator)
    
    var actions_label = Label.new()
    actions_label.text = "可执行操作:"
    actions_label.add_theme_font_size_override("font_size", 14)
    vb.add_child(actions_label)
    
    var actions_scroll = ScrollContainer.new()
    actions_scroll.name = "ActionsScroll"
    actions_scroll.custom_minimum_size = Vector2(0, 200)
    vb.add_child(actions_scroll)
    
    var actions_vb = VBoxContainer.new()
    actions_vb.name = "ActionsContainer"
    actions_scroll.add_child(actions_vb)
    
    var close_btn = Button.new()
    close_btn.text = "关闭 (ESC)"
    close_btn.pressed.connect(_on_close_equipment_panel)
    vb.add_child(close_btn)
    
    equipment_panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)

func _create_emergency_panel():
    emergency_panel = PanelContainer.new()
    emergency_panel.name = "EmergencyPanel"
    emergency_panel.custom_minimum_size = Vector2(500, 600)
    add_child(emergency_panel)
    
    var vb = VBoxContainer.new()
    emergency_panel.add_child(vb)
    
    var title = Label.new()
    title.name = "EmergencyTitle"
    title.text = "应急处置流程"
    title.add_theme_font_size_override("font_size", 20)
    title.add_theme_color_override("font_color", Color(1, 0.8, 0.2))
    vb.add_child(title)
    
    var fault_info = Label.new()
    fault_info.name = "FaultInfo"
    fault_info.text = ""
    fault_info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    vb.add_child(fault_info)
    
    var progress_bar = ProgressBar.new()
    progress_bar.name = "ProgressBar"
    progress_bar.max_value = 100
    progress_bar.value = 0
    vb.add_child(progress_bar)
    
    var timer_label = Label.new()
    timer_label.name = "EmergencyTimer"
    timer_label.text = "剩余时间: --:--"
    timer_label.add_theme_color_override("font_color", Color(1, 0.5, 0.2))
    vb.add_child(timer_label)
    
    var current_step_label = Label.new()
    current_step_label.name = "CurrentStepLabel"
    current_step_label.text = ""
    current_step_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    vb.add_child(current_step_label)
    
    var step_desc = Label.new()
    step_desc.name = "StepDescription"
    step_desc.text = ""
    step_desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    vb.add_child(step_desc)
    
    var separator = HSeparator.new()
    vb.add_child(separator)
    
    var ops_label = Label.new()
    ops_label.text = "请选择操作:"
    vb.add_child(ops_label)
    
    var ops_scroll = ScrollContainer.new()
    ops_scroll.custom_minimum_size = Vector2(0, 250)
    vb.add_child(ops_scroll)
    
    var ops_vb = VBoxContainer.new()
    ops_vb.name = "EmergencyOperations"
    ops_scroll.add_child(ops_vb)
    
    var info_label = Label.new()
    info_label.name = "InfoLabel"
    info_label.text = ""
    info_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    vb.add_child(info_label)
    
    emergency_panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)

func _create_fault_alert():
    fault_alert_panel = PanelContainer.new()
    fault_alert_panel.name = "FaultAlert"
    fault_alert_panel.custom_minimum_size = Vector2(500, 120)
    add_child(fault_alert_panel)
    
    var vb = VBoxContainer.new()
    fault_alert_panel.add_child(vb)
    
    var alert_label = Label.new()
    alert_label.name = "AlertLabel"
    alert_label.text = "⚠ 设备故障警报!"
    alert_label.add_theme_font_size_override("font_size", 24)
    alert_label.add_theme_color_override("font_color", Color(1, 0.2, 0.2))
    vb.add_child(alert_label)
    
    var fault_desc = Label.new()
    fault_desc.name = "FaultDescription"
    fault_desc.text = ""
    fault_desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    vb.add_child(fault_desc)
    
    fault_alert_panel.set_anchors_and_offsets_preset(Control.PRESET_TOP_CENTER)
    fault_alert_panel.offset_top = 60

func _create_result_panel():
    result_panel = PanelContainer.new()
    result_panel.name = "ResultPanel"
    result_panel.custom_minimum_size = Vector2(500, 400)
    add_child(result_panel)
    
    var vb = VBoxContainer.new()
    result_panel.add_child(vb)
    
    var title = Label.new()
    title.name = "ResultTitle"
    title.text = "实训结果"
    title.add_theme_font_size_override("font_size", 24)
    vb.add_child(title)
    
    var result_label = Label.new()
    result_label.name = "ResultStatus"
    result_label.text = ""
    result_label.add_theme_font_size_override("font_size", 18)
    vb.add_child(result_label)
    
    var score_label = Label.new()
    score_label.name = "ResultScore"
    score_label.text = ""
    score_label.add_theme_font_size_override("font_size", 16)
    vb.add_child(score_label)
    
    var stats_scroll = ScrollContainer.new()
    stats_scroll.custom_minimum_size = Vector2(0, 150)
    vb.add_child(stats_scroll)
    
    var stats_vb = VBoxContainer.new()
    stats_vb.name = "StatsContainer"
    stats_scroll.add_child(stats_vb)
    
    var menu_btn = Button.new()
    menu_btn.text = "返回主菜单"
    menu_btn.pressed.connect(_on_return_to_menu)
    vb.add_child(menu_btn)
    
    var retry_btn = Button.new()
    retry_btn.text = "重新开始"
    retry_btn.pressed.connect(_on_retry_training)
    vb.add_child(retry_btn)
    
    result_panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)

func _create_player_list():
    player_list_panel = PanelContainer.new()
    player_list_panel.name = "PlayerListPanel"
    player_list_panel.custom_minimum_size = Vector2(200, 200)
    add_child(player_list_panel)
    
    var vb = VBoxContainer.new()
    player_list_panel.add_child(vb)
    
    var title = Label.new()
    title.text = "在线玩家"
    title.add_theme_font_size_override("font_size", 14)
    vb.add_child(title)
    
    var list_container = VBoxContainer.new()
    list_container.name = "PlayerListContainer"
    vb.add_child(list_container)
    
    player_list_panel.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
    player_list_panel.offset_top = 60
    player_list_panel.offset_left = -210

func show_equipment_panel(equipment_id: String, equipment_data: Dictionary):
    current_equipment_id = equipment_id
    current_equipment_data = equipment_data
    is_panel_open = true
    
    var title = equipment_panel.get_node("EquipmentTitle")
    title.text = equipment_data.get("name", "设备")
    
    var desc = equipment_panel.get_node("EquipmentDesc")
    desc.text = equipment_data.get("description", "")
    
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    var has_fault = false
    var fault_type = ""
    if game_manager:
        has_fault = game_manager.fault_manager.has_active_fault(equipment_id)
        if has_fault:
            var fault_data = game_manager.fault_manager.get_equipment_fault(equipment_id)
            fault_type = fault_data.get("fault_name", "未知故障")
    
    var status = equipment_panel.get_node("EquipmentStatus")
    if has_fault:
        status.text = "状态: 故障 - " + fault_type
        status.add_theme_color_override("font_color", Color(1, 0.3, 0.3))
    else:
        status.text = "状态: 正常运行"
        status.add_theme_color_override("font_color", Color(0.3, 1, 0.3))
    
    var actions_container = equipment_panel.get_node("ActionsScroll/ActionsContainer")
    for child in actions_container.get_children():
        child.queue_free()
    
    var available_actions = equipment_data.get("interact_actions", [])
    for action_id in available_actions:
        var btn = Button.new()
        btn.text = _get_action_name(action_id)
        btn.custom_minimum_size = Vector2(0, 40)
        btn.pressed.connect(_on_operation_pressed.bind(action_id))
        actions_container.add_child(btn)
    
    equipment_panel.visible = true
    Input.mouse_mode = Input.MOUSE_MODE_VISIBLE

func hide_equipment_panel():
    equipment_panel.visible = false
    is_panel_open = false
    if not emergency_panel.visible:
        Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
    equipment_panel_closed.emit()

func show_emergency_panel(equipment_id: String, fault_type: String, procedure: Dictionary):
    emergency_panel.visible = true
    is_panel_open = true
    Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
    
    var fault_info = emergency_panel.get_node("FaultInfo")
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager:
        var fault_data = game_manager.fault_manager.get_fault_info(fault_type)
        fault_info.text = "设备: " + equipment_id + "\n" + \
                          "故障: " + fault_data.get("name", fault_type) + "\n" + \
                          "描述: " + fault_data.get("description", "")
    
    var title = emergency_panel.get_node("EmergencyTitle")
    title.text = procedure.get("name", "应急处置流程")
    
    _update_emergency_panel()

func hide_emergency_panel():
    emergency_panel.visible = false
    is_panel_open = false
    if not equipment_panel.visible:
        Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func show_fault_alert(fault_data: Dictionary):
    var alert = fault_alert_panel.get_node("AlertLabel")
    alert.text = "⚠ 设备故障警报!"
    
    var desc = fault_alert_panel.get_node("FaultDescription")
    desc.text = fault_data.get("equipment_name", "设备") + " 发生 " + \
                fault_data.get("fault_name", "故障") + "\n" + \
                fault_data.get("description", "")
    
    fault_alert_panel.visible = true
    
    var tween = create_tween()
    tween.tween_interval(5.0)
    tween.tween_callback(hide_fault_alert)

func hide_fault_alert():
    fault_alert_panel.visible = false

func show_result_panel(success: bool, score: int, stats: Dictionary):
    result_panel.visible = true
    is_panel_open = true
    Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
    
    var title = result_panel.get_node("ResultTitle")
    var status = result_panel.get_node("ResultStatus")
    var score_label = result_panel.get_node("ResultScore")
    
    if success:
        title.add_theme_color_override("font_color", Color(0.2, 1, 0.3))
        status.text = "✓ 处置成功!"
        status.add_theme_color_override("font_color", Color(0.2, 1, 0.3))
    else:
        title.add_theme_color_override("font_color", Color(1, 0.3, 0.3))
        status.text = "✗ 处置失败"
        status.add_theme_color_override("font_color", Color(1, 0.3, 0.3))
    
    score_label.text = "最终得分: " + str(score) + " / 100"
    
    var stats_container = result_panel.get_node("StatsContainer")
    for child in stats_container.get_children():
        child.queue_free()
    
    var items = [
        "完成步骤: " + str(stats.get("steps_completed", 0)) + " / " + str(stats.get("total_steps", 0)),
        "用时: " + str(round(stats.get("time_spent", 0), 1)) + " 秒",
        "错误次数: " + str(stats.get("mistakes", 0))
    ]
    
    for item in items:
        var label = Label.new()
        label.text = item
        stats_container.add_child(label)

func update_hud(status: String, score: int, timer: float, fault_info: String):
    if not hud_panel.visible:
        return
    
    var status_label = hud_panel.get_node("StatusLabel")
    var score_label = hud_panel.get_node("ScoreLabel")
    var timer_label = hud_panel.get_node("TimerLabel")
    var fault_label = hud_panel.get_node("FaultLabel")
    
    status_label.text = "系统状态: " + status
    if status == "正常":
        status_label.add_theme_color_override("font_color", Color(0.2, 1, 0.3))
    else:
        status_label.add_theme_color_override("font_color", Color(1, 0.3, 0.3))
    
    score_label.text = "得分: " + str(score)
    
    var mins = int(timer) / 60
    var secs = int(timer) % 60
    timer_label.text = "时间: %02d:%02d" % [mins, secs]
    if timer < 30:
        timer_label.add_theme_color_override("font_color", Color(1, 0.3, 0.3))
    else:
        timer_label.add_theme_color_override("font_color", Color(1, 1, 1))
    
    fault_label.text = "当前故障: " + (fault_info if fault_info else "无")
    if fault_info:
        fault_label.add_theme_color_override("font_color", Color(1, 0.5, 0.2))
    else:
        fault_label.add_theme_color_override("font_color", Color(1, 1, 1))

func update_player_list(players: Array):
    var container = player_list_panel.get_node("PlayerListContainer")
    for child in container.get_children():
        child.queue_free()
    
    for player in players:
        var hb = HBoxContainer.new()
        
        var name_label = Label.new()
        name_label.text = player.get("name", "未知")
        if player.get("is_host", false):
            name_label.text += " (主机)"
            name_label.add_theme_color_override("font_color", Color(1, 0.8, 0.2))
        hb.add_child(name_label)
        
        container.add_child(hb)

func _update_emergency_panel():
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if not game_manager:
        return
    
    var progress = game_manager.emergency_manager.get_procedure_progress()
    var current_step = game_manager.emergency_manager.get_current_step()
    
    var progress_bar = emergency_panel.get_node("ProgressBar")
    progress_bar.value = progress.get("progress", 0)
    
    var timer = emergency_panel.get_node("EmergencyTimer")
    var time_remaining = progress.get("time_remaining", 0)
    var mins = int(time_remaining) / 60
    var secs = int(time_remaining) % 60
    timer.text = "剩余时间: %02d:%02d" % [mins, secs]
    if time_remaining < 30:
        timer.add_theme_color_override("font_color", Color(1, 0.2, 0.2))
    else:
        timer.add_theme_color_override("font_color", Color(1, 0.5, 0.2))
    
    var step_label = emergency_panel.get_node("CurrentStepLabel")
    var step_desc = emergency_panel.get_node("StepDescription")
    
    if not current_step.is_empty():
        step_label.text = "步骤 " + str(progress.get("current_step", 0) + 1) + \
                          "/" + str(progress.get("total_steps", 0)) + ": " + \
                          current_step.get("name", "")
        step_desc.text = current_step.get("description", "")
    else:
        step_label.text = "处置流程已完成"
        step_desc.text = ""
    
    var info_label = emergency_panel.get_node("InfoLabel")
    info_label.text = "当前得分: " + str(progress.get("score", 0)) + \
                      " | 错误次数: " + str(progress.get("mistakes", 0)) + \
                      "/" + str(progress.get("max_mistakes", 3))
    
    var ops_container = emergency_panel.get_node("EmergencyOperations")
    for child in ops_container.get_children():
        child.queue_free()
    
    if not current_step.is_empty():
        var correct_actions = current_step.get("correct_actions", [])
        var all_actions = _get_all_possible_operations()
        
        for action_id in all_actions:
            var btn = Button.new()
            btn.text = _get_action_name(action_id)
            btn.custom_minimum_size = Vector2(0, 45)
            
            if action_id in correct_actions:
                btn.add_theme_color_override("font_color", Color(0.2, 1, 0.3))
            
            btn.pressed.connect(_on_emergency_operation_pressed.bind(action_id))
            ops_container.add_child(btn)

func _get_all_possible_operations() -> Array:
    return [
        "press_emergency_stop", "cut_power", "warn_personnel", "evacuate_area",
        "measure_temperature", "check_gauge", "apply_water", "use_fire_extinguisher",
        "activate_cooling", "turn_on_ventilation", "open_damper", "close_damper",
        "call_dispatch", "report_status", "set_warning_sign", "isolate_area",
        "confirm_safe", "verify_temperature", "turn_on_headlamp", "stay_calm",
        "stop_machines", "set_to_neutral", "check_switch_gear", "inspect_cables",
        "start_generator", "activate_ups", "guide_evacuation", "check_exit",
        "report_blackout", "headcount", "confirm_all_safe", "trigger_gas_alarm",
        "shout_warning", "stop_all_work", "notify_workers", "measure_gas",
        "read_detector", "evacuate_to_intake", "lead_escape", "call_rescue",
        "report_emergency", "seal_area", "locate_leak", "identify_fluid",
        "close_valve", "shut_off_supply", "open_relief_valve", "depressurize",
        "contain_spill", "use_absorbent", "set_slippery_sign", "warn_others",
        "apply_patch", "use_clamp", "call_maintenance", "report_leak"
    ]

func _get_action_name(action_id: String) -> String:
    var names = {
        "press_emergency_stop": "按下紧急停止按钮",
        "cut_power": "切断主电源",
        "warn_personnel": "警示周边人员",
        "evacuate_area": "疏散作业区域",
        "measure_temperature": "测量设备温度",
        "check_gauge": "查看仪表读数",
        "apply_water": "喷水降温",
        "use_fire_extinguisher": "使用灭火器",
        "activate_cooling": "启动冷却系统",
        "turn_on_ventilation": "开启通风设备",
        "open_damper": "打开风门",
        "close_damper": "关闭风门",
        "call_dispatch": "呼叫调度室",
        "report_status": "汇报当前状态",
        "set_warning_sign": "设置警示标志",
        "isolate_area": "隔离危险区域",
        "confirm_safe": "确认安全",
        "verify_temperature": "复核温度",
        "turn_on_headlamp": "打开头灯",
        "stay_calm": "保持冷静",
        "stop_machines": "停止运转设备",
        "set_to_neutral": "切换至空档",
        "check_switch_gear": "检查开关柜",
        "inspect_cables": "检查电缆",
        "start_generator": "启动发电机",
        "activate_ups": "启动UPS",
        "guide_evacuation": "引导人员撤离",
        "check_exit": "确认安全出口",
        "report_blackout": "上报停电情况",
        "headcount": "清点人数",
        "confirm_all_safe": "确认全员安全",
        "trigger_gas_alarm": "触发瓦斯警报",
        "shout_warning": "大声呼喊警示",
        "stop_all_work": "停止所有作业",
        "notify_workers": "通知作业人员",
        "measure_gas": "检测瓦斯浓度",
        "read_detector": "读取检测仪",
        "evacuate_to_intake": "撤离至进风巷",
        "lead_escape": "带领人员逃生",
        "call_rescue": "呼叫救护队",
        "report_emergency": "上报紧急情况",
        "seal_area": "封闭区域",
        "locate_leak": "查找泄漏点",
        "identify_fluid": "确认泄漏介质",
        "close_valve": "关闭阀门",
        "shut_off_supply": "切断供应",
        "open_relief_valve": "开启泄压阀",
        "depressurize": "释放压力",
        "contain_spill": "围堵泄漏物",
        "use_absorbent": "使用吸附材料",
        "set_slippery_sign": "设置防滑标志",
        "warn_others": "警告他人",
        "apply_patch": "粘贴堵漏片",
        "use_clamp": "使用管箍",
        "call_maintenance": "呼叫维修人员",
        "report_leak": "上报泄漏情况"
    }
    return names.get(action_id, action_id)

func _on_operation_pressed(operation_id: String):
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager:
        var result = game_manager.emergency_manager.submit_operation(
            operation_id, 
            game_manager.current_player_id
        )
        
        if game_manager.is_multiplayer:
            game_manager.network_manager.broadcast_operation(
                game_manager.current_player_id,
                {"operation_id": operation_id, "result": result}
            )
        
        if result.get("completed", false):
            hide_emergency_panel()
            hide_equipment_panel()
        
        _update_emergency_panel()
    
    operation_selected.emit(operation_id)

func _on_emergency_operation_pressed(operation_id: String):
    _on_operation_pressed(operation_id)

func _on_close_equipment_panel():
    hide_equipment_panel()

func _on_return_to_menu():
    hide_all_panels()
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager:
        game_manager.return_to_menu()

func _on_retry_training():
    hide_all_panels()
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager:
        game_manager.start_training()

func hide_all_panels():
    equipment_panel.visible = false
    emergency_panel.visible = false
    fault_alert_panel.visible = false
    result_panel.visible = false
    player_list_panel.visible = false
    is_panel_open = false
    Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func update_emergency_timer():
    _update_emergency_panel()

func _create_chain_fault_panel():
    chain_fault_panel = PanelContainer.new()
    chain_fault_panel.name = "ChainFaultPanel"
    chain_fault_panel.custom_minimum_size = Vector2(450, 300)
    add_child(chain_fault_panel)
    
    var vb = VBoxContainer.new()
    chain_fault_panel.add_child(vb)
    
    var title_bar = HBoxContainer.new()
    vb.add_child(title_bar)
    
    var title_label = Label.new()
    title_label.text = "⚠️ 故障联动警报"
    title_label.add_theme_color_override("font_color", Color(1, 0.3, 0.3))
    title_label.add_theme_font_size_override("font_size", 16)
    title_bar.add_child(title_label)
    
    title_bar.add_spacer()
    
    var close_btn = Button.new()
    close_btn.text = "关闭"
    close_btn.pressed.connect(_on_close_chain_fault_panel)
    title_bar.add_child(close_btn)
    
    var chain_title = Label.new()
    chain_title.text = "故障连锁关系："
    chain_title.add_theme_font_size_override("font_size", 12)
    chain_title.add_theme_color_override("font_color", Color(0.8, 0.8, 0.8))
    vb.add_child(chain_title)
    
    var chain_display = ScrollContainer.new()
    chain_display.custom_minimum_size = Vector2(0, 120)
    vb.add_child(chain_display)
    
    var chain_vb = VBoxContainer.new()
    chain_vb.name = "ChainDisplay"
    chain_display.add_child(chain_vb)
    
    var history_title = Label.new()
    history_title.text = "\n故障联动历史："
    history_title.add_theme_font_size_override("font_size", 12)
    history_title.add_theme_color_override("font_color", Color(0.8, 0.8, 0.8))
    vb.add_child(history_title)
    
    var history_list = ItemList.new()
    history_list.name = "ChainHistoryList"
    history_list.custom_minimum_size = Vector2(0, 100)
    vb.add_child(history_list)
    
    chain_fault_panel.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
    chain_fault_panel.offset_right = -20
    chain_fault_panel.offset_top = 70
    chain_fault_panel.offset_bottom = 380
    
    chain_fault_panel.visible = false

func _create_replay_panel():
    replay_panel = PanelContainer.new()
    replay_panel.name = "ReplayPanel"
    replay_panel.custom_minimum_size = Vector2(500, 400)
    add_child(replay_panel)
    
    var vb = VBoxContainer.new()
    replay_panel.add_child(vb)
    
    var title_bar = HBoxContainer.new()
    vb.add_child(title_bar)
    
    var title_label = Label.new()
    title_label.text = "📼 实训流程回放"
    title_label.add_theme_font_size_override("font_size", 16)
    title_bar.add_child(title_label)
    
    title_bar.add_spacer()
    
    replay_status_label = Label.new()
    replay_status_label.name = "ReplayStatusLabel"
    replay_status_label.text = "已停止"
    replay_status_label.add_theme_color_override("font_color", Color(0.8, 0.8, 0.8))
    title_bar.add_child(replay_status_label)
    
    var close_btn = Button.new()
    close_btn.text = "关闭"
    close_btn.pressed.connect(_on_close_replay_panel)
    title_bar.add_child(close_btn)
    
    var controls_hb = HBoxContainer.new()
    vb.add_child(controls_hb)
    
    replay_play_button = Button.new()
    replay_play_button.text = "▶ 播放"
    replay_play_button.pressed.connect(_on_replay_play_pressed)
    controls_hb.add_child(replay_play_button)
    
    var pause_btn = Button.new()
    pause_btn.text = "⏸ 暂停"
    pause_btn.pressed.connect(_on_replay_pause_pressed)
    controls_hb.add_child(pause_btn)
    
    var stop_btn = Button.new()
    stop_btn.text = "⏹ 停止"
    stop_btn.pressed.connect(_on_replay_stop_pressed)
    controls_hb.add_child(stop_btn)
    
    controls_hb.add_spacer()
    
    var speed_label = Label.new()
    speed_label.text = "速度："
    controls_hb.add_child(speed_label)
    
    replay_speed_option = OptionButton.new()
    replay_speed_option.add_item("0.25x", 0)
    replay_speed_option.add_item("0.5x", 1)
    replay_speed_option.add_item("1x", 2)
    replay_speed_option.add_item("2x", 3)
    replay_speed_option.add_item("4x", 4)
    replay_speed_option.select(2)
    replay_speed_option.item_selected.connect(_on_replay_speed_changed)
    controls_hb.add_child(replay_speed_option)
    
    replay_progress = ProgressBar.new()
    replay_progress.name = "ReplayProgress"
    replay_progress.custom_minimum_size = Vector2(0, 25)
    vb.add_child(replay_progress)
    
    var time_hb = HBoxContainer.new()
    vb.add_child(time_hb)
    
    replay_time_label = Label.new()
    replay_time_label.text = "00:00 / 00:00"
    time_hb.add_child(replay_time_label)
    
    time_hb.add_spacer()
    
    var seek_back_btn = Button.new()
    seek_back_btn.text = "⏪ -5s"
    seek_back_btn.pressed.connect(_on_replay_seek_back)
    time_hb.add_child(seek_back_btn)
    
    var seek_forward_btn = Button.new()
    seek_forward_btn.text = "⏩ +5s"
    seek_forward_btn.pressed.connect(_on_replay_seek_forward)
    time_hb.add_child(seek_forward_btn)
    
    var events_label = Label.new()
    events_label.text = "\n事件列表："
    events_label.add_theme_font_size_override("font_size", 12)
    events_label.add_theme_color_override("font_color", Color(0.8, 0.8, 0.8))
    vb.add_child(events_label)
    
    var scroll = ScrollContainer.new()
    scroll.custom_minimum_size = Vector2(0, 200)
    vb.add_child(scroll)
    
    replay_event_list = ItemList.new()
    replay_event_list.name = "ReplayEventList"
    replay_event_list.allow_reselect = true
    scroll.add_child(replay_event_list)
    
    replay_panel.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
    replay_panel.offset_left = 20
    replay_panel.offset_right = -20
    replay_panel.offset_bottom = -20
    replay_panel.offset_top = -450
    
    replay_panel.visible = false

func _create_network_status_panel():
    network_status_panel = PanelContainer.new()
    network_status_panel.name = "NetworkStatusPanel"
    network_status_panel.custom_minimum_size = Vector2(200, 30)
    add_child(network_status_panel)
    
    var hb = HBoxContainer.new()
    network_status_panel.add_child(hb)
    
    var status_icon = Label.new()
    status_icon.name = "NetStatusIcon"
    status_icon.text = "🌐"
    hb.add_child(status_icon)
    
    var status_label = Label.new()
    status_label.name = "NetStatusLabel"
    status_label.text = "网络: 离线"
    status_label.add_theme_font_size_override("font_size", 11)
    hb.add_child(status_label)
    
    var latency_label = Label.new()
    latency_label.name = "NetLatencyLabel"
    latency_label.text = "延迟: --"
    latency_label.add_theme_font_size_override("font_size", 11)
    latency_label.add_theme_color_override("font_color", Color(0.7, 0.7, 0.7))
    hb.add_child(latency_label)
    
    hb.add_spacer()
    
    var quality_label = Label.new()
    quality_label.name = "NetQualityLabel"
    quality_label.text = "质量: --"
    quality_label.add_theme_font_size_override("font_size", 11)
    quality_label.add_theme_color_override("font_color", Color(0.7, 0.7, 0.7))
    hb.add_child(quality_label)
    
    network_status_panel.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
    network_status_panel.offset_right = -10
    network_status_panel.offset_bottom = -10
    network_status_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
    
    network_status_panel.visible = false

func show_chain_fault_panel(parent_fault_id: String, child_equip: String, child_fault: String):
    chain_fault_history.append({
        "parent": parent_fault_id,
        "child": child_equip,
        "fault": child_fault,
        "time": Time.get_datetime_string_from_system()
    })
    
    _update_chain_display()
    
    var history_list = chain_fault_panel.get_node("ChainHistoryList")
    var parent_name = _get_equipment_name(parent_fault_id)
    var child_name = _get_equipment_name(child_equip)
    var fault_name = _get_fault_name(child_fault)
    history_list.add_item("[%s] %s → %s: %s" % [Time.get_time_string_from_system(), parent_name, child_name, fault_name])
    
    chain_fault_panel.visible = true
    is_panel_open = true
    Input.mouse_mode = Input.MOUSE_MODE_VISIBLE

func _update_chain_display():
    var chain_display = chain_fault_panel.get_node("ChainDisplay")
    for child in chain_display.get_children():
        child.queue_free()
    
    var last_idx = chain_fault_history.size() - 1
    if last_idx >= 0:
        var chain = []
        chain.append(chain_fault_history[last_idx]["child"])
        
        var current_parent = chain_fault_history[last_idx]["parent"]
        for i in range(last_idx - 1, -1, -1):
            if chain_fault_history[i]["child"] == current_parent:
                chain.insert(0, current_parent)
                current_parent = chain_fault_history[i]["parent"]
        
        chain.insert(0, current_parent)
        
        var chain_text = " → ".join(chain.map(func(e): return _get_equipment_name(e)))
        var chain_label = Label.new()
        chain_label.text = chain_text
        chain_label.add_theme_font_size_override("font_size", 14)
        chain_label.add_theme_color_override("font_color", Color(1, 0.8, 0.3))
        chain_display.add_child(chain_label)
        
        var fault_text = "连锁故障: " + _get_fault_name(chain_fault_history[last_idx]["fault"])
        var fault_label = Label.new()
        fault_label.text = fault_text
        fault_label.add_theme_font_size_override("font_size", 13)
        fault_label.add_theme_color_override("font_color", Color(1, 0.4, 0.4))
        chain_display.add_child(fault_label)

func show_replay_panel(events_data: Array = []):
    if not events_data.is_empty():
        _populate_replay_events(events_data)
    
    replay_panel.visible = true
    is_panel_open = true
    is_replay_mode = true
    Input.mouse_mode = Input.MOUSE_MODE_VISIBLE

func _populate_replay_events(events: Array):
    replay_event_list.clear()
    for event in events:
        var event_type = event.get("event_type", "unknown")
        var timestamp = event.get("timestamp", "")
        var display_text = ""
        
        match event_type:
            "fault_triggered":
                var equip = _get_equipment_name(event.get("equipment_id", ""))
                var fault = _get_fault_name(event.get("fault_type", ""))
                display_text = "🔴 [%s] 故障触发: %s - %s" % [timestamp, equip, fault]
            "operation":
                var step = event.get("step_index", 0)
                var op = event.get("operation", "")
                var correct = event.get("correct", false)
                var status = "✅" if correct else "❌"
                display_text = "%s [%s] 步骤%d 操作: %s" % [status, timestamp, step, _get_action_name(op)]
            "step_complete":
                var step = event.get("step_index", 0)
                var step_name = event.get("step_name", "")
                display_text = "📝 [%s] 完成步骤%d: %s" % [timestamp, step, step_name]
            "chain_fault":
                var parent = _get_equipment_name(event.get("parent_fault_id", ""))
                var child = _get_equipment_name(event.get("child_equipment_id", ""))
                display_text = "🔗 [%s] 连锁故障: %s → %s" % [timestamp, parent, child]
            "scene_start":
                var scene_id = event.get("scene_id", "")
                display_text = "🎬 [%s] 场景开始: %s" % [timestamp, scene_id]
            "scene_end":
                var scene_id = event.get("scene_id", "")
                var success = event.get("success", false)
                display_text = "🏁 [%s] 场景结束: %s (%s)" % [timestamp, scene_id, "成功" if success else "失败"]
            "training_start":
                display_text = "🚀 [%s] 训练开始" % timestamp
            "training_end":
                var score = event.get("score", 0)
                var success = event.get("success", false)
                display_text = "🏆 [%s] 训练结束 - 得分: %d (%s)" % [timestamp, score, "成功" if success else "失败"]
            _:
                display_text = "[%s] %s" % [timestamp, event_type]
        
        replay_event_list.add_item(display_text)

func update_replay_progress(current_time: float, total_time: float):
    if total_time > 0:
        replay_progress.value = (current_time / total_time) * 100
    
    var current_str = _format_time(current_time)
    var total_str = _format_time(total_time)
    replay_time_label.text = "%s / %s" % [current_str, total_str]

func _format_time(seconds: float) -> String:
    var mins = int(seconds) / 60
    var secs = int(seconds) % 60
    return "%02d:%02d" % [mins, secs]

func update_network_status(connected: bool, latency: float = 0.0, quality: String = ""):
    var status_icon = network_status_panel.get_node("NetStatusIcon")
    var status_label = network_status_panel.get_node("NetStatusLabel")
    var latency_label = network_status_panel.get_node("NetLatencyLabel")
    var quality_label = network_status_panel.get_node("NetQualityLabel")
    
    if connected:
        status_icon.text = "🌐"
        status_label.text = "网络: 在线"
        status_label.add_theme_color_override("font_color", Color(0.3, 1, 0.3))
    else:
        status_icon.text = "❌"
        status_label.text = "网络: 离线"
        status_label.add_theme_color_override("font_color", Color(1, 0.3, 0.3))
    
    latency_label.text = "延迟: %dms" % int(latency)
    quality_label.text = "质量: " + quality
    
    match quality:
        "excellent":
            quality_label.add_theme_color_override("font_color", Color(0.3, 1, 0.3))
        "good":
            quality_label.add_theme_color_override("font_color", Color(0.7, 1, 0.3))
        "fair":
            quality_label.add_theme_color_override("font_color", Color(1, 0.8, 0.3))
        "poor":
            quality_label.add_theme_color_override("font_color", Color(1, 0.5, 0.3))
        "bad":
            quality_label.add_theme_color_override("font_color", Color(1, 0.3, 0.3))
        _:
            quality_label.add_theme_color_override("font_color", Color(0.7, 0.7, 0.7))

func _on_close_chain_fault_panel():
    chain_fault_panel.visible = false
    is_panel_open = false
    Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _on_close_replay_panel():
    replay_panel.visible = false
    is_panel_open = false
    is_replay_mode = false
    Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _on_replay_play_pressed():
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager:
        game_manager.replay_manager.start_replay()
        replay_status_label.text = "播放中..."
        replay_play_button.text = "⏸ 暂停"

func _on_replay_pause_pressed():
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager:
        game_manager.replay_manager.pause_replay()
        replay_status_label.text = "已暂停"
        replay_play_button.text = "▶ 播放"

func _on_replay_stop_pressed():
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager:
        game_manager.replay_manager.stop_replay()
        replay_status_label.text = "已停止"
        replay_play_button.text = "▶ 播放"
        update_replay_progress(0, 0)

func _on_replay_speed_changed(index: int):
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager:
        var speeds = [0.25, 0.5, 1.0, 2.0, 4.0]
        game_manager.replay_manager.set_replay_speed(speeds[index])

func _on_replay_seek_back():
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager:
        var current = game_manager.replay_manager.current_replay_time
        game_manager.replay_manager.seek_replay(max(0, current - 5.0))

func _on_replay_seek_forward():
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager:
        var current = game_manager.replay_manager.current_replay_time
        var total = game_manager.replay_manager.total_replay_time
        game_manager.replay_manager.seek_replay(min(total, current + 5.0))

func hide_all_panels():
    equipment_panel.visible = false
    emergency_panel.visible = false
    fault_alert_panel.visible = false
    result_panel.visible = false
    player_list_panel.visible = false
    chain_fault_panel.visible = false
    replay_panel.visible = false
    is_panel_open = false
    is_replay_mode = false
    Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
