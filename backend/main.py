from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timezone
from intercept.model import (
    InterceptPredictionRequest,
    InterceptPredictionResponse,
)
from intercept.service import get_latest_vessel_position
from intercept.geojson import build_prediction_geojson
from vision_service import detect_oil_spill
from opendrift_service import run_hindcast_simulation
from forensics.engine import run_forensic_analysis
from forensics.model import (
    ForensicAnalysisRequest,
    ForensicAnalysisResponse,
)

app = FastAPI(
    title="SlickTrace Maritime Forensics API",
    description="Automated SAR oil spill detection and AIS vessel correlation engine",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def health_check():
    return {"status": "online", "system": "SlickTrace Core Engine"}

@app.get("/api/v1/health")
def api_status():
    return {"status": "healthy", "postgis": "connected", "pipeline": "ready"}

@app.post("/api/detect-spill")
async def process_satellite_image(file: UploadFile = File(...)):
    # Wait for the entire image stream to upload into memory
    image_bytes = await file.read()
    # Pass the bytes to the U-Net and return the GeoJSON instantly to the frontend
    geojson_result = detect_oil_spill(image_bytes)
    return geojson_result

class HindcastRequest(BaseModel):
    detection_lat: float
    detection_lon: float
    detection_time: datetime
    hours_back: int = 24

@app.post("/api/run-hindcast")
def calculate_spill_origin(request: HindcastRequest):
    # DEMO: Force date to match the mock AIS database
    demo_date = datetime(2026, 8, 29, 10, 0, tzinfo=timezone.utc)

    # Runs the reverse physics simulation
    origin_data = run_hindcast_simulation(
        start_lat=request.detection_lat,
        start_lon=request.detection_lon,
        detection_time=demo_date, # Overrides request.detection_time
        hours_back=request.hours_back
    )
    
    return origin_data

@app.post(
    "/api/forensics/analyze",
    response_model=ForensicAnalysisResponse,
)
def analyze_forensics(request: ForensicAnalysisRequest):
    return run_forensic_analysis(
        dump_time=request.dump_time,
        origin_latitude=request.origin_latitude,
        origin_longitude=request.origin_longitude,
    )

from intercept.model import (
    InterceptPredictionRequest,
    InterceptPredictionResponse,
)
from intercept.service import get_latest_vessel_position
from intercept.geojson import build_prediction_geojson


@app.post(
    "/api/intercept/predict",
    response_model=InterceptPredictionResponse,
)
def predict_intercept(request: InterceptPredictionRequest):

    vessel = get_latest_vessel_position(request.mmsi)

    if vessel is None:
        raise HTTPException(
            status_code=404,
            detail=f"No AIS data found for MMSI {request.mmsi}",
        )

    if vessel["speed_knots"] is None:
        raise HTTPException(
            status_code=422,
            detail="Latest AIS observation has no speed value.",
        )

    if vessel["heading"] is None:
        raise HTTPException(
            status_code=422,
            detail="Latest AIS observation has no heading value.",
        )

    prediction = build_prediction_geojson(
        latitude=vessel["latitude"],
        longitude=vessel["longitude"],
        speed_knots=vessel["speed_knots"],
        heading_degrees=vessel["heading"],
        prediction_minutes=request.prediction_minutes,
        interval_minutes=request.interval_minutes,
        asset_latitude=request.asset_latitude,
        asset_longitude=request.asset_longitude,
        asset_speed_knots=request.asset_speed_knots,
    )

    prediction["metadata"] = {
        "mmsi": vessel["mmsi"],
        "vessel_name": vessel["vessel_name"],
        "vessel_type": vessel["vessel_type"],
        "ais_timestamp": vessel["timestamp"],
        "source": "Supabase ais_vessel_positions",
    }

    return prediction