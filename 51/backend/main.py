from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import numpy as np
import os
import tempfile

from modules.parameter_parser import ParameterParser
from modules.ray_simulation import RaySimulator, BatchSimulator
from modules.interference import InterferenceCalculator
from modules.report_generator import ReportGenerator

app = FastAPI(title="光路仿真API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

parameter_parser = ParameterParser()
ray_simulator = RaySimulator()
batch_simulator = BatchSimulator()
interference_calc = InterferenceCalculator()
report_generator = ReportGenerator()

class OpticalElement(BaseModel):
    id: str
    type: str
    position: Dict[str, float]
    parameters: Dict[str, Any]

class SimulationRequest(BaseModel):
    elements: List[OpticalElement]
    light_source: Dict[str, Any]
    simulation_type: str = "ray_tracing"
    resolution: int = 1000
    enable_recording: bool = False

class BatchConfig(BaseModel):
    id: str = ""
    name: str = ""
    elements: List[OpticalElement]
    light_source: Dict[str, Any]
    simulation_type: str = "ray_tracing"
    resolution: int = 500

class BatchCompareRequest(BaseModel):
    configs: List[BatchConfig]

class ParseRequest(BaseModel):
    file_content: str
    file_type: str

@app.get("/")
async def root():
    return {"message": "光路仿真服务已启动", "version": "1.0.0"}

@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}

@app.post("/api/parse/parameters")
async def parse_parameters(request: ParseRequest):
    try:
        result = parameter_parser.parse(request.file_content, request.file_type)
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/parse/upload")
async def upload_parameters(file: UploadFile = File(...)):
    try:
        content = await file.read()
        file_type = file.filename.split(".")[-1].lower()
        result = parameter_parser.parse(content.decode("utf-8"), file_type)
        return {"success": True, "data": result, "filename": file.filename}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/simulate/ray")
async def simulate_ray(request: SimulationRequest):
    try:
        elements_data = [e.dict() for e in request.elements]
        result = ray_simulator.simulate(
            elements=elements_data,
            light_source=request.light_source,
            resolution=request.resolution,
            enable_recording=request.enable_recording
        )
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/simulate/interference")
async def simulate_interference(request: SimulationRequest):
    try:
        elements_data = [e.dict() for e in request.elements]
        result = interference_calc.calculate(
            elements=elements_data,
            light_source=request.light_source,
            simulation_type=request.simulation_type,
            resolution=request.resolution
        )
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/report/generate")
async def generate_report(report_data: Dict[str, Any]):
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            report_path = report_generator.generate(
                simulation_results=report_data.get("simulation_results", {}),
                element_data=report_data.get("element_data", []),
                output_path=tmp.name
            )
        return FileResponse(
            report_path,
            media_type="application/pdf",
            filename="光路仿真调试报告.pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/elements/types")
async def get_element_types():
    return {
        "success": True,
        "data": parameter_parser.get_supported_elements()
    }

@app.get("/api/templates/{template_name}")
async def get_template(template_name: str):
    try:
        template = parameter_parser.get_template(template_name)
        return {"success": True, "data": template}
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.post("/api/simulate/batch")
async def simulate_batch(request: BatchCompareRequest):
    try:
        configs_data = []
        for config in request.configs:
            config_dict = config.dict()
            config_dict["elements"] = [e.dict() for e in config.elements]
            configs_data.append(config_dict)
        
        def progress_callback(progress: float, message: str):
            print(f"[Batch] {progress*100:.0f}% - {message}")
        
        result = batch_simulator.compare_configs(configs_data, progress_callback=progress_callback)
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/simulate/performance")
async def get_performance_metrics():
    return {
        "success": True,
        "data": {
            "simulator_version": "2.0.0",
            "features": [
                "ray_tracing",
                "batch_comparison",
                "frame_recording",
                "performance_monitoring",
                "interference_calculation"
            ],
            "max_ray_limit": 10000,
            "max_frames_per_simulation": 1000,
            "supported_element_types": [
                "lens", "mirror", "beam_splitter", "detector",
                "aperture", "filter", "grating", "waveplate", "prism"
            ]
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
