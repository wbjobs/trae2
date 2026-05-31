extends Node

signal server_started(port)
signal server_stopped()
signal client_connected(player_id, player_info)
signal client_disconnected(player_id)
signal player_connected(player_id, player_info)
signal player_disconnected(player_id)
signal message_received(player_id, message_type, data)
signal fault_received(equipment_id, fault_type)
signal operation_received(player_id, operation)
signal training_result_received(success, score)
signal connection_error(error_msg)
signal sync_received(data_type, sync_data)
signal reconnecting(attempt)
signal reconnected()
signal reconnect_failed()
signal network_stats_updated(stats)
signal message_dropped(message_type, reason)

var tcp_server: TCPServer = null
var tcp_client: StreamPeerTCP = null
var connected_clients: Dictionary = {}
var is_running: bool = false
var server_port: int = 8080
var server_host: String = "127.0.0.1"
var local_player_id: String = ""
var local_player_name: String = ""
var is_server_mode: bool = false

var message_queue: Array = []
var batch_interval: float = 0.05
var batch_timer: float = 0.0
var max_batch_size: int = 10
var use_compression: bool = true
var use_batching: bool = true

var max_messages_per_second: int = 60
var message_count: int = 0
var second_timer: float = 0.0
var flow_control_enabled: bool = true
var low_priority_delay: float = 0.1

var enable_reconnect: bool = true
var reconnect_attempts: int = 0
var max_reconnect_attempts: int = 5
var reconnect_interval: float = 3.0
var reconnect_timer: float = 0.0
var is_reconnecting: bool = false
var saved_player_id: String = ""
var saved_player_name: String = ""

var network_stats: Dictionary = {
    "bytes_sent": 0,
    "bytes_received": 0,
    "messages_sent": 0,
    "messages_received": 0,
    "compressed_bytes_saved": 0,
    "dropped_messages": 0,
    "latency": 0.0,
    "packet_loss": 0.0
}

var last_ping_time: float = 0.0
var latency: float = 0.0
var enable_latency_measurement: bool = true

var message_priority: Dictionary = {
    "connect": 0,
    "disconnect": 0,
    "fault": 1,
    "training_start": 1,
    "training_result": 1,
    "operation": 2,
    "sync": 2,
    "player_list": 3,
    "heartbeat": 4,
    "chat": 5
}

var pending_server_messages: Dictionary = {}

var buffered_messages: Array = []
var replay_buffer_size: int = 100
var sequence_number: int = 0
var last_acked_sequence: int = -1

const MESSAGE_TYPE := {
    "CONNECT": "connect",
    "DISCONNECT": "disconnect",
    "HEARTBEAT": "heartbeat",
    "FAULT": "fault",
    "OPERATION": "operation",
    "SYNC": "sync",
    "TRAINING_START": "training_start",
    "TRAINING_RESULT": "training_result",
    "CHAT": "chat",
    "PLAYER_LIST": "player_list",
    "BATCH": "batch",
    "PING": "ping",
    "PONG": "pong",
    "STATE_SYNC": "state_sync",
    "RECONNECT": "reconnect",
    "ACK": "ack"
}

const PRIORITY_CRITICAL := 0
const PRIORITY_HIGH := 1
const PRIORITY_NORMAL := 2
const PRIORITY_LOW := 3
const PRIORITY_BACKGROUND := 4
const PRIORITY_CHAT := 5

func _ready():
    _init_network()

func _init_network():
    tcp_server = TCPServer.new()
    tcp_client = StreamPeerTCP.new()

func _process(delta):
    _update_flow_control(delta)
    _process_batching(delta)
    _update_reconnect(delta)
    _update_ping(delta)
    
    if is_server_mode:
        _process_server(delta)
    else:
        _process_client(delta)
    
    if int(Time.get_ticks_msec()) % 1000 < 20:
        network_stats_updated.emit(network_stats.duplicate())

func start_server(port: int = 8080) -> bool:
    server_port = port
    is_server_mode = true
    is_running = true
    local_player_id = "server_" + str(Time.get_unix_time_from_system())
    local_player_name = "主机"
    
    if tcp_server.listen(port) == OK:
        print("服务器启动，端口: ", port)
        server_started.emit(port)
        return true
    else:
        connection_error.emit("无法启动服务器，端口可能被占用")
        is_running = false
        is_server_mode = false
        return false

func stop_server():
    for peer_id in connected_clients.keys():
        var peer = connected_clients[peer_id]["stream"]
        if peer:
            peer.disconnect_from_host()
    
    connected_clients.clear()
    tcp_server.stop()
    is_running = false
    is_server_mode = false
    server_stopped.emit()

func connect_to_server(host: String, port: int, player_id: String, player_name: String) -> bool:
    server_host = host
    server_port = port
    local_player_id = player_id
    local_player_name = player_name
    saved_player_id = player_id
    saved_player_name = player_name
    is_server_mode = false
    is_running = true
    is_reconnecting = false
    reconnect_attempts = 0
    
    var status = tcp_client.connect_to_host(host, port)
    if status == OK:
        while tcp_client.get_status() == StreamPeerTCP.STATUS_CONNECTING:
            OS.delay_msec(10)
        
        if tcp_client.get_status() == StreamPeerTCP.STATUS_CONNECTED:
            print("已连接到服务器: ", host, ":", port)
            var connect_msg = _create_message(MESSAGE_TYPE["CONNECT"], {
                "player_id": player_id,
                "player_name": player_name
            })
            _send_to_client(tcp_client, connect_msg)
            client_connected.emit(player_id, {"name": player_name})
            return true
        else:
            connection_error.emit("无法连接到服务器")
            is_running = false
            return false
    else:
        connection_error.emit("连接失败")
        is_running = false
        return false

func disconnect():
    if is_server_mode:
        stop_server()
    else:
        if tcp_client and tcp_client.get_status() == StreamPeerTCP.STATUS_CONNECTED:
            var disconnect_msg = _create_message(MESSAGE_TYPE["DISCONNECT"], {
                "player_id": local_player_id
            })
            _send_to_client(tcp_client, disconnect_msg)
            tcp_client.disconnect_from_host()
        is_running = false
        client_disconnected.emit(local_player_id)

func _process_server(delta):
    if not is_running:
        return
    
    if tcp_server.is_connection_available():
        var new_peer = tcp_server.take_connection()
        if new_peer:
            _handle_new_connection(new_peer)
    
    _process_clients_data()

func _process_client(delta):
    if not is_running or not tcp_client:
        return
    
    if tcp_client.get_status() == StreamPeerTCP.STATUS_CONNECTED:
        if tcp_client.get_available_bytes() > 0:
            var data = tcp_client.get_utf8_string(tcp_client.get_available_bytes())
            if data:
                _process_message("", data)
    elif tcp_client.get_status() != StreamPeerTCP.STATUS_CONNECTING:
        connection_error.emit("与服务器断开连接")
        is_running = false

func _handle_new_connection(peer: StreamPeerTCP):
    var temp_id = "client_" + str(Time.get_ticks_msec())
    connected_clients[temp_id] = {
        "stream": peer,
        "player_id": "",
        "player_name": "",
        "last_heartbeat": Time.get_ticks_msec(),
        "latency": 0.0,
        "connected_time": Time.get_ticks_msec(),
        "message_count": 0
    }
    print("新客户端连接: ", temp_id)

func _process_clients_data():
    var to_remove = []
    
    for temp_id in connected_clients.keys():
        var client_info = connected_clients[temp_id]
        var peer = client_info["stream"]
        
        if peer.get_status() != StreamPeerTCP.STATUS_CONNECTED:
            to_remove.append(temp_id)
            continue
        
        if peer.get_available_bytes() > 0:
            var data = peer.get_utf8_string(peer.get_available_bytes())
            if data:
                _process_message(temp_id, data)
    
    for temp_id in to_remove:
        _remove_client(temp_id)

func _process_message(sender_id: String, raw_data: String):
    var messages = raw_data.split("\n", false)
    for msg_str in messages:
        if msg_str.is_empty():
            continue
        
        var json = JSON.parse_string(msg_str)
        if not json is Dictionary:
            continue
        
        var msg_type = json.get("type", "")
        var data = json.get("data", {})
        var seq = json.get("sequence", -1)
        
        network_stats["bytes_received"] += msg_str.length()
        network_stats["messages_received"] += 1
        
        if seq > last_acked_sequence and is_server_mode:
            var ack_msg = _create_message(MESSAGE_TYPE["ACK"], {"sequence": seq})
            if sender_id in connected_clients:
                _send_to_client(connected_clients[sender_id]["stream"], ack_msg)
        
        _process_single_message(sender_id, msg_type, data)

func _handle_connect(temp_id: String, data: Dictionary):
    var player_id = data.get("player_id", "")
    var player_name = data.get("player_name", "未知")
    
    if temp_id in connected_clients:
        connected_clients[temp_id]["player_id"] = player_id
        connected_clients[temp_id]["player_name"] = player_name
        
        var player_info = {"id": player_id, "name": player_name}
        player_connected.emit(player_id, player_info)
        
        _broadcast_player_list()
        _send_to_client(connected_clients[temp_id]["stream"], 
            _create_message(MESSAGE_TYPE["PLAYER_LIST"], _get_player_list_data()))

func _handle_disconnect(temp_id: String, data: Dictionary):
    var player_id = data.get("player_id", "")
    _remove_client(temp_id)
    if not player_id.is_empty():
        player_disconnected.emit(player_id)
    _broadcast_player_list()

func _handle_heartbeat(temp_id: String, data: Dictionary):
    if temp_id in connected_clients:
        connected_clients[temp_id]["last_heartbeat"] = Time.get_ticks_msec()

func _handle_fault(data: Dictionary):
    var equipment_id = data.get("equipment_id", "")
    var fault_type = data.get("fault_type", "")
    fault_received.emit(equipment_id, fault_type)

func _handle_operation(sender_id: String, data: Dictionary):
    var player_id = data.get("player_id", sender_id)
    var operation = data.get("operation", {})
    operation_received.emit(player_id, operation)
    
    if is_server_mode:
        _broadcast(_create_message(MESSAGE_TYPE["OPERATION"], data), sender_id)

func _handle_sync(data: Dictionary):
    var data_type = data.get("sync_type", "")
    var sync_data = data.get("data", {})
    sync_received.emit(data_type, sync_data)

func _handle_training_start(data: Dictionary):
    print("收到训练开始指令")

func _handle_training_result(data: Dictionary):
    var success = data.get("success", false)
    var score = data.get("score", 0)
    training_result_received.emit(success, score)

func _handle_chat(sender_id: String, data: Dictionary):
    if is_server_mode:
        _broadcast(_create_message(MESSAGE_TYPE["CHAT"], data), sender_id)

func _remove_client(temp_id: String):
    if temp_id in connected_clients:
        var client_info = connected_clients[temp_id]
        var peer = client_info["stream"]
        if peer:
            peer.disconnect_from_host()
        connected_clients.erase(temp_id)

func _get_player_list_data() -> Dictionary:
    var players = []
    players.append({
        "id": local_player_id,
        "name": local_player_name,
        "is_host": true
    })
    
    for temp_id in connected_clients.keys():
        var client = connected_clients[temp_id]
        if not client["player_id"].is_empty():
            players.append({
                "id": client["player_id"],
                "name": client["player_name"],
                "is_host": false
            })
    
    return {"players": players}

func _broadcast_player_list():
    _broadcast(_create_message(MESSAGE_TYPE["PLAYER_LIST"], _get_player_list_data()), "")

func broadcast_fault(equipment_id: String, fault_type: String):
    var msg = _create_message(MESSAGE_TYPE["FAULT"], {
        "equipment_id": equipment_id,
        "fault_type": fault_type
    })
    _broadcast(msg, "")

func broadcast_operation(player_id: String, operation: Dictionary):
    var msg = _create_message(MESSAGE_TYPE["OPERATION"], {
        "player_id": player_id,
        "operation": operation
    })
    if is_server_mode:
        _broadcast(msg, "")
    else:
        _send_to_client(tcp_client, msg)

func broadcast_training_result(success: bool, score: int):
    var msg = _create_message(MESSAGE_TYPE["TRAINING_RESULT"], {
        "success": success,
        "score": score
    })
    _broadcast(msg, "")

func broadcast_sync(sync_type: String, data: Dictionary):
    var msg = _create_message(MESSAGE_TYPE["SYNC"], {
        "sync_type": sync_type,
        "data": data
    })
    if is_server_mode:
        _broadcast(msg, "")
    else:
        _send_to_client(tcp_client, msg)

func send_training_start():
    var msg = _create_message(MESSAGE_TYPE["TRAINING_START"], {
        "timestamp": Time.get_ticks_msec()
    })
    _broadcast(msg, "")

func _create_message(msg_type: String, data: Dictionary) -> String:
    var message = {
        "type": msg_type,
        "data": data,
        "timestamp": Time.get_ticks_msec()
    }
    return JSON.stringify(message) + "\n"

func _broadcast(message: String, exclude_id: String = ""):
    for temp_id in connected_clients.keys():
        if temp_id == exclude_id:
            continue
        var client_info = connected_clients[temp_id]
        var peer = client_info["stream"]
        if peer and peer.get_status() == StreamPeerTCP.STATUS_CONNECTED:
            _send_to_client(peer, message)

func _send_to_client(peer: StreamPeerTCP, message: String):
    if peer and peer.get_status() == StreamPeerTCP.STATUS_CONNECTED:
        peer.put_data(message.to_utf8())

func get_connected_players() -> Array:
    var players = []
    players.append({
        "id": local_player_id,
        "name": local_player_name,
        "is_host": true
    })
    
    for temp_id in connected_clients.keys():
        var client = connected_clients[temp_id]
        if not client["player_id"].is_empty():
            players.append({
                "id": client["player_id"],
                "name": client["player_name"],
                "is_host": false
            })
    
    return players

func is_connected() -> bool:
    if is_server_mode:
        return is_running
    else:
        return tcp_client and tcp_client.get_status() == StreamPeerTCP.STATUS_CONNECTED

func _update_flow_control(delta: float) -> void:
    if not flow_control_enabled:
        return
    
    second_timer += delta
    if second_timer >= 1.0:
        second_timer = 0.0
        message_count = 0

func _check_flow_control(msg_type: String) -> bool:
    if not flow_control_enabled:
        return true
    
    var priority = message_priority.get(msg_type, PRIORITY_NORMAL)
    
    if priority <= PRIORITY_HIGH:
        return true
    
    if message_count >= max_messages_per_second:
        message_dropped.emit(msg_type, "flow_control")
        network_stats["dropped_messages"] += 1
        return false
    
    message_count += 1
    return true

func _process_batching(delta: float) -> void:
    if not use_batching or message_queue.is_empty():
        return
    
    batch_timer += delta
    if batch_timer >= batch_interval or message_queue.size() >= max_batch_size:
        batch_timer = 0.0
        _flush_message_queue()

func _queue_message(msg_type: String, data: Dictionary, exclude_id: String = "") -> void:
    if not _check_flow_control(msg_type):
        return
    
    var priority = message_priority.get(msg_type, PRIORITY_NORMAL)
    
    var message = {
        "type": msg_type,
        "data": data,
        "timestamp": Time.get_ticks_msec(),
        "priority": priority,
        "exclude_id": exclude_id
    }
    
    var insert_pos = 0
    for i in range(message_queue.size()):
        if message_queue[i]["priority"] > priority:
            insert_pos = i
            break
        insert_pos = i + 1
    
    message_queue.insert(insert_pos, message)

func _flush_message_queue() -> void:
    if message_queue.is_empty():
        return
    
    if message_queue.size() == 1:
        var msg = message_queue[0]
        var message_str = _create_message(msg["type"], msg["data"])
        if is_server_mode:
            _broadcast(message_str, msg.get("exclude_id", ""))
        else:
            _send_to_client(tcp_client, message_str)
    else:
        var batch = []
        for msg in message_queue:
            batch.append({
                "type": msg["type"],
                "data": msg["data"]
            })
        
        var batch_message = _create_message(MESSAGE_TYPE["BATCH"], {"messages": batch})
        if is_server_mode:
            _broadcast(batch_message, "")
        else:
            _send_to_client(tcp_client, batch_message)
    
    message_queue.clear()

func _compress_data(data: String) -> PackedByteArray:
    var bytes = data.to_utf8()
    if use_compression and bytes.size() > 100:
        var compressed = bytes.compress()
        network_stats["compressed_bytes_saved"] += bytes.size() - compressed.size()
        return compressed
    return bytes

func _decompress_data(bytes: PackedByteArray) -> String:
    if use_compression and bytes.size() > 0:
        var decompressed = bytes.decompress()
        if decompressed.size() > 0:
            return decompressed.get_string_from_utf8()
    return bytes.get_string_from_utf8()

func _update_reconnect(delta: float) -> void:
    if is_server_mode or not enable_reconnect or is_reconnecting:
        return
    
    if tcp_client and tcp_client.get_status() == StreamPeerTCP.STATUS_CONNECTED:
        reconnect_attempts = 0
        return
    
    if tcp_client and tcp_client.get_status() != StreamPeerTCP.STATUS_CONNECTED and is_running:
        reconnect_timer += delta
        if reconnect_timer >= reconnect_interval:
            reconnect_timer = 0.0
            reconnect_attempts += 1
            
            if reconnect_attempts > max_reconnect_attempts:
                is_reconnecting = false
                reconnect_failed.emit()
                connection_error.emit("重连失败，已达到最大重试次数")
                return
            
            is_reconnecting = true
            reconnecting.emit(reconnect_attempts)
            
            var new_client = StreamPeerTCP.new()
            var status = new_client.connect_to_host(server_host, server_port)
            
            if status == OK:
                var wait_time = 0.0
                while new_client.get_status() == StreamPeerTCP.STATUS_CONNECTING and wait_time < 5.0:
                    OS.delay_msec(50)
                    wait_time += 0.05
                
                if new_client.get_status() == StreamPeerTCP.STATUS_CONNECTED:
                    tcp_client = new_client
                    
                    var reconnect_msg = _create_message(MESSAGE_TYPE["RECONNECT"], {
                        "player_id": saved_player_id,
                        "player_name": saved_player_name,
                        "last_sequence": last_acked_sequence,
                        "attempt": reconnect_attempts
                    })
                    _send_to_client(tcp_client, reconnect_msg)
                    
                    is_reconnecting = false
                    reconnect_attempts = 0
                    reconnected.emit()
                    print("重连成功，第 ", reconnect_attempts, " 次尝试")
                else:
                    is_reconnecting = false
            else:
                is_reconnecting = false

func _update_ping(delta: float) -> void:
    if not enable_latency_measurement or not is_running:
        return
    
    last_ping_time += delta
    if last_ping_time >= 5.0:
        last_ping_time = 0.0
        var ping_msg = _create_message(MESSAGE_TYPE["PING"], {
            "timestamp": Time.get_ticks_msec()
        })
        if is_server_mode:
            _broadcast(ping_msg, "")
        else:
            _send_to_client(tcp_client, ping_msg)

func _handle_ping(sender_id: String, data: Dictionary) -> void:
    var pong_msg = _create_message(MESSAGE_TYPE["PONG"], {
        "timestamp": data.get("timestamp", 0),
        "server_time": Time.get_ticks_msec()
    })
    
    if is_server_mode:
        if sender_id in connected_clients:
            var peer = connected_clients[sender_id]["stream"]
            _send_to_client(peer, pong_msg)
    else:
        _send_to_client(tcp_client, pong_msg)

func _handle_pong(sender_id: String, data: Dictionary) -> void:
    var sent_time = data.get("timestamp", 0)
    var current_time = Time.get_ticks_msec()
    latency = (current_time - sent_time) / 2.0
    network_stats["latency"] = latency
    
    if sender_id in connected_clients:
        connected_clients[sender_id]["latency"] = latency

func _handle_batch(sender_id: String, data: Dictionary) -> void:
    var messages = data.get("messages", [])
    for msg in messages:
        var msg_type = msg.get("type", "")
        var msg_data = msg.get("data", {})
        _process_single_message(sender_id, msg_type, msg_data)

func _handle_reconnect(sender_id: String, data: Dictionary) -> void:
    var player_id = data.get("player_id", "")
    var player_name = data.get("player_name", "")
    var last_seq = data.get("last_sequence", -1)
    
    for temp_id in connected_clients.keys():
        if connected_clients[temp_id]["player_id"] == player_id:
            connected_clients[temp_id]["stream"] = connected_clients[sender_id]["stream"]
            connected_clients.erase(sender_id)
            
            var state_sync = {
                "active_faults": {},
                "emergency_state": {}
            }
            
            var game_manager = get_tree().root.get_node_or_null("GameManager")
            if game_manager:
                state_sync["active_faults"] = game_manager.fault_manager.get_active_faults()
                var progress = game_manager.emergency_manager.get_procedure_progress()
                state_sync["emergency_state"] = progress
            
            var sync_msg = _create_message(MESSAGE_TYPE["STATE_SYNC"], state_sync)
            _send_to_client(connected_clients[temp_id]["stream"], sync_msg)
            
            player_connected.emit(player_id, {"name": player_name})
            _broadcast_player_list()
            
            print("玩家重连成功: ", player_name)
            return

func _handle_state_sync(sender_id: String, data: Dictionary) -> void:
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if not game_manager:
        return
    
    var active_faults = data.get("active_faults", {})
    for equip_id in active_faults.keys():
        if not game_manager.fault_manager.has_active_fault(equip_id):
            var fault_data = active_faults[equip_id]
            game_manager.fault_manager.active_faults[equip_id] = fault_data
    
    var emergency_state = data.get("emergency_state", {})
    if not emergency_state.is_empty() and not game_manager.emergency_manager.is_procedure_active:
        var progress = emergency_state
        var step_idx = progress.get("current_step", 0)
        var score = progress.get("score", 0)
        var mistakes = progress.get("mistakes", 0)
        game_manager.emergency_manager.current_step_index = step_idx
        game_manager.emergency_manager.total_score = score
        game_manager.emergency_manager.mistake_count = mistakes
    
    print("收到状态同步，已恢复游戏状态")

func _process_single_message(sender_id: String, msg_type: String, data: Dictionary) -> void:
    match msg_type:
        MESSAGE_TYPE["CONNECT"]:
            _handle_connect(sender_id, data)
        MESSAGE_TYPE["DISCONNECT"]:
            _handle_disconnect(sender_id, data)
        MESSAGE_TYPE["HEARTBEAT"]:
            _handle_heartbeat(sender_id, data)
        MESSAGE_TYPE["FAULT"]:
            _handle_fault(data)
        MESSAGE_TYPE["OPERATION"]:
            _handle_operation(sender_id, data)
        MESSAGE_TYPE["SYNC"]:
            _handle_sync(data)
        MESSAGE_TYPE["TRAINING_START"]:
            _handle_training_start(data)
        MESSAGE_TYPE["TRAINING_RESULT"]:
            _handle_training_result(data)
        MESSAGE_TYPE["CHAT"]:
            _handle_chat(sender_id, data)
        MESSAGE_TYPE["PING"]:
            _handle_ping(sender_id, data)
        MESSAGE_TYPE["PONG"]:
            _handle_pong(sender_id, data)
        MESSAGE_TYPE["BATCH"]:
            _handle_batch(sender_id, data)
        MESSAGE_TYPE["RECONNECT"]:
            _handle_reconnect(sender_id, data)
        MESSAGE_TYPE["STATE_SYNC"]:
            _handle_state_sync(sender_id, data)
        MESSAGE_TYPE["ACK"]:
            last_acked_sequence = data.get("sequence", last_acked_sequence)
    
    message_received.emit(sender_id, msg_type, data)

func _send_to_client(peer: StreamPeerTCP, message: String):
    if peer and peer.get_status() == StreamPeerTCP.STATUS_CONNECTED:
        var data = message.to_utf8()
        network_stats["bytes_sent"] += data.size()
        network_stats["messages_sent"] += 1
        peer.put_data(data)

func _create_message(msg_type: String, data: Dictionary) -> String:
    sequence_number += 1
    var message = {
        "type": msg_type,
        "data": data,
        "timestamp": Time.get_ticks_msec(),
        "sequence": sequence_number
    }
    
    buffered_messages.append(message.duplicate())
    if buffered_messages.size() > replay_buffer_size:
        buffered_messages.remove_at(0)
    
    return JSON.stringify(message) + "\n"

func broadcast_queued(msg_type: String, data: Dictionary) -> void:
    _queue_message(msg_type, data, "")

func send_queued(msg_type: String, data: Dictionary) -> void:
    _queue_message(msg_type, data, "")

func set_network_parameters(params: Dictionary) -> void:
    if params.has("use_compression"):
        use_compression = params["use_compression"]
    if params.has("use_batching"):
        use_batching = params["use_batching"]
    if params.has("batch_interval"):
        batch_interval = params["batch_interval"]
    if params.has("max_batch_size"):
        max_batch_size = params["max_batch_size"]
    if params.has("flow_control_enabled"):
        flow_control_enabled = params["flow_control_enabled"]
    if params.has("max_messages_per_second"):
        max_messages_per_second = params["max_messages_per_second"]
    if params.has("enable_reconnect"):
        enable_reconnect = params["enable_reconnect"]
    if params.has("max_reconnect_attempts"):
        max_reconnect_attempts = params["max_reconnect_attempts"]
    if params.has("reconnect_interval"):
        reconnect_interval = params["reconnect_interval"]

func get_network_stats() -> Dictionary:
    return network_stats.duplicate()

func reset_network_stats() -> void:
    network_stats = {
        "bytes_sent": 0,
        "bytes_received": 0,
        "messages_sent": 0,
        "messages_received": 0,
        "compressed_bytes_saved": 0,
        "dropped_messages": 0,
        "latency": latency,
        "packet_loss": 0.0
    }

func get_latency() -> float:
    return latency

func get_network_quality() -> String:
    if latency < 50:
        return "excellent"
    elif latency < 100:
        return "good"
    elif latency < 200:
        return "fair"
    elif latency < 400:
        return "poor"
    else:
        return "bad"
