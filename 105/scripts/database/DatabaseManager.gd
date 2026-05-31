extends Node

signal database_connected()
signal database_error(error_msg)

var db: Object = null
var db_path: String = ""
var is_connected: bool = false

const TABLE_TRAINING_RECORDS := "
CREATE TABLE IF NOT EXISTS training_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id TEXT NOT NULL,
    player_name TEXT NOT NULL,
    training_type TEXT NOT NULL,
    score INTEGER NOT NULL,
    duration REAL NOT NULL,
    success INTEGER NOT NULL,
    operations TEXT NOT NULL,
    timestamp TEXT NOT NULL
);"

const TABLE_OPERATION_LOGS := "
CREATE TABLE IF NOT EXISTS operation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id INTEGER,
    step_index INTEGER,
    operation_name TEXT,
    correct INTEGER,
    time_spent REAL,
    timestamp TEXT,
    FOREIGN KEY (record_id) REFERENCES training_records(id)
);"

const TABLE_EQUIPMENT_STATUS := "
CREATE TABLE IF NOT EXISTS equipment_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_id TEXT UNIQUE,
    equipment_name TEXT,
    status TEXT,
    last_check TEXT,
    fault_count INTEGER DEFAULT 0
);"

func _ready():
    _check_sqlite_support()

func _check_sqlite_support():
    if not Engine.has_singleton("SQLite"):
        push_warning("SQLite 模块未找到，使用本地文件存储作为备选方案")

func connect_database(path: String) -> bool:
    db_path = path
    
    var db_class = load("res://addons/godot-sqlite/SQLite.gd")
    if db_class:
        db = db_class.new()
        db.path = path
        if db.open_db():
            is_connected = true
            _create_tables()
            database_connected.emit()
            return true
        else:
            database_error.emit("无法打开数据库")
            return false
    else:
        push_warning("SQLite 插件未安装，使用 JSON 文件存储")
        is_connected = true
        _init_file_storage()
        database_connected.emit()
        return true

func _create_tables():
    if db and is_connected:
        db.query(TABLE_TRAINING_RECORDS)
        db.query(TABLE_OPERATION_LOGS)
        db.query(TABLE_EQUIPMENT_STATUS)

func _init_file_storage():
    var dir = Directory.new()
    var data_dir = db_path.get_base_dir()
    if not dir.dir_exists(data_dir):
        dir.make_dir_recursive(data_dir)

func save_training_record(record: Dictionary) -> int:
    var record_id = 0
    
    if db and is_connected:
        var operations_str = JSON.stringify(record["operations"])
        var query = "
INSERT INTO training_records 
(player_id, player_name, training_type, score, duration, success, operations, timestamp)
VALUES (?, ?, ?, ?, ?, ?, ?, ?);"
        
        var params = [
            record["player_id"],
            record["player_name"],
            record["training_type"],
            record["score"],
            record["duration"],
            1 if record["success"] else 0,
            operations_str,
            record["timestamp"]
        ]
        
        db.query_with_params(query, params)
        record_id = db.get_last_insert_rowid()
        
        for i in range(len(record["operations"])):
            var op = record["operations"][i]
            var log_query = "
INSERT INTO operation_logs 
(record_id, step_index, operation_name, correct, time_spent, timestamp)
VALUES (?, ?, ?, ?, ?, ?);"
            
            var log_params = [
                record_id,
                i,
                op.get("name", "unknown"),
                1 if op.get("correct", false) else 0,
                op.get("time_spent", 0),
                op.get("timestamp", "")
            ]
            
            db.query_with_params(log_query, log_params)
    else:
        record_id = _save_to_file(record)
    
    return record_id

func _save_to_file(record: Dictionary) -> int:
    var file = FileAccess.open(db_path + ".json", FileAccess.READ)
    var records = []
    
    if file:
        var content = file.get_as_text()
        file.close()
        if not content.is_empty():
            var json = JSON.parse_string(content)
            if json is Array:
                records = json
    
    var new_id = records.size() + 1
    record["id"] = new_id
    records.append(record)
    
    file = FileAccess.open(db_path + ".json", FileAccess.WRITE)
    if file:
        file.store_string(JSON.stringify(records))
        file.close()
    
    return new_id

func get_training_records(limit: int = 50) -> Array:
    var records = []
    
    if db and is_connected:
        var query = "SELECT * FROM training_records ORDER BY id DESC LIMIT ?;"
        var result = db.query_with_params(query, [limit])
        
        if result:
            for row in result:
                var record = {
                    "id": row[0],
                    "player_id": row[1],
                    "player_name": row[2],
                    "training_type": row[3],
                    "score": row[4],
                    "duration": row[5],
                    "success": row[6] == 1,
                    "operations": JSON.parse_string(row[7]),
                    "timestamp": row[8]
                }
                records.append(record)
    else:
        records = _load_from_file(limit)
    
    return records

func _load_from_file(limit: int) -> Array:
    var file = FileAccess.open(db_path + ".json", FileAccess.READ)
    if file:
        var content = file.get_as_text()
        file.close()
        if not content.is_empty():
            var json = JSON.parse_string(content)
            if json is Array:
                var reversed = []
                for i in range(min(json.size(), limit) - 1, -1, -1):
                    reversed.append(json[i])
                return reversed
    return []

func get_player_statistics(player_id: String) -> Dictionary:
    var stats = {
        "total_trainings": 0,
        "success_count": 0,
        "avg_score": 0.0,
        "avg_duration": 0.0,
        "total_score": 0,
        "total_duration": 0.0
    }
    
    if db and is_connected:
        var query = "
SELECT 
    COUNT(*) as total,
    SUM(success) as success_count,
    AVG(score) as avg_score,
    AVG(duration) as avg_duration,
    SUM(score) as total_score,
    SUM(duration) as total_duration
FROM training_records 
WHERE player_id = ?;"
        
        var result = db.query_with_params(query, [player_id])
        if result and result.size() > 0:
            var row = result[0]
            stats["total_trainings"] = row[0]
            stats["success_count"] = row[1]
            stats["avg_score"] = row[2]
            stats["avg_duration"] = row[3]
            stats["total_score"] = row[4]
            stats["total_duration"] = row[5]
    
    return stats

func update_equipment_status(equipment_id: String, equipment_name: String, status: String, fault: bool = false):
    if db and is_connected:
        var check_query = "SELECT id, fault_count FROM equipment_status WHERE equipment_id = ?;"
        var result = db.query_with_params(check_query, [equipment_id])
        
        var timestamp = Time.get_datetime_string_from_system()
        
        if result and result.size() > 0:
            var row = result[0]
            var new_fault_count = row[1] + (1 if fault else 0)
            var update_query = "
UPDATE equipment_status 
SET status = ?, last_check = ?, fault_count = ?, equipment_name = ?
WHERE equipment_id = ?;"
            
            db.query_with_params(update_query, [
                status, timestamp, new_fault_count, equipment_name, equipment_id
            ])
        else:
            var insert_query = "
INSERT INTO equipment_status 
(equipment_id, equipment_name, status, last_check, fault_count)
VALUES (?, ?, ?, ?, ?);"
            
            db.query_with_params(insert_query, [
                equipment_id, equipment_name, status, timestamp, 1 if fault else 0
            ])

func clean_expired_records(days_old: int = 30) -> Dictionary:
    var result = {"deleted_count": 0, "success": false, "message": ""}
    
    if db and is_connected:
        var delete_query = "
DELETE FROM operation_logs 
WHERE record_id IN (SELECT id FROM training_records WHERE timestamp < datetime('now', '-" + str(days_old) + " days'));"
        db.query(delete_query)
        
        var delete_training = "
DELETE FROM training_records 
WHERE timestamp < datetime('now', '-" + str(days_old) + " days');"
        db.query(delete_training)
        
        var count_query = "
SELECT changes() as deleted;"
        var count_result = db.query(count_query)
        if count_result and count_result.size() > 0:
            result["deleted_count"] = count_result[0][0]
        
        result["success"] = true
        result["message"] = "已清理 " + str(result["deleted_count"]) + " 条 " + str(days_old) + " 天前的记录"
    else:
        result = _clean_expired_records_file(days_old)
    
    print("数据库清理: ", result["message"])
    return result

func _clean_expired_records_file(days_old: int) -> Dictionary:
    var result = {"deleted_count": 0, "success": false, "message": ""}
    
    var file = FileAccess.open(db_path + ".json", FileAccess.READ)
    if not file:
        result["message"] = "无法打开记录文件"
        return result
    
    var content = file.get_as_text()
    file.close()
    
    if content.is_empty():
        result["message"] = "记录文件为空"
        result["success"] = true
        return result
    
    var records = JSON.parse_string(content)
    if not records is Array:
        result["message"] = "记录文件格式错误"
        return result
    
    var cutoff_time = Time.get_unix_time_from_system() - (days_old * 86400)
    var new_records = []
    var deleted = 0
    
    for record in records:
        var record_time = _parse_timestamp(record.get("timestamp", ""))
        if record_time > 0 and record_time < cutoff_time:
            deleted += 1
        else:
            new_records.append(record)
    
    var write_file = FileAccess.open(db_path + ".json", FileAccess.WRITE)
    if write_file:
        write_file.store_string(JSON.stringify(new_records))
        write_file.close()
        result["deleted_count"] = deleted
        result["success"] = true
        result["message"] = "已清理 " + str(deleted) + " 条 " + str(days_old) + " 天前的记录"
    else:
        result["message"] = "无法写入记录文件"
    
    return result

func clean_old_records(max_records: int = 100) -> Dictionary:
    var result = {"deleted_count": 0, "success": false, "message": ""}
    
    if db and is_connected:
        var count_query = "SELECT COUNT(*) FROM training_records;"
        var count_result = db.query(count_query)
        var total = 0
        if count_result and count_result.size() > 0:
            total = count_result[0][0]
        
        if total > max_records:
            var delete_count = total - max_records
            
            var delete_logs = "
DELETE FROM operation_logs 
WHERE record_id IN (SELECT id FROM training_records ORDER BY id ASC LIMIT " + str(delete_count) + ");"
            db.query(delete_logs)
            
            var delete_training = "
DELETE FROM training_records 
WHERE id IN (SELECT id FROM training_records ORDER BY id ASC LIMIT " + str(delete_count) + ");"
            db.query(delete_training)
            
            result["deleted_count"] = delete_count
        else:
            result["deleted_count"] = 0
        
        result["success"] = true
        result["message"] = "已保留最近 " + str(max_records) + " 条记录，删除 " + str(result["deleted_count"]) + " 条旧记录"
    else:
        result = _clean_old_records_file(max_records)
    
    return result

func _clean_old_records_file(max_records: int) -> Dictionary:
    var result = {"deleted_count": 0, "success": false, "message": ""}
    
    var file = FileAccess.open(db_path + ".json", FileAccess.READ)
    if not file:
        result["message"] = "无法打开记录文件"
        return result
    
    var content = file.get_as_text()
    file.close()
    
    if content.is_empty():
        result["message"] = "记录文件为空"
        result["success"] = true
        return result
    
    var records = JSON.parse_string(content)
    if not records is Array:
        result["message"] = "记录文件格式错误"
        return result
    
    var deleted = 0
    if records.size() > max_records:
        deleted = records.size() - max_records
        records = records.slice(records.size() - max_records, records.size())
    
    var write_file = FileAccess.open(db_path + ".json", FileAccess.WRITE)
    if write_file:
        write_file.store_string(JSON.stringify(records))
        write_file.close()
        result["deleted_count"] = deleted
        result["success"] = true
        result["message"] = "已保留最近 " + str(max_records) + " 条记录，删除 " + str(deleted) + " 条旧记录"
    else:
        result["message"] = "无法写入记录文件"
    
    return result

func delete_all_records() -> Dictionary:
    var result = {"deleted_count": 0, "success": false, "message": ""}
    
    if db and is_connected:
        db.query("DELETE FROM operation_logs;")
        db.query("DELETE FROM training_records;")
        result["success"] = true
        result["message"] = "所有记录已清空"
    else:
        var file = FileAccess.open(db_path + ".json", FileAccess.WRITE)
        if file:
            file.store_string("[]")
            file.close()
            result["success"] = true
            result["message"] = "所有记录已清空"
        else:
            result["message"] = "无法清空记录文件"
    
    return result

func _parse_timestamp(timestamp_str: String) -> int:
    if timestamp_str.is_empty():
        return 0
    
    var parts = timestamp_str.split("T")
    if parts.size() != 2:
        return 0
    
    var date_part = parts[0]
    var time_part = parts[1].replace("Z", "")
    
    var date_parts = date_part.split("-")
    var time_parts = time_part.split(":")
    
    if date_parts.size() != 3 or time_parts.size() < 2:
        return 0
    
    var year = date_parts[0].to_int()
    var month = date_parts[1].to_int()
    var day = date_parts[2].to_int()
    var hour = time_parts[0].to_int()
    var minute = time_parts[1].to_int()
    var second = 0
    if time_parts.size() > 2:
        second = time_parts[2].to_int()
    
    var datetime = {
        "year": year,
        "month": month,
        "day": day,
        "hour": hour,
        "minute": minute,
        "second": second
    }
    
    return Time.get_unix_time_from_datetime_dict(datetime)

func get_record_count() -> int:
    if db and is_connected:
        var query = "SELECT COUNT(*) FROM training_records;"
        var result = db.query(query)
        if result and result.size() > 0:
            return result[0][0]
    else:
        var file = FileAccess.open(db_path + ".json", FileAccess.READ)
        if file:
            var content = file.get_as_text()
            file.close()
            if not content.is_empty():
                var json = JSON.parse_string(content)
                if json is Array:
                    return json.size()
    return 0

func close_database():
    if db and is_connected:
        db.close_db()
        is_connected = false
