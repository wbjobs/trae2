import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.params_parser import ParamsParser, DamGeometry, SoilLayer, BoundaryCondition


class TestParamsParser(unittest.TestCase):
    def setUp(self):
        self.test_config = """
dam_geometry:
  dam_height: 30.0
  crest_width: 8.0
  upstream_slope: 2.5
  downstream_slope: 2.0
  foundation_depth: 10.0
  reservoir_water_level: 28.0
  tailwater_level: 2.0
  dam_length: 100.0

soil_layers:
  - name: "Dam fill"
    thickness: 30.0
    permeability_x: 1.0e-5
    permeability_y: 5.0e-6
    porosity: 0.35
    density: 2000.0
    saturation: 1.0
  
  - name: "Foundation"
    thickness: 15.0
    permeability_x: 1.0e-6
    permeability_y: 1.0e-6
    porosity: 0.30
    density: 2100.0
    saturation: 1.0

boundary_conditions:
  - type: "head"
    location: "upstream"
    value: 28.0
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
  mesh_size: 2.0
  refinement_level: 1

output_params:
  output_dir: "./output"
  save_vtk: true
"""
    
    def test_load_yaml_config(self):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            f.write(self.test_config)
            config_path = f.name
        
        try:
            parser = ParamsParser(config_path)
            
            self.assertIsNotNone(parser.dam_geometry)
            self.assertEqual(parser.dam_geometry.dam_height, 30.0)
            self.assertEqual(parser.dam_geometry.crest_width, 8.0)
            
            self.assertEqual(len(parser.soil_layers), 2)
            self.assertEqual(parser.soil_layers[0].name, "Dam fill")
            self.assertEqual(parser.soil_layers[0].permeability_x, 1.0e-5)
            
            self.assertEqual(len(parser.boundary_conditions), 2)
            
            self.assertEqual(parser.simulation_params.simulation_type, "steady_state")
            
        finally:
            os.unlink(config_path)
    
    def test_validate_config(self):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            f.write(self.test_config)
            config_path = f.name
        
        try:
            parser = ParamsParser(config_path)
            is_valid, errors = parser.validate()
            
            self.assertTrue(is_valid, f"Validation errors: {errors}")
            self.assertEqual(len(errors), 0)
            
        finally:
            os.unlink(config_path)
    
    def test_get_permeability_at_point(self):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            f.write(self.test_config)
            config_path = f.name
        
        try:
            parser = ParamsParser(config_path)
            
            kx, ky = parser.get_permeability_at_point(0, 15.0)
            self.assertEqual(kx, 1.0e-5)
            self.assertEqual(ky, 5.0e-6)
            
            kx, ky = parser.get_permeability_at_point(0, 35.0)
            self.assertEqual(kx, 1.0e-6)
            self.assertEqual(ky, 1.0e-6)
            
        finally:
            os.unlink(config_path)
    
    def test_to_dict(self):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            f.write(self.test_config)
            config_path = f.name
        
        try:
            parser = ParamsParser(config_path)
            config_dict = parser.to_dict()
            
            self.assertIn('dam_geometry', config_dict)
            self.assertIn('soil_layers', config_dict)
            self.assertIn('simulation_params', config_dict)
            self.assertEqual(config_dict['dam_geometry']['dam_height'], 30.0)
            
        finally:
            os.unlink(config_path)


if __name__ == '__main__':
    unittest.main()
