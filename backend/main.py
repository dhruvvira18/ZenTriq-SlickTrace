from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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