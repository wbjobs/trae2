import random
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
import logging
from datetime import datetime, timedelta
import json
import os
import sys
import hashlib
import threading
from functools import lru_cache, wraps
from collections import OrderedDict
from pathlib import Path
import time

sys.path.append(str(Path(__file__).parent.parent))

app = Flask(__name__)
CORS(app)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MOCK_DATA = True

QUERY_TIMEOUT = 30
CACHE_TTL = 300

class LRUCache:
    def __init__(self, capacity=128, ttl=CACHE_TTL):
        self.capacity = capacity
        self.ttl = ttl
        self.cache = OrderedDict()
        self.lock = threading.Lock()
    
    def get(self, key):
        with self.lock:
            if key in self.cache:
                item, timestamp = self.cache[key]
                if time.time() - timestamp < self.ttl:
                    self.cache.move_to_end(key)
                    return item
                else:
                    del self.cache[key]
            return None
    
    def set(self, key, value):
        with self.lock:
            if key in self.cache:
                self.cache.move_to_end(key)
            elif len(self.cache) >= self.capacity:
                self.cache.popitem(last=False)
            self.cache[key] = (value, time.time())
    
    def clear(self):
        with self.lock:
            self.cache.clear()

data_cache = LRUCache(capacity=256, ttl=300)

def cache_response(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        req_body = None
        try:
            req_body = request.json
        except Exception:
            pass
        cache_key = hashlib.md5(
            f"{func.__name__}:{request.args}:{req_body}".encode()
        ).hexdigest()
        
        cached = data_cache.get(cache_key)
        if cached:
            logger.info(f"Cache hit for {func.__name__}")
            return cached
        
        result = func(*args, **kwargs)
        data_cache.set(cache_key, result)
        return result
    return wrapper

async_tasks = {}

def run_async_task(task_id, func, *args, **kwargs):
    def worker():
        try:
            async_tasks[task_id]['status'] = 'running'
            result = func(*args, **kwargs)
            async_tasks[task_id]['status'] = 'completed'
            async_tasks[task_id]['result'] = result
        except Exception as e:
            async_tasks[task_id]['status'] = 'failed'
            async_tasks[task_id]['error'] = str(e)
    
    async_tasks[task_id] = {
        'status': 'pending',
        'created_at': datetime.now().isoformat(),
        'result': None,
        'error': None
    }
    
    thread = threading.Thread(target=worker)
    thread.daemon = True
    thread.start()

class TimeoutException(Exception):
    pass

def timeout(seconds):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start = time.time()
            result = func(*args, **kwargs)
            elapsed = time.time() - start
            if elapsed > seconds:
                logger.warning(f"{func.__name__} took {elapsed:.2f}s, exceeding timeout {seconds}s")
            return result
        return wrapper
    return decorator

def get_aggregated_power_stats(start_date, end_date, station_id='all'):
    query = f"""
        SELECT 
            sum(total_power) as total_power,
            avg(avg_power) as avg_power,
            max(max_power) as peak_power,
            sum(record_count) as record_count
        FROM pv_power_daily
        WHERE date >= '{start_date}' AND date <= '{end_date}'
    """
    if station_id != 'all':
        query += f" AND station_id = '{station_id}'"
    
    from spark.power_aggregation import PowerAggregator
    aggregator = PowerAggregator()
    result = aggregator.spark.sql(query).first()
    aggregator.close()
    
    return {
        'total_power': float(result.total_power or 0),
        'avg_power': float(result.avg_power or 0),
        'peak_power': float(result.peak_power or 0),
        'record_count': int(result.record_count or 0)
    }

def get_yoy_mom_from_db(start_date, end_date, station_id='all', compare_type='all'):
    from spark.power_aggregation import PowerAggregator
    aggregator = PowerAggregator()
    
    result = {}
    
    if compare_type in ('yoy', 'all'):
        yoy_start = datetime.strptime(start_date, '%Y-%m-%d') - timedelta(days=365)
        yoy_end = datetime.strptime(end_date, '%Y-%m-%d') - timedelta(days=365)
        
        query = """
            SELECT date, total_power
            FROM pv_power_daily
            WHERE date >= '{}' AND date <= '{}'
        """.format(start_date, end_date)
        if station_id != 'all':
            query += f" AND station_id = '{station_id}'"
        query += " ORDER BY date"
        
        current_df = aggregator.spark.sql(query)
        
        yoy_query = """
            SELECT date, total_power
            FROM pv_power_daily
            WHERE date >= '{}' AND date <= '{}'
        """.format(yoy_start.strftime('%Y-%m-%d'), yoy_end.strftime('%Y-%m-%d'))
        if station_id != 'all':
            yoy_query += f" AND station_id = '{station_id}'"
        yoy_query += " ORDER BY date"
        
        yoy_df = aggregator.spark.sql(yoy_query)
        
        current_total = current_df.agg({'total_power': 'sum'}).first()[0] or 0
        yoy_total = yoy_df.agg({'total_power': 'sum'}).first()[0] or 0
        yoy_change = current_total - yoy_total
        yoy_rate = (yoy_change / yoy_total * 100) if yoy_total != 0 else 0
        
        current_rows = current_df.collect()
        yoy_rows = yoy_df.collect()
        
        yoy_details = []
        for i, row in enumerate(current_rows):
            yoy_val = yoy_rows[i].total_power if i < len(yoy_rows) else 0
            rate = ((row.total_power - yoy_val) / yoy_val * 100) if yoy_val != 0 else 0
            yoy_details.append({
                'date': row.date,
                'currentValue': round(float(row.total_power), 2),
                'yoyValue': round(float(yoy_val), 2),
                'yoyChangeRate': round(float(rate), 2)
            })
        
        result['yoy'] = {
            'current': round(float(current_total), 2),
            'previous': round(float(yoy_total), 2),
            'changeValue': round(float(yoy_change), 2),
            'changeRate': round(float(yoy_rate), 2),
            'details': yoy_details
        }
    
    if compare_type in ('mom', 'all'):
        start_dt = datetime.strptime(start_date, '%Y-%m-%d')
        end_dt = datetime.strptime(end_date, '%Y-%m-%d')
        delta = end_dt - start_dt
        mom_end = start_dt - timedelta(days=1)
        mom_start = mom_end - delta
        
        mom_query = """
            SELECT date, total_power
            FROM pv_power_daily
            WHERE date >= '{}' AND date <= '{}'
        """.format(mom_start.strftime('%Y-%m-%d'), mom_end.strftime('%Y-%m-%d'))
        if station_id != 'all':
            mom_query += f" AND station_id = '{station_id}'"
        mom_query += " ORDER BY date"
        
        mom_df = aggregator.spark.sql(mom_query)
        current_df_mom = aggregator.spark.sql(f"""
            SELECT date, total_power
            FROM pv_power_daily
            WHERE date >= '{start_date}' AND date <= '{end_date}'
            {'AND station_id = ' + repr(station_id) if station_id != 'all' else ''}
            ORDER BY date
        """)
        
        current_total_mom = current_df_mom.agg({'total_power': 'sum'}).first()[0] or 0
        mom_total = mom_df.agg({'total_power': 'sum'}).first()[0] or 0
        mom_change = current_total_mom - mom_total
        mom_rate = (mom_change / mom_total * 100) if mom_total != 0 else 0
        
        current_rows_mom = current_df_mom.collect()
        mom_rows = mom_df.collect()
        
        mom_details = []
        for i, row in enumerate(current_rows_mom):
            mom_val = mom_rows[i].total_power if i < len(mom_rows) else 0
            rate = ((row.total_power - mom_val) / mom_val * 100) if mom_val != 0 else 0
            mom_details.append({
                'date': row.date,
                'currentValue': round(float(row.total_power), 2),
                'momValue': round(float(mom_val), 2),
                'momChangeRate': round(float(rate), 2)
            })
        
        result['mom'] = {
            'current': round(float(current_total_mom), 2),
            'previous': round(float(mom_total), 2),
            'changeValue': round(float(mom_change), 2),
            'changeRate': round(float(mom_rate), 2),
            'details': mom_details
        }
    
    aggregator.close()
    return result

try:
    from spark.power_aggregation import PowerAggregator
    from spark.fault_analysis import FaultAnalyzer
    from spark.report_generator import ReportGenerator
    from spark.data_cleaning import PVDataCleaner
    SPARK_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Spark modules not available: {e}")
    SPARK_AVAILABLE = False


def generate_mock_stats():
    return {
        'totalPower': 12580.5,
        'todayPower': 856.2,
        'efficiency': 96.5,
        'lossRate': 3.2,
        'onlineRate': 98.7,
        'faultCount': 8,
        'yoyChange': 12.3,
        'momChange': -2.5
    }


def generate_mock_power_trend(days=7):
    data = []
    base_date = datetime.now() - timedelta(days=days)
    for i in range(days):
        data.append({
            'time': (base_date + timedelta(days=i)).strftime('%Y-%m-%d'),
            'value': round(500 + i * 30 + (i % 3) * 50 + (i * 17) % 100, 2)
        })
    return data


def generate_mock_fault_distribution():
    return [
        {'name': '逆变器故障', 'value': 25},
        {'name': '组件异常', 'value': 18},
        {'name': '汇流箱故障', 'value': 12},
        {'name': '电网故障', 'value': 8},
        {'name': '通信中断', 'value': 5}
    ]


def generate_mock_loss_analysis():
    return [
        {'name': '遮挡损耗', 'value': 456.2},
        {'name': '温度损耗', 'value': 324.5},
        {'name': '线损', 'value': 234.1},
        {'name': '设备故障', 'value': 178.3},
        {'name': '其他损耗', 'value': 104.2}
    ]


def generate_mock_inverter_data():
    return [
        {'name': 'INV-001', 'power': 52.3, 'efficiency': 96.5, 'temperature': 42, 'status': '正常'},
        {'name': 'INV-002', 'power': 48.7, 'efficiency': 95.8, 'temperature': 45, 'status': '正常'},
        {'name': 'INV-003', 'power': 45.2, 'efficiency': 92.3, 'temperature': 58, 'status': '告警'},
        {'name': 'INV-004', 'power': 51.8, 'efficiency': 97.2, 'temperature': 40, 'status': '正常'},
        {'name': 'INV-005', 'power': 0, 'efficiency': 0, 'temperature': 25, 'status': '故障'}
    ]


def generate_mock_power_yoy_mom(compare_type='all'):
    random.seed(42)
    base_monthly = [980, 1020, 1150, 1280, 1450, 1580, 1620, 1550, 1380, 1200, 1050, 950]
    current_values = []
    previous_yoy_values = []
    previous_mom_values = []

    for i, base in enumerate(base_monthly):
        yoy_rate = random.uniform(0.08, 0.15)
        current = round(base * (1 + yoy_rate), 2)
        current_values.append(current)
        previous_yoy_values.append(round(base, 2))

    total_current = sum(current_values)
    total_yoy_previous = sum(previous_yoy_values)

    for i, val in enumerate(current_values):
        mom_rate = random.uniform(-0.10, 0.10)
        previous_mom_values.append(round(val / (1 + mom_rate), 2))

    total_mom_previous = sum(previous_mom_values)

    details = []
    for i in range(12):
        month_str = f"2026-{i+1:02d}"
        detail = {
            'date': month_str,
            'currentValue': current_values[i],
            'yoyValue': previous_yoy_values[i],
            'momValue': previous_mom_values[i],
        }
        if previous_yoy_values[i] != 0:
            detail['yoyChangeRate'] = round(
                (current_values[i] - previous_yoy_values[i]) / previous_yoy_values[i] * 100, 2
            )
        else:
            detail['yoyChangeRate'] = 0
        if previous_mom_values[i] != 0:
            detail['momChangeRate'] = round(
                (current_values[i] - previous_mom_values[i]) / previous_mom_values[i] * 100, 2
            )
        else:
            detail['momChangeRate'] = 0
        details.append(detail)

    result = {}
    if compare_type in ('yoy', 'all'):
        result['yoy'] = {
            'current': round(total_current, 2),
            'previous': round(total_yoy_previous, 2),
            'changeValue': round(total_current - total_yoy_previous, 2),
            'changeRate': round(
                (total_current - total_yoy_previous) / total_yoy_previous * 100, 2
            ),
            'details': details
        }
    if compare_type in ('mom', 'all'):
        result['mom'] = {
            'current': round(total_current, 2),
            'previous': round(total_mom_previous, 2),
            'changeValue': round(total_current - total_mom_previous, 2),
            'changeRate': round(
                (total_current - total_mom_previous) / total_mom_previous * 100, 2
            ),
            'details': details
        }
    return result


def generate_mock_fault_geo_distribution():
    return {
        'stations': [
            {
                'stationId': 'ST-001',
                'stationName': '宁夏银川光伏电站',
                'lng': 106.278179,
                'lat': 38.46637,
                'faultCount': 12,
                'faultTypes': [
                    {'type': '逆变器故障', 'count': 5},
                    {'type': '组件异常', 'count': 4},
                    {'type': '通信中断', 'count': 3}
                ],
                'severity': 'warning'
            },
            {
                'stationId': 'ST-002',
                'stationName': '甘肃酒泉光伏电站',
                'lng': 98.49423,
                'lat': 39.73207,
                'faultCount': 8,
                'faultTypes': [
                    {'type': '汇流箱故障', 'count': 5},
                    {'type': '电网故障', 'count': 3}
                ],
                'severity': 'info'
            },
            {
                'stationId': 'ST-003',
                'stationName': '青海西宁光伏电站',
                'lng': 101.778916,
                'lat': 36.623178,
                'faultCount': 25,
                'faultTypes': [
                    {'type': '逆变器故障', 'count': 10},
                    {'type': '组件异常', 'count': 8},
                    {'type': '汇流箱故障', 'count': 5},
                    {'type': '通信中断', 'count': 2}
                ],
                'severity': 'critical'
            },
            {
                'stationId': 'ST-004',
                'stationName': '新疆乌鲁木齐光伏电站',
                'lng': 87.617733,
                'lat': 43.792818,
                'faultCount': 3,
                'faultTypes': [
                    {'type': '通信中断', 'count': 2},
                    {'type': '组件异常', 'count': 1}
                ],
                'severity': 'info'
            },
            {
                'stationId': 'ST-005',
                'stationName': '河北张北光伏电站',
                'lng': 114.71595,
                'lat': 41.15517,
                'faultCount': 15,
                'faultTypes': [
                    {'type': '逆变器故障', 'count': 7},
                    {'type': '电网故障', 'count': 5},
                    {'type': '汇流箱故障', 'count': 3}
                ],
                'severity': 'warning'
            }
        ]
    }


saved_layouts = {
    1: {
        'id': 1,
        'name': '默认布局',
        'config': {
            'layout': {
                'gridCols': 12,
                'gridRows': 6,
                'charts': [
                    {'id': 'chart-1', 'type': 'power-trend', 'x': 0, 'y': 0, 'w': 8, 'h': 3, 'visible': True, 'config': {}},
                    {'id': 'chart-2', 'type': 'fault-distribution', 'x': 8, 'y': 0, 'w': 4, 'h': 3, 'visible': True, 'config': {}},
                    {'id': 'chart-3', 'type': 'loss-analysis', 'x': 0, 'y': 3, 'w': 6, 'h': 3, 'visible': True, 'config': {}},
                    {'id': 'chart-4', 'type': 'device-status', 'x': 6, 'y': 3, 'w': 6, 'h': 3, 'visible': True, 'config': {}}
                ]
            }
        },
        'isDefault': True,
        'createdAt': '2026-01-01T00:00:00',
        'updatedAt': '2026-01-01T00:00:00'
    }
}
_layout_id_counter = [2]


@app.route('/api/stats', methods=['GET'])
@cache_response
@timeout(QUERY_TIMEOUT)
def get_stats():
    start_date = request.args.get('startDate')
    end_date = request.args.get('endDate')
    station_id = request.args.get('stationId', 'all')
    use_aggregated = request.args.get('useAggregated', 'true').lower() == 'true'
    
    logger.info(f"Getting stats: {start_date} - {end_date}, station: {station_id}, useAggregated: {use_aggregated}")
    
    if MOCK_DATA or not SPARK_AVAILABLE:
        return jsonify({'code': 200, 'data': generate_mock_stats()})
    
    try:
        if use_aggregated:
            power_stats = get_aggregated_power_stats(start_date, end_date, station_id)
        else:
            aggregator = PowerAggregator()
            power_stats = aggregator.get_power_stats(start_date, end_date, station_id)
            aggregator.close()
        
        power_stats['total_power'] = round(power_stats['total_power'] / 1000, 2)
        power_stats['peak_power'] = round(power_stats['peak_power'] / 1000, 2)
        
        return jsonify({'code': 200, 'data': power_stats})
    except TimeoutException as e:
        logger.warning(f"Query timeout: {e}")
        return jsonify({'code': 408, 'message': '查询超时，请缩小时间范围或使用预聚合数据'}), 408
    except Exception as e:
        logger.error(f"Error getting stats: {e}")
        return jsonify({'code': 500, 'message': str(e)}), 500


@app.route('/api/power-trend', methods=['GET'])
@cache_response
@timeout(QUERY_TIMEOUT)
def get_power_trend():
    start_date = request.args.get('startDate')
    end_date = request.args.get('endDate')
    station_id = request.args.get('stationId', 'all')
    frequency = request.args.get('frequency', 'day')
    page = int(request.args.get('page', 1))
    page_size = int(request.args.get('pageSize', 1000))
    
    logger.info(f"Getting power trend: {start_date} - {end_date}, freq: {frequency}, page: {page}")
    
    if MOCK_DATA or not SPARK_AVAILABLE:
        days = 7 if frequency == 'day' else (30 if frequency == 'month' else 24)
        return jsonify({'code': 200, 'data': generate_mock_power_trend(days)})
    
    try:
        use_aggregated = frequency in ['day', 'week', 'month']
        
        if use_aggregated:
            table_name = 'pv_power_hourly' if frequency == 'hour' else 'pv_power_daily'
            query = f"""
                SELECT date, total_power 
                FROM {table_name}
                WHERE date >= '{start_date}' AND date <= '{end_date}'
            """
            if station_id != 'all':
                query += f" AND station_id = '{station_id}'"
            query += " ORDER BY date"
            
            from spark.power_aggregation import PowerAggregator
            aggregator = PowerAggregator()
            trend_df = aggregator.spark.sql(query)
        else:
            aggregator = PowerAggregator()
            df = aggregator.load_cleaned_data('pv_panel_cleaned', start_date, end_date)
            if frequency == 'hour':
                trend_df = aggregator.get_hourly_distribution(df)
            else:
                trend_df = aggregator.get_daily_trend(df, station_id)
        
        total = trend_df.count()
        offset = (page - 1) * page_size
        trend_df = trend_df.offset(offset).limit(page_size)
        
        data = []
        for row in trend_df.collect():
            row_dict = row.asDict()
            if 'total_power' in row_dict:
                row_dict['value'] = round(row_dict.pop('total_power') / 1000, 2)
            if 'date' in row_dict:
                row_dict['time'] = row_dict.pop('date')
            data.append(row_dict)
        
        aggregator.close()
        return jsonify({
            'code': 200,
            'data': data,
            'pagination': {
                'page': page,
                'pageSize': page_size,
                'total': total,
                'hasMore': offset + page_size < total
            }
        })
    except TimeoutException as e:
        logger.warning(f"Query timeout: {e}")
        return jsonify({'code': 408, 'message': '查询超时，请缩小时间范围'}), 408
    except Exception as e:
        logger.error(f"Error getting power trend: {e}")
        return jsonify({'code': 500, 'message': str(e)}), 500


@app.route('/api/fault-distribution', methods=['GET'])
@cache_response
@timeout(QUERY_TIMEOUT)
def get_fault_distribution():
    start_date = request.args.get('startDate')
    end_date = request.args.get('endDate')
    station_id = request.args.get('stationId', 'all')
    
    logger.info(f"Getting fault distribution: {start_date} - {end_date}")
    
    if MOCK_DATA or not SPARK_AVAILABLE:
        return jsonify({'code': 200, 'data': generate_mock_fault_distribution()})
    
    try:
        use_aggregated = True
        
        if use_aggregated:
            query = f"""
                SELECT fault_type, sum(fault_count) as fault_count
                FROM pv_fault_daily
                WHERE date >= '{start_date}' AND date <= '{end_date}'
            """
            if station_id != 'all':
                query += f" AND station_id = '{station_id}'"
            query += " GROUP BY fault_type ORDER BY fault_count DESC"
            
            from spark.fault_analysis import FaultAnalyzer
            analyzer = FaultAnalyzer()
            dist_df = analyzer.spark.sql(query)
        else:
            analyzer = FaultAnalyzer()
            df = analyzer.load_fault_data(start_date, end_date)
            df = analyzer.classify_faults(df)
            dist_df = analyzer.get_fault_distribution(df)
        
        data = [row.asDict() for row in dist_df.collect()]
        analyzer.close()
        return jsonify({'code': 200, 'data': data})
    except TimeoutException as e:
        logger.warning(f"Query timeout: {e}")
        return jsonify({'code': 408, 'message': '查询超时，请缩小时间范围'}), 408
    except Exception as e:
        logger.error(f"Error getting fault distribution: {e}")
        return jsonify({'code': 500, 'message': str(e)}), 500


@app.route('/api/device-status', methods=['GET'])
@cache_response
@timeout(QUERY_TIMEOUT)
def get_device_status():
    station_id = request.args.get('stationId', 'all')
    as_of_date = request.args.get('asOfDate', datetime.now().strftime('%Y-%m-%d'))
    
    logger.info(f"Getting device status for station: {station_id}, date: {as_of_date}")
    
    if MOCK_DATA or not SPARK_AVAILABLE:
        return jsonify({
            'code': 200,
            'data': {
                'onlineCount': 145,
                'totalCount': 150,
                'onlineRate': 96.7,
                'efficiency': 96.5
            }
        })
    
    try:
        query = f"""
            SELECT 
                count(CASE WHEN status = 'online' THEN 1 END) as online_count,
                count(*) as total_count,
                round(count(CASE WHEN status = 'online' THEN 1 END) * 100.0 / count(*), 2) as online_rate
            FROM pv_device_status
            WHERE dt = '{as_of_date}'
        """
        if station_id != 'all':
            query += f" AND station_id = '{station_id}'"
        
        from spark.power_aggregation import PowerAggregator
        aggregator = PowerAggregator()
        result = aggregator.spark.sql(query).first()
        aggregator.close()
        
        return jsonify({
            'code': 200,
            'data': {
                'onlineCount': int(result.online_count or 0),
                'totalCount': int(result.total_count or 0),
                'onlineRate': float(result.online_rate or 0)
            }
        })
    except Exception as e:
        logger.error(f"Error getting device status: {e}")
        return jsonify({'code': 500, 'message': str(e)}), 500


@app.route('/api/loss-analysis', methods=['GET'])
@cache_response
@timeout(QUERY_TIMEOUT)
def get_loss_analysis():
    start_date = request.args.get('startDate')
    end_date = request.args.get('endDate')
    station_id = request.args.get('stationId', 'all')
    
    logger.info(f"Getting loss analysis: {start_date} - {end_date}")
    
    if MOCK_DATA or not SPARK_AVAILABLE:
        return jsonify({'code': 200, 'data': generate_mock_loss_analysis()})
    
    try:
        from spark.power_aggregation import PowerAggregator
        aggregator = PowerAggregator()
        df = aggregator.load_cleaned_data('pv_panel_cleaned', start_date, end_date)
        if station_id != 'all':
            df = df.filter(col('station_id') == station_id)
        
        loss_df = aggregator.calculate_loss_analysis(df)
        data = [row.asDict() for row in loss_df.collect()]
        aggregator.close()
        
        loss_types = ['遮挡损耗', '温度损耗', '线损', '设备故障', '其他损耗']
        total_loss = sum(d.get('quality_loss', 0) for d in data)
        
        result = []
        for i, lt in enumerate(loss_types):
            loss_value = total_loss * [0.35, 0.25, 0.18, 0.14, 0.08][i]
            result.append({
                'name': lt,
                'value': round(loss_value, 2)
            })
        
        return jsonify({'code': 200, 'data': result})
    except Exception as e:
        logger.error(f"Error getting loss analysis: {e}")
        return jsonify({'code': 500, 'message': str(e)}), 500


@app.route('/api/inverter-data', methods=['GET'])
@cache_response
@timeout(QUERY_TIMEOUT)
def get_inverter_data():
    station_id = request.args.get('stationId', 'all')
    page = int(request.args.get('page', 1))
    page_size = int(request.args.get('pageSize', 20))
    
    logger.info(f"Getting inverter data for station: {station_id}, page: {page}")
    
    if MOCK_DATA or not SPARK_AVAILABLE:
        return jsonify({'code': 200, 'data': generate_mock_inverter_data()})
    
    try:
        query = """
            SELECT 
                inverter_id as name,
                active_power as power,
                efficiency,
                temperature,
                CASE 
                    WHEN status = 'online' AND efficiency >= 95 THEN '正常'
                    WHEN status = 'online' AND efficiency >= 90 THEN '告警'
                    ELSE '故障'
                END as status
            FROM pv_inverter_cleaned
            WHERE data_time = (SELECT max(data_time) FROM pv_inverter_cleaned)
        """
        if station_id != 'all':
            query += f" AND station_id = '{station_id}'"
        query += " ORDER BY inverter_id"
        
        from spark.power_aggregation import PowerAggregator
        aggregator = PowerAggregator()
        
        total_df = aggregator.spark.sql(query)
        total = total_df.count()
        
        offset = (page - 1) * page_size
        result_df = total_df.offset(offset).limit(page_size)
        
        data = []
        for row in result_df.collect():
            row_dict = row.asDict()
            row_dict['power'] = round(row_dict.get('power', 0), 2)
            row_dict['efficiency'] = round(row_dict.get('efficiency', 0), 1)
            row_dict['temperature'] = round(row_dict.get('temperature', 0), 1)
            data.append(row_dict)
        
        aggregator.close()
        
        return jsonify({
            'code': 200,
            'data': data,
            'pagination': {
                'page': page,
                'pageSize': page_size,
                'total': total,
                'hasMore': offset + page_size < total
            }
        })
    except Exception as e:
        logger.error(f"Error getting inverter data: {e}")
        return jsonify({'code': 500, 'message': str(e)}), 500


@app.route('/api/async-query', methods=['POST'])
def submit_async_query():
    data = request.json
    query_type = data.get('type')
    params = data.get('params', {})
    
    task_id = f"ASYNC_{datetime.now().strftime('%Y%m%d%H%M%S%f')}"
    
    def execute_query():
        if query_type == 'power_trend':
            return get_aggregated_power_stats(**params)
        elif query_type == 'fault_stats':
            from spark.fault_analysis import FaultAnalyzer
            analyzer = FaultAnalyzer()
            result = analyzer.get_fault_summary(**params)
            analyzer.close()
            return result
        else:
            raise ValueError(f"Unknown query type: {query_type}")
    
    run_async_task(task_id, execute_query)
    
    return jsonify({
        'code': 200,
        'data': {
            'taskId': task_id,
            'status': 'submitted',
            'message': '异步查询任务已提交，请使用任务ID查询结果'
        }
    })


@app.route('/api/async-query/<task_id>', methods=['GET'])
def get_async_query_result(task_id):
    task = async_tasks.get(task_id)
    
    if not task:
        return jsonify({'code': 404, 'message': '任务不存在'}), 404
    
    return jsonify({
        'code': 200,
        'data': {
            'taskId': task_id,
            'status': task['status'],
            'createdAt': task['created_at'],
            'result': task['result'],
            'error': task['error']
        }
    })


@app.route('/api/cache/clear', methods=['POST'])
def clear_cache():
    global data_cache
    data_cache = LRUCache(capacity=256, ttl=300)
    return jsonify({'code': 200, 'message': '缓存已清除'})


@app.route('/api/panel-data', methods=['GET'])
def get_panel_data():
    station_id = request.args.get('stationId', 'all')
    
    logger.info(f"Getting panel data for station: {station_id}")
    
    if MOCK_DATA or not SPARK_AVAILABLE:
        return jsonify({
            'code': 200,
            'data': {
                'totalPanels': 5000,
                'onlinePanels': 4850,
                'faultPanels': 35,
                'avgEfficiency': 95.8
            }
        })
    
    return jsonify({'code': 200, 'data': {}})


@app.route('/api/data-cleaning', methods=['POST'])
def run_data_cleaning():
    data = request.json
    logger.info(f"Starting data cleaning: {data}")
    
    if MOCK_DATA or not SPARK_AVAILABLE:
        return jsonify({
            'code': 200,
            'data': {
                'taskId': f"TASK_{datetime.now().strftime('%Y%m%d%H%M%S')}",
                'status': 'running',
                'message': '数据清洗任务已提交'
            }
        })
    
    try:
        cleaner = PVDataCleaner()
        stats = cleaner.run_full_cleaning(
            start_date=data.get('startDate'),
            end_date=data.get('endDate')
        )
        cleaner.close()
        return jsonify({
            'code': 200,
            'data': {
                'taskId': f"TASK_{datetime.now().strftime('%Y%m%d%H%M%S')}",
                'status': 'completed',
                'stats': stats
            }
        })
    except Exception as e:
        logger.error(f"Error running data cleaning: {e}")
        return jsonify({'code': 500, 'message': str(e)}), 500


@app.route('/api/cleaning-status/<task_id>', methods=['GET'])
def get_cleaning_status(task_id):
    logger.info(f"Getting cleaning status for task: {task_id}")
    
    if MOCK_DATA or not SPARK_AVAILABLE:
        return jsonify({
            'code': 200,
            'data': {
                'taskId': task_id,
                'status': 'completed',
                'progress': 100,
                'duplicates_removed': 12345,
                'missing_filled': 3456,
                'outliers_removed': 890
            }
        })
    
    return jsonify({'code': 200, 'data': {}})


@app.route('/api/export-report', methods=['GET'])
def export_report():
    report_type = request.args.get('type', 'daily')
    start_date = request.args.get('startDate')
    end_date = request.args.get('endDate')
    format = request.args.get('format', 'xlsx')
    
    logger.info(f"Exporting report: {report_type}, {start_date} - {end_date}, format: {format}")
    
    if MOCK_DATA or not SPARK_AVAILABLE:
        from io import BytesIO
        output = BytesIO()
        output.write(b'PV Operation Report - Mock Data')
        output.seek(0)
        
        filename = f"PV_Report_{datetime.now().strftime('%Y%m%d')}.{format}"
        return send_file(
            output,
            as_attachment=True,
            download_name=filename,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
    
    try:
        generator = ReportGenerator()
        if report_type == 'daily':
            report_path = generator.generate_daily_report(format=format)
        elif report_type == 'weekly':
            report_path = generator.generate_weekly_report(
                year=datetime.now().year,
                week=datetime.now().isocalendar()[1],
                format=format
            )
        elif report_type == 'monthly':
            report_path = generator.generate_monthly_report(
                year=datetime.now().year,
                month=datetime.now().month,
                format=format
            )
        else:
            report_path = generator.generate_custom_report(start_date, end_date, format=format)
        
        generator.close()
        
        return send_file(
            report_path,
            as_attachment=True,
            download_name=os.path.basename(report_path)
        )
    except Exception as e:
        logger.error(f"Error exporting report: {e}")
        return jsonify({'code': 500, 'message': str(e)}), 500


@app.route('/api/power-yoy-mom', methods=['GET'])
@cache_response
@timeout(QUERY_TIMEOUT)
def get_power_yoy_mom():
    start_date = request.args.get('startDate')
    end_date = request.args.get('endDate')
    station_id = request.args.get('stationId', 'all')
    compare_type = request.args.get('compareType', 'all')

    logger.info(f"Getting power YoY/MoM: {start_date} - {end_date}, station: {station_id}, compareType: {compare_type}")

    if MOCK_DATA or not SPARK_AVAILABLE:
        return jsonify({'code': 200, 'data': generate_mock_power_yoy_mom(compare_type)})

    try:
        result = get_yoy_mom_from_db(start_date, end_date, station_id, compare_type)
        return jsonify({'code': 200, 'data': result})
    except TimeoutException as e:
        logger.warning(f"Query timeout: {e}")
        return jsonify({'code': 408, 'message': '查询超时，请缩小时间范围'}), 408
    except Exception as e:
        logger.error(f"Error getting power YoY/MoM: {e}")
        return jsonify({'code': 500, 'message': str(e)}), 500


@app.route('/api/fault-geo-distribution', methods=['GET'])
@cache_response
@timeout(QUERY_TIMEOUT)
def get_fault_geo_distribution():
    start_date = request.args.get('startDate')
    end_date = request.args.get('endDate')
    station_id = request.args.get('stationId', 'all')

    logger.info(f"Getting fault geo distribution: {start_date} - {end_date}, station: {station_id}")

    if MOCK_DATA or not SPARK_AVAILABLE:
        return jsonify({'code': 200, 'data': generate_mock_fault_geo_distribution()})

    try:
        query = f"""
            SELECT station_id, station_name,
                   sum(fault_count) as fault_count,
                   collect_list(named_struct('type', fault_type, 'count', fault_count)) as fault_types
            FROM pv_fault_daily
            WHERE date >= '{start_date}' AND date <= '{end_date}'
        """
        if station_id != 'all':
            query += f" AND station_id = '{station_id}'"
        query += " GROUP BY station_id, station_name"

        from spark.fault_analysis import FaultAnalyzer
        analyzer = FaultAnalyzer()
        dist_df = analyzer.spark.sql(query)

        station_coords = {
            'ST-001': {'lng': 106.278179, 'lat': 38.46637},
            'ST-002': {'lng': 98.49423, 'lat': 39.73207},
            'ST-003': {'lng': 101.778916, 'lat': 36.623178},
            'ST-004': {'lng': 87.617733, 'lat': 43.792818},
            'ST-005': {'lng': 114.71595, 'lat': 41.15517},
        }

        stations = []
        for row in dist_df.collect():
            fault_count = row.fault_count
            if fault_count >= 20:
                severity = 'critical'
            elif fault_count >= 10:
                severity = 'warning'
            else:
                severity = 'info'
            coords = station_coords.get(row.station_id, {'lng': 0, 'lat': 0})
            stations.append({
                'stationId': row.station_id,
                'stationName': row.station_name,
                'lng': coords['lng'],
                'lat': coords['lat'],
                'faultCount': int(fault_count),
                'faultTypes': [{'type': ft['type'], 'count': int(ft['count'])} for ft in row.fault_types],
                'severity': severity
            })
        analyzer.close()
        return jsonify({'code': 200, 'data': {'stations': stations}})
    except TimeoutException as e:
        logger.warning(f"Query timeout: {e}")
        return jsonify({'code': 408, 'message': '查询超时，请缩小时间范围'}), 408
    except Exception as e:
        logger.error(f"Error getting fault geo distribution: {e}")
        return jsonify({'code': 500, 'message': str(e)}), 500


@app.route('/api/layouts', methods=['GET'])
@cache_response
@timeout(QUERY_TIMEOUT)
def get_layouts():
    logger.info("Getting all layouts")
    layouts = list(saved_layouts.values())
    return jsonify({'code': 200, 'data': {'layouts': layouts}})


@app.route('/api/layouts', methods=['POST'])
def save_layout():
    data = request.json
    name = data.get('name', '未命名布局')
    config = data.get('config', {})
    is_default = data.get('isDefault', False)

    logger.info(f"Saving layout: {name}")

    layout_id = _layout_id_counter[0]
    _layout_id_counter[0] += 1

    now = datetime.now().isoformat()
    if is_default:
        for lid, layout in saved_layouts.items():
            layout['isDefault'] = False

    saved_layouts[layout_id] = {
        'id': layout_id,
        'name': name,
        'config': config,
        'isDefault': is_default,
        'createdAt': now,
        'updatedAt': now
    }

    return jsonify({'code': 200, 'data': {'layout': saved_layouts[layout_id]}})


@app.route('/api/layouts/<int:layout_id>', methods=['PUT'])
def update_layout(layout_id):
    if layout_id not in saved_layouts:
        return jsonify({'code': 404, 'message': '布局不存在'}), 404

    data = request.json
    logger.info(f"Updating layout: {layout_id}")

    layout = saved_layouts[layout_id]
    if 'name' in data:
        layout['name'] = data['name']
    if 'config' in data:
        layout['config'] = data['config']
    if 'isDefault' in data:
        if data['isDefault']:
            for lid, l in saved_layouts.items():
                l['isDefault'] = False
        layout['isDefault'] = data['isDefault']
    layout['updatedAt'] = datetime.now().isoformat()

    return jsonify({'code': 200, 'data': {'layout': layout}})


@app.route('/api/layouts/<int:layout_id>', methods=['DELETE'])
def delete_layout(layout_id):
    if layout_id not in saved_layouts:
        return jsonify({'code': 404, 'message': '布局不存在'}), 404

    logger.info(f"Deleting layout: {layout_id}")
    del saved_layouts[layout_id]

    return jsonify({'code': 200, 'data': {'message': '布局已删除'}})


@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'code': 200,
        'data': {
            'status': 'healthy',
            'timestamp': datetime.now().isoformat(),
            'spark_available': SPARK_AVAILABLE
        }
    })


@app.errorhandler(404)
def not_found(e):
    return jsonify({'code': 404, 'message': 'Not found'}), 404


@app.errorhandler(500)
def internal_error(e):
    logger.error(f"Internal error: {e}")
    return jsonify({'code': 500, 'message': 'Internal server error'}), 500


if __name__ == '__main__':
    logger.info("Starting PV Ops Dashboard API server...")
    logger.info(f"Spark available: {SPARK_AVAILABLE}")
    logger.info(f"Mock data mode: {MOCK_DATA}")
    
    app.run(host='0.0.0.0', port=5000, debug=True)
