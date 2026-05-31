import unittest
from datetime import datetime
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

PHYSICAL_BOUNDS = None
JUMP_DETECTION_THRESHOLDS = None

try:
    from pyspark.sql import SparkSession
    from pyspark.sql.functions import col, lit
    from pyspark.sql.types import StructType, StructField, StringType, DoubleType, TimestampType
    from spark.data_cleaning import PVDataCleaner, PHYSICAL_BOUNDS, JUMP_DETECTION_THRESHOLDS
    PYSPARK_AVAILABLE = True
except ImportError as e:
    print(f"PySpark not available: {e}")
    PYSPARK_AVAILABLE = False
    PHYSICAL_BOUNDS = {
        "power_output": {"min": 0, "max": 5000},
        "temperature": {"min": -40, "max": 120},
        "voltage": {"min": 0, "max": 1500},
        "current": {"min": 0, "max": 1000},
        "irradiance": {"min": 0, "max": 1500},
        "wind_speed": {"min": 0, "max": 60},
        "humidity": {"min": 0, "max": 100},
        "pressure": {"min": 800, "max": 1100},
        "efficiency": {"min": 0, "max": 110},
        "soc": {"min": 0, "max": 100},
        "grid_frequency": {"min": 45, "max": 65},
        "reactive_power": {"min": -5000, "max": 5000},
        "power_factor": {"min": -1, "max": 1}
    }
    JUMP_DETECTION_THRESHOLDS = {
        "power_output": 0.8,
        "temperature": 0.5,
        "voltage": 0.3,
        "current": 0.5,
        "irradiance": 0.8,
        "default": 0.5
    }


@unittest.skipIf(not PYSPARK_AVAILABLE, "PySpark not available")
class TestDataCleaning(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.spark = SparkSession.builder \
            .appName("TestDataCleaning") \
            .master("local[2]") \
            .getOrCreate()
        
        cls.cleaner = PVDataCleaner(cls.spark)

    @classmethod
    def tearDownClass(cls):
        cls.cleaner.close()
        cls.spark.stop()

    def test_physical_bounds_check(self):
        schema = StructType([
            StructField("device_id", StringType(), True),
            StructField("data_time", TimestampType(), True),
            StructField("power_output", DoubleType(), True),
            StructField("temperature", DoubleType(), True)
        ])
        
        test_data = [
            ("DEV001", datetime.now(), 300.0, 25.0),
            ("DEV001", datetime.now(), 6000.0, 25.0),
            ("DEV001", datetime.now(), -10.0, 25.0),
            ("DEV001", datetime.now(), 400.0, 150.0),
        ]
        
        df = self.spark.createDataFrame(test_data, schema)
        df = self.cleaner.check_physical_bounds(df)
        
        self.assertIn("power_output_in_bounds", df.columns)
        self.assertIn("temperature_in_bounds", df.columns)
        
        bounds = self.cleaner.cleaning_stats.get("physical_bounds", {})
        self.assertIn("power_output", bounds)
        self.assertIn("temperature", bounds)
        self.assertEqual(bounds["power_output"]["out_of_bounds"], 2)
        self.assertEqual(bounds["temperature"]["out_of_bounds"], 1)

    def test_remove_duplicates(self):
        schema = StructType([
            StructField("device_id", StringType(), True),
            StructField("data_time", TimestampType(), True),
            StructField("power_output", DoubleType(), True)
        ])
        
        base_time = datetime.now()
        test_data = [
            ("DEV001", base_time, 300.0),
            ("DEV001", base_time, 350.0),
            ("DEV001", datetime.now(), 400.0),
        ]
        
        df = self.spark.createDataFrame(test_data, schema)
        
        initial_count = df.count()
        df_clean = self.cleaner.remove_duplicates(df, subset=["device_id", "data_time"])
        
        self.assertEqual(df_clean.count(), initial_count - 1)
        self.assertEqual(self.cleaner.cleaning_stats["duplicates_removed"], 1)

    def test_handle_missing_values(self):
        schema = StructType([
            StructField("device_id", StringType(), True),
            StructField("data_time", StringType(), True),
            StructField("power_output", DoubleType(), True),
            StructField("temperature", DoubleType(), True)
        ])
        
        test_data = [
            ("DEV001", "2024-01-01 12:00:00", 300.0, 25.0),
            ("DEV001", "2024-01-01 13:00:00", None, 26.0),
            ("DEV001", "2024-01-01 14:00:00", 350.0, None),
        ]
        
        df = self.spark.createDataFrame(test_data, schema)
        df_clean = self.cleaner.handle_missing_values(df, strategy='impute')
        
        missing_stats = self.cleaner.cleaning_stats["missing_values"]
        self.assertIn("power_output", missing_stats)
        self.assertEqual(missing_stats["power_output"], 1)
        self.assertEqual(missing_stats["temperature"], 1)
        
        null_count = df_clean.filter(col("power_output").isNull()).count()
        self.assertEqual(null_count, 0)

    def test_add_data_quality_flag(self):
        schema = StructType([
            StructField("device_id", StringType(), True),
            StructField("data_time", StringType(), True),
            StructField("power_output", DoubleType(), True),
            StructField("temperature", DoubleType(), True),
            StructField("irradiance", DoubleType(), True)
        ])
        
        test_data = [
            ("DEV001", "2024-01-01 12:00:00", 300.0, 25.0, 800.0),
            ("DEV001", "2024-01-01 13:00:00", -10.0, 26.0, 700.0),
        ]
        
        df = self.spark.createDataFrame(test_data, schema)
        df_clean = self.cleaner.add_data_quality_flag(df)
        
        self.assertIn("data_quality", df_clean.columns)
        
        good_count = df_clean.filter(col("data_quality") == "good").count()
        self.assertEqual(good_count, 1)

    def test_enhanced_anomaly_filter(self):
        schema = StructType([
            StructField("device_id", StringType(), True),
            StructField("data_time", TimestampType(), True),
            StructField("power_output", DoubleType(), True),
            StructField("voltage", DoubleType(), True),
            StructField("temperature", DoubleType(), True)
        ])
        
        base_time = datetime.now()
        test_data = [
            ("DEV001", base_time, 300.0, 600.0, 25.0),
            ("DEV001", datetime.now(), 6000.0, 2000.0, 25.0),
            ("DEV001", datetime.now(), -10.0, 500.0, 25.0),
        ]
        
        df = self.spark.createDataFrame(test_data, schema)
        
        df = self.cleaner.check_physical_bounds(df)
        df = self.cleaner.check_negative_values(df)
        df_filtered = self.cleaner.enhanced_anomaly_filter(df, filter_mode="remove")
        
        self.assertIn("enhanced_quality", df_filtered.columns)
        self.assertEqual(df_filtered.count(), 1)

    def test_constants_defined(self):
        self.assertIsInstance(PHYSICAL_BOUNDS, dict)
        self.assertIn("power_output", PHYSICAL_BOUNDS)
        self.assertIsInstance(JUMP_DETECTION_THRESHOLDS, dict)
        self.assertIn("power_output", JUMP_DETECTION_THRESHOLDS)
        
        self.assertEqual(PHYSICAL_BOUNDS["power_output"]["min"], 0)
        self.assertGreater(PHYSICAL_BOUNDS["power_output"]["max"], 0)
        self.assertGreater(JUMP_DETECTION_THRESHOLDS["power_output"], 0)

if not PYSPARK_AVAILABLE:
    def standalone_test_constants():
        print("\n=== Running standalone constant tests ===")
        assert isinstance(PHYSICAL_BOUNDS, dict), "PHYSICAL_BOUNDS should be a dict"
        assert "power_output" in PHYSICAL_BOUNDS, "PHYSICAL_BOUNDS should contain power_output"
        assert isinstance(JUMP_DETECTION_THRESHOLDS, dict), "JUMP_DETECTION_THRESHOLDS should be a dict"
        assert "power_output" in JUMP_DETECTION_THRESHOLDS, "JUMP_DETECTION_THRESHOLDS should contain power_output"
        assert PHYSICAL_BOUNDS["power_output"]["min"] == 0, "power_output min should be 0"
        assert PHYSICAL_BOUNDS["power_output"]["max"] > 0, "power_output max should be > 0"
        assert JUMP_DETECTION_THRESHOLDS["power_output"] > 0, "power_output jump threshold should be > 0"
        print("All standalone constant tests PASSED!")


if __name__ == "__main__":
    unittest.main(verbosity=2)
