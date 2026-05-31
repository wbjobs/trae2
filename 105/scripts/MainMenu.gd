extends Control

var main_panel: PanelContainer = null
var singleplayer_panel: PanelContainer = null
var multiplayer_panel: PanelContainer = null
var history_panel: PanelContainer = null
var connect_dialog: Window = null

var player_name_input: LineEdit = null
var host_input: LineEdit = null
var port_input: LineEdit = null
var server_port_input: LineEdit = null
var status_label: Label = null

func _ready():
    _create_ui()
    _connect_signals()

func _create_ui():
    var bg = ColorRect.new()
    bg.color = Color(0.08, 0.08, 0.12)
    bg.anchor_right = 1
    bg.anchor_bottom = 1
    add_child(bg)
    
    var title = Label.new()
    title.text = "矿山井下设备应急处置实训系统"
    title.add_theme_font_size_override("font_size", 48)
    title.add_theme_color_override("font_color", Color(0.9, 0.85, 0.2))
    title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    title.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
    title.offset_top = 50
    add_child(title)
    
    var subtitle = Label.new()
    subtitle.text = "Mining Emergency Response Training System"
    subtitle.add_theme_font_size_override("font_size", 18)
    subtitle.add_theme_color_override("font_color", Color(0.6, 0.6, 0.7))
    subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    subtitle.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
    subtitle.offset_top = 110
    add_child(subtitle)
    
    _create_main_panel()
    _create_singleplayer_panel()
    _create_multiplayer_panel()
    _create_history_panel()
    
    main_panel.visible = true
    singleplayer_panel.visible = false
    multiplayer_panel.visible = false
    history_panel.visible = false

func _create_main_panel():
    main_panel = PanelContainer.new()
    main_panel.name = "MainPanel"
    main_panel.custom_minimum_size = Vector2(500, 400)
    add_child(main_panel)
    
    var vb = VBoxContainer.new()
    main_panel.add_child(vb)
    
    var name_hb = HBoxContainer.new()
    vb.add_child(name_hb)
    
    var name_label = Label.new()
    name_label.text = "学员姓名:"
    name_label.custom_minimum_size = Vector2(100, 0)
    name_hb.add_child(name_label)
    
    player_name_input = LineEdit.new()
    player_name_input.placeholder_text = "请输入您的姓名"
    player_name_input.text = "学员" + str(randi() % 1000)
    name_hb.add_child(player_name_input)
    
    vb.add_spacer()
    
    var single_btn = Button.new()
    single_btn.text = "单人实训模式"
    single_btn.custom_minimum_size = Vector2(0, 60)
    single_btn.add_theme_font_size_override("font_size", 20)
    single_btn.pressed.connect(_show_singleplayer_panel)
    vb.add_child(single_btn)
    
    vb.add_spacer()
    
    var host_btn = Button.new()
    host_btn.text = "创建联机房间 (主机)"
    host_btn.custom_minimum_size = Vector2(0, 60)
    host_btn.add_theme_font_size_override("font_size", 20)
    host_btn.pressed.connect(_show_multiplayer_panel.bind(true))
    vb.add_child(host_btn)
    
    vb.add_spacer()
    
    var join_btn = Button.new()
    join_btn.text = "加入联机房间"
    join_btn.custom_minimum_size = Vector2(0, 60)
    join_btn.add_theme_font_size_override("font_size", 20)
    join_btn.pressed.connect(_show_multiplayer_panel.bind(false))
    vb.add_child(join_btn)
    
    vb.add_spacer()
    
    var history_btn = Button.new()
    history_btn.text = "查看实训记录"
    history_btn.custom_minimum_size = Vector2(0, 50)
    history_btn.add_theme_font_size_override("font_size", 16)
    history_btn.pressed.connect(_show_history_panel)
    vb.add_child(history_btn)
    
    vb.add_spacer()
    
    var quit_btn = Button.new()
    quit_btn.text = "退出系统"
    quit_btn.custom_minimum_size = Vector2(0, 50)
    quit_btn.add_theme_font_size_override("font_size", 16)
    quit_btn.pressed.connect(_on_quit_pressed)
    vb.add_child(quit_btn)
    
    status_label = Label.new()
    status_label.text = ""
    status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    status_label.add_theme_color_override("font_color", Color(0.8, 0.8, 0.8))
    vb.add_child(status_label)
    
    main_panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)

func _create_singleplayer_panel():
    singleplayer_panel = PanelContainer.new()
    singleplayer_panel.name = "SingleplayerPanel"
    singleplayer_panel.custom_minimum_size = Vector2(600, 500)
    add_child(singleplayer_panel)
    
    var vb = VBoxContainer.new()
    singleplayer_panel.add_child(vb)
    
    var title = Label.new()
    title.text = "单人实训模式"
    title.add_theme_font_size_override("font_size", 28)
    title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    title.add_theme_color_override("font_color", Color(0.9, 0.85, 0.2))
    vb.add_child(title)
    
    vb.add_spacer()
    
    var desc = Label.new()
    desc.text = "在单人模式下，您将独立完成设备故障的应急处置训练。\n系统会随机触发设备故障，您需要按照正确的流程进行处置。"
    desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    vb.add_child(desc)
    
    vb.add_spacer()
    
    var difficulty_label = Label.new()
    difficulty_label.text = "训练难度设置:"
    difficulty_label.add_theme_font_size_override("font_size", 16)
    vb.add_child(difficulty_label)
    
    var difficulty_hb = HBoxContainer.new()
    vb.add_child(difficulty_hb)
    
    var easy_btn = Button.new()
    easy_btn.text = "简单"
    easy_btn.pressed.connect(_set_difficulty.bind("easy"))
    difficulty_hb.add_child(easy_btn)
    
    var normal_btn = Button.new()
    normal_btn.text = "普通"
    normal_btn.pressed.connect(_set_difficulty.bind("normal"))
    difficulty_hb.add_child(normal_btn)
    
    var hard_btn = Button.new()
    hard_btn.text = "困难"
    hard_btn.pressed.connect(_set_difficulty.bind("hard"))
    difficulty_hb.add_child(hard_btn)
    
    vb.add_spacer()
    
    var start_btn = Button.new()
    start_btn.text = "开始训练"
    start_btn.custom_minimum_size = Vector2(0, 60)
    start_btn.add_theme_font_size_override("font_size", 22)
    start_btn.pressed.connect(_start_single_player)
    vb.add_child(start_btn)
    
    vb.add_spacer()
    
    var back_btn = Button.new()
    back_btn.text = "返回主菜单"
    back_btn.custom_minimum_size = Vector2(0, 50)
    back_btn.pressed.connect(_show_main_panel)
    vb.add_child(back_btn)
    
    singleplayer_panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)

func _create_multiplayer_panel():
    multiplayer_panel = PanelContainer.new()
    multiplayer_panel.name = "MultiplayerPanel"
    multiplayer_panel.custom_minimum_size = Vector2(600, 500)
    add_child(multiplayer_panel)
    
    var vb = VBoxContainer.new()
    multiplayer_panel.add_child(vb)
    
    var title = Label.new()
    title.name = "MultiplayerTitle"
    title.text = "多人联机模式"
    title.add_theme_font_size_override("font_size", 28)
    title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    title.add_theme_color_override("font_color", Color(0.9, 0.85, 0.2))
    vb.add_child(title)
    
    var desc = Label.new()
    desc.name = "MultiplayerDesc"
    desc.text = "在多人模式下，您可以与其他学员协同完成应急处置训练。\n请选择创建房间或加入现有房间。"
    desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    vb.add_child(desc)
    
    vb.add_spacer()
    
    var config_vb = VBoxContainer.new()
    config_vb.name = "ConfigContainer"
    vb.add_child(config_vb)
    
    var port_hb = HBoxContainer.new()
    port_hb.name = "PortHB"
    config_vb.add_child(port_hb)
    
    var port_label = Label.new()
    port_label.text = "端口号:"
    port_label.custom_minimum_size = Vector2(100, 0)
    port_hb.add_child(port_label)
    
    server_port_input = LineEdit.new()
    server_port_input.placeholder_text = "8080"
    server_port_input.text = "8080"
    port_hb.add_child(server_port_input)
    
    var host_hb = HBoxContainer.new()
    host_hb.name = "HostHB"
    config_vb.add_child(host_hb)
    
    var host_label = Label.new()
    host_label.text = "主机地址:"
    host_label.custom_minimum_size = Vector2(100, 0)
    host_hb.add_child(host_label)
    
    host_input = LineEdit.new()
    host_input.placeholder_text = "127.0.0.1"
    host_input.text = "127.0.0.1"
    host_hb.add_child(host_input)
    
    vb.add_spacer()
    
    var start_btn = Button.new()
    start_btn.name = "StartMultiBtn"
    start_btn.text = "开始"
    start_btn.custom_minimum_size = Vector2(0, 60)
    start_btn.add_theme_font_size_override("font_size", 22)
    vb.add_child(start_btn)
    
    vb.add_spacer()
    
    var conn_status = Label.new()
    conn_status.name = "ConnectionStatus"
    conn_status.text = ""
    conn_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    vb.add_child(conn_status)
    
    vb.add_spacer()
    
    var back_btn = Button.new()
    back_btn.text = "返回主菜单"
    back_btn.custom_minimum_size = Vector2(0, 50)
    back_btn.pressed.connect(_show_main_panel)
    vb.add_child(back_btn)
    
    multiplayer_panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)

func _create_history_panel():
    history_panel = PanelContainer.new()
    history_panel.name = "HistoryPanel"
    history_panel.custom_minimum_size = Vector2(800, 700)
    add_child(history_panel)
    
    var vb = VBoxContainer.new()
    history_panel.add_child(vb)
    
    var title = Label.new()
    title.text = "实训记录"
    title.add_theme_font_size_override("font_size", 28)
    title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    vb.add_child(title)
    
    var stats_label = Label.new()
    stats_label.name = "StatsLabel"
    stats_label.text = "当前记录数: 0"
    stats_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    stats_label.add_theme_color_override("font_color", Color(0.7, 0.7, 0.7))
    vb.add_child(stats_label)
    
    var scroll = ScrollContainer.new()
    scroll.custom_minimum_size = Vector2(0, 350)
    vb.add_child(scroll)
    
    var records_vb = VBoxContainer.new()
    records_vb.name = "RecordsContainer"
    scroll.add_child(records_vb)
    
    var clean_label = Label.new()
    clean_label.text = "数据库清理:"
    clean_label.add_theme_font_size_override("font_size", 14)
    vb.add_child(clean_label)
    
    var clean_hb = HBoxContainer.new()
    vb.add_child(clean_hb)
    
    var clean_30_btn = Button.new()
    clean_30_btn.text = "清理30天前"
    clean_30_btn.pressed.connect(_clean_30_days)
    clean_hb.add_child(clean_30_btn)
    
    var clean_7_btn = Button.new()
    clean_7_btn.text = "清理7天前"
    clean_7_btn.pressed.connect(_clean_7_days)
    clean_hb.add_child(clean_7_btn)
    
    var keep_100_btn = Button.new()
    keep_100_btn.text = "保留最近100条"
    keep_100_btn.pressed.connect(_keep_100_records)
    clean_hb.add_child(keep_100_btn)
    
    var delete_all_btn = Button.new()
    delete_all_btn.text = "清空所有记录"
    delete_all_btn.pressed.connect(_delete_all_records)
    delete_all_btn.add_theme_color_override("font_color", Color(1, 0.3, 0.3))
    clean_hb.add_child(delete_all_btn)
    
    var clean_status = Label.new()
    clean_status.name = "CleanStatus"
    clean_status.text = ""
    clean_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    vb.add_child(clean_status)
    
    var btn_hb = HBoxContainer.new()
    vb.add_child(btn_hb)
    
    var refresh_btn = Button.new()
    refresh_btn.text = "刷新记录"
    refresh_btn.pressed.connect(_refresh_history)
    btn_hb.add_child(refresh_btn)
    
    var back_btn = Button.new()
    back_btn.text = "返回主菜单"
    back_btn.custom_minimum_size = Vector2(0, 50)
    back_btn.pressed.connect(_show_main_panel)
    btn_hb.add_child(back_btn)
    
    history_panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)

func _connect_signals():
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager:
        game_manager.game_state_changed.connect(_on_game_state_changed)
        game_manager.network_manager.connection_error.connect(_on_connection_error)
        game_manager.network_manager.server_started.connect(_on_server_started)
        game_manager.network_manager.client_connected.connect(_on_client_connected)

func _show_main_panel():
    main_panel.visible = true
    singleplayer_panel.visible = false
    multiplayer_panel.visible = false
    history_panel.visible = false
    status_label.text = ""

func _show_singleplayer_panel():
    if player_name_input.text.strip_edges().is_empty():
        status_label.text = "请输入学员姓名！"
        status_label.add_theme_color_override("font_color", Color(1, 0.3, 0.3))
        return
    
    main_panel.visible = false
    singleplayer_panel.visible = true
    multiplayer_panel.visible = false
    history_panel.visible = false

func _show_multiplayer_panel(is_host: bool):
    if player_name_input.text.strip_edges().is_empty():
        status_label.text = "请输入学员姓名！"
        status_label.add_theme_color_override("font_color", Color(1, 0.3, 0.3))
        return
    
    main_panel.visible = false
    singleplayer_panel.visible = false
    multiplayer_panel.visible = true
    history_panel.visible = false
    
    var title = multiplayer_panel.get_node("MultiplayerTitle")
    var desc = multiplayer_panel.get_node("MultiplayerDesc")
    var host_hb = multiplayer_panel.get_node("ConfigContainer/HostHB")
    var start_btn = multiplayer_panel.get_node("StartMultiBtn")
    
    for child in start_btn.get_signal_connection_list("pressed"):
        start_btn.pressed.disconnect(Callable(start_btn, child.method))
    
    if is_host:
        title.text = "创建联机房间"
        desc.text = "作为主机创建房间，其他学员可以加入您的房间进行协同训练。\n您将负责控制训练流程。"
        host_hb.visible = false
        start_btn.text = "创建房间并开始"
        start_btn.pressed.connect(_start_multiplayer_host)
    else:
        title.text = "加入联机房间"
        desc.text = "输入主机地址和端口号，加入已有的训练房间。\n与主机和其他学员协同完成应急处置。"
        host_hb.visible = true
        start_btn.text = "连接并加入"
        start_btn.pressed.connect(_start_multiplayer_client)

func _show_history_panel():
    main_panel.visible = false
    singleplayer_panel.visible = false
    multiplayer_panel.visible = false
    history_panel.visible = true
    _refresh_history()

func _set_difficulty(difficulty: String):
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager:
        match difficulty:
            "easy":
                game_manager.fault_manager.set_simulation_parameters({
                    "min_interval": 20,
                    "max_interval": 40,
                    "max_active_faults": 1,
                    "fault_probability": 0.5
                })
            "normal":
                game_manager.fault_manager.set_simulation_parameters({
                    "min_interval": 10,
                    "max_interval": 30,
                    "max_active_faults": 2,
                    "fault_probability": 0.7
                })
            "hard":
                game_manager.fault_manager.set_simulation_parameters({
                    "min_interval": 5,
                    "max_interval": 15,
                    "max_active_faults": 3,
                    "fault_probability": 0.9
                })

func _start_single_player():
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager:
        game_manager.player_name = player_name_input.text.strip_edges()
        game_manager.current_player_id = str(Time.get_unix_time_from_system())
        game_manager.start_single_player()

func _start_multiplayer_host():
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager:
        game_manager.player_name = player_name_input.text.strip_edges()
        var port = int(server_port_input.text.strip_edges())
        if port == 0:
            port = 8080
        game_manager.start_multiplayer_server(port)

func _start_multiplayer_client():
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager:
        game_manager.player_name = player_name_input.text.strip_edges()
        var host = host_input.text.strip_edges()
        var port = int(server_port_input.text.strip_edges())
        if host.is_empty():
            host = "127.0.0.1"
        if port == 0:
            port = 8080
        
        var status = multiplayer_panel.get_node("ConnectionStatus")
        status.text = "正在连接 " + host + ":" + str(port) + "..."
        status.add_theme_color_override("font_color", Color(0.8, 0.8, 0.3))
        
        game_manager.start_multiplayer_client(host, port)

func _refresh_history():
    var container = history_panel.get_node("RecordsContainer")
    for child in container.get_children():
        child.queue_free()
    
    _update_stats_label()
    
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager:
        var records = game_manager.get_training_history(20)
        if records.is_empty():
            var label = Label.new()
            label.text = "暂无实训记录"
            label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
            container.add_child(label)
        else:
            for record in records:
                var panel = PanelContainer.new()
                panel.custom_minimum_size = Vector2(0, 80)
                container.add_child(panel)
                
                var hb = HBoxContainer.new()
                panel.add_child(hb)
                
                var info_vb = VBoxContainer.new()
                hb.add_child(info_vb)
                
                var name_label = Label.new()
                var mode = "单人" if record.get("training_type", "single") == "single" else "多人"
                name_label.text = record.get("player_name", "未知") + " | " + mode + "模式"
                name_label.add_theme_font_size_override("font_size", 14)
                info_vb.add_child(name_label)
                
                var time_label = Label.new()
                time_label.text = "时间: " + record.get("timestamp", "")
                time_label.add_theme_color_override("font_color", Color(0.6, 0.6, 0.6))
                info_vb.add_child(time_label)
                
                hb.add_spacer()
                
                var result_vb = VBoxContainer.new()
                hb.add_child(result_vb)
                
                var score_label = Label.new()
                score_label.text = "得分: " + str(record.get("score", 0)) + " / 100"
                score_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
                result_vb.add_child(score_label)
                
                var status = "✓ 成功" if record.get("success", false) else "✗ 失败"
                var result_label = Label.new()
                result_label.text = status
                result_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
                if record.get("success", false):
                    result_label.add_theme_color_override("font_color", Color(0.2, 1, 0.3))
                else:
                    result_label.add_theme_color_override("font_color", Color(1, 0.3, 0.3))
                result_vb.add_child(result_label)
                
                var dur_label = Label.new()
                dur_label.text = "用时: " + str(round(record.get("duration", 0), 1)) + "秒"
                dur_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
                dur_label.add_theme_color_override("font_color", Color(0.6, 0.6, 0.6))
                result_vb.add_child(dur_label)
                
                hb.add_spacer()
                
                var actions_vb = VBoxContainer.new()
                hb.add_child(actions_vb)
                
                var replay_btn = Button.new()
                replay_btn.text = "📼 回放"
                replay_btn.custom_minimum_size = Vector2(80, 35)
                var has_events = record.get("events", []).size() > 0
                replay_btn.disabled = not has_events
                replay_btn.pressed.connect(_on_replay_record.bind(record))
                actions_vb.add_child(replay_btn)
                
                if not has_events:
                    var no_event_label = Label.new()
                    no_event_label.text = "无回放数据"
                    no_event_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
                    no_event_label.add_theme_color_override("font_color", Color(0.5, 0.5, 0.5))
                    no_event_label.add_theme_font_size_override("font_size", 10)
                    actions_vb.add_child(no_event_label)

func _on_game_state_changed(new_state):
    pass

func _on_connection_error(error_msg):
    var status = multiplayer_panel.get_node("ConnectionStatus")
    status.text = "连接失败: " + error_msg
    status.add_theme_color_override("font_color", Color(1, 0.3, 0.3))

func _on_server_started(port):
    var status = multiplayer_panel.get_node("ConnectionStatus")
    status.text = "服务器已启动，端口: " + str(port)
    status.add_theme_color_override("font_color", Color(0.2, 1, 0.3))

func _on_client_connected(player_id, player_info):
    var status = multiplayer_panel.get_node("ConnectionStatus")
    status.text = "已连接，正在进入游戏..."
    status.add_theme_color_override("font_color", Color(0.2, 1, 0.3))

func _on_quit_pressed():
    get_tree().quit()

func _clean_30_days():
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager:
        var result = game_manager.clean_expired_records(30)
        _update_clean_status(result)
        _refresh_history()

func _clean_7_days():
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager:
        var result = game_manager.clean_expired_records(7)
        _update_clean_status(result)
        _refresh_history()

func _keep_100_records():
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager:
        var result = game_manager.clean_old_records(100)
        _update_clean_status(result)
        _refresh_history()

func _delete_all_records():
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager:
        var result = game_manager.delete_all_records()
        _update_clean_status(result)
        _refresh_history()

func _update_clean_status(result: Dictionary):
    var clean_status = history_panel.get_node("CleanStatus")
    if clean_status:
        clean_status.text = result.get("message", "")
        if result.get("success", false):
            clean_status.add_theme_color_override("font_color", Color(0.2, 1, 0.3))
        else:
            clean_status.add_theme_color_override("font_color", Color(1, 0.3, 0.3))

func _update_stats_label():
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    var stats_label = history_panel.get_node("StatsLabel")
    if game_manager and stats_label:
        var count = game_manager.get_record_count()
        stats_label.text = "当前记录数: " + str(count)

func _on_replay_record(record: Dictionary):
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if not game_manager:
        return
    
    var events = record.get("events", [])
    if events.is_empty():
        print("该记录没有回放数据")
        return
    
    var player_name = record.get("player_name", "未知")
    var score = record.get("score", 0)
    var duration = record.get("duration", 0)
    var success = record.get("success", false)
    
    game_manager.player_name = player_name + " (回放)"
    game_manager.current_player_id = "replay_" + str(Time.get_unix_time_from_system())
    game_manager.is_replay_mode = true
    
    game_manager.replay_manager.load_replay_data(events)
    game_manager.replay_manager.set_replay_context(score, duration, success)
    
    var mine_scene = preload("res://scenes/MineScene.tscn").instantiate()
    get_tree().root.add_child(mine_scene)
    
    await get_tree().process_frame
    
    if mine_scene and mine_scene.ui_layer:
        mine_scene.ui_layer.show_replay_panel(events)
    
    history_panel.visible = false
    main_panel.visible = false
