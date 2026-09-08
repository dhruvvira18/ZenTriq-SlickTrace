"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  ShieldAlert,
  Activity,
  Satellite,
  Clock,
  Radio,
  UploadCloud,
  Database,
  Waves,
  BrainCircuit,
  Crosshair,
  ChevronRight,
} from "lucide-react";

const TacticalMap = dynamic(() => import("./TacticalMap"), {
  ssr: false,
});

type PipelineState =
  | "IDLE"
  | "VISION"
  | "PHYSICS"
  | "POSTGIS"
  | "SCORING"
  | "COMPLETE"
  | "REJECTED"
  | "ERROR";

type PipelineStage =
  | "VISION"
  | "PHYSICS"
  | "POSTGIS"
  | "SCORING";

type ToastType = "success" | "info" | "warning" | "error";

type Toast = {
  id: number;
  type: ToastType;
  title: string;
  message: string;
};

export default function SlickTraceConsole() {
  const [isBriefingMode, setIsBriefingMode] = useState(false);

  const [currentTimeUTC, setCurrentTimeUTC] = useState("");
  const [currentTimeIST, setCurrentTimeIST] = useState("");

  const [file, setFile] = useState<File | null>(null);

  const [pipelineState, setPipelineState] =
    useState<PipelineState>("IDLE");

  const [failedStage, setFailedStage] =
    useState<PipelineStage | null>(null);

  const [spillPolygon, setSpillPolygon] =
    useState<[number, number][] | null>(null);

  const [centroid, setCentroid] =
    useState<[number, number] | null>(null);

  const [hindcastResult, setHindcastResult] =
    useState<any | null>(null);

  const [forensicResult, setForensicResult] =
    useState<any | null>(null);

  const [playbackHour, setPlaybackHour] = useState(-24);
  const [isPlaying, setIsPlaying] = useState(false);

  const [toasts, setToasts] = useState<Toast[]>([]);

  const DETECTION_TIME =
    new Date("2026-08-29T10:00:00Z").getTime();

  const currentSimTime = new Date(
    DETECTION_TIME +
      playbackHour * 60 * 60 * 1000
  );

  /*
   * ---------------------------------------------------------
   * TOAST SYSTEM
   * ---------------------------------------------------------
   */

  const showToast = (
    type: ToastType,
    title: string,
    message: string
  ) => {
    const id = Date.now();

    setToasts((prev) => [
      ...prev,
      {
        id,
        type,
        title,
        message,
      },
    ]);

    window.setTimeout(() => {
      setToasts((prev) =>
        prev.filter((toast) => toast.id !== id)
      );
    }, 5000);
  };

  /*
   * ---------------------------------------------------------
   * PLAYBACK
   * ---------------------------------------------------------
   */

  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;

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

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isPlaying]);

  /*
   * ---------------------------------------------------------
   * SYSTEM CLOCK
   * ---------------------------------------------------------
   */

  useEffect(() => {
    const updateClocks = () => {
      const now = new Date();

      setCurrentTimeUTC(
        now.toISOString().substring(11, 19) +
          " UTC"
      );

      setCurrentTimeIST(
        now.toLocaleTimeString("en-GB", {
          timeZone: "Asia/Kolkata",
        }) + " IST"
      );
    };

    updateClocks();

    const timer = setInterval(
      updateClocks,
      1000
    );

    return () => clearInterval(timer);
  }, []);

  /*
   * ---------------------------------------------------------
   * RESET PIPELINE DATA
   * ---------------------------------------------------------
   */

  const resetPipelineData = () => {
    setSpillPolygon(null);
    setCentroid(null);
    setHindcastResult(null);
    setForensicResult(null);
    setPlaybackHour(-24);
    setIsPlaying(false);
    setFailedStage(null);
  };

  /*
   * ---------------------------------------------------------
   * AI VISION
   * ---------------------------------------------------------
   */

  const handleRunDetection = async () => {
    if (!file) return;

    resetPipelineData();

    setPipelineState("VISION");

    const formData = new FormData();

    formData.append("file", file);

    showToast(
      "info",
      "VISION ANALYSIS STARTED",
      "Processing the uploaded SAR scene through the AI vision layer."
    );

    try {
      const res = await fetch(
        "http://127.0.0.1:8000/api/detect-spill",
        {
          method: "POST",
          body: formData,
        }
      );

      if (!res.ok) {
        throw new Error(
          `Vision API returned HTTP ${res.status}`
        );
      }

      const data = await res.json();

      /*
       * -----------------------------------------------------
       * NO SPILL DETECTED
       *
       * This is a valid analytical result, NOT an error.
       * This fixes the Class 0 infinite-processing bug.
       * -----------------------------------------------------
       */

      if (
        !data.features ||
        data.features.length === 0
      ) {
        setPipelineState("REJECTED");
        setFailedStage(null);

        showToast(
          "warning",
          "NO SPILL DETECTED",
          "The SAR scene did not produce a valid oil-spill signature. Analysis halted."
        );

        return;
      }

      /*
       * -----------------------------------------------------
       * VALID SPILL DETECTION
       * -----------------------------------------------------
       */

      const rawCoordinates =
        data.features[0]?.geometry?.coordinates?.[0];

      if (
        !Array.isArray(rawCoordinates) ||
        rawCoordinates.length < 3
      ) {
        throw new Error(
          "Vision API returned an invalid polygon."
        );
      }

      const coords =
        rawCoordinates.map(
          (pt: [number, number]) =>
            [
              pt[1],
              pt[0],
            ] as [number, number]
        );

      setSpillPolygon(coords);

      const avgLat =
        coords.reduce(
          (
            acc: number,
            c: [number, number]
          ) => acc + c[0],
          0
        ) / coords.length;

      const avgLon =
        coords.reduce(
          (
            acc: number,
            c: [number, number]
          ) => acc + c[1],
          0
        ) / coords.length;

      setCentroid([
        avgLat,
        avgLon,
      ]);

      showToast(
        "success",
        "VISION COMPLETE",
        "Oil-spill signature detected. Proceeding to hydrodynamic hindcast."
      );

      await handleRunHindcast([
        avgLat,
        avgLon,
      ]);
    } catch (err) {
      console.error(
        "Vision Pipeline Fault:",
        err
      );

      setFailedStage("VISION");
      setPipelineState("ERROR");

      showToast(
        "error",
        "VISION ANALYSIS FAILED",
        "Unable to process the uploaded SAR scene."
      );
    }
  };

  /*
   * ---------------------------------------------------------
   * HYDRODYNAMIC HINDCAST
   * ---------------------------------------------------------
   */

  const handleRunHindcast = async (
    center: [number, number]
  ) => {
    setPipelineState("PHYSICS");

    try {
      const res = await fetch(
        "http://127.0.0.1:8000/api/run-hindcast",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            detection_lat: center[0],
            detection_lon: center[1],
            detection_time:
              "2026-08-29T10:00:00Z",
            hours_back: 24,
          }),
        }
      );

      if (!res.ok) {
        throw new Error(
          `Hindcast API returned HTTP ${res.status}`
        );
      }

      const data = await res.json();

      if (
        data.origin_latitude === undefined ||
        data.origin_longitude === undefined
      ) {
        throw new Error(
          "Hindcast API returned no calculated origin."
        );
      }

      setHindcastResult(data);

      showToast(
        "success",
        "HINDCAST COMPLETE",
        `Estimated origin: ${Number(
          data.origin_latitude
        ).toFixed(4)}°N, ${Number(
          data.origin_longitude
        ).toFixed(4)}°E`
      );

      await handleRunForensics(data);
    } catch (err) {
      console.error(
        "Hydrodynamic Simulation Fault:",
        err
      );

      setFailedStage("PHYSICS");
      setPipelineState("ERROR");

      showToast(
        "error",
        "HINDCAST FAILED",
        "The hydrodynamic simulation could not be completed."
      );
    }
  };

  /*
   * ---------------------------------------------------------
   * POSTGIS + FORENSIC ANALYSIS
   * ---------------------------------------------------------
   */

  const handleRunForensics = async (
    hindcast: any
  ) => {
    /*
     * Spatial Trajectory Engine
     */
    setPipelineState("POSTGIS");

    try {
      /*
       * Temporary visual transition.
       *
       * Later we will replace this with a real backend
       * trajectory-analysis status from the API.
       */
      await new Promise((resolve) =>
        setTimeout(resolve, 800)
      );

      /*
       * Forensic scoring
       */
      setPipelineState("SCORING");

      const res = await fetch(
        "http://127.0.0.1:8000/api/forensics/analyze",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            dump_time:
              hindcast.dump_time,
            origin_latitude:
              hindcast.origin_latitude,
            origin_longitude:
              hindcast.origin_longitude,
          }),
        }
      );

      if (!res.ok) {
        throw new Error(
          `Forensic API returned HTTP ${res.status}`
        );
      }

      const data = await res.json();

      if (!data || !Array.isArray(data.vessels)) {
        throw new Error(
          "Forensic API returned an invalid vessel result."
        );
      }

      setPlaybackHour(-24);
      setForensicResult(data);

      setFailedStage(null);
      setPipelineState("COMPLETE");

      const vesselCount =
        data.vessels.length;

      const primarySuspect =
        data.vessels.find(
          (vessel: any) =>
            vessel.rank === 1
        );

      showToast(
        "success",
        "FORENSIC ANALYSIS COMPLETE",
        primarySuspect
          ? `${vesselCount} vessels correlated. Primary suspect: ${primarySuspect.vessel_name}.`
          : `${vesselCount} vessels correlated against the estimated origin.`
      );
    } catch (err) {
      console.error(
        "Forensic Engine Fault:",
        err
      );

      setFailedStage(
        "SCORING"
      );

      setPipelineState("ERROR");

      showToast(
        "error",
        "FORENSIC ANALYSIS FAILED",
        "The vessel correlation engine could not complete the analysis."
      );
    }
  };

  /*
   * ---------------------------------------------------------
   * VESSEL DARK-GAP STATE
   * ---------------------------------------------------------
   */

  const isVesselDark = (
    vessel: any
  ) => {
    if (
      !vessel.gap_start ||
      !vessel.gap_end
    ) {
      return false;
    }

    const start =
      new Date(
        vessel.gap_start
      ).getTime();

    const end =
      new Date(
        vessel.gap_end
      ).getTime();

    return (
      currentSimTime.getTime() >= start &&
      currentSimTime.getTime() <= end
    );
  };

  /*
   * ---------------------------------------------------------
   * METOCEAN VECTOR FORMATTER
   * ---------------------------------------------------------
   */

  const formatVector = (
    u: number,
    v: number
  ) => {
    const speed =
      Math.sqrt(
        u * u + v * v
      ).toFixed(2);

    let dir = "";

    if (v > 0) {
      dir += "N";
    } else if (v < 0) {
      dir += "S";
    }

    if (u > 0) {
      dir += "E";
    } else if (u < 0) {
      dir += "W";
    }

    return `${speed} m/s ${dir}`;
  };

  /*
   * ---------------------------------------------------------
   * PIPELINE STEP ICON
   * ---------------------------------------------------------
   */

  const StepIcon = ({
    stage,
    current,
    failed,
    icon: Icon,
  }: {
    stage: PipelineStage;
    current: PipelineState;
    failed: PipelineStage | null;
    icon: any;
  }) => {
    const stages: PipelineStage[] = [
      "VISION",
      "PHYSICS",
      "POSTGIS",
      "SCORING",
    ];

    const stageIdx =
      stages.indexOf(stage);

    const currentIdx =
      stages.indexOf(
        current as PipelineStage
      );

    let colorClass =
      "text-slate-600 border-slate-700 bg-slate-900/50";

    /*
     * Failed stage
     */
    if (failed === stage) {
      colorClass =
        "text-red-400 border-red-500/60 bg-red-950/40 shadow-[0_0_12px_rgba(239,68,68,0.15)]";
    }

    /*
     * No-spill rejection occurs during Vision.
     */
    else if (
      current === "REJECTED" &&
      stage === "VISION"
    ) {
      colorClass =
        "text-amber-400 border-amber-500/60 bg-amber-950/30";
    }

    /*
     * Pipeline fully complete.
     */
    else if (
      current === "COMPLETE"
    ) {
      colorClass =
        "text-emerald-400 border-emerald-500/50 bg-emerald-950/30";
    }

    /*
     * Completed previous stage.
     */
    else if (
      currentIdx > stageIdx
    ) {
      colorClass =
        "text-emerald-400 border-emerald-500/50 bg-emerald-950/30";
    }

    /*
     * Current running stage.
     */
    else if (
      current === stage
    ) {
      colorClass =
        "text-sky-400 border-sky-500 bg-sky-950/50 animate-pulse shadow-[0_0_10px_rgba(56,189,248,0.2)]";
    }

    return (
      <div
        className={`w-8 h-8 rounded flex items-center justify-center border ${colorClass} transition-all duration-500`}
      >
        <Icon className="w-4 h-4" />
      </div>
    );
  };

  /*
   * ---------------------------------------------------------
   * PIPELINE STATUS TEXT
   * ---------------------------------------------------------
   */

  const getPipelineStatusLabel = () => {
    switch (pipelineState) {
      case "VISION":
        return "VISION";

      case "PHYSICS":
        return "HINDCAST";

      case "POSTGIS":
        return "TRAJECTORY";

      case "SCORING":
        return "FORENSICS";

      case "COMPLETE":
        return "COMPLETE";

      case "REJECTED":
        return "NO DETECTION";

      case "ERROR":
        return "ERROR";

      default:
        return "IDLE";
    }
  };

  const isProcessing =
    [
      "VISION",
      "PHYSICS",
      "POSTGIS",
      "SCORING",
    ].includes(pipelineState);

  /*
   * ---------------------------------------------------------
   * UI
   * ---------------------------------------------------------
   */

  return (
    <div
      className={`h-screen flex flex-col font-sans select-none ${
        isBriefingMode
          ? "bg-slate-100 text-slate-900"
          : "bg-[#0A0E17] text-slate-100"
      }`}
    >
      {/* =====================================================
          TOAST NOTIFICATIONS
          ===================================================== */}

      <div className="fixed bottom-5 right-5 z-[9999] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-3 pointer-events-none">
        {toasts.map((toast) => {
          const config = {
            success: {
              icon: "✓",
              border:
                "border-emerald-500/40",
              accent:
                "text-emerald-400",
              glow:
                "shadow-[0_0_20px_rgba(16,185,129,0.08)]",
            },

            info: {
              icon: "i",
              border:
                "border-sky-500/40",
              accent:
                "text-sky-400",
              glow:
                "shadow-[0_0_20px_rgba(14,165,233,0.08)]",
            },

            warning: {
              icon: "!",
              border:
                "border-amber-500/40",
              accent:
                "text-amber-400",
              glow:
                "shadow-[0_0_20px_rgba(245,158,11,0.08)]",
            },

            error: {
              icon: "×",
              border:
                "border-red-500/40",
              accent:
                "text-red-400",
              glow:
                "shadow-[0_0_20px_rgba(239,68,68,0.08)]",
            },
          }[toast.type];

          return (
            <div
              key={toast.id}
              className={`
                pointer-events-auto
                rounded-lg
                border
                ${config.border}
                bg-[#0B111C]/95
                backdrop-blur-md
                ${config.glow}
                px-4
                py-3
                font-mono
              `}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`
                    flex
                    h-7
                    w-7
                    shrink-0
                    items-center
                    justify-center
                    rounded
                    border
                    ${config.border}
                    ${config.accent}
                    text-sm
                    font-bold
                  `}
                >
                  {config.icon}
                </div>

                <div className="min-w-0">
                  <div
                    className={`
                      text-xs
                      font-bold
                      tracking-wider
                      ${config.accent}
                    `}
                  >
                    {toast.title}
                  </div>

                  <div className="mt-1 text-[11px] leading-relaxed text-slate-400">
                    {toast.message}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* =====================================================
          HEADER
          ===================================================== */}

      <header
        className={`h-14 border-b px-6 flex items-center justify-between font-mono text-xs ${
          isBriefingMode
            ? "bg-white border-slate-300"
            : "bg-[#0A0E17] border-slate-800"
        }`}
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sky-400 font-bold tracking-wider text-sm">
            <Radio className="w-5 h-5 animate-pulse" />

            <span>
              SLICKTRACE // NTRO MARITIME
              RECONNAISSANCE
            </span>
          </div>

          <span className="px-2 py-1 rounded text-xs bg-red-950 text-red-400 border border-red-800 tracking-widest font-semibold">
            TOP SECRET // RESTRICTED ACCESS
          </span>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 text-slate-400 text-sm">
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-sky-400" />
              {currentTimeUTC}
            </span>

            <span className="flex items-center gap-1.5 text-slate-500">
              {currentTimeIST}
            </span>
          </div>
        </div>
      </header>

      {/* =====================================================
          MAIN GRID
          ===================================================== */}

      <div className="flex-1 grid grid-cols-12 gap-4 p-4 overflow-hidden">
        {/* ===================================================
            LEFT PANEL
            =================================================== */}

        <div
          className={`col-span-3 rounded-lg border flex flex-col overflow-y-auto ${
            isBriefingMode
              ? "bg-white border-slate-300"
              : "bg-[#0d131f] border-slate-800"
          }`}
        >
          {/* SAR ACQUISITION */}

          <div className="p-5 border-b border-slate-800">
            <h2 className="text-sm font-mono font-bold tracking-wider text-slate-400 uppercase flex items-center gap-2 mb-4">
              <Satellite className="w-5 h-5 text-sky-400" />

              SAR Sensor Acquisition
            </h2>

            <div
              className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer transition ${
                file
                  ? "border-sky-500 bg-sky-950/20"
                  : "border-slate-700 hover:border-slate-500 bg-[#0A0E17]"
              }`}
              onClick={() =>
                document
                  .getElementById(
                    "file-input"
                  )
                  ?.click()
              }
            >
              <input
                id="file-input"
                type="file"
                accept=".tif,.tiff,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => {
                  if (
                    e.target.files &&
                    e.target.files[0]
                  ) {
                    setFile(
                      e.target.files[0]
                    );

                    resetPipelineData();
                    setPipelineState(
                      "IDLE"
                    );

                    showToast(
                      "info",
                      "SAR SCENE LOADED",
                      e.target.files[0]
                        .name
                    );
                  }
                }}
              />

              <UploadCloud className="w-10 h-10 text-sky-400 mb-3" />

              <p className="text-sm font-mono text-slate-300 tracking-wider">
                {file
                  ? file.name
                  : "DRAG & DROP SATELLITE RASTER"}
              </p>
            </div>

            {/* EXECUTE / RETRY BUTTON */}

            <button
              disabled={
                !file ||
                isProcessing
              }
              onClick={
                handleRunDetection
              }
              className={`w-full mt-4 py-3 rounded font-mono text-sm font-bold tracking-wider transition flex items-center justify-center gap-2 ${
                isProcessing
                  ? "bg-amber-600 text-white cursor-not-allowed"
                  : pipelineState ===
                    "ERROR"
                  ? "bg-red-700 hover:bg-red-600 text-white"
                  : pipelineState ===
                    "REJECTED"
                  ? "bg-amber-700 hover:bg-amber-600 text-white"
                  : "bg-sky-600 hover:bg-sky-500 text-white"
              }`}
            >
              <Activity className="w-5 h-5" />

              {isProcessing
                ? "PROCESSING PIPELINE..."
                : pipelineState ===
                  "REJECTED"
                ? "RE-RUN ANALYSIS"
                : pipelineState ===
                  "ERROR"
                ? "RETRY PIPELINE"
                : "EXECUTE RECON PIPELINE"}
            </button>
          </div>

          {/* TELEMETRY */}

          <div className="p-5 flex flex-col gap-6">
            <div>
              <h2 className="text-xs font-mono font-bold tracking-widest text-slate-500 uppercase mb-2">
                Target Telemetry (T-0)
              </h2>

              <div className="bg-[#0A0E17] border border-slate-800 rounded p-3 font-mono text-xs flex flex-col gap-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">
                    DETECTION DATETIME
                  </span>

                  <span className="text-slate-300">
                    {hindcastResult
                      ? "2026-08-29 10:00Z"
                      : "--"}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-500">
                    CENTROID LATITUDE
                  </span>

                  <span className="text-sky-400">
                    {centroid
                      ? `${centroid[0].toFixed(
                          5
                        )}°N`
                      : "--"}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-500">
                    CENTROID LONGITUDE
                  </span>

                  <span className="text-sky-400">
                    {centroid
                      ? `${centroid[1].toFixed(
                          5
                        )}°E`
                      : "--"}
                  </span>
                </div>
              </div>
            </div>

            {/* METOCEAN */}

            <div>
              <h2 className="text-xs font-mono font-bold tracking-widest text-slate-500 uppercase mb-2 flex items-center justify-between">
                <span>
                  MetOcean Physics
                </span>

                {hindcastResult && (
                  <span className="flex items-center gap-1.5 text-emerald-400 text-[10px]">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    LIVE
                  </span>
                )}
              </h2>

              <div className="bg-[#0A0E17] border border-slate-800 rounded p-3 font-mono text-xs flex flex-col gap-2 relative overflow-hidden">
                <div className="flex justify-between">
                  <span className="text-slate-500">
                    HINDCAST ENGINE
                  </span>

                  <span className="text-amber-400">
                    OpenOil v1.0
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-500">
                    NETCDF SOURCE
                  </span>

                  <span className="text-slate-300">
                    mumbai_currents.nc
                  </span>
                </div>

                {hindcastResult?.environment ? (
                  <div className="mt-2 pt-2 border-t border-slate-800/80 flex flex-col gap-2">
                    <div className="flex justify-between items-center group">
                      <span className="text-slate-500 flex items-center gap-1">
                        <ChevronRight className="w-3 h-3 text-sky-500 opacity-0 group-hover:opacity-100 transition-opacity" />

                        OCEAN CURRENTS
                      </span>

                      <span className="text-sky-300 font-semibold">
                        {formatVector(
                          hindcastResult
                            .environment
                            .current_u,
                          hindcastResult
                            .environment
                            .current_v
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between items-center group">
                      <span className="text-slate-500 flex items-center gap-1">
                        <ChevronRight className="w-3 h-3 text-sky-500 opacity-0 group-hover:opacity-100 transition-opacity" />

                        WIND FORCING
                      </span>

                      <span className="text-sky-300 font-semibold">
                        {formatVector(
                          hindcastResult
                            .environment
                            .wind_u,
                          hindcastResult
                            .environment
                            .wind_v
                        )}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 pt-2 border-t border-slate-800/80 text-slate-600 text-center text-[10px]">
                    AWAITING SENSOR TELEMETRY...
                  </div>
                )}

                <div className="flex justify-between mt-2 pt-2 border-t border-slate-800">
                  <span className="text-slate-500">
                    CALCULATED ORIGIN
                  </span>

                  <span className="text-amber-500 font-bold">
                    {hindcastResult
                      ? `${hindcastResult.origin_latitude.toFixed(
                          4
                        )}°N, ${hindcastResult.origin_longitude.toFixed(
                          4
                        )}°E`
                      : "--"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===================================================
            CENTER MAP
            =================================================== */}

        <div className="col-span-6 relative flex flex-col border border-slate-800 rounded-lg overflow-hidden shadow-2xl">
          <TacticalMap
            spillPolygon={
              spillPolygon
            }
            centroid={centroid}
            hindcastResult={
              hindcastResult
            }
            vessels={
              forensicResult?.vessels ||
              []
            }
            isBriefingMode={
              isBriefingMode
            }
            playbackHour={
              playbackHour
            }
            setPlaybackHour={
              setPlaybackHour
            }
            isPlaying={
              isPlaying
            }
            setIsPlaying={
              setIsPlaying
            }
            currentSimTime={
              currentSimTime
            }
          />
        </div>

        {/* ===================================================
            RIGHT PANEL
            =================================================== */}

        <div
          className={`col-span-3 rounded-lg border flex flex-col overflow-hidden ${
            isBriefingMode
              ? "bg-white border-slate-300"
              : "bg-[#0d131f] border-slate-800"
          }`}
        >
          {/* PIPELINE STATUS */}

          <div className="p-5 border-b border-slate-800 bg-[#0A0E17]">
            <h2 className="text-sm font-mono font-bold tracking-wider text-slate-400 uppercase flex items-center justify-between mb-4">
              <span className="flex items-center gap-2">
                <BrainCircuit className="w-5 h-5 text-emerald-500" />

                Pipeline Status
              </span>

              <span
                className={`text-xs px-2 py-1 border rounded ${
                  pipelineState ===
                  "COMPLETE"
                    ? "text-emerald-400 border-emerald-800 bg-emerald-950/30"
                    : pipelineState ===
                      "ERROR"
                    ? "text-red-400 border-red-800 bg-red-950/30"
                    : pipelineState ===
                      "REJECTED"
                    ? "text-amber-400 border-amber-800 bg-amber-950/30"
                    : "text-slate-500 border-slate-700 bg-slate-900"
                }`}
              >
                {getPipelineStatusLabel()}
              </span>
            </h2>

            <div className="flex flex-col gap-4 relative pl-1">
              <div className="absolute left-[15px] top-4 bottom-4 w-px bg-slate-800 z-0"></div>

              {/* VISION */}

              <div className="flex items-center gap-4 z-10">
                <StepIcon
                  stage="VISION"
                  current={
                    pipelineState
                  }
                  failed={
                    failedStage
                  }
                  icon={Satellite}
                />

                <div className="flex flex-col">
                  <span
                    className={`text-xs font-mono font-bold tracking-wider ${
                      [
                        "VISION",
                        "PHYSICS",
                        "POSTGIS",
                        "SCORING",
                        "COMPLETE",
                        "REJECTED",
                      ].includes(
                        pipelineState
                      )
                        ? "text-slate-200"
                        : "text-slate-600"
                    }`}
                  >
                    1. AI Vision Layer
                    (U-Net)
                  </span>

                  <span className="text-[10px] text-slate-500 leading-tight mt-0.5">
                    Extracts GeoJSON
                    polygon
                  </span>

                  {pipelineState ===
                    "REJECTED" && (
                    <span className="text-[9px] text-amber-400 mt-1 font-mono">
                      NO SPILL DETECTED
                    </span>
                  )}

                  {failedStage ===
                    "VISION" && (
                    <span className="text-[9px] text-red-400 mt-1 font-mono">
                      ANALYSIS FAILED
                    </span>
                  )}
                </div>
              </div>

              {/* HINDCAST */}

              <div className="flex items-center gap-4 z-10">
                <StepIcon
                  stage="PHYSICS"
                  current={
                    pipelineState
                  }
                  failed={
                    failedStage
                  }
                  icon={Waves}
                />

                <div className="flex flex-col">
                  <span
                    className={`text-xs font-mono font-bold tracking-wider ${
                      [
                        "PHYSICS",
                        "POSTGIS",
                        "SCORING",
                        "COMPLETE",
                      ].includes(
                        pipelineState
                      )
                        ? "text-slate-200"
                        : "text-slate-600"
                    }`}
                  >
                    2. Hydrodynamic
                    Hindcast
                  </span>

                  <span className="text-[10px] text-slate-500 leading-tight mt-0.5">
                    Lagrangian particle
                    reverse drift
                  </span>

                  {failedStage ===
                    "PHYSICS" && (
                    <span className="text-[9px] text-red-400 mt-1 font-mono">
                      SIMULATION FAILED
                    </span>
                  )}
                </div>
              </div>

              {/* POSTGIS */}

              <div className="flex items-center gap-4 z-10">
                <StepIcon
                  stage="POSTGIS"
                  current={
                    pipelineState
                  }
                  failed={
                    failedStage
                  }
                  icon={Database}
                />

                <div className="flex flex-col">
                  <span
                    className={`text-xs font-mono font-bold tracking-wider ${
                      [
                        "POSTGIS",
                        "SCORING",
                        "COMPLETE",
                      ].includes(
                        pipelineState
                      )
                        ? "text-slate-200"
                        : "text-slate-600"
                    }`}
                  >
                    3. Spatial Trajectory
                    Engine
                  </span>

                  <span className="text-[10px] text-slate-500 leading-tight mt-0.5">
                    ST_MakeLine
                    intersection
                  </span>

                  {failedStage ===
                    "POSTGIS" && (
                    <span className="text-[9px] text-red-400 mt-1 font-mono">
                      TRAJECTORY ANALYSIS
                      FAILED
                    </span>
                  )}
                </div>
              </div>

              {/* FORENSICS */}

              <div className="flex items-center gap-4 z-10">
                <StepIcon
                  stage="SCORING"
                  current={
                    pipelineState
                  }
                  failed={
                    failedStage
                  }
                  icon={Crosshair}
                />

                <div className="flex flex-col">
                  <span
                    className={`text-xs font-mono font-bold tracking-wider ${
                      [
                        "SCORING",
                        "COMPLETE",
                      ].includes(
                        pipelineState
                      )
                        ? "text-slate-200"
                        : "text-slate-600"
                    }`}
                  >
                    4. Forensic Anomaly
                    Engine
                  </span>

                  <span className="text-[10px] text-slate-500 leading-tight mt-0.5">
                    AIS gaps &
                    kinematics scoring
                  </span>

                  {failedStage ===
                    "SCORING" && (
                    <span className="text-[9px] text-red-400 mt-1 font-mono">
                      CORRELATION FAILED
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* =================================================
              SUSPECT MATRIX
              ================================================= */}

          <div className="p-5 flex-1 flex flex-col gap-4 overflow-y-auto">
            <h2 className="text-sm font-mono font-bold tracking-wider text-slate-400 uppercase flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-500" />

                Suspect Matrix
              </span>
            </h2>

            <div className="flex-1 flex flex-col gap-3">
              {forensicResult?.vessels ? (
                forensicResult.vessels.map(
                  (vessel: any) => {
                    const isPrime =
                      vessel.rank === 1;

                    const darkNow =
                      isVesselDark(
                        vessel
                      );

                    return (
                      <div
                        key={
                          vessel.mmsi
                        }
                        className={`p-4 rounded border flex flex-col gap-3 transition-all ${
                          darkNow
                            ? "bg-red-950/80 border-red-600 shadow-[0_0_15px_rgba(220,38,38,0.2)]"
                            : isPrime
                            ? "bg-[#1e1318] border-red-900/50"
                            : "bg-[#0A0E17] border-slate-800"
                        }`}
                      >
                        {/* VESSEL HEADER */}

                        <div className="flex items-start justify-between border-b border-slate-800/80 pb-2.5">
                          <div>
                            <span className="font-mono text-sm font-bold text-slate-100 flex items-center gap-2">
                              {
                                vessel.vessel_name
                              }

                              {darkNow && (
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                              )}
                            </span>

                            <span className="text-xs font-mono text-slate-500 block mt-1">
                              MMSI:{" "}
                              {
                                vessel.mmsi
                              }{" "}
                              |{" "}
                              {
                                vessel.vessel_type
                              }
                            </span>
                          </div>

                          <div className="text-right flex flex-col items-end">
                            <span
                              className={`text-base font-mono font-bold leading-none ${
                                isPrime
                                  ? "text-red-400"
                                  : "text-amber-400"
                              }`}
                            >
                              {Number(
                                vessel.final_score
                              ).toFixed(
                                1
                              )}
                            </span>

                            <span className="text-[9px] font-mono text-slate-500 tracking-widest mt-1.5">
                              TOTAL SCORE
                            </span>
                          </div>
                        </div>

                        {/* SCORE BREAKDOWN */}

                        <div className="flex flex-col gap-2.5">
                          {/* DARK */}

                          <div>
                            <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                              <span className="text-slate-400">
                                DARK ACTIVITY
                                (50%)
                              </span>

                              <span className="text-slate-200">
                                {Number(
                                  vessel.dark_ship_score
                                ).toFixed(
                                  1
                                )}
                              </span>
                            </div>

                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-red-500"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    Number(
                                      vessel.dark_ship_score
                                    )
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>

                          {/* SPATIAL */}

                          <div>
                            <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                              <span className="text-slate-400">
                                SPATIAL PROXIMITY
                                (35%)
                              </span>

                              <span className="text-slate-200">
                                {Number(
                                  vessel.spatial_score
                                ).toFixed(
                                  1
                                )}
                              </span>
                            </div>

                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-amber-500"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    Number(
                                      vessel.spatial_score
                                    )
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>

                          {/* KINEMATICS */}

                          <div>
                            <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                              <span className="text-slate-400">
                                KINEMATICS
                                (15%)
                              </span>

                              <span className="text-slate-200">
                                {Number(
                                  vessel.movement_score
                                ).toFixed(
                                  1
                                )}
                              </span>
                            </div>

                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-sky-500"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    Number(
                                      vessel.movement_score
                                    )
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }
                )
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-600 font-mono text-sm">
                  <Database className="w-10 h-10 mb-3 opacity-30 text-slate-500" />

                  <span>
                    AWAITING CORRELATION
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}