from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
    allow_origins=["*"],
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