import os
import sys
import tempfile
import unittest
import shutil
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.params_parser import ParamsParser
from src.mesh_generator import MeshGenerator
from src.fem_solver import FEMSolver
from src.post_processor import PostProcessor


class TestIntegration(unittest.TestCase):
    def setUp(self):
        self.test_config = """
dam_geometry:
  dam_height: 20.0
  crest_width: 5.0
  upstream_slope: 2.0
  downstream_slope: 2.0
  foundation_depth: 5.0
  reservoir_water_level: 18.0
  tailwater_level: 2.0
  dam_length: 100.0

soil_layers:
  - name: "Dam fill"
    thickness: 20.0
    permeability_x: 1.0e-5
    permeability_y: 1.0e-5
    porosity: 0.35
    density: 2000.0
    saturation: 1.0
  
  - name: "Foundation"
    thickness: 10.0
    permeability_x: 1.0e-6
    permeability_y: 1.0e-6
    porosity: 0.30
    density: 2100.0
    saturation: 1.0

boundary_conditions:
  - type: "head"
    location: "upstream"
    value: 18.0
    description: "Upstream reservoir"
  
  - type: "head"
    location: "downstream"
    value: 2.0
    description: "Downstream water"

simulation_params:
  simulation_type: "steady_state"
  max_iterations: 1000
  convergence_tolerance: 1.0e-6

mesh_params:
  element_type: "quad4"
  mesh_size: 4.0
  refinement_level: 1

output_params:
  output_dir: "./test_output"
  save_vtk: true
  save_numpy: true
  generate_report: true
"""
        self.temp_dir = tempfile.mkdtemp()
        self.config_path = os.path.join(self.temp_dir, 'config.yaml')
        self.output_dir = os.path.join(self.temp_dir, 'output')
        
        with open(self.config_path, 'w', encoding='utf-8') as f:
            f.write(self.test_config)
    
    def tearDown(self):
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)
    
    def test_full_workflow(self):
        parser = ParamsParser(self.config_path)
        
        is_valid, errors = parser.validate()
        self.assertTrue(is_valid, f"Validation errors: {errors}")
        
        generator = MeshGenerator(parser)
        mesh_data = generator.generate_structured_mesh()
        
        self.assertGreater(mesh_data.num_nodes, 0)
        self.assertGreater(mesh_data.num_elements, 0)
        
        solver = FEMSolver(parser, mesh_data)
        result = solver.solve_steady_state()
        
        self.assertTrue(result.converged)
        self.assertGreater(len(result.head), 0)
        
        post_processor = PostProcessor(parser, mesh_data, result, self.output_dir)
        
        plots = post_processor.generate_all_plots()
        
        self.assertIn('hydraulic_head', plots)
        self.assertIn('pressure', plots)
        self.assertIn('velocity_field', plots)
        self.assertIn('phreatic_line', plots)
        
        for plot_path in plots.values():
            if plot_path:
                self.assertTrue(os.path.exists(plot_path), f"Plot file not found: {plot_path}")
        
        data_files = post_processor.export_data()
        
        self.assertIn('numpy', data_files)
        self.assertIn('csv', data_files)
        
        for data_path in data_files.values():
            self.assertTrue(os.path.exists(data_path), f"Data file not found: {data_path}")
        
        stats = post_processor.get_statistics()
        
        self.assertIn('hydraulic_head', stats)
        self.assertIn('pressure', stats)
        self.assertIn('velocity', stats)
        self.assertIn('hydraulic_gradient', stats)
        
        self.assertGreater(stats['hydraulic_head']['max'], 0)
        self.assertGreater(stats['pressure']['max'], 0)
    
    def test_head_boundary_values(self):
        parser = ParamsParser(self.config_path)
        generator = MeshGenerator(parser)
        mesh_data = generator.generate_structured_mesh()
        
        solver = FEMSolver(parser, mesh_data)
        result = solver.solve_steady_state()
        
        if 'upstream' in mesh_data.boundary_nodes:
            upstream_nodes = mesh_data.boundary_nodes['upstream']
            if len(upstream_nodes) > 0:
                avg_upstream_head = np.mean(result.head[upstream_nodes])
                self.assertAlmostEqual(avg_upstream_head, 18.0, delta=2.0)
        
        if 'downstream' in mesh_data.boundary_nodes:
            downstream_nodes = mesh_data.boundary_nodes['downstream']
            if len(downstream_nodes) > 0:
                avg_downstream_head = np.mean(result.head[downstream_nodes])
                self.assertAlmostEqual(avg_downstream_head, 2.0, delta=1.0)


if __name__ == '__main__':
    unittest.main()
