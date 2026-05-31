import os
import sys
import tempfile
import unittest
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.params_parser import ParamsParser, DamGeometry, SoilLayer, BoundaryCondition
from src.mesh_generator import MeshGenerator
from src.fem_solver import FEMSolver, FEMResult


class TestFEMSolver(unittest.TestCase):
    def setUp(self):
        self.parser = ParamsParser()
        self.parser.dam_geometry = DamGeometry(
            dam_height=20.0,
            crest_width=5.0,
            upstream_slope=2.0,
            downstream_slope=2.0,
            foundation_depth=5.0,
            reservoir_water_level=18.0,
            tailwater_level=2.0,
            dam_length=100.0
        )
        self.parser.soil_layers = [
            SoilLayer(
                name="坝体填土",
                thickness=20.0,
                permeability_x=1.0e-5,
                permeability_y=1.0e-5,
                porosity=0.35,
                density=2000.0
            ),
            SoilLayer(
                name="基础层",
                thickness=10.0,
                permeability_x=1.0e-6,
                permeability_y=1.0e-6,
                porosity=0.30,
                density=2100.0
            )
        ]
        self.parser.mesh_params = {
            'mesh_size': 4.0,
            'refinement_level': 1
        }
        self.parser.simulation_params = type('obj', (object,), {
            'simulation_type': 'steady_state',
            'max_iterations': 1000,
            'convergence_tolerance': 1e-6,
            'time_step': 1.0,
            'total_time': 100.0
        })()
        self.parser.boundary_conditions = [
            BoundaryCondition(type='head', location='upstream', value=18.0),
            BoundaryCondition(type='head', location='downstream', value=2.0)
        ]
        
        generator = MeshGenerator(self.parser)
        self.mesh_data = generator.generate_structured_mesh()
    
    def test_fem_solver_initialization(self):
        solver = FEMSolver(self.parser, self.mesh_data)
        
        self.assertIsNotNone(solver)
        self.assertEqual(solver.params, self.parser)
        self.assertEqual(solver.mesh, self.mesh_data)
        self.assertIsNone(solver.result)
    
    def test_shape_function(self):
        solver = FEMSolver(self.parser, self.mesh_data)
        
        N, dN_dxi, dN_deta = solver._shape_function(0.0, 0.0)
        
        self.assertEqual(len(N), 4)
        self.assertEqual(len(dN_dxi), 4)
        self.assertEqual(len(dN_deta), 4)
        self.assertAlmostEqual(np.sum(N), 1.0, places=6)
    
    def test_gauss_quadrature(self):
        solver = FEMSolver(self.parser, self.mesh_data)
        
        points, weights = solver._gauss_quadrature_2d(2)
        
        self.assertEqual(len(points), 4)
        self.assertEqual(len(weights), 4)
        self.assertAlmostEqual(np.sum(weights), 4.0, places=6)
    
    def test_solve_steady_state(self):
        solver = FEMSolver(self.parser, self.mesh_data)
        result = solver.solve_steady_state()
        
        self.assertIsInstance(result, FEMResult)
        self.assertEqual(len(result.head), self.mesh_data.num_nodes)
        self.assertEqual(len(result.pressure), self.mesh_data.num_nodes)
        self.assertTrue(result.converged)
        self.assertGreater(result.solve_time, 0)
        
        self.assertTrue(np.all(np.isfinite(result.head)))
        self.assertTrue(np.all(np.isfinite(result.pressure)))
    
    def test_result_summary(self):
        solver = FEMSolver(self.parser, self.mesh_data)
        solver.solve_steady_state()
        
        summary = solver.get_result_summary()
        
        self.assertIn('max_head', summary)
        self.assertIn('min_head', summary)
        self.assertIn('avg_head', summary)
        self.assertIn('max_pressure', summary)
        self.assertIn('max_velocity', summary)
        self.assertIn('solve_time', summary)
        self.assertIn('converged', summary)
    
    def test_save_and_load_result(self):
        solver = FEMSolver(self.parser, self.mesh_data)
        result = solver.solve_steady_state()
        
        with tempfile.NamedTemporaryFile(suffix='.npz', delete=False) as f:
            save_path = f.name
        
        try:
            result.save(save_path)
            self.assertTrue(os.path.exists(save_path))
            
            loaded_result = FEMResult.load(save_path)
            
            np.testing.assert_array_equal(loaded_result.head, result.head)
            np.testing.assert_array_equal(loaded_result.pressure, result.pressure)
            self.assertEqual(loaded_result.converged, result.converged)
            self.assertAlmostEqual(loaded_result.solve_time, result.solve_time, places=4)
            
        finally:
            os.unlink(save_path)


if __name__ == '__main__':
    unittest.main()
