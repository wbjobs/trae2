extends Node

signal replay_started(record_id, record_data)
signal replay_stopped()
signal replay_paused()
signal replay_resumed()
signal replay_seeked(time)
signal replay_completed()
signal replay_frame(frame_index, frame_data)
signal replay_progress(current_time, total_time)

enum ReplayState { STOPPED, PLAYING, PAUSED }

var current_state: ReplayState = ReplayState.STOPPED
var current_record: Dictionary = {}
var current_record_id: int = 0
var replay_time: float = 0.0
var replay_speed: float = 1.0
var current_frame_index: int = 0
var replay_frames: Array = []
var is_replay_mode: bool = false
var current_replay_time: float = 0.0
var total_replay_time: float = 0.0

var record_buffer: Array = []
var is_recording: bool = false
var recording_start_time: float = 0.0

const RecordType := {
    "FAULT_TRIGGER": "fault_trigger",
    "FAULT_RESOLVE": "fault_resolve",
    "OPERATION": "operation",
    "STEP_COMPLETE": "step_complete",
    "PLAYER_MOVE": "player_move",
    "TRAINING_START": "training_start",
    "TRAINING_END": "training_end",
    "CHAIN_FAULT": "chain_fault",
    "SCENE_START": "scene_start",
    "SCENE_END": "scene_end"
}

func _ready():
    pass

func _process(delta):
    if current_state == ReplayState.PLAYING:
        _process_replay(delta)

func start_recording() -> void:
    is_recording = true
    recording_start_time = Time.get_ticks_msec()
    record_buffer.clear()
    print("开始记录实训流程")

func stop_recording() -> void:
    is_recording = false
    print("停止记录实训流程，共记录 ", record_buffer.size(), " 条事件")

func record_event(event_type: String, event_data: Dictionary) -> void:
    if not is_recording:
        return
    
    var event = {
        "timestamp": Time.get_ticks_msec() - recording_start_time,
        "type": event_type,
        "data": event_data
    }
    record_buffer.append(event)

func get_recorded_data() -> Array:
    return record_buffer.duplicate(true)

func load_replay(record_id: int, record_data: Dictionary) -> bool:
    var operations = record_data.get("operations", [])
    if operations.is_empty():
        push_warning("回放记录为空")
        return false
    
    current_record = record_data
    current_record_id = record_id
    replay_frames = _build_replay_frames(record_data)
    is_replay_mode = true
    
    print("加载回放记录: ", record_id, "，共 ", replay_frames.size(), " 帧")
    return true

func _build_replay_frames(record_data: Dictionary) -> Array:
    var frames = []
    var operations = record_data.get("operations", [])
    
    for i in range(operations.size()):
        var op = operations[i]
        var frame = {
            "frame_index": i,
            "time": op.get("time_spent", 0) * 1000,
            "cumulative_time": 0,
            "type": "operation",
            "step_index": op.get("step_index", 0),
            "step_name": op.get("step_name", ""),
            "operation": op.get("operation", ""),
            "correct": op.get("correct", false),
            "player_id": op.get("player_id", ""),
            "timestamp": op.get("timestamp", ""),
            "summary": op.get("summary", {})
        }
        frames.append(frame)
    
    var cumulative = 0.0
    for frame in frames:
        cumulative += frame["time"]
        frame["cumulative_time"] = cumulative
    
    return frames

func start_replay() -> bool:
    if replay_frames.is_empty():
        return false
    
    current_state = ReplayState.PLAYING
    replay_time = 0.0
    current_replay_time = 0.0
    total_replay_time = get_total_duration() / 1000.0
    current_frame_index = 0
    
    replay_progress.emit(0.0, total_replay_time)
    replay_started.emit(current_record_id, current_record)
    print("开始回放")
    return true

func stop_replay() -> void:
    current_state = ReplayState.STOPPED
    is_replay_mode = false
    replay_time = 0.0
    current_replay_time = 0.0
    current_frame_index = 0
    replay_progress.emit(0.0, total_replay_time)
    replay_stopped.emit()
    print("停止回放")

func pause_replay() -> void:
    if current_state == ReplayState.PLAYING:
        current_state = ReplayState.PAUSED
        replay_paused.emit()
        print("回放暂停")

func resume_replay() -> void:
    if current_state == ReplayState.PAUSED:
        current_state = ReplayState.PLAYING
        replay_resumed.emit()
        print("回放继续")

func seek_replay(time_seconds: float) -> void:
    if replay_frames.is_empty():
        return
    
    var time_ms = time_seconds * 1000.0
    replay_time = clamp(time_ms, 0.0, get_total_duration())
    current_replay_time = replay_time / 1000.0
    
    for i in range(replay_frames.size()):
        if replay_frames[i]["cumulative_time"] >= replay_time:
            current_frame_index = i
            break
    
    replay_progress.emit(current_replay_time, total_replay_time)
    replay_seeked.emit(current_replay_time)
    _emit_current_frame()

func set_replay_speed(speed: float) -> void:
    replay_speed = clamp(speed, 0.25, 4.0)

func _process_replay(delta: float) -> void:
    if replay_frames.is_empty():
        return
    
    replay_time += delta * 1000 * replay_speed
    current_replay_time = replay_time / 1000.0
    
    replay_progress.emit(current_replay_time, total_replay_time)
    
    while current_frame_index < replay_frames.size():
        var frame = replay_frames[current_frame_index]
        if replay_time >= frame["cumulative_time"]:
            _emit_current_frame()
            current_frame_index += 1
        else:
            break
    
    if current_frame_index >= replay_frames.size():
        current_frame_index = replay_frames.size() - 1
        current_state = ReplayState.STOPPED
        is_replay_mode = false
        replay_completed.emit()
        print("回放完成")

func _emit_current_frame() -> void:
    if current_frame_index >= 0 and current_frame_index < replay_frames.size():
        var frame = replay_frames[current_frame_index]
        replay_frame.emit(current_frame_index, frame)

func get_total_duration() -> float:
    if replay_frames.is_empty():
        return 0.0
    return replay_frames[replay_frames.size() - 1]["cumulative_time"]

func get_current_frame() -> Dictionary:
    if current_frame_index >= 0 and current_frame_index < replay_frames.size():
        return replay_frames[current_frame_index].duplicate()
    return {}

func get_progress() -> float:
    var total = get_total_duration()
    if total <= 0:
        return 0.0
    return replay_time / total * 100.0

func get_replay_info() -> Dictionary:
    return {
        "record_id": current_record_id,
        "player_name": current_record.get("player_name", "未知"),
        "training_type": current_record.get("training_type", "single"),
        "score": current_record.get("score", 0),
        "success": current_record.get("success", false),
        "duration": current_record.get("duration", 0),
        "timestamp": current_record.get("timestamp", ""),
        "total_frames": replay_frames.size(),
        "current_frame": current_frame_index,
        "replay_time": replay_time,
        "total_duration": get_total_duration(),
        "is_playing": current_state == ReplayState.PLAYING,
        "is_paused": current_state == ReplayState.PAUSED,
        "replay_speed": replay_speed
    }

func save_replay_to_file(record_id: int, record_data: Dictionary, file_path: String) -> bool:
    var replay_data = {
        "record_id": record_id,
        "record_data": record_data,
        "frames": _build_replay_frames(record_data),
        "saved_at": Time.get_datetime_string_from_system()
    }
    
    var file = FileAccess.open(file_path, FileAccess.WRITE)
    if file:
        file.store_string(JSON.stringify(replay_data))
        file.close()
        print("回放学已保存到: ", file_path)
        return true
    return false

func load_replay_from_file(file_path: String) -> bool:
    var file = FileAccess.open(file_path, FileAccess.READ)
    if not file:
        return false
    
    var content = file.get_as_text()
    file.close()
    
    var replay_data = JSON.parse_string(content)
    if not replay_data is Dictionary:
        return false
    
    current_record_id = replay_data.get("record_id", 0)
    current_record = replay_data.get("record_data", {})
    replay_frames = replay_data.get("frames", [])
    is_replay_mode = true
    
    return true

func record_fault_trigger(equipment_id: String, fault_type: String, fault_data: Dictionary) -> void:
    record_event(RecordType.FAULT_TRIGGER, {
        "equipment_id": equipment_id,
        "fault_type": fault_type,
        "fault_data": fault_data
    })

func record_operation(step_index: int, operation_id: String, correct: bool, player_id: String) -> void:
    record_event(RecordType.OPERATION, {
        "step_index": step_index,
        "operation_id": operation_id,
        "correct": correct,
        "player_id": player_id
    })

func record_step_complete(step_index: int, step_data: Dictionary, correct: bool, player_id: String) -> void:
    record_event(RecordType.STEP_COMPLETE, {
        "step_index": step_index,
        "step_data": step_data,
        "correct": correct,
        "player_id": player_id
    })

func record_training_start() -> void:
    record_event(RecordType.TRAINING_START, {
        "start_time": Time.get_datetime_string_from_system()
    })

func record_training_end(success: bool, score: int, duration: float) -> void:
    record_event(RecordType.TRAINING_END, {
        "success": success,
        "score": score,
        "duration": duration
    })
    stop_recording()

func record_chain_fault(parent_id: String, child_equip: String, child_fault: String) -> void:
    record_event(RecordType.CHAIN_FAULT, {
        "parent_id": parent_id,
        "child_equipment": child_equip,
        "child_fault": child_fault
    })

func record_scene_start(scene_id: String, scene_data: Dictionary) -> void:
    record_event(RecordType.SCENE_START, {
        "scene_id": scene_id,
        "scene_data": scene_data
    })

func record_scene_end(scene_id: String, success: bool) -> void:
    record_event(RecordType.SCENE_END, {
        "scene_id": scene_id,
        "success": success
    })

func get_available_replays() -> Array:
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager:
        return game_manager.get_training_history(100)
    return []

func can_replay() -> bool:
    return not replay_frames.is_empty()

func is_playing() -> bool:
    return current_state == ReplayState.PLAYING

func is_paused() -> bool:
    return current_state == ReplayState.PAUSED

func toggle_pause() -> void:
    if current_state == ReplayState.PLAYING:
        pause_replay()
    elif current_state == ReplayState.PAUSED:
        resume_replay()

func load_replay_data(events: Array) -> void:
    record_buffer.clear()
    record_buffer = events.duplicate()
    replay_frames = _build_replay_frames({"events": events})
    current_record_id = 0
    current_record = {}
    current_frame_index = 0
    replay_time = 0.0
    current_replay_time = 0.0
    total_replay_time = get_total_duration() / 1000.0
    is_replay_mode = true
    replay_progress.emit(0.0, total_replay_time)

func set_replay_context(score: int, duration: float, success: bool) -> void:
    current_record = {
        "score": score,
        "duration": duration,
        "success": success
    }

func get_current_replay_time() -> float:
    return replay_time

func get_total_replay_time() -> float:
    return get_total_duration()
