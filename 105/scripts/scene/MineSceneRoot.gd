extends Node3D

var scene_manager: Node = null
var ui_layer: CanvasLayer = null
var training_active: bool = false

func _ready():
    _init_scene()
    _connect_signals()
    
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager and not game_manager.is_replay_mode:
        if game_manager.is_server or not game_manager.is_multiplayer:
            var start_timer = Timer.new()
            start_timer.wait_time = 2.0
            start_timer.one_shot = true
            start_timer.timeout.connect(_delayed_start_training)
            add_child(start_timer)
            start_timer.start()

func _init_scene():
    scene_manager = preload("res://scripts/scene/MineSceneManager.gd").new()
    add_child(scene_manager)
    
    ui_layer = preload("res://scripts/scene/UILayer.gd").new()
    ui_layer.name = "UILayer"
    add_child(ui_layer)
    
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager and game_manager.is_multiplayer:
        ui_layer.player_list_panel.visible = true
        _update_player_list()

func _connect_signals():
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager:
        game_manager.fault_triggered.connect(_on_fault_triggered)
        game_manager.emergency_completed.connect(_on_emergency_completed)
        game_manager.emergency_manager.emergency_started.connect(_on_emergency_started)
        game_manager.emergency_manager.timer_updated.connect(_on_emergency_timer_updated)
        game_manager.network_manager.fault_received.connect(_on_network_fault)
        game_manager.network_manager.training_result_received.connect(_on_network_result)
        game_manager.network_manager.player_connected.connect(_on_player_connected_network)
        game_manager.network_manager.player_disconnected.connect(_on_player_disconnected_network)
        game_manager.fault_manager.chain_fault_triggered.connect(_on_chain_fault_triggered)
        game_manager.replay_manager.replay_progress.connect(_on_replay_progress)
        game_manager.replay_manager.replay_started.connect(_on_replay_started)
        game_manager.replay_manager.replay_completed.connect(_on_replay_completed)
        game_manager.network_manager.reconnecting.connect(_on_reconnecting)
        game_manager.network_manager.reconnected.connect(_on_reconnected)
        game_manager.network_manager.reconnect_failed.connect(_on_reconnect_failed)
        game_manager.network_manager.network_stats_updated.connect(_on_network_stats_updated)
        game_manager.network_manager.connection_error.connect(_on_connection_error)
    
    if scene_manager:
        scene_manager.equipment_interacted.connect(_on_equipment_interacted)
    
    if ui_layer:
        ui_layer.operation_selected.connect(_on_operation_selected)

func _delayed_start_training():
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager:
        game_manager.start_training()
        if game_manager.is_server:
            game_manager.network_manager.send_training_start()

func _on_fault_triggered(equipment_id, fault_type):
    if scene_manager:
        scene_manager.set_equipment_fault_state(equipment_id, true, fault_type)
    
    if ui_layer:
        var game_manager = get_tree().root.get_node_or_null("GameManager")
        if game_manager:
            var fault_data = game_manager.fault_manager.get_equipment_fault(equipment_id)
            ui_layer.show_fault_alert(fault_data)

func _on_emergency_started(equipment_id, fault_type, procedure):
    if ui_layer:
        ui_layer.show_emergency_panel(equipment_id, fault_type, procedure)

func _on_emergency_completed(success, score):
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager:
        var operations = game_manager.emergency_manager.get_operation_records()
        var summary = {}
        for op in operations:
            if op.has("summary"):
                summary = op["summary"]
                break
        
        if summary.is_empty():
            var progress = game_manager.emergency_manager.get_procedure_progress()
            summary = {
                "success": success,
                "score": score,
                "steps_completed": progress.get("completed_steps", 0),
                "total_steps": progress.get("total_steps", 0),
                "time_spent": progress.get("time_remaining", 0),
                "mistakes": progress.get("mistakes", 0)
            }
        
        if ui_layer:
            ui_layer.show_result_panel(success, score, summary)
    
    if scene_manager:
        var game_manager2 = get_tree().root.get_node_or_null("GameManager")
        if game_manager2:
            var active_faults = game_manager2.fault_manager.get_active_faults()
            for equip_id in active_faults.keys():
                scene_manager.set_equipment_fault_state(equip_id, false, "")

func _on_emergency_timer_updated(time_remaining):
    if ui_layer:
        ui_layer.update_emergency_timer()
        
        var game_manager = get_tree().root.get_node_or_null("GameManager")
        if game_manager:
            var progress = game_manager.emergency_manager.get_procedure_progress()
            var status = "故障中" if progress.get("time_remaining", 0) > 0 else "正常"
            var fault_info = "处置中"
            
            ui_layer.update_hud(
                status,
                progress.get("score", 0),
                progress.get("time_remaining", 0),
                fault_info
            )

func _on_equipment_interacted(equipment_id):
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager:
        if game_manager.is_multiplayer:
            game_manager.network_manager.broadcast_sync("interaction", {
                "player_id": game_manager.current_player_id,
                "equipment_id": equipment_id
            })

func _on_operation_selected(operation_id):
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager and game_manager.is_multiplayer:
        game_manager.network_manager.broadcast_operation(
            game_manager.current_player_id,
            {"operation_id": operation_id}
        )

func _on_network_fault(equipment_id, fault_type):
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if not game_manager:
        return
    
    var fault_def = game_manager.fault_manager.get_fault_info(fault_type)
    var all_equipment = scene_manager.get_all_equipment() if scene_manager else {}
    var equip_data = all_equipment.get(equipment_id, {})
    
    var fault_data = {
        "equipment_id": equipment_id,
        "equipment_name": equip_data.get("name", "未知设备"),
        "fault_type": fault_type,
        "fault_name": fault_def.get("name", "未知故障"),
        "severity": fault_def.get("severity", "medium"),
        "description": fault_def.get("description", ""),
        "symptoms": fault_def.get("symptoms", []),
        "trigger_time": Time.get_ticks_msec(),
        "time_limit": fault_def.get("time_limit", 120.0),
        "time_remaining": fault_def.get("time_limit", 120.0),
        "status": "active"
    }
    
    game_manager.fault_manager.active_faults[equipment_id] = fault_data
    
    if scene_manager:
        scene_manager.set_equipment_fault_state(equipment_id, true, fault_type)
    
    if ui_layer:
        var alert_data = {
            "equipment_id": equipment_id,
            "equipment_name": equip_data.get("name", "设备"),
            "fault_name": fault_def.get("name", fault_type),
            "description": fault_def.get("description", "")
        }
        ui_layer.show_fault_alert(alert_data)
    
    game_manager.emergency_manager.start_emergency_procedure(equipment_id, fault_type)

func _on_network_result(success, score):
    _on_emergency_completed(success, score)

func _on_player_connected_network(player_id, player_info):
    _update_player_list()

func _on_player_disconnected_network(player_id):
    _update_player_list()

func _update_player_list():
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager and ui_layer:
        var players = game_manager.network_manager.get_connected_players()
        ui_layer.update_player_list(players)

func _process(delta):
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager and ui_layer:
        var progress = game_manager.emergency_manager.get_procedure_progress()
        if not progress.is_empty():
            var status = "故障中"
            var fault_info = "处置中"
            var active_faults = game_manager.fault_manager.get_active_fault_list()
            if active_faults.size() > 0:
                var first_fault = active_faults[0]
                fault_info = first_fault.get("fault_name", "")
            
            ui_layer.update_hud(
                status,
                progress.get("score", 0),
                progress.get("time_remaining", 0),
                fault_info
            )

func _on_chain_fault_triggered(parent_fault_id, child_equipment_id, child_fault_type):
    if ui_layer:
        ui_layer.show_chain_fault_panel(parent_fault_id, child_equipment_id, child_fault_type)

func _on_replay_progress(current_time, total_time):
    if ui_layer:
        ui_layer.update_replay_progress(current_time, total_time)

func _on_replay_started():
    if ui_layer:
        ui_layer.replay_status_label.text = "播放中..."
        ui_layer.replay_play_button.text = "⏸ 暂停"

func _on_replay_completed():
    if ui_layer:
        ui_layer.replay_status_label.text = "已完成"
        ui_layer.replay_play_button.text = "▶ 播放"

func _on_reconnecting(attempt):
    if ui_layer:
        var status_icon = ui_layer.network_status_panel.get_node("NetStatusIcon")
        var status_label = ui_layer.network_status_panel.get_node("NetStatusLabel")
        status_icon.text = "🔄"
        status_label.text = "重连中(%d)" % attempt
        status_label.add_theme_color_override("font_color", Color(1, 0.8, 0.3))

func _on_reconnected():
    if ui_layer:
        var status_icon = ui_layer.network_status_panel.get_node("NetStatusIcon")
        var status_label = ui_layer.network_status_panel.get_node("NetStatusLabel")
        status_icon.text = "🌐"
        status_label.text = "已重连"
        status_label.add_theme_color_override("font_color", Color(0.3, 1, 0.3))

func _on_reconnect_failed():
    if ui_layer:
        var status_icon = ui_layer.network_status_panel.get_node("NetStatusIcon")
        var status_label = ui_layer.network_status_panel.get_node("NetStatusLabel")
        status_icon.text = "❌"
        status_label.text = "重连失败"
        status_label.add_theme_color_override("font_color", Color(1, 0.3, 0.3))

func _on_network_stats_updated(stats):
    if ui_layer:
        var game_manager = get_tree().root.get_node_or_null("GameManager")
        if game_manager and game_manager.is_multiplayer:
            var connected = game_manager.network_manager.is_connected()
            var latency = stats.get("latency", 0.0)
            var quality = game_manager.network_manager.get_network_quality()
            ui_layer.update_network_status(connected, latency, quality)

func _on_connection_error(error_msg):
    print("网络错误: ", error_msg)
    if ui_layer:
        var status_icon = ui_layer.network_status_panel.get_node("NetStatusIcon")
        var status_label = ui_layer.network_status_panel.get_node("NetStatusLabel")
        status_icon.text = "⚠️"
        status_label.text = "网络错误"
        status_label.add_theme_color_override("font_color", Color(1, 0.5, 0.3))
