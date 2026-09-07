"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { 
  ShieldAlert, Activity, Satellite, Clock, Radio, UploadCloud, 
  AlertTriangle, Sun, Moon, Database, Waves, BrainCircuit, Crosshair, ChevronRight, Wind
} from "lucide-react";

const TacticalMap = dynamic(() => import("./TacticalMap"), { ssr: false });

export default function SlickTraceConsole() {
  const [isBriefingMode, setIsBriefingMode] = useState(false);
  const [currentTimeUTC, setCurrentTimeUTC] = useState("");
  const [currentTimeIST, setCurrentTimeIST] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [pipelineState, setPipelineState] = useState<"IDLE" | "VISION" | "PHYSICS" | "POSTGIS" | "SCORING" | "COMPLETE">("IDLE");
  
  const [spillPolygon, setSpillPolygon] = useState<[number, number][] | null>(null);
  const [centroid, setCentroid] = useState<[number, number] | null>(null);
  const [hindcastResult, setHindcastResult] = useState<any | null>(null);
  const [forensicResult, setForensicResult] = useState<any | null>(null);

  const [playbackHour, setPlaybackHour] = useState(-24);
  const [isPlaying, setIsPlaying] = useState(false);

  const DETECTION_TIME = new Date("2026-08-29T10:00:00Z").getTime(); 
  const currentSimTime = new Date(DETECTION_TIME + (playbackHour * 60 * 60 * 1000));

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        setPlaybackHour((prev) => {
          if (prev >= 0) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  useEffect(() => {
    const updateClocks = () => {
      const now = new Date();
      setCurrentTimeUTC(now.toISOString().substring(11, 19) + " UTC");
      setCurrentTimeIST(now.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata" }) + " IST");
    };
    updateClocks();
    const timer = setInterval(updateClocks, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleRunDetection = async () => {
    if (!file) return;
    setPipelineState("VISION");
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("http://127.0.0.1:8000/api/detect-spill", { method: "POST", body: formData });
      const data = await res.json();
      if (data.features && data.features.length > 0) {
        const coords = data.features[0].geometry.coordinates[0].map((pt: [number, number]) => [pt[1], pt[0]] as [number, number]);
        setSpillPolygon(coords);
        const avgLat = coords.reduce((acc: number, c: [number, number]) => acc + c[0], 0) / coords.length;
        const avgLon = coords.reduce((acc: number, c: [number, number]) => acc + c[1], 0) / coords.length;
        setCentroid([avgLat, avgLon]);
        await handleRunHindcast([avgLat, avgLon]);
      }
    } catch (err) {
      console.error("Vision Pipeline Fault:", err);
      setPipelineState("IDLE");
    }
  };

  const handleRunHindcast = async (center: [number, number]) => {
    setPipelineState("PHYSICS");
    try {
      const res = await fetch("http://127.0.0.1:8000/api/run-hindcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detection_lat: center[0], detection_lon: center[1], detection_time: "2026-08-29T10:00:00Z", hours_back: 24 }),
      });
      const data = await res.json();
      setHindcastResult(data);
      await handleRunForensics(data);
    } catch (err) {
      console.error("Hydrodynamic Simulation Fault:", err);
      setPipelineState("IDLE");
    }
  };

  const handleRunForensics = async (hindcast: any) => {
    setPipelineState("POSTGIS");
    try {
      await new Promise(r => setTimeout(r, 800)); 
      setPipelineState("SCORING");
      const res = await fetch("http://127.0.0.1:8000/api/forensics/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dump_time: hindcast.dump_time, origin_latitude: hindcast.origin_latitude, origin_longitude: hindcast.origin_longitude }),
      });
      const data = await res.json();
      
      setPlaybackHour(-24);
      setForensicResult(data);
      setPipelineState("COMPLETE");
    } catch (err) {
      console.error("Forensic Engine Fault:", err);
      setPipelineState("IDLE");
    }
  };

  const isVesselDark = (vessel: any) => {
    if (!vessel.gap_start || !vessel.gap_end) return false;
    const start = new Date(vessel.gap_start).getTime();
    const end = new Date(vessel.gap_end).getTime();
    return currentSimTime.getTime() >= start && currentSimTime.getTime() <= end;
  };

  const formatVector = (u: number, v: number) => {
    const speed = Math.sqrt(u*u + v*v).toFixed(2);
    let dir = "";
    if (v > 0) dir += "N"; else if (v < 0) dir += "S";
    if (u > 0) dir += "E"; else if (u < 0) dir += "W";
    return `${speed} m/s ${dir}`;
  };

  const StepIcon = ({ stage, current, icon: Icon }: { stage: string, current: string, icon: any }) => {
    const stages = ["IDLE", "VISION", "PHYSICS", "POSTGIS", "SCORING", "COMPLETE"];
    const stageIdx = stages.indexOf(stage);
    const currentIdx = stages.indexOf(current);
    
    let colorClass = "text-slate-600 border-slate-700 bg-slate-900/50";
    if (stageIdx < currentIdx || current === "COMPLETE") colorClass = "text-emerald-400 border-emerald-500/50 bg-emerald-950/30";
    else if (stageIdx === currentIdx) colorClass = "text-sky-400 border-sky-500 bg-sky-950/50 animate-pulse shadow-[0_0_10px_rgba(56,189,248,0.2)]";

    return (
      <div className={`w-8 h-8 rounded flex items-center justify-center border ${colorClass} transition-all duration-500`}>
        <Icon className="w-4 h-4" />
      </div>
    );
  };

  return (
    <div className={`h-screen flex flex-col font-sans select-none ${isBriefingMode ? "bg-slate-100 text-slate-900" : "bg-[#0A0E17] text-slate-100"}`}>
      <header className={`h-14 border-b px-6 flex items-center justify-between font-mono text-xs ${isBriefingMode ? "bg-white border-slate-300" : "bg-[#0A0E17] border-slate-800"}`}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sky-400 font-bold tracking-wider text-sm"><Radio className="w-5 h-5 animate-pulse" /><span>SLICKTRACE // NTRO MARITIME RECONNAISSANCE</span></div>
          <span className="px-2 py-1 rounded text-xs bg-red-950 text-red-400 border border-red-800 tracking-widest font-semibold">TOP SECRET // RESTRICTED ACCESS</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 text-slate-400 text-sm">
            <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-sky-400" /> {currentTimeUTC}</span>
            <span className="flex items-center gap-1.5 text-slate-500">{currentTimeIST}</span>
          </div>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-12 gap-4 p-4 overflow-hidden">
        
        {/* --- LEFT PANEL: INGESTION & TELEMETRY --- */}
        <div className={`col-span-3 rounded-lg border flex flex-col overflow-y-auto ${isBriefingMode ? "bg-white border-slate-300" : "bg-[#0d131f] border-slate-800"}`}>
          <div className="p-5 border-b border-slate-800">
            <h2 className="text-sm font-mono font-bold tracking-wider text-slate-400 uppercase flex items-center gap-2 mb-4"><Satellite className="w-5 h-5 text-sky-400" /> SAR Sensor Acquisition</h2>
            <div className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer transition ${file ? "border-sky-500 bg-sky-950/20" : "border-slate-700 hover:border-slate-500 bg-[#0A0E17]"}`} onClick={() => document.getElementById("file-input")?.click()}>
              <input id="file-input" type="file" accept=".tif,.tiff,.jpg,.jpeg,.png" className="hidden" onChange={(e) => e.target.files && setFile(e.target.files[0])} />
              <UploadCloud className="w-10 h-10 text-sky-400 mb-3" />
              <p className="text-sm font-mono text-slate-300 tracking-wider">{file ? file.name : "DRAG & DROP SATELLITE RASTER"}</p>
            </div>
            <button disabled={!file || (pipelineState !== "IDLE" && pipelineState !== "COMPLETE")} onClick={handleRunDetection} className={`w-full mt-4 py-3 rounded font-mono text-sm font-bold tracking-wider transition flex items-center justify-center gap-2 ${pipelineState !== "IDLE" && pipelineState !== "COMPLETE" ? "bg-amber-600 text-white" : "bg-sky-600 hover:bg-sky-500 text-white"}`}>
              <Activity className="w-5 h-5" />{pipelineState !== "IDLE" && pipelineState !== "COMPLETE" ? "PROCESSING PIPELINE..." : "EXECUTE RECON PIPELINE"}
            </button>
          </div>

          <div className="p-5 flex flex-col gap-6">
            <div>
              <h2 className="text-xs font-mono font-bold tracking-widest text-slate-500 uppercase mb-2">Target Telemetry (T-0)</h2>
              <div className="bg-[#0A0E17] border border-slate-800 rounded p-3 font-mono text-xs flex flex-col gap-2">
                <div className="flex justify-between"><span className="text-slate-500">DETECTION DATETIME</span><span className="text-slate-300">{hindcastResult ? "2026-08-29 10:00Z" : "--"}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">CENTROID LATITUDE</span><span className="text-sky-400">{centroid ? `${centroid[0].toFixed(5)}°N` : "--"}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">CENTROID LONGITUDE</span><span className="text-sky-400">{centroid ? `${centroid[1].toFixed(5)}°E` : "--"}</span></div>
              </div>
            </div>

            {/* LIVE ANIMATED METOCEAN SENSOR FEED */}
            <div>
              <h2 className="text-xs font-mono font-bold tracking-widest text-slate-500 uppercase mb-2 flex items-center justify-between">
                <span>MetOcean Physics</span>
                {hindcastResult && <span className="flex items-center gap-1.5 text-emerald-400 text-[10px]"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> LIVE</span>}
              </h2>
              <div className="bg-[#0A0E17] border border-slate-800 rounded p-3 font-mono text-xs flex flex-col gap-2 relative overflow-hidden">
                <div className="flex justify-between"><span className="text-slate-500">HINDCAST ENGINE</span><span className="text-amber-400">OpenOil v1.0</span></div>
                <div className="flex justify-between"><span className="text-slate-500">NETCDF SOURCE</span><span className="text-slate-300">mumbai_currents.nc</span></div>
                
                {/* Dynamic Vector Feed */}
                {hindcastResult?.environment ? (
                  <div className="mt-2 pt-2 border-t border-slate-800/80 flex flex-col gap-2">
                     <div className="flex justify-between items-center group">
                        <span className="text-slate-500 flex items-center gap-1"><ChevronRight className="w-3 h-3 text-sky-500 opacity-0 group-hover:opacity-100 transition-opacity"/> OCEAN CURRENTS</span>
                        <span className="text-sky-300 font-semibold">{formatVector(hindcastResult.environment.current_u, hindcastResult.environment.current_v)}</span>
                     </div>
                     <div className="flex justify-between items-center group">
                        <span className="text-slate-500 flex items-center gap-1"><ChevronRight className="w-3 h-3 text-sky-500 opacity-0 group-hover:opacity-100 transition-opacity"/> WIND FORCING</span>
                        <span className="text-sky-300 font-semibold">{formatVector(hindcastResult.environment.wind_u, hindcastResult.environment.wind_v)}</span>
                     </div>
                  </div>
                ) : (
                  <div className="mt-2 pt-2 border-t border-slate-800/80 text-slate-600 text-center text-[10px]">AWAITING SENSOR TELEMETRY...</div>
                )}
                
                <div className="flex justify-between mt-2 pt-2 border-t border-slate-800"><span className="text-slate-500">CALCULATED ORIGIN</span><span className="text-amber-500 font-bold">{hindcastResult ? `${hindcastResult.origin_latitude.toFixed(4)}°N, ${hindcastResult.origin_longitude.toFixed(4)}°E` : "--"}</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* --- CENTER TACTICAL MAP --- */}
        <div className="col-span-6 relative flex flex-col border border-slate-800 rounded-lg overflow-hidden shadow-2xl">
          <TacticalMap
            spillPolygon={spillPolygon}
            centroid={centroid}
            hindcastResult={hindcastResult}
            vessels={forensicResult?.vessels || []}
            isBriefingMode={isBriefingMode}
            playbackHour={playbackHour}
            setPlaybackHour={setPlaybackHour}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            currentSimTime={currentSimTime}
          />
        </div>

        {/* --- RIGHT PANEL: ARCHITECTURE & FORENSICS --- */}
        <div className={`col-span-3 rounded-lg border flex flex-col overflow-hidden ${isBriefingMode ? "bg-white border-slate-300" : "bg-[#0d131f] border-slate-800"}`}>
          
          <div className="p-5 border-b border-slate-800 bg-[#0A0E17]">
            <h2 className="text-sm font-mono font-bold tracking-wider text-slate-400 uppercase flex items-center justify-between mb-4">
              <span className="flex items-center gap-2"><BrainCircuit className="w-5 h-5 text-emerald-500" /> Pipeline Status</span>
              <span className="text-xs text-slate-500 px-2 py-1 border border-slate-700 rounded bg-slate-900">{pipelineState}</span>
            </h2>
            
            <div className="flex flex-col gap-4 relative pl-1">
              <div className="absolute left-[15px] top-4 bottom-4 w-px bg-slate-800 z-0"></div>

              <div className="flex items-center gap-4 z-10">
                <StepIcon stage="VISION" current={pipelineState} icon={Satellite} />
                <div className="flex flex-col">
                  <span className={`text-xs font-mono font-bold tracking-wider ${["VISION","PHYSICS","POSTGIS","SCORING","COMPLETE"].includes(pipelineState) ? "text-slate-200" : "text-slate-600"}`}>1. AI Vision Layer (U-Net)</span>
                  <span className="text-[10px] text-slate-500 leading-tight mt-0.5">Extracts GeoJSON polygon</span>
                </div>
              </div>
              <div className="flex items-center gap-4 z-10">
                <StepIcon stage="PHYSICS" current={pipelineState} icon={Waves} />
                <div className="flex flex-col">
                  <span className={`text-xs font-mono font-bold tracking-wider ${["PHYSICS","POSTGIS","SCORING","COMPLETE"].includes(pipelineState) ? "text-slate-200" : "text-slate-600"}`}>2. Hydrodynamic Hindcast</span>
                  <span className="text-[10px] text-slate-500 leading-tight mt-0.5">Lagrangian particle reverse drift</span>
                </div>
              </div>
              <div className="flex items-center gap-4 z-10">
                <StepIcon stage="POSTGIS" current={pipelineState} icon={Database} />
                <div className="flex flex-col">
                  <span className={`text-xs font-mono font-bold tracking-wider ${["POSTGIS","SCORING","COMPLETE"].includes(pipelineState) ? "text-slate-200" : "text-slate-600"}`}>3. Spatial Trajectory Engine</span>
                  <span className="text-[10px] text-slate-500 leading-tight mt-0.5">ST_MakeLine intersection</span>
                </div>
              </div>
              <div className="flex items-center gap-4 z-10">
                <StepIcon stage="SCORING" current={pipelineState} icon={Crosshair} />
                <div className="flex flex-col">
                  <span className={`text-xs font-mono font-bold tracking-wider ${["SCORING","COMPLETE"].includes(pipelineState) ? "text-slate-200" : "text-slate-600"}`}>4. Forensic Anomaly Engine</span>
                  <span className="text-[10px] text-slate-500 leading-tight mt-0.5">AIS gaps & kinematics scoring</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-5 flex-1 flex flex-col gap-4 overflow-y-auto">
            <h2 className="text-sm font-mono font-bold tracking-wider text-slate-400 uppercase flex items-center justify-between">
              <span className="flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-red-500" /> Suspect Matrix</span>
            </h2>
            
            <div className="flex-1 flex flex-col gap-3">
              {forensicResult?.vessels ? (
                forensicResult.vessels.map((vessel: any) => {
                  const isPrime = vessel.rank === 1;
                  const darkNow = isVesselDark(vessel);
                  
                  return (
                    <div key={vessel.mmsi} className={`p-4 rounded border flex flex-col gap-3 transition-all ${darkNow ? "bg-red-950/80 border-red-600 shadow-[0_0_15px_rgba(220,38,38,0.2)]" : isPrime ? "bg-[#1e1318] border-red-900/50" : "bg-[#0A0E17] border-slate-800"}`}>
                      
                      <div className="flex items-start justify-between border-b border-slate-800/80 pb-2.5">
                        <div>
                          <span className="font-mono text-sm font-bold text-slate-100 flex items-center gap-2">
                            {vessel.vessel_name} {darkNow && <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>}
                          </span>
                          <span className="text-xs font-mono text-slate-500 block mt-1">MMSI: {vessel.mmsi} | {vessel.vessel_type}</span>
                        </div>
                        <div className="text-right flex flex-col items-end">
                          <span className={`text-base font-mono font-bold leading-none ${isPrime ? "text-red-400" : "text-amber-400"}`}>{vessel.final_score.toFixed(1)}</span>
                          <span className="text-[9px] font-mono text-slate-500 tracking-widest mt-1.5">TOTAL SCORE</span>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-2.5">
                        <div>
                          <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                            <span className="text-slate-400">DARK ACTIVITY (50%)</span>
                            <span className="text-slate-200">{vessel.dark_ship_score.toFixed(1)}</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-red-500" style={{ width: `${(vessel.dark_ship_score / 50) * 100}%` }}></div></div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                            <span className="text-slate-400">SPATIAL PROXIMITY (35%)</span>
                            <span className="text-slate-200">{vessel.spatial_score.toFixed(1)}</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-amber-500" style={{ width: `${(vessel.spatial_score / 35) * 100}%` }}></div></div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                            <span className="text-slate-400">KINEMATICS (15%)</span>
                            <span className="text-slate-200">{vessel.movement_score.toFixed(1)}</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-sky-500" style={{ width: `${(vessel.movement_score / 15) * 100}%` }}></div></div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-600 font-mono text-sm">
                  <Database className="w-10 h-10 mb-3 opacity-30 text-slate-500" />
                  <span>AWAITING CORRELATION</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}