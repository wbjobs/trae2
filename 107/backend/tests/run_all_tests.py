import unittest
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    import pyspark
    PYSPARK_AVAILABLE = True
except ImportError:
    PYSPARK_AVAILABLE = False


def run_standalone_tests():
    print("\n" + "="*60)
    print("RUNNING STANDALONE TESTS (PySpark not available)")
    print("="*60)
    
    all_passed = True
    
    from test_power_aggregation import run_standalone_tests as run_power_tests
    power_passed = run_power_tests()
    all_passed = all_passed and power_passed
    
    from test_data_cleaning import standalone_test_constants
    try:
        standalone_test_constants()
        all_passed = all_passed and True
    except Exception as e:
        print(f"✗ standalone_test_constants FAILED: {e}")
        all_passed = False
    
    try:
        from test_api_performance import run_standalone_tests as run_api_tests
        api_passed = run_api_tests()
        all_passed = all_passed and api_passed
    except ImportError as e:
        print(f"Note: test_api_performance standalone tests not available: {e}")
    
    print("\n" + "="*60)
    print(f"STANDALONE TEST SUMMARY: {'ALL PASSED' if all_passed else 'SOME FAILED'}")
    print("="*60)
    
    return all_passed


def run_unittest_suite():
    loader = unittest.TestLoader()
    start_dir = os.path.dirname(os.path.abspath(__file__))
    suite = loader.discover(start_dir, pattern="test_*.py")
    
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    print(f"Tests run: {result.testsRun}")
    print(f"Failures: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")
    print(f"Success: {result.testsRun - len(result.failures) - len(result.errors)}")
    
    if result.failures:
        print("\nFailures:")
        for test, traceback in result.failures:
            print(f"  - {test}: {traceback.split(chr(10))[0]}")
    
    if result.errors:
        print("\nErrors:")
        for test, traceback in result.errors:
            print(f"  - {test}: {traceback.split(chr(10))[0]}")
    
    print("="*60)
    
    return result.wasSuccessful()


if __name__ == "__main__":
    if PYSPARK_AVAILABLE:
        print("PySpark detected, running full test suite...")
        success = run_unittest_suite()
    else:
        print("PySpark not available, running standalone tests...")
        success = run_standalone_tests()
    
    sys.exit(0 if success else 1)
