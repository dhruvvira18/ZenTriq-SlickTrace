"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Polygon, Marker, Popup, Polyline, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import { Play, Pause, RotateCcw, AlertOctagon } from "lucide-react";

// --- CUSTOM TACTICAL ICONS ---
const createVesselIcon = (color: string, label: string, isDark: boolean = false) =>
  L.divIcon({
    className: "custom-vessel",
    html: `
      <div style="display: flex; flex-direction: column; align-items: center; position: relative;">
        ${isDark ? '<div style="position: absolute; -top: 4px; -left: 4px; width: 20px; height: 20px; border-radius: 50%; border: 1px solid red; animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>' : ''}
        <div style="background-color: ${color}; width: 12px; height: 12px; transform: rotate(45deg); border: 2px solid #0f172a; box-shadow: 0 0 8px ${color};"></div>
        <span style="color: ${color}; font-size: 10px; font-weight: bold; font-family: monospace; text-shadow: 1px 1px 3px black; white-space: nowrap; margin-top: 4px;">${label}</span>
      </div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

const targetCrosshairIcon = L.divIcon({
  className: "target-crosshair",
  html: `
    <div style="width: 40px; height: 40px; position: relative;">
      <div style="position: absolute; top: 0; left: 0; width: 10px; height: 10px; border-top: 2px solid #38bdf8; border-left: 2px solid #38bdf8;"></div>
      <div style="position: absolute; top: 0; right: 0; width: 10px; height: 10px; border-top: 2px solid #38bdf8; border-right: 2px solid #38bdf8;"></div>
      <div style="position: absolute; bottom: 0; left: 0; width: 10px; height: 10px; border-bottom: 2px solid #38bdf8; border-left: 2px solid #38bdf8;"></div>
      <div style="position: absolute; bottom: 0; right: 0; width: 10px; height: 10px; border-bottom: 2px solid #38bdf8; border-right: 2px solid #38bdf8;"></div>
    </div>
  `,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

const timeReticleIcon = L.divIcon({
  className: "time-reticle",
  html: `<div style="width: 14px; height: 14px; border: 2px solid #818cf8; border-radius: 50%; background: #0a0e17; box-shadow: 0 0 10px #818cf8;"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function MapFramer({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap();
  const hasFramed = useRef(false);
  useEffect(() => {
    if (bounds && !hasFramed.current) {
      map.fitBounds(bounds, { padding: [80, 80], maxZoom: 12, animate: true, duration: 1.5 });
      hasFramed.current = true;
    }
  }, [bounds, map]);
  return null;
}

interface TacticalMapProps {
  spillPolygon: [number, number][] | null;
  centroid: [number, number] | null;
  hindcastResult: any;
  vessels: any[];
  isBriefingMode: boolean;
  playbackHour: number;
  setPlaybackHour: (val: number) => void;
  isPlaying: boolean;
  setIsPlaying: (val: boolean) => void;
  currentSimTime: Date;
}

export default function TacticalMap({
  spillPolygon,
  centroid,
  hindcastResult,
  vessels,
  isBriefingMode,
  playbackHour,
  setPlaybackHour,
  isPlaying,
  setIsPlaying,
  currentSimTime
}: TacticalMapProps) {
  const defaultCenter: [number, number] = [18.95, 71.85];

  // Extracts OpenDrift trajectory from backend, or falls back to straight line
  const originCoords: [number, number] | null = hindcastResult ? [hindcastResult.origin_latitude, hindcastResult.origin_longitude] : null;
  const slickTrajectory: [number, number][] = hindcastResult?.trajectory_path || (centroid && originCoords ? [originCoords, centroid] : []);

  const mapBounds = useMemo(() => {
    if (centroid && originCoords) return L.latLngBounds(centroid, originCoords);
    if (centroid) return L.latLngBounds(centroid, centroid).pad(0.1);
    return null;
  }, [centroid, originCoords]);

  // Helper to find interpolated position on an array of coordinates based on time
  const getPosFromArray = (path: [number, number][], hour: number): [number, number] | null => {
    if (!path || path.length === 0) return null;
    if (path.length === 1) return path[0];
    const ratio = (24 + hour) / 24; 
    const index = Math.min(Math.floor(ratio * (path.length - 1)), path.length - 2);
    const segmentRatio = (ratio * (path.length - 1)) - index;
    const start = path[index];
    const end = path[index + 1];
    return [
      start[0] + (end[0] - start[0]) * segmentRatio,
      start[1] + (end[1] - start[1]) * segmentRatio
    ];
  };

  const currentSlickPos = getPosFromArray(slickTrajectory, playbackHour);

  return (
    <div className="w-full h-full relative rounded-lg overflow-hidden border border-slate-800 flex flex-col bg-[#0A0E17]">
      <div className="flex-1 relative z-0">
        <MapContainer center={defaultCenter} zoom={9} className="w-full h-full" attributionControl={false} zoomControl={true}>
          <TileLayer url={isBriefingMode ? "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}" : "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"} maxZoom={15} />
          <MapFramer bounds={mapBounds} />

          {centroid && <Marker position={centroid} icon={targetCrosshairIcon} />}
          {spillPolygon && <Polygon positions={spillPolygon} pathOptions={{ color: "#38bdf8", fillColor: "#0284c7", fillOpacity: 0.45, weight: 2 }} />}

          {originCoords && (
            <>
              <Circle center={originCoords} radius={500} pathOptions={{ color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 0.2, weight: 1 }} />
              <Circle center={originCoords} radius={30} pathOptions={{ color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 1, weight: 0 }} />
            </>
          )}

          {/* Render the true OpenDrift path */}
          {slickTrajectory.length > 1 && (
            <Polyline positions={slickTrajectory} pathOptions={{ color: "#818cf8", weight: 2, dashArray: "4, 4" }} />
          )}
          {currentSlickPos && <Marker position={currentSlickPos} icon={timeReticleIcon} />}

          {/* RENDER ACTUAL AIS TRAJECTORIES */}
          {vessels.map((v) => {
            const isCulprit = v.rank === 1;
            const baseColor = isCulprit ? "#ef4444" : "#64748b";
            
            // Check for real trajectory data from backend, fallback to mock if missing
            const actualPath = v.trajectory_path || [
              [originCoords?.[0]! + (Math.sin(v.mmsi)*0.1), originCoords?.[1]! + (Math.cos(v.mmsi)*0.1)],
              [originCoords?.[0]! + (Math.cos(v.mmsi)*0.5), originCoords?.[1]! + (Math.sin(v.mmsi)*0.5)]
            ];

            const currentVesselPos = getPosFromArray(actualPath, playbackHour) as [number, number];
            
            // Gap detection logic
            const gapStart = v.gap_start ? new Date(v.gap_start).getTime() : 0;
            const gapEnd = v.gap_end ? new Date(v.gap_end).getTime() : 0;
            const isDarkNow = currentSimTime.getTime() >= gapStart && currentSimTime.getTime() <= gapEnd;

            return (
              <React.Fragment key={v.mmsi}>
                {/* Full AIS Route Line */}
                <Polyline positions={actualPath} pathOptions={{ color: baseColor, weight: 1, opacity: 0.5 }} />
                
                {/* Red dashed line if vessel has a dark gap */}
                {gapStart > 0 && (
                   <Polyline 
                     positions={[actualPath[0], actualPath[actualPath.length -1]]} // Simplification: replace with real gap coords from backend
                     pathOptions={{ color: "#ef4444", weight: 2, dashArray: "5, 5", opacity: isDarkNow ? 1 : 0.2 }} 
                   />
                )}

                <Marker position={currentVesselPos} icon={createVesselIcon(isDarkNow ? "#ef4444" : baseColor, v.vessel_name, isDarkNow)}>
                  <Popup className="font-mono text-xs text-slate-200">
                    <strong className={isCulprit ? "text-red-400" : ""}>{v.vessel_name}</strong><br/>
                    Risk Index: {v.final_score}<br/>
                    {isDarkNow && <span className="text-red-500 font-bold mt-1 block tracking-wider">⚠ DARK ACTIVITY</span>}
                  </Popup>
                </Marker>
              </React.Fragment>
            );
          })}
        </MapContainer>
      </div>

      {/* --- NLE TACTICAL TIMELINE DECK --- */}
      {centroid && originCoords && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-4xl bg-[#0b101a]/95 backdrop-blur-md border border-slate-700/80 p-3 rounded-lg z-[1000] shadow-2xl flex flex-col gap-2">
          
          <div className="flex items-center justify-between font-mono text-[10px] uppercase text-slate-500 mb-1 tracking-widest px-1">
            <span>Playback Engine: <span className="text-sky-400">Active</span></span>
            <span className="text-slate-300">
              Time Index: <span className="text-white bg-slate-800 px-1 py-0.5 rounded border border-slate-700">T {playbackHour === 0 ? " 0" : playbackHour}H</span>
            </span>
            <span>Sim Date: <span className="text-amber-500">{currentSimTime.toISOString().substring(0, 16).replace("T", " ")}Z</span></span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center bg-[#05080f] border border-slate-700 rounded-md overflow-hidden shrink-0">
              <button onClick={() => { setIsPlaying(false); setPlaybackHour(-24); }} className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white transition border-r border-slate-700">
                <RotateCcw className="w-4 h-4" />
              </button>
              <button onClick={() => { if (playbackHour === 0) setPlaybackHour(-24); setIsPlaying(!isPlaying); }} className={`flex items-center gap-1.5 px-4 py-2 font-mono text-[10px] font-bold tracking-widest transition ${isPlaying ? "bg-amber-900/40 text-amber-500 hover:bg-amber-900/60" : "hover:bg-slate-800 text-sky-400"}`}>
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {isPlaying ? "PAUSE" : "PLAY"}
              </button>
            </div>

            <div className="relative flex-1 h-12 bg-[#05080f] border border-slate-700 rounded-md flex items-end group shadow-inner">
              <div className="absolute top-0 left-0 bottom-0 right-[6px] ml-[6px] pointer-events-none">
                <div className="absolute top-0 left-0 h-full bg-sky-900/20 border-r border-sky-500/50" style={{ width: `${((24 + playbackHour) / 24) * 100}%` }} />
              </div>
              <div className="absolute inset-0 flex justify-between items-end px-[6px] pb-1 pointer-events-none">
                {Array.from({ length: 25 }).map((_, i) => {
                  const hour = -24 + i;
                  const isMajor = hour % 6 === 0;
                  return (
                    <div key={hour} className="flex flex-col items-center justify-end h-full">
                      {isMajor && <span className={`text-[9px] font-mono mb-1 ${hour === 0 ? "text-sky-400 font-bold" : hour === -24 ? "text-amber-500 font-bold" : "text-slate-500"}`}>{hour === 0 ? "T-0" : hour}</span>}
                      <div className={`w-[1px] ${isMajor ? "bg-slate-400 h-2.5" : "bg-slate-700 h-1"}`}></div>
                    </div>
                  );
                })}
              </div>
              <div className="absolute top-0 bottom-0 left-[6px] right-[6px] pointer-events-none">
                <div className="absolute top-0 bottom-0 w-[1px] bg-sky-400 z-20 pointer-events-none transition-all duration-100 ease-linear" style={{ left: `${((24 + playbackHour) / 24) * 100}%` }}>
                  <div className="absolute -top-0 -translate-x-1/2 w-3 h-2.5 bg-sky-400 rounded-sm shadow-[0_0_8px_rgba(56,189,248,0.8)]">
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[4px] border-l-transparent border-r-transparent border-t-sky-400"></div>
                  </div>
                </div>
              </div>
              <input type="range" min="-24" max="0" step="1" value={playbackHour} onChange={(e) => { setIsPlaying(false); setPlaybackHour(Number(e.target.value)); }} className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-30" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}