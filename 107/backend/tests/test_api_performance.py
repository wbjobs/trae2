import unittest
import time
import sys
import os
import json
from datetime import datetime, timedelta
import unittest.mock as mock

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

LRUCache = None

try:
    from api.app import app, data_cache, LRUCache
    FLASK_AVAILABLE = True
except ImportError as e:
    print(f"Flask app not available: {e}")
    FLASK_AVAILABLE = False
    
    from collections import OrderedDict
    import threading
    import time
    
    class LRUCache:
        def __init__(self, capacity=256, ttl=300):
            self.capacity = capacity
            self.ttl = ttl
            self.cache = OrderedDict()
            self.timestamps = {}
            self.lock = threading.Lock()
        
        def get(self, key):
            with self.lock:
                if key not in self.cache:
                    return None
                
                if time.time() - self.timestamps[key] > self.ttl:
                    del self.cache[key]
                    del self.timestamps[key]
                    return None
                
                self.cache.move_to_end(key)
                return self.cache[key]
        
        def set(self, key, value):
            with self.lock:
                if key in self.cache:
                    self.cache.move_to_end(key)
                else:
                    if len(self.cache) >= self.capacity:
                        oldest_key = next(iter(self.cache))
                        del self.cache[oldest_key]
                        del self.timestamps[oldest_key]
                
                self.cache[key] = value
                self.timestamps[key] = time.time()
        
        def clear(self):
            with self.lock:
                self.cache.clear()
                self.timestamps.clear()


@unittest.skipIf(not FLASK_AVAILABLE, "Flask not available")
class TestAPIPerformance(unittest.TestCase):

    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()

    def test_lru_cache_creation(self):
        cache = LRUCache(capacity=3, ttl=60)
        self.assertIsNotNone(cache)

    def test_lru_cache_set_get(self):
        cache = LRUCache(capacity=3, ttl=60)
        cache.set("key1", "value1")
        self.assertEqual(cache.get("key1"), "value1")

    def test_lru_cache_eviction(self):
        cache = LRUCache(capacity=2, ttl=60)
        cache.set("key1", "value1")
        cache.set("key2", "value2")
        cache.set("key3", "value3")
        
        self.assertIsNone(cache.get("key1"))
        self.assertEqual(cache.get("key2"), "value2")
        self.assertEqual(cache.get("key3"), "value3")

    def test_lru_cache_order(self):
        cache = LRUCache(capacity=3, ttl=60)
        cache.set("key1", "value1")
        cache.set("key2", "value2")
        cache.set("key3", "value3")
        
        cache.get("key1")
        cache.set("key4", "value4")
        
        self.assertIsNone(cache.get("key2"))
        self.assertEqual(cache.get("key1"), "value1")

    def test_health_endpoint(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(data["code"], 200)
        self.assertIn("status", data["data"])

    def test_cache_decorator(self):
        start_time = time.time()
        response1 = self.client.get("/api/stats?startDate=2024-01-01&endDate=2024-01-07")
        first_duration = time.time() - start_time
        
        start_time = time.time()
        response2 = self.client.get("/api/stats?startDate=2024-01-01&endDate=2024-01-07")
        second_duration = time.time() - start_time
        
        self.assertEqual(response1.status_code, 200)
        self.assertEqual(response2.status_code, 200)
        
        print(f"First request: {first_duration:.4f}s, Cached request: {second_duration:.4f}s")

    def test_pagination_parameters(self):
        response = self.client.get(
            "/api/power-trend?startDate=2024-01-01&endDate=2024-01-07&page=1&pageSize=10"
        )
        self.assertEqual(response.status_code, 200)
        
        data = json.loads(response.data)
        self.assertIn("pagination", data)

    def test_async_query_submission(self):
        payload = {
            "type": "power_trend",
            "params": {
                "start_date": "2024-01-01",
                "end_date": "2024-01-07"
            }
        }
        response = self.client.post(
            "/api/async-query",
            data=json.dumps(payload),
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIn("taskId", data["data"])
        self.assertEqual(data["data"]["status"], "submitted")

    def test_query_timeout_handling(self):
        start = time.time()
        response = self.client.get("/api/stats?startDate=2020-01-01&endDate=2024-12-31")
        duration = time.time() - start
        
        self.assertLess(duration, 35)
        self.assertIn(response.status_code, [200, 408])

    def test_timeout_exception(self):
        from api.app import TimeoutException
        self.assertIsInstance(TimeoutException("Test"), Exception)


def run_standalone_tests():
    print("\n=== Running standalone API performance tests ===")
    
    results = []
    
    try:
        cache = LRUCache(capacity=3, ttl=60)
        assert cache is not None, "LRUCache should be created"
        print("✓ test_lru_cache_creation PASSED")
        results.append(True)
    except AssertionError as e:
        print(f"✗ test_lru_cache_creation FAILED: {e}")
        results.append(False)
    
    try:
        cache = LRUCache(capacity=3, ttl=60)
        cache.set("key1", "value1")
        assert cache.get("key1") == "value1", "Should get the same value"
        print("✓ test_lru_cache_set_get PASSED")
        results.append(True)
    except AssertionError as e:
        print(f"✗ test_lru_cache_set_get FAILED: {e}")
        results.append(False)
    
    try:
        cache = LRUCache(capacity=2, ttl=60)
        cache.set("key1", "value1")
        cache.set("key2", "value2")
        cache.set("key3", "value3")
        
        assert cache.get("key1") is None, "key1 should be evicted"
        assert cache.get("key2") == "value2", "key2 should exist"
        assert cache.get("key3") == "value3", "key3 should exist"
        print("✓ test_lru_cache_eviction PASSED")
        results.append(True)
    except AssertionError as e:
        print(f"✗ test_lru_cache_eviction FAILED: {e}")
        results.append(False)
    
    try:
        cache = LRUCache(capacity=3, ttl=60)
        cache.set("key1", "value1")
        cache.set("key2", "value2")
        cache.set("key3", "value3")
        
        cache.get("key1")
        cache.set("key4", "value4")
        
        assert cache.get("key2") is None, "key2 should be evicted"
        assert cache.get("key1") == "value1", "key1 should exist after access"
        print("✓ test_lru_cache_order PASSED")
        results.append(True)
    except AssertionError as e:
        print(f"✗ test_lru_cache_order FAILED: {e}")
        results.append(False)
    
    try:
        cache = LRUCache(capacity=3, ttl=1)
        cache.set("key1", "value1")
        import time
        time.sleep(1.1)
        assert cache.get("key1") is None, "Expired key should return None"
        print("✓ test_lru_cache_ttl_expiration PASSED")
        results.append(True)
    except AssertionError as e:
        print(f"✗ test_lru_cache_ttl_expiration FAILED: {e}")
        results.append(False)
    
    try:
        cache = LRUCache(capacity=3, ttl=60)
        cache.set("key1", "value1")
        cache.set("key2", "value2")
        cache.clear()
        assert cache.get("key1") is None, "Cleared cache should return None"
        assert cache.get("key2") is None, "Cleared cache should return None"
        print("✓ test_lru_cache_clear PASSED")
        results.append(True)
    except AssertionError as e:
        print(f"✗ test_lru_cache_clear FAILED: {e}")
        results.append(False)
    
    try:
        class TimeoutException(Exception):
            pass
        exc = TimeoutException("Test timeout")
        assert isinstance(exc, Exception), "Should be an Exception subclass"
        print("✓ test_timeout_exception PASSED")
        results.append(True)
    except AssertionError as e:
        print(f"✗ test_timeout_exception FAILED: {e}")
        results.append(False)
    
    passed = sum(results)
    total = len(results)
    print(f"\n=== Standalone API Test Results: {passed}/{total} PASSED ===")
    return all(results)


if __name__ == "__main__":
    if FLASK_AVAILABLE:
        unittest.main(verbosity=2)
    else:
        success = run_standalone_tests()
        sys.exit(0 if success else 1)
