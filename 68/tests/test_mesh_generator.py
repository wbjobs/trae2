import os
import sys
import tempfile
import unittest
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.params_parser import ParamsParser, DamGeometry, SoilLayer, BoundaryCondition
from src.mesh_generator import MeshGenerator, MeshData


class TestMeshGenerator(unittest.TestCase):
    def setUp(self):
        self.parser = ParamsParser()
        self.parser.dam_geometry = DamGeometry(
            dam_height=30.0,
            crest_width=8.0,
            upstream_slope=2.5,
            downstream_slope=2.0,
            foundation_depth=10.0,
            reservoir_water_level=28.0,
            tailwater_level=2.0,
            dam_length=100.0
        )
        self.parser.soil_layers = [
            SoilLayer(
                name="坝体填土",
                thickness=30.0,
                permeability_x=1.0e-5,
                permeability_y=5.0e-6,
                porosity=0.35,
                density=2000.0
            ),
            SoilLayer(
                name="基础层",
                thickness=15.0,
                permeability_x=1.0e-6,
                permeability_y=1.0e-6,
                porosity=0.30,
                density=2100.0
            )
        ]
        self.parser.mesh_params = {
            'mesh_size': 5.0,
            'refinement_level': 1
        }
        self.parser.boundary_conditions = [
            BoundaryCondition(type='head', location='upstream', value=28.0),
            BoundaryCondition(type='head', location='downstream', value=2.0)
        ]
    
    def test_generate_structured_mesh(self):
        generator = MeshGenerator(self.parser)
        mesh_data = generator.generate_structured_mesh()
        
        self.assertIsInstance(mesh_data, MeshData)
        self.assertGreater(mesh_data.num_nodes, 0)
        self.assertGreater(mesh_data.num_elements, 0)
        self.assertEqual(len(mesh_data.nodes), mesh_data.num_nodes)
        self.assertEqual(len(mesh_data.elements), mesh_data.num_elements)
    
    def test_mesh_boundary_nodes(self):
        generator = MeshGenerator(self.parser)
        mesh_data = generator.generate_structured_mesh()
        
        self.assertIsInstance(mesh_data.boundary_nodes, dict)
        self.assertGreater(len(mesh_data.boundary_nodes), 0)
        
        for boundary_name, node_indices in mesh_data.boundary_nodes.items():
            self.assertIsInstance(node_indices, np.ndarray)
            self.assertGreater(len(node_indices), 0)
    
    def test_element_materials(self):
        generator = MeshGenerator(self.parser)
        mesh_data = generator.generate_structured_mesh()
        
        self.assertEqual(len(mesh_data.element_materials), mesh_data.num_elements)
        self.assertTrue(np.all(mesh_data.element_materials >= 0))
    
    def test_mesh_quality(self):
        generator = MeshGenerator(self.parser)
        generator.generate_structured_mesh()
        
        quality = generator.get_mesh_quality()
        
        self.assertIn('num_nodes', quality)
        self.assertIn('num_elements', quality)
        self.assertIn('max_aspect_ratio', quality)
        self.assertIn('avg_aspect_ratio', quality)
        self.assertIn('total_area', quality)
        
        self.assertEqual(quality['num_nodes'], generator.mesh_data.num_nodes)
        self.assertEqual(quality['num_elements'], generator.mesh_data.num_elements)
    
    def test_refine_mesh(self):
        generator = MeshGenerator(self.parser)
        generator.generate_structured_mesh()
        original_nodes = generator.mesh_data.num_nodes
        original_elements = generator.mesh_data.num_elements
        
        generator.refine_mesh(2)
        
        self.assertGreater(generator.mesh_data.num_nodes, original_nodes)
        self.assertGreater(generator.mesh_data.num_elements, original_elements)
    
    def test_save_and_load_mesh(self):
        generator = MeshGenerator(self.parser)
        mesh_data = generator.generate_structured_mesh()
        
        with tempfile.NamedTemporaryFile(suffix='.npz', delete=False) as f:
            save_path = f.name
        
        try:
            mesh_data.save(save_path)
            self.assertTrue(os.path.exists(save_path))
            
            loaded_mesh = MeshData.load(save_path)
            self.assertEqual(loaded_mesh.num_nodes, mesh_data.num_nodes)
            self.assertEqual(loaded_mesh.num_elements, mesh_data.num_elements)
            np.testing.assert_array_equal(loaded_mesh.nodes, mesh_data.nodes)
            np.testing.assert_array_equal(loaded_mesh.elements, mesh_data.elements)
            
        finally:
            os.unlink(save_path)


if __name__ == '__main__':
    unittest.main()
