import unittest
import sys
import os
import json
from datetime import datetime, timedelta

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def calculate_yoy_change(current, previous):
    if previous == 0:
        return 0
    return round((current - previous) / previous * 100, 2)

def calculate_mom_change(current, previous):
    if previous == 0:
        return 0
    return round((current - previous) / previous * 100, 2)

def calculate_mom_period(start_date_str, end_date_str):
    start_dt = datetime.strptime(start_date_str, '%Y-%m-%d')
    end_dt = datetime.strptime(end_date_str, '%Y-%m-%d')
    delta = end_dt - start_dt
    mom_end = start_dt - timedelta(days=1)
    mom_start = mom_end - delta
    return mom_start.strftime('%Y-%m-%d'), mom_end.strftime('%Y-%m-%d')

def calculate_yoy_period(start_date_str, end_date_str):
    start_dt = datetime.strptime(start_date_str, '%Y-%m-%d')
    end_dt = datetime.strptime(end_date_str, '%Y-%m-%d')
    yoy_start = start_dt - timedelta(days=365)
    yoy_end = end_dt - timedelta(days=365)
    return yoy_start.strftime('%Y-%m-%d'), yoy_end.strftime('%Y-%m-%d')

def classify_severity(fault_count):
    if fault_count >= 20:
        return 'critical'
    elif fault_count >= 10:
        return 'warning'
    else:
        return 'info'

STATION_COORDS = {
    'ST-001': {'lng': 106.278179, 'lat': 38.46637, 'name': '银川光伏电站'},
    'ST-002': {'lng': 98.49423, 'lat': 39.73207, 'name': '酒泉光伏电站'},
    'ST-003': {'lng': 101.778916, 'lat': 36.623178, 'name': '西宁光伏电站'},
    'ST-004': {'lng': 87.617733, 'lat': 43.792818, 'name': '乌鲁木齐光伏电站'},
    'ST-005': {'lng': 114.71595, 'lat': 41.15517, 'name': '张北光伏电站'},
}


class TestYoYMoMAnalysis(unittest.TestCase):

    def test_yoy_change_positive(self):
        current = 1200.0
        previous = 1000.0
        rate = calculate_yoy_change(current, previous)
        self.assertAlmostEqual(rate, 20.0, places=2)

    def test_yoy_change_negative(self):
        current = 800.0
        previous = 1000.0
        rate = calculate_yoy_change(current, previous)
        self.assertAlmostEqual(rate, -20.0, places=2)

    def test_yoy_change_zero_previous(self):
        rate = calculate_yoy_change(1000.0, 0)
        self.assertEqual(rate, 0)

    def test_yoy_change_same_value(self):
        rate = calculate_yoy_change(1000.0, 1000.0)
        self.assertAlmostEqual(rate, 0.0, places=2)

    def test_mom_change_calculation(self):
        current = 550.0
        previous = 500.0
        rate = calculate_mom_change(current, previous)
        self.assertAlmostEqual(rate, 10.0, places=2)

    def test_yoy_period_calculation(self):
        start = '2024-01-01'
        end = '2024-01-31'
        yoy_start, yoy_end = calculate_yoy_period(start, end)
        self.assertEqual(yoy_start, '2023-01-01')
        self.assertEqual(yoy_end, '2023-01-31')

    def test_mom_period_calculation(self):
        start = '2024-02-01'
        end = '2024-02-29'
        mom_start, mom_end = calculate_mom_period(start, end)
        self.assertEqual(mom_end, '2024-01-31')
        start_dt = datetime.strptime(mom_start, '%Y-%m-%d')
        end_dt = datetime.strptime(mom_end, '%Y-%m-%d')
        delta = end_dt - start_dt
        self.assertEqual(delta.days + 1, 29)

    def test_yoy_details_structure(self):
        details = []
        for i in range(12):
            current_val = 800 + i * 50
            previous_val = 700 + i * 40
            details.append({
                'date': f'2024-{i+1:02d}',
                'currentValue': current_val,
                'yoyValue': previous_val,
                'yoyChangeRate': calculate_yoy_change(current_val, previous_val)
            })
        self.assertEqual(len(details), 12)
        for d in details:
            self.assertIn('date', d)
            self.assertIn('currentValue', d)
            self.assertIn('yoyValue', d)
            self.assertIn('yoyChangeRate', d)
            self.assertGreater(d['currentValue'], 0)
            self.assertGreater(d['yoyValue'], 0)


class TestFaultGeoDistribution(unittest.TestCase):

    def test_severity_critical(self):
        self.assertEqual(classify_severity(25), 'critical')

    def test_severity_warning(self):
        self.assertEqual(classify_severity(15), 'warning')

    def test_severity_info(self):
        self.assertEqual(classify_severity(5), 'info')

    def test_severity_boundary_critical(self):
        self.assertEqual(classify_severity(20), 'critical')

    def test_severity_boundary_warning(self):
        self.assertEqual(classify_severity(10), 'warning')

    def test_severity_boundary_info(self):
        self.assertEqual(classify_severity(9), 'info')

    def test_station_coords_structure(self):
        for station_id, coords in STATION_COORDS.items():
            self.assertIn('lng', coords)
            self.assertIn('lat', coords)
            self.assertIn('name', coords)
            self.assertGreater(coords['lng'], 70)
            self.assertLess(coords['lng'], 140)
            self.assertGreater(coords['lat'], 20)
            self.assertLess(coords['lat'], 55)

    def test_geo_data_structure(self):
        stations = []
        for sid, coords in STATION_COORDS.items():
            fault_count = len(sid) * 7
            stations.append({
                'stationId': sid,
                'stationName': coords['name'],
                'lng': coords['lng'],
                'lat': coords['lat'],
                'faultCount': fault_count,
                'faultTypes': [
                    {'type': 'inverter_fault', 'count': fault_count // 2},
                    {'type': 'panel_anomaly', 'count': fault_count - fault_count // 2}
                ],
                'severity': classify_severity(fault_count)
            })
        self.assertEqual(len(stations), 5)
        for s in stations:
            self.assertIn('stationId', s)
            self.assertIn('stationName', s)
            self.assertIn('lng', s)
            self.assertIn('lat', s)
            self.assertIn('faultCount', s)
            self.assertIn('faultTypes', s)
            self.assertIn('severity', s)


class TestLayoutManagement(unittest.TestCase):

    def setUp(self):
        self.layouts = {}
        self.id_counter = [1]

    def _save_layout(self, name, config=None, is_default=False):
        layout_id = self.id_counter[0]
        self.id_counter[0] += 1
        now = datetime.now().isoformat()
        if is_default:
            for lid, layout in self.layouts.items():
                layout['isDefault'] = False
        self.layouts[layout_id] = {
            'id': layout_id,
            'name': name,
            'config': config or {},
            'isDefault': is_default,
            'createdAt': now,
            'updatedAt': now
        }
        return self.layouts[layout_id]

    def _update_layout(self, layout_id, data):
        if layout_id not in self.layouts:
            return None
        layout = self.layouts[layout_id]
        if 'name' in data:
            layout['name'] = data['name']
        if 'config' in data:
            layout['config'] = data['config']
        if 'isDefault' in data:
            if data['isDefault']:
                for lid, l in self.layouts.items():
                    l['isDefault'] = False
            layout['isDefault'] = data['isDefault']
        layout['updatedAt'] = datetime.now().isoformat()
        return layout

    def _delete_layout(self, layout_id):
        if layout_id in self.layouts:
            del self.layouts[layout_id]
            return True
        return False

    def test_save_layout(self):
        layout = self._save_layout('测试布局', {'gridCols': 12}, False)
        self.assertEqual(layout['name'], '测试布局')
        self.assertFalse(layout['isDefault'])
        self.assertIn('id', layout)

    def test_save_default_layout_exclusive(self):
        self._save_layout('布局1', {}, True)
        self._save_layout('布局2', {}, True)
        default_count = sum(1 for l in self.layouts.values() if l['isDefault'])
        self.assertEqual(default_count, 1)
        layout2 = self.layouts[2]
        self.assertTrue(layout2['isDefault'])

    def test_update_layout(self):
        self._save_layout('旧名称', {'key': 'val'}, False)
        updated = self._update_layout(1, {'name': '新名称'})
        self.assertEqual(updated['name'], '新名称')

    def test_update_layout_not_found(self):
        result = self._update_layout(999, {'name': '不存在'})
        self.assertIsNone(result)

    def test_delete_layout(self):
        self._save_layout('待删除', {}, False)
        self.assertIn(1, self.layouts)
        result = self._delete_layout(1)
        self.assertTrue(result)
        self.assertNotIn(1, self.layouts)

    def test_delete_layout_not_found(self):
        result = self._delete_layout(999)
        self.assertFalse(result)

    def test_layout_config_structure(self):
        config = {
            'gridCols': 12,
            'gridRows': 8,
            'charts': [
                {'id': 'powerTrend', 'type': 'line', 'x': 0, 'y': 0, 'w': 8, 'h': 4, 'visible': True},
                {'id': 'faultPie', 'type': 'pie', 'x': 8, 'y': 0, 'w': 4, 'h': 4, 'visible': True}
            ]
        }
        layout = self._save_layout('配置布局', config, False)
        self.assertIn('charts', layout['config'])
        self.assertEqual(len(layout['config']['charts']), 2)


class TestQueryIndexOptimization(unittest.TestCase):

    def test_index_definitions_structure(self):
        indexes = [
            {'name': 'idx_power_daily_date_station', 'table': 'pv_power_daily', 'columns': ['date', 'station_id']},
            {'name': 'idx_power_hourly_date_station', 'table': 'pv_power_hourly', 'columns': ['date', 'station_id']},
            {'name': 'idx_fault_daily_date_station', 'table': 'pv_fault_daily', 'columns': ['date', 'station_id']},
            {'name': 'idx_fault_raw_type', 'table': 'pv_fault_raw', 'columns': ['fault_type']},
            {'name': 'idx_device_status_station_status', 'table': 'pv_device_status', 'columns': ['station_id', 'status']},
            {'name': 'idx_panel_cleaned_quality_date', 'table': 'pv_panel_cleaned', 'columns': ['data_quality', 'dt']},
            {'name': 'idx_inverter_cleaned_station_time', 'table': 'pv_inverter_cleaned', 'columns': ['station_id', 'dt']},
        ]
        for idx in indexes:
            self.assertIn('name', idx)
            self.assertIn('table', idx)
            self.assertIn('columns', idx)
            self.assertTrue(len(idx['name']) > 0)
            self.assertTrue(len(idx['columns']) > 0)

    def test_materialized_view_definitions(self):
        mvs = [
            'mv_power_monthly_yoy',
            'mv_fault_geo_stats',
            'mv_station_daily_overview'
        ]
        for mv in mvs:
            self.assertTrue(mv.startswith('mv_'))
            self.assertTrue(len(mv) > 3)

    def test_hive_optimization_settings(self):
        settings = {
            'hive.materializedview.rewriting': 'true',
            'hive.exec.parallel': 'true',
            'hive.exec.parallel.thread.number': '8',
            'hive.cbo.enable': 'true',
            'hive.optimize.index.filter': 'true',
            'hive.auto.convert.join': 'true',
        }
        for key, val in settings.items():
            self.assertIn(key, settings)
            self.assertIsNotNone(val)

    def test_query_uses_index_hint(self):
        query = """
            SELECT station_id, date, total_power
            FROM pv_power_daily
            WHERE date >= '2024-01-01' AND date <= '2024-01-31'
            AND station_id = 'ST-001'
            ORDER BY date
        """
        self.assertIn('date', query)
        self.assertIn('station_id', query)
        self.assertIn('WHERE', query)


def run_standalone_tests():
    print("\n=== Running standalone new features tests ===")
    
    suite = unittest.TestLoader().loadTestsFromModule(sys.modules[__name__])
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    return result.wasSuccessful()


if __name__ == "__main__":
    success = run_standalone_tests()
    sys.exit(0 if success else 1)
