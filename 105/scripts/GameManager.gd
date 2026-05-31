extends Node

signal game_state_changed(new_state)
signal fault_triggered(equipment_id, fault_type)
signal emergency_completed(success, score)

enum GameState { MENU, SINGLE_PLAYER, MULTI_PLAYER, TRAINING, RESULT }

var current_state: GameState = GameState.MENU
var is_server: bool = false
var is_multiplayer: bool = false
var is_replay_mode: bool = false
var current_player_id: String = ""
var player_name: String = "学员"
var training_start_time: float = 0.0
var training_active: bool = false
var connected_players: Dictionary = {}

var fault_manager: Node
var emergency_manager: Node
var network_manager: Node
var database_manager: Node
var replay_manager: Node

func _ready():
    _init_managers()
    _load_database()

func _init_managers():
    database_manager = preload("res://scripts/database/DatabaseManager.gd").new()
    add_child(database_manager)
    
    network_manager = preload("res://scripts/network/NetworkManager.gd").new()
    add_child(network_manager)
    
    fault_manager = preload("res://scripts/equipment/FaultManager.gd").new()
    add_child(fault_manager)
    
    emergency_manager = preload("res://scripts/emergency/EmergencyManager.gd").new()
    add_child(emergency_manager)
    
    replay_manager = preload("res://scripts/emergency/ReplayManager.gd").new()
    add_child(replay_manager)
    
    fault_manager.fault_triggered.connect(_on_fault_triggered)
    fault_manager.chain_fault_triggered.connect(_on_chain_fault_triggered)
    fault_manager.fault_scene_started.connect(_on_fault_scene_started)
    fault_manager.fault_scene_completed.connect(_on_fault_scene_completed)
    emergency_manager.emergency_completed.connect(_on_emergency_completed)
    emergency_manager.operation_recorded.connect(_on_operation_recorded)
    emergency_manager.step_completed.connect(_on_step_completed)
    network_manager.player_connected.connect(_on_player_connected)
    network_manager.player_disconnected.connect(_on_player_disconnected)
    network_manager.operation_received.connect(_on_network_operation)
    network_manager.fault_received.connect(_on_network_fault_sync)
    network_manager.sync_received.connect(_on_sync_received)

func _load_database():
    var db_path = OS.get_user_data_dir().plus_file("training_records.db")
    database_manager.connect_database(db_path)

func start_single_player():
    current_state = GameState.SINGLE_PLAYER
    is_multiplayer = false
    is_server = false
    game_state_changed.emit(current_state)
    get_tree().change_scene_to_file("res://scenes/MineScene.tscn")

func start_multiplayer_server(port: int = 8080):
    current_state = GameState.MULTI_PLAYER
    is_multiplayer = true
    is_server = true
    network_manager.start_server(port)
    game_state_changed.emit(current_state)
    get_tree().change_scene_to_file("res://scenes/MineScene.tscn")

func start_multiplayer_client(host: String = "127.0.0.1", port: int = 8080):
    current_state = GameState.MULTI_PLAYER
    is_multiplayer = true
    is_server = false
    current_player_id = str(Time.get_unix_time_from_system())
    network_manager.connect_to_server(host, port, current_player_id, player_name)
    game_state_changed.emit(current_state)
    get_tree().change_scene_to_file("res://scenes/MineScene.tscn")

func start_training():
    if is_replay_mode:
        return
    
    training_start_time = Time.get_ticks_msec() / 1000.0
    training_active = true
    current_state = GameState.TRAINING
    game_state_changed.emit(current_state)
    fault_manager.start_fault_simulation()
    replay_manager.start_recording()
    replay_manager.record_training_start()

func complete_training(success: bool, score: int, operations: Array):
    training_active = false
    var end_time = Time.get_ticks_msec() / 1000.0
    var duration = end_time - training_start_time
    
    var event_records = replay_manager.get_recorded_data()
    
    var record = {
        "player_name": player_name,
        "player_id": current_player_id,
        "training_type": "multiplayer" if is_multiplayer else "single",
        "score": score,
        "duration": duration,
        "success": success,
        "operations": operations,
        "events": event_records,
        "timestamp": Time.get_datetime_string_from_system()
    }
    
    database_manager.save_training_record(record)
    replay_manager.record_training_end(success, score, duration)
    
    current_state = GameState.RESULT
    game_state_changed.emit(current_state)
    
    if is_server or not is_multiplayer:
        emergency_completed.emit(success, score)

func return_to_menu():
    if is_multiplayer:
        network_manager.disconnect()
    training_active = false
    current_state = GameState.MENU
    connected_players.clear()
    game_state_changed.emit(current_state)
    get_tree().change_scene_to_file("res://scenes/MainMenu.tscn")

func _on_fault_triggered(equipment_id, fault_type):
    fault_triggered.emit(equipment_id, fault_type)
    emergency_manager.start_emergency_procedure(equipment_id, fault_type)
    if is_server:
        network_manager.broadcast_fault(equipment_id, fault_type)

func _on_emergency_completed(success, score):
    var operations = emergency_manager.get_operation_records()
    complete_training(success, score, operations)
    if is_server:
        network_manager.broadcast_training_result(success, score)

func _on_player_connected(player_id, player_info):
    connected_players[player_id] = player_info

func _on_player_disconnected(player_id):
    if player_id in connected_players:
        connected_players.erase(player_id)

func _on_chain_fault_triggered(parent_fault_id, child_equipment_id, child_fault_type):
    replay_manager.record_chain_fault(parent_fault_id, child_equipment_id, child_fault_type)

func _on_fault_scene_started(scene_id, scene_data):
    replay_manager.record_scene_start(scene_id, scene_data)

func _on_fault_scene_completed(scene_id, success):
    replay_manager.record_scene_end(scene_id, success)

func _on_operation_recorded(operation_data):
    var step_index = operation_data.get("step_index", 0)
    var operation_id = operation_data.get("operation", "")
    var correct = operation_data.get("correct", false)
    var player_id = operation_data.get("player_id", "")
    replay_manager.record_operation(step_index, operation_id, correct, player_id)

func _on_step_completed(step_index, step_data, correct, player_id):
    replay_manager.record_step_complete(step_index, step_data, correct, player_id)

func _on_network_operation(player_id, operation):
    if is_multiplayer and emergency_manager.is_procedure_active:
        var operation_id = operation.get("operation_id", "")
        if not operation_id.is_empty():
            if is_server:
                var result = emergency_manager.submit_operation(operation_id, player_id, true)
                
                var sync_data = {
                    "operation_id": operation_id,
                    "player_id": player_id,
                    "result": result,
                    "step_index": emergency_manager.current_step_index,
                    "score": emergency_manager.total_score,
                    "mistakes": emergency_manager.mistake_count,
                    "time_remaining": emergency_manager.active_procedure.get("time_remaining", 0) if emergency_manager.active_procedure else 0
                }
                network_manager.broadcast_sync("operation_result", sync_data)
            else:
                emergency_manager.submit_operation(operation_id, player_id, false)

func _on_network_fault_sync(equipment_id, fault_type):
    if is_multiplayer and not is_server:
        if not fault_manager.has_active_fault(equipment_id):
            var fault_def = fault_manager.get_fault_info(fault_type)
            var equip_data = fault_manager.registered_equipment.get(equipment_id, {})
            
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
            fault_manager.active_faults[equipment_id] = fault_data

func _on_sync_received(data_type, sync_data):
    match data_type:
        "operation_result":
            if not is_server:
                var result = sync_data.get("result", {})
                emergency_manager.apply_operation_result(result)
        
        "procedure_sync":
            if not is_server:
                var equipment_id = sync_data.get("equipment_id", "")
                var fault_type = sync_data.get("fault_type", "")
                var step_idx = sync_data.get("step_index", 0)
                var time_remaining = sync_data.get("time_remaining", 0)
                
                if not emergency_manager.is_procedure_active:
                    emergency_manager.start_emergency_procedure(equipment_id, fault_type)
                
                emergency_manager.current_step_index = step_idx
                emergency_manager.total_score = sync_data.get("score", 0)
                emergency_manager.mistake_count = sync_data.get("mistakes", 0)
                
                if emergency_manager.active_procedure:
                    emergency_manager.active_procedure["time_remaining"] = time_remaining
        
        "fault_resolved":
            var equipment_id = sync_data.get("equipment_id", "")
            if equipment_id in fault_manager.active_faults:
                fault_manager.active_faults.erase(equipment_id)

func get_training_history(limit: int = 50) -> Array:
    return database_manager.get_training_records(limit)

func clean_expired_records(days_old: int = 30) -> Dictionary:
    return database_manager.clean_expired_records(days_old)

func clean_old_records(max_records: int = 100) -> Dictionary:
    return database_manager.clean_old_records(max_records)

func delete_all_records() -> Dictionary:
    return database_manager.delete_all_records()

func get_record_count() -> int:
    return database_manager.get_record_count()
