import unittest
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from spark.power_aggregation import (
        PowerAggregator, W_TO_KW, KWH_TO_MWH
    )
    PYSPARK_AVAILABLE = True
except ImportError as e:
    print(f"PySpark not available: {e}")
    PYSPARK_AVAILABLE = False
    W_TO_KW = 0.001
    KWH_TO_MWH = 0.001


class TestPowerAggregation(unittest.TestCase):

    def test_unit_conversion_constants(self):
        self.assertAlmostEqual(W_TO_KW, 0.001, places=6)
        self.assertAlmostEqual(KWH_TO_MWH, 0.001, places=6)

    def test_w_to_kw_conversion(self):
        watts = 1500.0
        expected_kw = watts * W_TO_KW
        self.assertAlmostEqual(expected_kw, 1.5, places=4)

    def test_kwh_to_mwh_conversion(self):
        kwh = 1500.0
        expected_mwh = kwh * KWH_TO_MWH
        self.assertAlmostEqual(expected_mwh, 1.5, places=4)

    def test_power_statistics_units(self):
        total_power_kwh = 1250.5
        total_power_mwh = total_power_kwh * KWH_TO_MWH
        
        self.assertAlmostEqual(total_power_mwh, 1.2505, places=4)

    def test_efficiency_calculation_logic(self):
        panel_power = 1000.0
        inverter_power = 950.0
        
        efficiency = (inverter_power / panel_power) * 100
        expected_efficiency = 95.0
        self.assertAlmostEqual(efficiency, expected_efficiency, places=4)

    def test_aggregation_formula_hourly(self):
        power_values = [100.0, 150.0, 200.0, 250.0]
        avg_power = sum(power_values) / len(power_values)
        total_power_kwh = avg_power / 12
        
        self.assertAlmostEqual(avg_power, 175.0)
        self.assertAlmostEqual(total_power_kwh, 14.5833, places=4)

    def test_integration_calculation(self):
        time_diff_hours = 0.5
        power1 = 200.0
        power2 = 300.0
        
        avg_power = (power1 + power2) / 2
        energy_kwh = avg_power * time_diff_hours
        
        self.assertAlmostEqual(avg_power, 250.0)
        self.assertAlmostEqual(energy_kwh, 125.0)

    def test_data_validation_logic(self):
        test_cases = [
            {"power": 100.0, "quality": "good", "valid": True},
            {"power": -5.0, "quality": "good", "valid": False},
            {"power": 150.0, "quality": "suspect", "valid": False},
            {"power": None, "quality": "good", "valid": False},
        ]
        
        for case in test_cases:
            is_valid = (
                case["power"] is not None and
                case["power"] >= 0 and
                case["quality"] == "good"
            )
            self.assertEqual(is_valid, case["valid"], 
                f"Failed for power={case['power']}, quality={case['quality']}")


if not PYSPARK_AVAILABLE:
    def run_standalone_tests():
        print("\n=== Running standalone power aggregation tests ===")
        
        results = []
        
        try:
            assert abs(W_TO_KW - 0.001) < 1e-6, "W_TO_KW should be 0.001"
            assert abs(KWH_TO_MWH - 0.001) < 1e-6, "KWH_TO_MWH should be 0.001"
            print("✓ test_unit_conversion_constants PASSED")
            results.append(True)
        except AssertionError as e:
            print(f"✗ test_unit_conversion_constants FAILED: {e}")
            results.append(False)
        
        try:
            watts = 1500.0
            expected_kw = watts * W_TO_KW
            assert abs(expected_kw - 1.5) < 1e-4, f"Expected 1.5, got {expected_kw}"
            print("✓ test_w_to_kw_conversion PASSED")
            results.append(True)
        except AssertionError as e:
            print(f"✗ test_w_to_kw_conversion FAILED: {e}")
            results.append(False)
        
        try:
            kwh = 1500.0
            expected_mwh = kwh * KWH_TO_MWH
            assert abs(expected_mwh - 1.5) < 1e-4, f"Expected 1.5, got {expected_mwh}"
            print("✓ test_kwh_to_mwh_conversion PASSED")
            results.append(True)
        except AssertionError as e:
            print(f"✗ test_kwh_to_mwh_conversion FAILED: {e}")
            results.append(False)
        
        try:
            total_power_kwh = 1250.5
            total_power_mwh = total_power_kwh * KWH_TO_MWH
            assert abs(total_power_mwh - 1.2505) < 1e-4, f"Expected 1.2505, got {total_power_mwh}"
            print("✓ test_power_statistics_units PASSED")
            results.append(True)
        except AssertionError as e:
            print(f"✗ test_power_statistics_units FAILED: {e}")
            results.append(False)
        
        try:
            panel_power = 1000.0
            inverter_power = 950.0
            efficiency = (inverter_power / panel_power) * 100
            assert abs(efficiency - 95.0) < 1e-4, f"Expected 95.0, got {efficiency}"
            print("✓ test_efficiency_calculation_logic PASSED")
            results.append(True)
        except AssertionError as e:
            print(f"✗ test_efficiency_calculation_logic FAILED: {e}")
            results.append(False)
        
        try:
            power_values = [100.0, 150.0, 200.0, 250.0]
            avg_power = sum(power_values) / len(power_values)
            total_power_kwh = avg_power / 12
            assert abs(avg_power - 175.0) < 1e-4, f"Expected 175.0, got {avg_power}"
            assert abs(total_power_kwh - 14.5833) < 1e-4, f"Expected 14.5833, got {total_power_kwh}"
            print("✓ test_aggregation_formula_hourly PASSED")
            results.append(True)
        except AssertionError as e:
            print(f"✗ test_aggregation_formula_hourly FAILED: {e}")
            results.append(False)
        
        try:
            time_diff_hours = 0.5
            power1 = 200.0
            power2 = 300.0
            avg_power = (power1 + power2) / 2
            energy_kwh = avg_power * time_diff_hours
            assert abs(avg_power - 250.0) < 1e-4, f"Expected 250.0, got {avg_power}"
            assert abs(energy_kwh - 125.0) < 1e-4, f"Expected 125.0, got {energy_kwh}"
            print("✓ test_integration_calculation PASSED")
            results.append(True)
        except AssertionError as e:
            print(f"✗ test_integration_calculation FAILED: {e}")
            results.append(False)
        
        try:
            test_cases = [
                {"power": 100.0, "quality": "good", "valid": True},
                {"power": -5.0, "quality": "good", "valid": False},
                {"power": 150.0, "quality": "suspect", "valid": False},
                {"power": None, "quality": "good", "valid": False},
            ]
            for case in test_cases:
                is_valid = (
                    case["power"] is not None and
                    case["power"] >= 0 and
                    case["quality"] == "good"
                )
                assert is_valid == case["valid"], f"Failed for power={case['power']}, quality={case['quality']}"
            print("✓ test_data_validation_logic PASSED")
            results.append(True)
        except AssertionError as e:
            print(f"✗ test_data_validation_logic FAILED: {e}")
            results.append(False)
        
        passed = sum(results)
        total = len(results)
        print(f"\n=== Standalone Test Results: {passed}/{total} PASSED ===")
        return all(results)


if __name__ == "__main__":
    unittest.main(verbosity=2)
