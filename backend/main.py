from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timezone
import os
import uuid
from pathlib import Path
from vision_service import detect_oil_spill
from opendrift_service import run_hindcast_simulation
from forensics.engine import run_forensic_analysis
from forensics.model import (
    ForensicAnalysisRequest,
    ForensicAnalysisResponse,
)
from geo_service import (
    calculate_bbox,
    expand_bbox
)

from supabase_service import (
    upload_spill_image,
    insert_oil_spill
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
async def process_satellite_image(
    file: UploadFile = File(...)
):

    # --------------------------------
    # 1. Read uploaded image
    # --------------------------------

    image_bytes = await file.read()

    if not image_bytes:
        return {
            "success": False,
            "message": "No image was uploaded."
        }


    # --------------------------------
    # 2. Run AI detection
    # --------------------------------

    geojson_result = detect_oil_spill(
        image_bytes
    )


    # --------------------------------
    # 3. Determine whether spill exists
    # --------------------------------

    is_oil_spill = geojson_result.get(
        "is_oil_spill",
        len(
            geojson_result.get(
                "features",
                []
            )
        ) > 0
    )


    # --------------------------------
    # 4. No spill detected
    # --------------------------------

    if not is_oil_spill:

        return {
            "success": True,
            "is_oil_spill": False,
            "message": "No oil spill was detected.",
            "geojson": geojson_result
        }


    # --------------------------------
    # 5. Calculate spill bounding box
    # --------------------------------

    spill_bbox = calculate_bbox(
        geojson_result
    )

    if spill_bbox is None:

        return {
            "success": False,
            "is_oil_spill": True,
            "message":
                "Oil spill detected, but its geographic boundary could not be calculated."
        }


    # --------------------------------
    # 6. Determine spill center
    # --------------------------------

    latitude = (
        spill_bbox["min_lat"] +
        spill_bbox["max_lat"]
    ) / 2

    longitude = (
        spill_bbox["min_lon"] +
        spill_bbox["max_lon"]
    ) / 2


    # --------------------------------
    # 7. Determine severity
    # --------------------------------

    # Temporary development rules.
    # We can make this much smarter later.

    lat_size = (
        spill_bbox["max_lat"] -
        spill_bbox["min_lat"]
    )

    lon_size = (
        spill_bbox["max_lon"] -
        spill_bbox["min_lon"]
    )

    approximate_area = (
        lat_size *
        lon_size *
        111.32 *
        111.32
    )

    if approximate_area < 5:

        severity = "LOW"
        avoidance_zone_km = 2

    elif approximate_area < 15:

        severity = "MEDIUM"
        avoidance_zone_km = 5

    elif approximate_area < 30:

        severity = "HIGH"
        avoidance_zone_km = 8

    else:

        severity = "CRITICAL"
        avoidance_zone_km = 12


    # --------------------------------
    # 8. Create vessel avoidance zone
    # --------------------------------

    avoidance_bbox = expand_bbox(
        spill_bbox,
        avoidance_zone_km
    )


    # --------------------------------
    # 9. Generate unique spill ID
    # --------------------------------

    spill_code = (
        "OS-" +
        datetime.now(timezone.utc).strftime("%Y%m%d") +
        "-" +
        uuid.uuid4().hex[:6].upper()
    )


    # --------------------------------
    # 10. Upload image to Supabase
    # --------------------------------

    extension = (
        Path(file.filename).suffix
        if file.filename
        else ".jpg"
    )

    storage_path = (
        f"{spill_code}{extension}"
    )

    content_type = (
        file.content_type
        or "image/jpeg"
    )

    image_url = upload_spill_image(
        image_bytes=image_bytes,
        file_path=storage_path,
        content_type=content_type
    )


    # --------------------------------
    # 11. Create database record
    # --------------------------------

    detected_time = datetime.now(
        timezone.utc
    ).isoformat()

    spill_record = {

        "spill_code":
            spill_code,

        "satellite_image_url":
            image_url,

        "latitude":
            latitude,

        "longitude":
            longitude,

        "area_km2":
            round(
                approximate_area,
                2
            ),

        # We will improve this later.
        "confidence":
            None,

        "severity":
            severity,

        "detected_at":
            detected_time,

        "status":
            "ACTIVE",

        "spill_boundary":
            geojson_result,

        "spill_bbox":
            spill_bbox,

        "avoidance_bbox":
            avoidance_bbox,

        "avoidance_zone_km":
            avoidance_zone_km,

        "nearby_vessels":
            0,

        "description":
            "Oil spill detected by SlickTrace AI."
    }


    # --------------------------------
    # 12. Insert into Supabase
    # --------------------------------

    inserted_record = insert_oil_spill(
        spill_record
    )


    # --------------------------------
    # 13. Return result to frontend
    # --------------------------------

    return {

        "success": True,

        "is_oil_spill": True,

        "spill_code":
            spill_code,

        "geojson":
            geojson_result,

        "spill_bbox":
            spill_bbox,

        "avoidance_bbox":
            avoidance_bbox,

        "avoidance_zone_km":
            avoidance_zone_km,

        "area_km2":
            round(
                approximate_area,
                2
            ),

        "severity":
            severity,

        "image_url":
            image_url,

        "database_record":
            inserted_record
    }
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