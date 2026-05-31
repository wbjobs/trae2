#!/usr/bin/env python
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_imports():
    print("Testing imports...")
    
    try:
        from cfd_dem_suite.config import SimulationConfig
        print("  ✓ config module")
    except Exception as e:
        print(f"  ✗ config module: {e}")
        return False
    
    try:
        from cfd_dem_suite.kernel import CFDDEMSolver, SimulationState
        print("  ✓ kernel module")
    except Exception as e:
        print(f"  ✗ kernel module: {e}")
        return False
    
    try:
        from cfd_dem_suite.scheduler import TaskScheduler, TaskStatus
        print("  ✓ scheduler module")
    except Exception as e:
        print(f"  ✗ scheduler module: {e}")
        return False
    
    try:
        from cfd_dem_suite.output import ResultExporter
        print("  ✓ output module")
    except Exception as e:
        print(f"  ✗ output module: {e}")
        return False
    
    try:
        from cfd_dem_suite.adapter import CrossEnvironmentAdapter
        print("  ✓ adapter module")
    except Exception as e:
        print(f"  ✗ adapter module: {e}")
        return False
    
    try:
        from cfd_dem_suite.backend import BackendClient, BackendIntegration
        print("  ✓ backend module")
    except Exception as e:
        print(f"  ✗ backend module: {e}")
        return False
    
    try:
        from cfd_dem_suite.main import main
        print("  ✓ main module")
    except Exception as e:
        print(f"  ✗ main module: {e}")
        return False
    
    return True


def test_config():
    print("\nTesting config module...")
    from cfd_dem_suite.config import SimulationConfig
    
    try:
        config = SimulationConfig()
        config.validate()
        print("  ✓ Default config creation and validation")
        
        config.particle.count = 100
        config.simulation.time_step = 1e-5
        config.simulation.total_time = 0.001
        
        assert config.particle.count == 100
        print("  ✓ Config parameter modification")
        
        return True
    except Exception as e:
        print(f"  ✗ Config test failed: {e}")
        return False


def test_kernel():
    print("\nTesting kernel module...")
    from cfd_dem_suite.config import SimulationConfig
    from cfd_dem_suite.kernel import CFDDEMSolver
    
    try:
        config = SimulationConfig()
        config.particle.count = 50
        config.simulation.time_step = 1e-5
        config.simulation.total_time = 0.0001
        
        solver = CFDDEMSolver(config)
        print("  ✓ Solver initialization")
        
        assert solver.state.particle_data.positions.shape == (50, 3)
        print("  ✓ Particle data structure")
        
        result = solver.step()
        print(f"  ✓ Single step execution (step: {solver.state.current_step})")
        
        return True
    except Exception as e:
        print(f"  ✗ Kernel test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_simulation():
    print("\nTesting full simulation (small scale)...")
    from cfd_dem_suite.config import SimulationConfig
    from cfd_dem_suite.kernel import CFDDEMSolver
    
    try:
        config = SimulationConfig()
        config.particle.count = 20
        config.simulation.time_step = 1e-5
        config.simulation.total_time = 0.0005
        config.output.output_dir = "./test_results"
        
        solver = CFDDEMSolver(config)
        
        progress_values = []
        def progress_cb(progress, state):
            progress_values.append(progress)
        
        state = solver.run(progress_callback=progress_cb)
        
        assert state.current_step > 0
        assert len(progress_values) > 0
        print(f"  ✓ Simulation completed ({state.current_step} steps)")
        print(f"  ✓ Progress callback working")
        print(f"  ✓ Collision count: {state.collision_count}")
        
        return True
    except Exception as e:
        print(f"  ✗ Simulation test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    print("=" * 60)
    print("CFD-DEM Suite Import and Functionality Test")
    print("=" * 60)
    
    all_passed = True
    
    all_passed &= test_imports()
    all_passed &= test_config()
    all_passed &= test_kernel()
    all_passed &= test_simulation()
    
    print("\n" + "=" * 60)
    if all_passed:
        print("All tests PASSED! ✓")
    else:
        print("Some tests FAILED! ✗")
    print("=" * 60)
    
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
