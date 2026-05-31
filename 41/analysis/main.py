from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional, Dict
from datetime import datetime, timedelta, date
import httpx
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared import (
    PVStringData, StringAnalysis, Alert, AlertLevel,
    EnergyPrediction, EnergyPredictionResponse,
    AggregatedData, settings
)
from analyzer import analyzer
from energy_predictor import predictor

app = FastAPI(title="PV Analysis Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"service": "PV Analysis", "status": "running"}


@app.post("/analyze", response_model=dict)
async def analyze_string_data(data: PVStringData):
    analysis, alerts = analyzer.analyze_string(data)
    return {
        "analysis": analysis.model_dump(),
        "alerts": [a.model_dump() for a in alerts]
    }


@app.post("/analyze/batch", response_model=dict)
async def analyze_batch_data(data_list: List[PVStringData]):
    results = []
    all_alerts = []
    
    for data in data_list:
        analysis, alerts = analyzer.analyze_string(data)
        results.append(analysis.model_dump())
        all_alerts.extend([a.model_dump() for a in alerts])
    
    batch_stats = analyzer.analyze_batch(data_list)
    
    return {
        "results": results,
        "alerts": all_alerts,
        "statistics": batch_stats
    }


@app.get("/analyze/{string_id}")
async def analyze_string_history(
    string_id: str,
    hours: int = 24
):
    try:
        async with httpx.AsyncClient() as client:
            end_time = datetime.now()
            start_time = end_time - timedelta(hours=hours)
            
            response = await client.get(
                f"{settings.GATEWAY_URL}/data/{string_id}",
                params={
                    "start_time": start_time.isoformat(),
                    "end_time": end_time.isoformat()
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="Failed to fetch data from gateway")
            
            data_records = response.json()
            
            if not data_records:
                return {"message": "No data available for analysis"}
            
            pv_data_list = [PVStringData(**record) for record in data_records]
            
            if len(pv_data_list) > 1:
                history = pv_data_list[:-1]
                latest_data = pv_data_list[-1]
                analysis, alerts = analyzer.analyze_string(latest_data, history)
            else:
                analysis, alerts = analyzer.analyze_string(pv_data_list[0])
            
            batch_stats = analyzer.analyze_batch(pv_data_list)
            
            return {
                "string_id": string_id,
                "analysis_period_hours": hours,
                "data_points": len(pv_data_list),
                "latest_analysis": analysis.model_dump(),
                "alerts": [a.model_dump() for a in alerts],
                "statistics": batch_stats
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/alerts/{string_id}", response_model=List[dict])
async def get_string_alerts(
    string_id: str,
    hours: int = 24
):
    try:
        async with httpx.AsyncClient() as client:
            end_time = datetime.now()
            start_time = end_time - timedelta(hours=hours)
            
            response = await client.get(
                f"{settings.GATEWAY_URL}/data/{string_id}",
                params={
                    "start_time": start_time.isoformat(),
                    "end_time": end_time.isoformat()
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="Failed to fetch data")
            
            data_records = response.json()
            pv_data_list = [PVStringData(**record) for record in data_records]
            
            all_alerts = []
            for data in pv_data_list:
                _, alerts = analyzer.analyze_string(data)
                all_alerts.extend([a.model_dump() for a in alerts])
            
            return all_alerts
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/thresholds")
async def update_thresholds(
    voltage_min: Optional[float] = None,
    voltage_max: Optional[float] = None,
    current_min: Optional[float] = None,
    current_max: Optional[float] = None,
    temp_min: Optional[float] = None,
    temp_max: Optional[float] = None
):
    if voltage_min is not None:
        settings.VOLTAGE_MIN = voltage_min
    if voltage_max is not None:
        settings.VOLTAGE_MAX = voltage_max
    if current_min is not None:
        settings.CURRENT_MIN = current_min
    if current_max is not None:
        settings.CURRENT_MAX = current_max
    if temp_min is not None:
        settings.TEMP_MIN = temp_min
    if temp_max is not None:
        settings.TEMP_MAX = temp_max
    
    analyzer.__init__()
    
    return {
        "status": "success",
        "thresholds": {
            "voltage": [settings.VOLTAGE_MIN, settings.VOLTAGE_MAX],
            "current": [settings.CURRENT_MIN, settings.CURRENT_MAX],
            "temperature": [settings.TEMP_MIN, settings.TEMP_MAX]
        }
    }


@app.get("/thresholds")
async def get_thresholds():
    return {
        "voltage": {
            "min": settings.VOLTAGE_MIN,
            "max": settings.VOLTAGE_MAX,
            "unit": "V"
        },
        "current": {
            "min": settings.CURRENT_MIN,
            "max": settings.CURRENT_MAX,
            "unit": "A"
        },
        "temperature": {
            "min": settings.TEMP_MIN,
            "max": settings.TEMP_MAX,
            "unit": "°C"
        }
    }


@app.get("/compare")
async def compare_strings(string_ids: str):
    string_id_list = string_ids.split(",")
    results = {}
    
    try:
        async with httpx.AsyncClient() as client:
            for sid in string_id_list:
                response = await client.get(f"{settings.GATEWAY_URL}/data/latest/{sid}")
                if response.status_code == 200:
                    data = PVStringData(**response.json())
                    analysis, _ = analyzer.analyze_string(data)
                    results[sid] = {
                        "data": data.model_dump(),
                        "analysis": analysis.model_dump()
                    }
        
        efficiencies = {sid: r["analysis"]["efficiency"] for sid, r in results.items()}
        
        return {
            "comparison": results,
            "efficiencies": efficiencies,
            "best_performer": max(efficiencies, key=efficiencies.get) if efficiencies else None,
            "worst_performer": min(efficiencies, key=efficiencies.get) if efficiencies else None
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict/energy/{string_id}")
async def predict_energy(
    string_id: str,
    days: int = 7,
    current_data: Optional[PVStringData] = None
):
    if current_data:
        predictor.update_history(string_id, current_data)
    
    predictions = predictor.predict_energy(string_id, days, current_data)
    total_energy = sum(p.predicted_energy for p in predictions)
    
    return EnergyPredictionResponse(
        string_id=string_id,
        predictions=predictions,
        total_predicted_energy=round(total_energy, 2),
        prediction_period_days=days
    )


@app.post("/predict/energy/batch")
async def predict_energy_batch(
    string_ids: List[str],
    days: int = 7,
    data_list: Optional[List[PVStringData]] = None
):
    current_data_map = {}
    if data_list:
        for data in data_list:
            current_data_map[data.string_id] = data
            predictor.update_history(data.string_id, data)
    
    predictions = predictor.predict_batch(string_ids, days, current_data_map)
    
    result = {}
    for sid, preds in predictions.items():
        total = sum(p.predicted_energy for p in preds)
        result[sid] = EnergyPredictionResponse(
            string_id=sid,
            predictions=preds,
            total_predicted_energy=round(total, 2),
            prediction_period_days=days
        )
    
    return result


@app.get("/predict/history")
async def get_prediction_history(string_id: str):
    daily_energy = predictor.calculate_daily_energy(string_id)
    return {
        "string_id": string_id,
        "daily_energy": {str(k): round(v, 2) for k, v in sorted(daily_energy.items())[-30:]},
        "trend_factor": predictor.calculate_trend_factor(string_id),
        "efficiency_factor": predictor.calculate_efficiency_factor(string_id)
    }


@app.get("/aggregate/{string_id}")
async def get_aggregated_data(
    string_id: str,
    period: str = "day",
    hours: int = 24
):
    try:
        async with httpx.AsyncClient() as client:
            end_time = datetime.now()
            start_time = end_time - timedelta(hours=hours)
            
            response = await client.get(
                f"{settings.GATEWAY_URL}/data/{string_id}",
                params={
                    "start_time": start_time.isoformat(),
                    "end_time": end_time.isoformat()
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="Failed to fetch data")
            
            data_records = response.json()
            
            if not data_records:
                return {"message": "No data available"}
            
            pv_data_list = [PVStringData(**record) for record in data_records]
            
            voltages = [d.voltage for d in pv_data_list]
            currents = [d.current for d in pv_data_list]
            temperatures = [d.temperature for d in pv_data_list]
            powers = [d.power if d.power else d.voltage * d.current for d in pv_data_list]
            
            total_energy = sum(p * 5 / 3600 for p in powers)
            avg_efficiency = analyzer._calculate_efficiency(pv_data_list[-1] if pv_data_list else None, pv_data_list[:-1])
            
            return AggregatedData(
                string_id=string_id,
                period=period,
                avg_voltage=round(sum(voltages) / len(voltages), 2) if voltages else 0,
                avg_current=round(sum(currents) / len(currents), 2) if currents else 0,
                avg_temperature=round(sum(temperatures) / len(temperatures), 1) if temperatures else 0,
                total_energy=round(total_energy, 2),
                max_power=round(max(powers) if powers else 0, 2),
                data_points=len(pv_data_list),
                efficiency=round(avg_efficiency, 4)
            )
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/aggregate/batch")
async def get_batch_aggregated_data(
    string_ids: List[str],
    period: str = "day",
    hours: int = 24
):
    results = {}
    for sid in string_ids:
        try:
            result = await get_aggregated_data(sid, period, hours)
            if isinstance(result, dict) and "string_id" in result:
                results[sid] = result
        except Exception:
            pass
    
    return {
        "period": period,
        "hours": hours,
        "aggregated_data": results,
        "summary": {
            "total_strings": len(results),
            "total_energy": sum(r.get("total_energy", 0) for r in results.values()),
            "avg_efficiency": sum(r.get("efficiency", 0) for r in results.values()) / max(len(results), 1)
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
