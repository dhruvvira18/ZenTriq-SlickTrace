"use client";

import React, { useMemo, useRef, useEffect } from "react";
import Map, { Source, Layer, Marker } from "react-map-gl/maplibre";
import { AlertOctagon } from "lucide-react";

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
  currentSimTime,
}: TacticalMapProps) {
  const mapRef = useRef<any>(null);
  const hasFramedSpill = useRef(false);
  const hasFramedHindcast = useRef(false);

  const originCoords: [number, number] | null = useMemo(() => {
    return hindcastResult ? [hindcastResult.origin_latitude, hindcastResult.origin_longitude] : null;
  }, [hindcastResult]);

  const slickTrajectory: [number, number][] = useMemo(() => {
    return hindcastResult?.trajectory_path || (centroid && originCoords ? [originCoords, centroid] : []);
  }, [hindcastResult, centroid, originCoords]);

  // --- 1. STRICT GEOJSON WRAPPERS (Prevents WebGL Culling) ---
  const polygonFC: any = useMemo(() => {
    if (!spillPolygon || spillPolygon.length < 3) return { type: "FeatureCollection", features: [] };
    const ring = spillPolygon.map(pt => [pt[1], pt[0]]);
    // Mathematically seal the polygon ring (MapLibre requirement)
    if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) ring.push(ring[0]); 
    return { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [ring] } }] };
  }, [spillPolygon]);

  const originPointFC: any = useMemo(() => {
    if (!originCoords) return { type: "FeatureCollection", features: [] };
    return { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [originCoords[1], originCoords[0]] } }] };
  }, [originCoords]);

  const slickLineFC: any = useMemo(() => {
    if (!slickTrajectory || slickTrajectory.length < 2) return { type: "FeatureCollection", features: [] };
    return { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "LineString", coordinates: slickTrajectory.map(pt => [pt[1], pt[0]]) } }] };
  }, [slickTrajectory]);

  const vesselLinesFC: any = useMemo(() => {
    if (!vessels || vessels.length === 0) return { type: "FeatureCollection", features: [] };
    return {
      type: "FeatureCollection",
      features: vessels.filter(v => v.trajectory_path && v.trajectory_path.length > 1).map(v => ({
        type: "Feature",
        geometry: { type: "LineString", coordinates: v.trajectory_path.map((pt: [number, number]) => [pt[1], pt[0]]) },
        properties: { color: v.rank === 1 ? "#ef4444" : "#64748b" }
      }))
    };
  }, [vessels]);

  // --- 2. STATIC BASEMAP STYLE (Prevents Buffer Teardowns) ---
  const mapStyle = useMemo(() => ({
    version: 8,
    sources: {
      "esri-base": {
        type: "raster",
        tiles: [
          isBriefingMode
            ? "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            : "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        ],
        tileSize: 256,
      }
    },
    layers: [ { id: "esri-base-layer", type: "raster", source: "esri-base", paint: { "raster-opacity": isBriefingMode ? 1 : 0.7 } } ]
  }), [isBriefingMode]);

  // --- 3. CINEMATIC CAMERA DIRECTOR ---
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current.getMap();

    if (centroid && !hasFramedSpill.current) {
      map.flyTo({ center: [centroid[1], centroid[0]], zoom: 13, pitch: 60, bearing: -15, duration: 2500, essential: true });
      hasFramedSpill.current = true;
    }
    
    if (centroid && originCoords && !hasFramedHindcast.current) {
      const bounds: [[number, number], [number, number]] = [
        [Math.min(centroid[1], originCoords[1]), Math.min(centroid[0], originCoords[0])],
        [Math.max(centroid[1], originCoords[1]), Math.max(centroid[0], originCoords[0])]
      ];
      map.fitBounds(bounds, { padding: 120, pitch: 60, bearing: -15, duration: 3000 });
      hasFramedHindcast.current = true;
    }
  }, [centroid, originCoords]);

  // Vector Interpolator
  const getPosFromArray = (path: [number, number][], hour: number): [number, number] | null => {
    if (!path || path.length < 2) return null;
    const ratio = (24 + hour) / 24; 
    const index = Math.min(Math.floor(ratio * (path.length - 1)), path.length - 2);
    const segmentRatio = (ratio * (path.length - 1)) - index;
    return [
      path[index][0] + (path[index + 1][0] - path[index][0]) * segmentRatio,
      path[index][1] + (path[index + 1][1] - path[index][1]) * segmentRatio
    ];
  };

  const currentSlickPos = getPosFromArray(slickTrajectory, playbackHour);

  return (
    <div className="w-full h-full relative bg-[#05080f]">
      <Map
        ref={mapRef}
        initialViewState={{ longitude: 71.85, latitude: 18.95, zoom: 8, pitch: 0, bearing: 0 }}
        mapStyle={mapStyle as any}
        interactiveLayerIds={[]} 
        attributionControl={false}
      >
        {/* --- EXPLICIT WEBGL LAYERS --- */}
        {/* The line-widths are increased to prevent sub-pixel 3D culling */}
        
        <Source id="origin-source" type="geojson" data={originPointFC}>
          <Layer id="origin-glow" type="circle" source="origin-source" paint={{ "circle-radius": 60, "circle-color": "#f59e0b", "circle-opacity": 0.15, "circle-stroke-width": 2, "circle-stroke-color": "#f59e0b", "circle-pitch-alignment": "map" }} />
        </Source>

        <Source id="vessel-source" type="geojson" data={vesselLinesFC}>
          <Layer id="vessel-paths-layer" type="line" source="vessel-source" paint={{ "line-color": ["get", "color"], "line-width": 3, "line-opacity": 0.6 }} />
        </Source>

        <Source id="slick-source" type="geojson" data={slickLineFC}>
          <Layer id="slick-path" type="line" source="slick-source" layout={{ "line-join": "round", "line-cap": "round" }} paint={{ "line-color": "#818cf8", "line-width": 4, "line-dasharray": [2, 2], "line-opacity": 0.9 }} />
        </Source>

        <Source id="spill-source" type="geojson" data={polygonFC}>
          <Layer id="spill-fill" type="fill" source="spill-source" paint={{ "fill-color": "#38bdf8", "fill-opacity": 0.4 }} />
          <Layer id="spill-line" type="line" source="spill-source" paint={{ "line-color": "#38bdf8", "line-width": 3 }} />
        </Source>

        {/* --- HTML HUD MARKERS --- */}
        {currentSlickPos && (
          <Marker longitude={currentSlickPos[1]} latitude={currentSlickPos[0]} anchor="center">
            <div className="relative flex items-center justify-center pointer-events-none">
               <div className="w-4 h-4 border-2 border-indigo-400 rounded-full bg-[#05080f]/80 shadow-[0_0_15px_rgba(129,140,248,0.8)]"></div>
               <span className="absolute left-6 text-[10px] font-mono font-bold text-indigo-300 drop-shadow-md">T {playbackHour}H</span>
            </div>
          </Marker>
        )}

        {vessels.map((v) => {
          const isCulprit = v.rank === 1;
          const colorHex = isCulprit ? "#ef4444" : "#64748b";
          const actualPath = v.trajectory_path && v.trajectory_path.length > 1 ? v.trajectory_path : [];
          
          const currentVesselPos = getPosFromArray(actualPath, playbackHour);
          if (!currentVesselPos) return null;

          const gapStart = v.gap_start ? new Date(v.gap_start).getTime() : 0;
          const gapEnd = v.gap_end ? new Date(v.gap_end).getTime() : 0;
          const isDarkNow = currentSimTime.getTime() >= gapStart && currentSimTime.getTime() <= gapEnd;

          return (
            <Marker key={v.mmsi} longitude={currentVesselPos[1]} latitude={currentVesselPos[0]} anchor="center">
              <div className="flex flex-col items-center pointer-events-none group">
                {isDarkNow && (
                  <div className="absolute -top-6 text-red-500 animate-bounce">
                    <AlertOctagon className="w-4 h-4 drop-shadow-[0_0_8px_rgba(239,68,68,1)]" />
                  </div>
                )}
                <div className="relative w-8 h-8 flex items-center justify-center">
                  <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2" style={{ borderColor: colorHex }}></div>
                  <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2" style={{ borderColor: colorHex }}></div>
                  <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2" style={{ borderColor: colorHex }}></div>
                  <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2" style={{ borderColor: colorHex }}></div>
                  <div className="w-2 h-2 rounded-sm rotate-45" style={{ backgroundColor: colorHex, boxShadow: `0 0 10px ${colorHex}` }}></div>
                </div>
                <div className="mt-1 bg-[#05080f]/90 border border-slate-700/80 px-1.5 py-0.5 rounded backdrop-blur shadow-lg flex flex-col items-center">
                  <span className="text-[9px] font-mono font-bold tracking-wider" style={{ color: colorHex }}>{v.vessel_name}</span>
                  <span className="text-[8px] font-mono text-slate-400">{v.vessel_type.substring(0, 15)}</span>
                </div>
              </div>
            </Marker>
          );
        })}
      </Map>
    </div>
  );
}