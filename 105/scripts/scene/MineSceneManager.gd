extends Node

signal scene_initialized()
signal player_moved(position)
signal equipment_interacted(equipment_id)

var player: Node3D = null
var camera: Camera3D = null
var equipment_nodes: Dictionary = {}
var interactable_objects: Array = []
var is_initialized: bool = false
var move_speed: float = 5.0
var mouse_sensitivity: float = 0.002
var player_rotation: Vector2 = Vector2.ZERO
var can_move: bool = true
var interact_range: float = 3.0

var equipment_definitions: Dictionary = {
    "pump_001": {
        "name": "主排水泵",
        "type": "pump",
        "position": Vector3(5, 0, 0),
        "description": "矿井主排水系统，负责排除井下积水",
        "possible_faults": ["overheat", "pump_failure", "power_failure"],
        "interact_actions": ["press_emergency_stop", "cut_power", "check_switch_gear", "start_generator"]
    },
    "vent_001": {
        "name": "局部通风机",
        "type": "ventilation",
        "position": Vector3(-5, 0, 5),
        "description": "工作面局部通风设备，保证工作面粉尘和瓦斯浓度",
        "possible_faults": ["ventilation_failure", "power_failure", "mechanical_failure"],
        "interact_actions": ["turn_on_ventilation", "open_damper", "close_damper", "trigger_gas_alarm", "measure_gas"]
    },
    "conveyor_001": {
        "name": "胶带输送机",
        "type": "conveyor",
        "position": Vector3(0, 0, 8),
        "description": "主运输胶带，负责运输开采的矿石",
        "possible_faults": ["conveyor_jam", "overheat", "control_failure"],
        "interact_actions": ["press_emergency_stop", "stop_machines", "set_warning_sign", "isolate_area"]
    },
    "substation_001": {
        "name": "井下变电所",
        "type": "substation",
        "position": Vector3(-8, 0, -5),
        "description": "井下电力分配中心，为各设备提供电力",
        "possible_faults": ["power_failure", "control_failure"],
        "interact_actions": ["check_switch_gear", "inspect_cables", "start_generator", "activate_ups", "cut_power", "report_blackout"]
    },
    "hydraulic_001": {
        "name": "液压泵站",
        "type": "hydraulic",
        "position": Vector3(8, 0, -3),
        "description": "为液压设备提供高压动力油",
        "possible_faults": ["leak", "overheat", "mechanical_failure"],
        "interact_actions": ["close_valve", "shut_off_supply", "open_relief_valve", "depressurize", "contain_spill", "apply_patch"]
    },
    "monitor_001": {
        "name": "监控室",
        "type": "monitor",
        "position": Vector3(0, 0, -8),
        "description": "矿井安全监控中心，实时监测各项环境参数",
        "possible_faults": ["control_failure", "power_failure"],
        "interact_actions": ["call_dispatch", "report_status", "call_rescue", "report_emergency", "notify_workers"]
    }
}

func _ready():
    _initialize_scene()

func _initialize_scene():
    randomize()
    
    _create_environment()
    _create_equipment()
    _create_player()
    _register_equipment_with_manager()
    
    is_initialized = true
    scene_initialized.emit()
    print("井下场景初始化完成")

func _create_environment():
    var ground = StaticBody3D.new()
    ground.name = "Ground"
    add_child(ground)
    
    var ground_mesh = CollisionShape3D.new()
    ground_mesh.shape = BoxShape3D.new()
    ground_mesh.shape.size = Vector3(50, 1, 50)
    ground_mesh.position = Vector3(0, -0.5, 0)
    ground.add_child(ground_mesh)
    
    var ground_visual = MeshInstance3D.new()
    ground_visual.mesh = BoxMesh.new()
    ground_visual.mesh.size = Vector3(50, 1, 50)
    ground_visual.position = Vector3(0, -0.5, 0)
    
    var mat = StandardMaterial3D.new()
    mat.albedo_color = Color(0.3, 0.25, 0.2)
    ground_visual.material_override = mat
    ground.add_child(ground_visual)
    
    var wall_positions = [
        Vector3(0, 1, -25),
        Vector3(0, 1, 25),
        Vector3(-25, 1, 0),
        Vector3(25, 1, 0)
    ]
    var wall_sizes = [
        Vector3(50, 4, 1),
        Vector3(50, 4, 1),
        Vector3(1, 4, 50),
        Vector3(1, 4, 50)
    ]
    
    for i in range(4):
        var wall = StaticBody3D.new()
        wall.name = "Wall_" + str(i)
        add_child(wall)
        
        var wall_col = CollisionShape3D.new()
        wall_col.shape = BoxShape3D.new()
        wall_col.shape.size = wall_sizes[i]
        wall_col.position = wall_positions[i]
        wall.add_child(wall_col)
        
        var wall_vis = MeshInstance3D.new()
        wall_vis.mesh = BoxMesh.new()
        wall_vis.mesh.size = wall_sizes[i]
        wall_vis.position = wall_positions[i]
        
        var wall_mat = StandardMaterial3D.new()
        wall_mat.albedo_color = Color(0.4, 0.35, 0.3)
        wall_vis.material_override = wall_mat
        wall.add_child(wall_vis)
    
    var pillar_positions = [
        Vector3(-10, 1.5, -10),
        Vector3(10, 1.5, -10),
        Vector3(-10, 1.5, 10),
        Vector3(10, 1.5, 10)
    ]
    
    for i in range(4):
        var pillar = StaticBody3D.new()
        pillar.name = "Pillar_" + str(i)
        add_child(pillar)
        
        var pillar_col = CollisionShape3D.new()
        pillar_col.shape = CylinderShape3D.new()
        pillar_col.shape.radius = 0.8
        pillar_col.shape.height = 3.0
        pillar_col.position = pillar_positions[i]
        pillar.add_child(pillar_col)
        
        var pillar_vis = MeshInstance3D.new()
        pillar_vis.mesh = CylinderMesh.new()
        pillar_vis.mesh.radius = 0.8
        pillar_vis.mesh.height = 3.0
        pillar_vis.position = pillar_positions[i]
        
        var pillar_mat = StandardMaterial3D.new()
        pillar_mat.albedo_color = Color(0.5, 0.45, 0.4)
        pillar_vis.material_override = pillar_mat
        pillar.add_child(pillar_vis)
    
    var light = DirectionalLight3D.new()
    light.light_color = Color(0.9, 0.85, 0.7)
    light.energy = 0.6
    light.rotation = Vector3(-1.0, 0.5, 0)
    light.name = "MainLight"
    add_child(light)
    
    var ambient = WorldEnvironment.new()
    ambient.name = "Environment"
    add_child(ambient)
    
    var env = Environment.new()
    env.ambient_light_color = Color(0.2, 0.18, 0.15)
    env.ambient_light_energy = 0.5
    env.background_mode = Environment.BG_MODE_COLOR
    env.background_color = Color(0.1, 0.08, 0.06)
    ambient.environment = env

func _create_equipment():
    for equip_id in equipment_definitions.keys():
        var equip_data = equipment_definitions[equip_id]
        var equip_node = _create_equipment_node(equip_id, equip_data)
        add_child(equip_node)
        equipment_nodes[equip_id] = equip_node
        interactable_objects.append(equip_node)

func _create_equipment_node(equip_id: String, equip_data: Dictionary) -> StaticBody3D:
    var equip = StaticBody3D.new()
    equip.name = equip_id
    equip.position = equip_data["position"]
    
    var col_shape = CollisionShape3D.new()
    col_shape.shape = BoxShape3D.new()
    col_shape.shape.size = Vector3(2, 2.5, 2)
    col_shape.position = Vector3(0, 1.25, 0)
    equip.add_child(col_shape)
    
    var mesh = MeshInstance3D.new()
    mesh.mesh = BoxMesh.new()
    mesh.mesh.size = Vector3(2, 2.5, 2)
    mesh.position = Vector3(0, 1.25, 0)
    
    var mat = StandardMaterial3D.new()
    match equip_data["type"]:
        "pump":
            mat.albedo_color = Color(0.2, 0.4, 0.6)
        "ventilation":
            mat.albedo_color = Color(0.3, 0.5, 0.3)
        "conveyor":
            mat.albedo_color = Color(0.5, 0.3, 0.2)
        "substation":
            mat.albedo_color = Color(0.4, 0.4, 0.2)
        "hydraulic":
            mat.albedo_color = Color(0.3, 0.3, 0.5)
        "monitor":
            mat.albedo_color = Color(0.2, 0.3, 0.4)
        _:
            mat.albedo_color = Color(0.5, 0.5, 0.5)
    
    mat.emission = 0.1
    mesh.material_override = mat
    equip.add_child(mesh)
    
    var interact_area = Area3D.new()
    interact_area.name = "InteractArea"
    var interact_col = CollisionShape3D.new()
    interact_col.shape = SphereShape3D.new()
    interact_col.shape.radius = interact_range
    interact_area.add_child(interact_col)
    equip.add_child(interact_area)
    
    equip.set_meta("equipment_id", equip_id)
    equip.set_meta("equipment_data", equip_data)
    
    var light = OmniLight3D.new()
    light.light_color = Color(0.8, 0.6, 0.2)
    light.energy = 0.5
    light.position = Vector3(0, 2, 0)
    light.name = "StatusLight"
    equip.add_child(light)
    
    var label = Label3D.new()
    label.text = equip_data["name"]
    label.position = Vector3(0, 3.5, 0)
    label.pixel_size = 0.01
    label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
    label.modulate = Color(1, 1, 1, 0.9)
    label.name = "EquipmentLabel"
    equip.add_child(label)
    
    return equip

func _create_player():
    player = CharacterBody3D.new()
    player.name = "Player"
    player.position = Vector3(0, 1, 0)
    add_child(player)
    
    var player_col = CollisionShape3D.new()
    player_col.shape = CapsuleShape3D.new()
    player_col.shape.radius = 0.3
    player_col.shape.height = 1.8
    player_col.position = Vector3(0, 0, 0)
    player.add_child(player_col)
    
    camera = Camera3D.new()
    camera.name = "Camera"
    camera.position = Vector3(0, 0.6, 0)
    player.add_child(camera)
    
    var headlamp = OmniLight3D.new()
    headlamp.name = "Headlamp"
    headlamp.light_color = Color(1, 0.95, 0.8)
    headlamp.energy = 1.5
    headlamp.position = Vector3(0, 0.2, 0.5)
    headlamp.attenuation = 15
    camera.add_child(headlamp)
    
    Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _register_equipment_with_manager():
    var game_manager = get_tree().root.get_node_or_null("GameManager")
    if game_manager:
        for equip_id in equipment_definitions.keys():
            var equip_data = equipment_definitions[equip_id]
            game_manager.fault_manager.register_equipment(equip_id, {
                "name": equip_data["name"],
                "type": equip_data["type"],
                "possible_faults": equip_data["possible_faults"]
            })

func _process(delta):
    if is_initialized and player:
        _handle_input(delta)
        _check_interaction()

func _handle_input(delta):
    if not can_move or not player:
        return
    
    if Input.is_action_pressed("escape"):
        if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
            Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
        else:
            Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
        return
    
    if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
        return
    
    var input_dir = Vector2.ZERO
    if Input.is_action_pressed("move_forward"):
        input_dir.y -= 1
    if Input.is_action_pressed("move_back"):
        input_dir.y += 1
    if Input.is_action_pressed("move_left"):
        input_dir.x -= 1
    if Input.is_action_pressed("move_right"):
        input_dir.x += 1
    
    input_dir = input_dir.normalized()
    
    var forward = -camera.global_transform.basis.z
    var right = camera.global_transform.basis.x
    forward.y = 0
    right.y = 0
    forward = forward.normalized()
    right = right.normalized()
    
    var move_dir = Vector3.ZERO
    move_dir += forward * input_dir.y
    move_dir += right * input_dir.x
    move_dir = move_dir.normalized()
    
    player.velocity.x = move_dir.x * move_speed
    player.velocity.z = move_dir.z * move_speed
    
    player.velocity.y -= 9.8 * delta
    
    player.move_and_slide()
    
    if player.position.y < -5:
        player.position = Vector3(0, 1, 0)
        player.velocity = Vector3.ZERO
    
    player_moved.emit(player.position)

func _unhandled_input(event):
    if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
        player_rotation.x -= event.relative.x * mouse_sensitivity
        player_rotation.y -= event.relative.y * mouse_sensitivity
        player_rotation.y = clamp(player_rotation.y, -1.4, 1.4)
        
        if player:
            player.rotation.y = player_rotation.x
        if camera:
            camera.rotation.x = player_rotation.y

func _check_interaction():
    if not camera or Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
        return
    
    var space_state = get_world_3d().direct_space_state
    var from = camera.global_position
    var to = from + -camera.global_transform.basis.z * interact_range
    
    var query = PhysicsRayQueryParameters3D.create(from, to)
    query.collision_mask = 1
    
    var result = space_state.intersect_ray(query)
    
    if result and result.has("collider"):
        var collider = result.collider
        if collider.has_meta("equipment_id"):
            var equip_id = collider.get_meta("equipment_id")
            var equip_data = collider.get_meta("equipment_data", {})
            
            if Input.is_action_just_pressed("interact"):
                _show_interaction_panel(equip_id, equip_data)
    
    if Input.is_action_just_pressed("interact"):
        var space = get_world_3d().direct_space_state
        var from_pos = camera.global_position
        var to_pos = from_pos + -camera.global_transform.basis.z * interact_range
        var result2 = space.intersect_ray(PhysicsRayQueryParameters3D.create(from_pos, to_pos))
        
        if result2 and result2.has("collider"):
            var col = result2.collider
            if col.has_meta("equipment_id"):
                var e_id = col.get_meta("equipment_id")
                var e_data = col.get_meta("equipment_data", {})
                equipment_interacted.emit(e_id)
                _show_interaction_panel(e_id, e_data)

func _show_interaction_panel(equipment_id: String, equipment_data: Dictionary):
    var ui_layer = get_tree().root.get_node_or_null("UILayer")
    if ui_layer:
        ui_layer.show_equipment_panel(equipment_id, equipment_data)

func set_equipment_fault_state(equipment_id: String, has_fault: bool, fault_type: String = ""):
    if equipment_id in equipment_nodes:
        var equip_node = equipment_nodes[equipment_id]
        var light = equip_node.get_node_or_null("StatusLight")
        var label = equip_node.get_node_or_null("EquipmentLabel")
        
        if light:
            if has_fault:
                light.light_color = Color(1, 0.2, 0.2)
                light.energy = 2.0
            else:
                light.light_color = Color(0.2, 1, 0.3)
                light.energy = 0.5
        
        if label and has_fault:
            label.text = equipment_data["name"] + "\n[故障: " + fault_type + "]"
            label.modulate = Color(1, 0.3, 0.3, 1)
        elif label:
            label.text = equipment_data["name"]
            label.modulate = Color(1, 1, 1, 0.9)

func get_nearby_equipment() -> Dictionary:
    if not player:
        return {}
    
    var nearest = {}
    var min_dist = 999.0
    
    for equip_id in equipment_nodes.keys():
        var equip_node = equipment_nodes[equip_id]
        var dist = player.global_position.distance_to(equip_node.global_position)
        if dist < interact_range * 1.5 and dist < min_dist:
            min_dist = dist
            nearest = {
                "id": equip_id,
                "data": equipment_definitions.get(equip_id, {}),
                "distance": dist
            }
    
    return nearest

func get_all_equipment() -> Dictionary:
    return equipment_definitions.duplicate()
