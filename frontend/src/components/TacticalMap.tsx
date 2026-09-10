"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
} from "react";

import {
  MapContainer,
  TileLayer,
  Polygon,
  Marker,
  Popup,
  Polyline,
  Circle,
  Tooltip,
  useMap,
} from "react-leaflet";

import L from "leaflet";

import {
  Play,
  Pause,
  RotateCcw,
} from "lucide-react";


// ============================================================
// TYPES
// ============================================================

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
  setSelectedTarget: (target: any) => void;
  isExporting: boolean;
}


// ============================================================
// CONSTANTS
// ============================================================

const DEFAULT_CENTER: [number, number] = [
  18.95,
  71.85,
];


// ============================================================
// CUSTOM VESSEL ICON
//
// Uses a divIcon instead of Leaflet's default PNG marker.
// This removes the marker-icon-2x.png / marker-shadow.png
// 404 errors.
// ============================================================

function createVesselIcon(
  color: string,
  heading: number | null,
  isPrimary: boolean,
  isSecondary: boolean,
  isDark: boolean
) {
  const rotation =
    heading != null
      ? heading
      : 0;

  const shipWidth =
    isPrimary
      ? 14
      : isSecondary
      ? 13
      : 11;

  const shipHeight =
    isPrimary
      ? 28
      : isSecondary
      ? 26
      : 23;

  const glow =
    isPrimary
      ? `0 0 16px ${color}`
      : isSecondary
      ? `0 0 12px ${color}`
      : `0 0 7px ${color}66`;

  return L.divIcon({
    className:
      "slicktrace-vessel-icon",

    html: `
      <div
        style="
          width:36px;
          height:36px;
          position:relative;
          display:flex;
          align-items:center;
          justify-content:center;
          transform:rotate(${rotation}deg);
        "
      >

        <!-- Ship hull -->
        <div
          style="
            width:${shipWidth}px;
            height:${shipHeight}px;
            border-radius:6px 6px 3px 3px;
            background:${color};
            border:2px solid rgba(255,255,255,0.9);
            box-shadow:${glow};
            position:relative;
            z-index:2;
          "
        ></div>

        <!-- Bow -->
        <div
          style="
            position:absolute;
            top:0px;
            left:50%;
            transform:translateX(-50%);
            width:0;
            height:0;
            border-left:6px solid transparent;
            border-right:6px solid transparent;
            border-bottom:8px solid ${color};
            z-index:3;
          "
        ></div>

        <!-- Direction indicator -->
        <div
          style="
            position:absolute;
            top:-8px;
            left:50%;
            transform:translateX(-50%);
            width:5px;
            height:5px;
            border-radius:50%;
            background:${isDark ? "#ef4444" : color};
            box-shadow:0 0 9px ${isDark ? "#ef4444" : color};
            z-index:4;
          "
        ></div>

      </div>
    `,

    iconSize: [
      36,
      36,
    ],

    iconAnchor: [
      18,
      18,
    ],
  });
}


// ============================================================
// MAP FRAMER
//
// Fits the map around the complete real AIS coverage.
// ============================================================

function MapFramer({
  bounds,
}: {
  bounds: L.LatLngBoundsExpression | null;
}) {
  const map = useMap();

  const hasFramed =
    useRef(false);

  useEffect(() => {
    if (
      !bounds ||
      hasFramed.current
    ) {
      return;
    }

    map.fitBounds(
      bounds,
      {
        padding: [
          70,
          70,
        ],

        maxZoom: 11,

        animate: true,

        duration: 1.2,
      }
    );

    hasFramed.current = true;
  }, [
    bounds,
    map,
  ]);

  return null;
}


// ============================================================
// FIND REAL AIS POSITION FOR PLAYBACK TIME
//
// Uses trajectory_points returned by the backend.
//
// Important:
// - No generated trajectory.
// - No fake interpolation across the entire 24h.
// - Interpolation only occurs between actual AIS observations.
// - A gap > 30 minutes is treated as AIS dark time.
// ============================================================

function getAISPosition(
  vessel: any,
  simulationTime: Date
): {
  position: [number, number];
  sog: number | null;
  cog: number | null;
  dark: boolean;
} | null {

  const points =
    vessel.trajectory_points;

  if (
    !Array.isArray(points) ||
    points.length === 0
  ) {
    return null;
  }

  const targetTime =
    simulationTime.getTime();


  // ----------------------------------------------------------
  // Find the interval containing the playback time
  // ----------------------------------------------------------

  for (
    let i = 0;
    i < points.length - 1;
    i++
  ) {

    const a =
      points[i];

    const b =
      points[i + 1];

    const timeA =
      new Date(
        a.timestamp
      ).getTime();

    const timeB =
      new Date(
        b.timestamp
      ).getTime();

    if (
      targetTime < timeA ||
      targetTime > timeB
    ) {
      continue;
    }


    const gapMinutes =
      (
        timeB -
        timeA
      ) / 60000;


    // --------------------------------------------------------
    // AIS DARK GAP
    // --------------------------------------------------------

    if (
      gapMinutes > 30
    ) {

      return {
        position: [
          Number(a.latitude),
          Number(a.longitude),
        ],

        sog:
          a.sog != null
            ? Number(a.sog)
            : null,

        cog:
          a.cog != null
            ? Number(a.cog)
            : null,

        dark: true,
      };
    }


    // --------------------------------------------------------
    // NORMAL AIS INTERPOLATION
    // --------------------------------------------------------

    const ratio =
      timeB === timeA
        ? 0
        : (
            targetTime -
            timeA
          ) /
          (
            timeB -
            timeA
          );

    const latitude =
      Number(a.latitude) +
      (
        Number(b.latitude) -
        Number(a.latitude)
      ) *
        ratio;

    const longitude =
      Number(a.longitude) +
      (
        Number(b.longitude) -
        Number(a.longitude)
      ) *
        ratio;

    const sog =
      a.sog != null &&
      b.sog != null
        ? Number(a.sog) +
          (
            Number(b.sog) -
            Number(a.sog)
          ) *
            ratio
        : a.sog != null
        ? Number(a.sog)
        : null;

    const cog =
      a.cog != null
        ? Number(a.cog)
        : null;

    return {
      position: [
        latitude,
        longitude,
      ],

      sog,

      cog,

      dark: false,
    };
  }


  // ----------------------------------------------------------
  // Before first AIS observation
  // ----------------------------------------------------------

  const first =
    points[0];

  const firstTime =
    new Date(
      first.timestamp
    ).getTime();

  if (
    targetTime < firstTime
  ) {
    return null;
  }


  // ----------------------------------------------------------
  // After final AIS observation
  // ----------------------------------------------------------

  const last =
    points[
      points.length - 1
    ];

  const lastTime =
    new Date(
      last.timestamp
    ).getTime();

  if (
    targetTime > lastTime
  ) {
    return {
      position: [
        Number(last.latitude),
        Number(last.longitude),
      ],

      sog:
        last.sog != null
          ? Number(last.sog)
          : null,

      cog:
        last.cog != null
          ? Number(last.cog)
          : null,

      dark: false,
    };
  }

  return null;
}


// ============================================================
// MAIN COMPONENT
// ============================================================

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
  currentSimTime,
  setSelectedTarget,
  isExporting,
}: TacticalMapProps) {

  // ==========================================================
  // ESTIMATED ORIGIN
  //
  // IMPORTANT:
  // This is now ONLY a point.
  //
  // We do NOT attempt to reconstruct the original oil shape.
  // ==========================================================

  const originCoords:
    | [number, number]
    | null =
    useMemo(() => {

      if (
        !hindcastResult
      ) {
        return null;
      }

      const latitude =
        Number(
          hindcastResult.origin_latitude
        );

      const longitude =
        Number(
          hindcastResult.origin_longitude
        );

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        return null;
      }

      return [
        latitude,
        longitude,
      ];

    }, [
      hindcastResult,
    ]);


  // ==========================================================
  // OPENDRIFT HINDCAST TRAJECTORY
  //
  // Prefer the real OpenDrift trajectory.
  //
  // If backend doesn't provide one, use origin -> centroid
  // as a minimal fallback so the layer remains visible.
  // ==========================================================

  const slickTrajectory:
    [number, number][] =
    useMemo(() => {

      if (
        hindcastResult?.trajectory_path &&
        Array.isArray(
          hindcastResult.trajectory_path
        ) &&
        hindcastResult.trajectory_path.length > 1
      ) {

        return hindcastResult.trajectory_path.map(
          (point: any) => [
            Number(point[0]),
            Number(point[1]),
          ] as [number, number]
        );
      }


      if (
        centroid &&
        originCoords
      ) {

        return [
          originCoords,
          centroid,
        ];
      }


      return [];

    }, [
      hindcastResult,
      centroid,
      originCoords,
    ]);

    // ==========================================================
  // PLAYBACK HINDCAST REVEAL
  //
  // The estimated origin stays fixed.
  // The detected spill stays fixed.
  //
  // During playback, progressively reveal the hindcast
  // from the estimated origin toward the detected spill.
  // ==========================================================

  const visibleHindcastPath:
    [number, number][] =
    useMemo(() => {
      if (
        slickTrajectory.length < 2
      ) {
        return [];
      }

      /*
       * Make sure the trajectory is ordered:
       *
       * ORIGIN  --->  DETECTED SPILL
       *
       * Some backend hindcasts may return the points
       * in the opposite order, so check the endpoints
       * against the estimated origin.
       */

      let orderedPath = [
        ...slickTrajectory,
      ];

      if (originCoords) {
        const first =
          orderedPath[0];

        const last =
          orderedPath[
            orderedPath.length - 1
          ];

        const firstDistance =
          Math.pow(
            first[0] -
              originCoords[0],
            2
          ) +
          Math.pow(
            first[1] -
              originCoords[1],
            2
          );

        const lastDistance =
          Math.pow(
            last[0] -
              originCoords[0],
            2
          ) +
          Math.pow(
            last[1] -
              originCoords[1],
            2
          );

        /*
         * If the final point is closer to the origin
         * than the first point, reverse the trajectory.
         */
        if (
          lastDistance <
          firstDistance
        ) {
          orderedPath.reverse();
        }
      }

      /*
       * playbackHour:
       *
       * -24 = beginning
       *   0 = detection time
       */

      const progress = Math.max(
        0,
        Math.min(
          1,
          (playbackHour + 24) / 24
        )
      );

      /*
       * At T-24:
       * show only the origin-side point.
       */
      if (
        progress <= 0
      ) {
        return [
          orderedPath[0],
        ];
      }

      /*
       * At T-0:
       * show the complete hindcast.
       */
      if (
        progress >= 1
      ) {
        return orderedPath;
      }

      /*
       * Reveal the trajectory progressively.
       */
      const exactIndex =
        progress *
        (orderedPath.length - 1);

      const endIndex =
        Math.floor(
          exactIndex
        );

      const fraction =
        exactIndex -
        endIndex;

      const visible =
        orderedPath.slice(
          0,
          endIndex + 1
        );

      /*
       * Add the interpolated tip so the line
       * moves smoothly rather than jumping from
       * one backend point to another.
       */
      if (
        endIndex <
        orderedPath.length - 1
      ) {
        const start =
          orderedPath[endIndex];

        const end =
          orderedPath[
            endIndex + 1
          ];

        visible.push([
          start[0] +
            (
              end[0] -
              start[0]
            ) *
              fraction,

          start[1] +
            (
              end[1] -
              start[1]
            ) *
              fraction,
        ]);
      }

      return visible;

    }, [
      slickTrajectory,
      originCoords,
      playbackHour,
    ]);
  // ==========================================================
  // MAP BOUNDS
  //
  // Include:
  // - all real AIS trajectories
  // - spill polygon
  // - estimated origin
  // - hindcast trajectory
  //
  // This prevents the map from zooming into only the spill.
  // ==========================================================

  const mapBounds =
    useMemo(() => {

      const points:
        [number, number][] =
        [];


      // --------------------------------------------------------
      // REAL AIS TRAJECTORIES
      // --------------------------------------------------------

      for (
        const vessel
        of vessels || []
      ) {

        const path =
          vessel.trajectory_path;

        if (
          !Array.isArray(path)
        ) {
          continue;
        }

        for (
          const point
          of path
        ) {

          if (
            Array.isArray(point) &&
            point.length >= 2
          ) {

            const latitude =
              Number(point[0]);

            const longitude =
              Number(point[1]);

            if (
              Number.isFinite(latitude) &&
              Number.isFinite(longitude)
            ) {

              points.push([
                latitude,
                longitude,
              ]);
            }
          }
        }
      }


      // --------------------------------------------------------
      // DETECTED SPILL POLYGON
      // --------------------------------------------------------

      if (
        spillPolygon &&
        spillPolygon.length > 0
      ) {

        points.push(
          ...spillPolygon
        );
      }


      // --------------------------------------------------------
      // ESTIMATED ORIGIN
      // --------------------------------------------------------

      if (
        originCoords
      ) {

        points.push(
          originCoords
        );
      }


      // --------------------------------------------------------
      // HINDCAST
      // --------------------------------------------------------

      if (
        slickTrajectory.length > 0
      ) {

        points.push(
          ...slickTrajectory
        );
      }


      if (
        points.length < 2
      ) {
        return null;
      }


      return L.latLngBounds(
        points
      );

    }, [
      vessels,
      spillPolygon,
      originCoords,
      slickTrajectory,
    ]);


  // ==========================================================
  // ACTUAL AIS GAP SEGMENTS
  //
  // We calculate gaps from real timestamp differences.
  //
  // This replaces the old:
  // [actualPath[0], actualPath[last]]
  //
  // which was incorrect.
  // ==========================================================

  const aisGapSegments =
    useMemo(() => {

      const segments: {
        key: string;

        vessel: any;

        positions: [
          [number, number],
          [number, number]
        ];

        durationMinutes: number;
      }[] = [];


      for (
        const vessel
        of vessels || []
      ) {

        const points =
          vessel.trajectory_points;

        if (
          !Array.isArray(points) ||
          points.length < 2
        ) {
          continue;
        }


        for (
          let i = 1;
          i < points.length;
          i++
        ) {

          const previous =
            points[i - 1];

          const current =
            points[i];

          const previousTime =
            new Date(
              previous.timestamp
            ).getTime();

          const currentTime =
            new Date(
              current.timestamp
            ).getTime();

          const durationMinutes =
            (
              currentTime -
              previousTime
            ) / 60000;


          // ----------------------------------------------------
          // GAP THRESHOLD
          // ----------------------------------------------------

          if (
            durationMinutes > 30
          ) {

            segments.push({
              key:
                `ais-gap-${vessel.mmsi}-${i}`,

              vessel,

              positions: [
                [
                  Number(
                    previous.latitude
                  ),
                  Number(
                    previous.longitude
                  ),
                ],

                [
                  Number(
                    current.latitude
                  ),
                  Number(
                    current.longitude
                  ),
                ],
              ],

              durationMinutes,
            });
          }
        }
      }


      return segments;

    }, [
      vessels,
    ]);


  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div
      className="
        relative
        w-full
        h-full
        rounded-lg
        overflow-hidden
        border
        border-slate-800
        bg-[#0A0E17]
      "
    >

      {/* ======================================================
          MAP
          ====================================================== */}

      <MapContainer
        preferCanvas={true}
        center={
          DEFAULT_CENTER
        }

        zoom={9}

        className="
          w-full
          h-full
        "

        attributionControl={
          false
        }

        zoomControl={
          !isExporting
        }
      >

        {/* ====================================================
            BASEMAP
            ==================================================== */}

        <TileLayer
          url={
            isBriefingMode
              ? "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
              : "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
          }

          maxZoom={
            15
          }
        />


        {/* ====================================================
            AUTO FRAME
            ==================================================== */}

        <MapFramer
          bounds={
            mapBounds
          }
        />


        {/* ====================================================
            DETECTED OIL SPILL POLYGON
           
            This is the actual shape returned by the
            computer-vision detection model.
           
            It remains FIXED.
            ==================================================== */}

        {spillPolygon &&
          spillPolygon.length >= 3 && (

          <Polygon
            positions={
              spillPolygon
            }

            eventHandlers={{ click: () => setSelectedTarget({ isSpill: true }) }}

            pathOptions={{
              color:
                "#38bdf8",

              fillColor:
                "#0284c7",

              fillOpacity:
                0.32,

              weight:
                3,

              opacity:
                1,

              dashArray:
                undefined,
            }}
          />

        )}


        {/* ====================================================
            ESTIMATED ORIGIN
           
            ONLY A DOT.
           
            We deliberately do NOT draw a reconstructed
            origin polygon.
            ==================================================== */}

        {originCoords && (
          <>

            {/* Outer uncertainty ring */}

            <Circle
              center={
                originCoords
              }

              radius={
                900
              }

              pathOptions={{
                color:
                  "#f59e0b",

                fillColor:
                  "#f59e0b",

                fillOpacity:
                  0.035,

                weight:
                  1,

                dashArray:
                  "6 7",
              }}
            />


            {/* Inner ring */}

            <Circle
              center={
                originCoords
              }

              radius={
                280
              }

              pathOptions={{
                color:
                  "#f59e0b",

                fillOpacity:
                  0,

                weight:
                  1,

                opacity:
                  0.4,
              }}
            />


            {/* Origin dot */}

            <Circle
              center={
                originCoords
              }

              radius={
                120
              }

              pathOptions={{
                color:
                  "#f59e0b",

                fillColor:
                  "#f59e0b",

                fillOpacity:
                  1,

                weight:
                  3,
              }}
            >

              <Tooltip
                permanent
                direction="right"
                offset={[
                  14,
                  0,
                ]}
                opacity={
                  1
                }
              >

                <span
                  style={{
                    fontFamily:
                      "monospace",

                    fontWeight:
                      700,

                    fontSize:
                      "10px",

                    letterSpacing:
                      "0.08em",

                    color:
                      "#f59e0b",
                  }}
                >
                  ESTIMATED ORIGIN
                </span>

              </Tooltip>

            </Circle>

          </>
        )}


        {/* ====================================================
            OPENDRIFT HINDCAST
           
            INDIGO DOTTED LINE
           
            This connects the estimated source reconstruction
            to the detected slick transport path.
            ==================================================== */}

        {/* ====================================================
          OPENDRIFT HINDCAST

          Playback progressively reveals the reconstructed
          transport path from:

              ESTIMATED ORIGIN
                    ↓
              DETECTED SPILL

          The origin itself remains fixed.
          ==================================================== */}

        {visibleHindcastPath.length > 1 && (
          <Polyline
            positions={
              visibleHindcastPath
            }

            pathOptions={{
              color:
                "#818cf8",

              weight:
                3,

              opacity:
                0.95,

              dashArray:
                "3 9",

              lineCap:
                "round",

              lineJoin:
                "round",
            }}
          />
        )}


        {/* ====================================================
            REAL AIS TRAJECTORIES
           
            IMPORTANT:
            These are the actual database trajectories.
           
            NO FAKE FALLBACK PATH.
            ==================================================== */}

        {vessels.map(
          (vessel) => {

            const path =
              vessel.trajectory_path;

            if (
              !Array.isArray(path) ||
              path.length < 2
            ) {
              return null;
            }


            const rank =
              Number(
                vessel.rank
              );


            const isPrimary =
              rank === 1;

            const isSecondary =
              rank === 2;


            // --------------------------------------------------
            // TRAJECTORY COLOUR
            //
            // Primary is CYAN so that its red AIS gap remains
            // visually distinct.
            // --------------------------------------------------

            const trajectoryColor =
              isPrimary
                ? "#22d3ee"
                : isSecondary
                ? "#60a5fa"
                : "#64748b";


            return (
              <Polyline
                key={
                  `ais-trajectory-${vessel.mmsi}`
                }

                positions={
                  path
                }

                pathOptions={{
                  color:
                    trajectoryColor,

                  weight:
                    isPrimary
                      ? 3
                      : isSecondary
                      ? 2.5
                      : 2,

                  opacity:
                    isPrimary
                      ? 0.95
                      : isSecondary
                      ? 0.78
                      : 0.52,

                  dashArray:
                    isPrimary
                      ? "3 8"
                      : "2 8",

                  lineCap:
                    "round",

                  lineJoin:
                    "round",
                }}
              />
            );
          }
        )}


        {/* ====================================================
            ACTUAL AIS GAP SEGMENTS
           
            Primary:
              RED
           
            Secondary:
              AMBER
           
            Other vessels:
              ORANGE
            ==================================================== */}

        {aisGapSegments.map(
          (gap) => {

            const rank =
              Number(
                gap.vessel.rank
              );

            const isPrimary =
              rank === 1;

            const isSecondary =
              rank === 2;


            const gapColor =
              isPrimary
                ? "#ef4444"
                : isSecondary
                ? "#f59e0b"
                : "#fb923c";


            return (
              <Polyline
                key={
                  gap.key
                }

                positions={
                  gap.positions
                }

                pathOptions={{
                  color:
                    gapColor,

                  weight:
                    isPrimary
                      ? 5
                      : 3,

                  opacity:
                    1,

                  dashArray:
                    "2 10",

                  lineCap:
                    "round",
                }}
              />
            );
          }
        )}


        {/* ====================================================
            CURRENT VESSEL POSITIONS
           
            Position changes during playback based on
            timestamped AIS data.
            ==================================================== */}

        {vessels.map(
          (vessel) => {

            const currentData =
              getAISPosition(
                vessel,
                currentSimTime
              );

            if (
              !currentData
            ) {
              return null;
            }


            const rank =
              Number(
                vessel.rank
              );

            const isPrimary =
              rank === 1;

            const isSecondary =
              rank === 2;

            const isTopTwo =
              isPrimary ||
              isSecondary;


            const vesselColor =
              isPrimary
                ? "#22d3ee"
                : isSecondary
                ? "#60a5fa"
                : "#94a3b8";


            return (
              <Marker
                key={
                  `vessel-${vessel.mmsi}`
                }

                position={
                  currentData.position
                }

                eventHandlers={{ click: () => setSelectedTarget(vessel) }}

                icon={
                  createVesselIcon(
                    vesselColor,
                    currentData.cog,
                    isPrimary,
                    isSecondary,
                    currentData.dark
                  )
                }
              >

                {/* =================================================
                    TOP TWO SUSPECT LABEL
                   
                    Only Rank #1 and Rank #2 get persistent
                    ship information.
                    ================================================= */}

                {isTopTwo && !isExporting && (

                  <Tooltip
                    permanent
                    direction="top"
                    offset={[
                      0,
                      -18,
                    ]}

                    opacity={
                      1
                    }
                  >

                    <div
                      style={{
                        fontFamily:
                          "monospace",

                        minWidth:
                          "150px",

                        padding:
                          "2px 4px",
                      }}
                    >

                      <div
                        style={{
                          color:
                            isPrimary
                              ? "#22d3ee"
                              : "#60a5fa",

                          fontWeight:
                            700,

                          fontSize:
                            "10px",

                          letterSpacing:
                            "0.04em",

                          marginBottom:
                            "3px",
                        }}
                      >
                        {vessel.vessel_name}
                      </div>


                      <div
                        style={{
                          color:
                            "#64748b",

                          fontSize:
                            "9px",
                        }}
                      >

                        SOG{" "}
                        {currentData.sog != null
                          ? `${currentData.sog.toFixed(
                              1
                            )} kn`
                          : "—"}

                        {"  |  "}

                        COG{" "}
                        {currentData.cog != null
                          ? `${currentData.cog.toFixed(
                              0
                            )}°`
                          : "—"}

                      </div>


                      {currentData.dark && (

                        <div
                          style={{
                            color:
                              "#ef4444",

                            fontWeight:
                              700,

                            fontSize:
                              "8px",

                            marginTop:
                              "3px",

                            letterSpacing:
                              "0.08em",
                          }}
                        >
                          AIS LOST
                        </div>

                      )}

                    </div>

                  </Tooltip>

                )}


                {/* =================================================
                    CLICK DETAILS
                    ================================================= */}

                <Popup>

                  <div
                    style={{
                      fontFamily:
                        "monospace",

                      fontSize:
                        "11px",

                      minWidth:
                        "190px",

                      color:
                        "#0f172a",
                    }}
                  >

                    <div
                      style={{
                        fontWeight:
                          700,

                        fontSize:
                          "13px",

                        marginBottom:
                          "6px",

                        color:
                          isPrimary
                            ? "#dc2626"
                            : isSecondary
                            ? "#d97706"
                            : "#334155",
                      }}
                    >
                      {vessel.vessel_name}
                    </div>


                    <div>
                      MMSI:{" "}
                      {vessel.mmsi}
                    </div>


                    <div>
                      Type:{" "}
                      {vessel.vessel_type}
                    </div>


                    <div>
                      Rank:{" "}
                      {vessel.rank ?? "—"}
                    </div>


                    <div>
                      Risk Score:{" "}
                      {vessel.final_score != null
                        ? Number(
                            vessel.final_score
                          ).toFixed(2)
                        : "—"}
                    </div>


                    <div>
                      SOG:{" "}
                      {currentData.sog != null
                        ? `${currentData.sog.toFixed(
                            1
                          )} kn`
                        : "—"}
                    </div>


                    <div>
                      COG:{" "}
                      {currentData.cog != null
                        ? `${currentData.cog.toFixed(
                            0
                          )}°`
                        : "—"}
                    </div>


                    {currentData.dark && (

                      <div
                        style={{
                          color:
                            "#dc2626",

                          fontWeight:
                            700,

                          marginTop:
                            "7px",
                        }}
                      >
                        AIS LOST
                      </div>

                    )}

                  </div>

                </Popup>

              </Marker>
            );
          }
        )}

      </MapContainer>


      {/* ======================================================
          PLAYBACK DECK
          ====================================================== */}

      {centroid &&
        originCoords && !isExporting && (

        <div
          className="
            absolute
            bottom-5
            left-1/2
            -translate-x-1/2
            w-[92%]
            max-w-5xl
            bg-[#0b101a]/95
            backdrop-blur-md
            border
            border-slate-700/80
            p-3
            rounded-lg
            z-[1000]
            shadow-2xl
            flex
            flex-col
            gap-2
          "
        >

          {/* ==================================================
              HEADER
              ================================================== */}

          <div
            className="
              flex
              items-center
              justify-between
              font-mono
              text-[10px]
              uppercase
              text-slate-500
              tracking-widest
              px-1
            "
          >

            <span>
              Playback Engine:{" "}
              <span
                className="
                  text-sky-400
                "
              >
                {isPlaying
                  ? "Running"
                  : "Ready"}
              </span>
            </span>


            <span
              className="
                text-slate-300
              "
            >
              Time Index:{" "}
              <span
                className="
                  text-white
                  bg-slate-800
                  px-1
                  py-0.5
                  rounded
                  border
                  border-slate-700
                "
              >
                T{" "}
                {playbackHour === 0
                  ? "0"
                  : playbackHour}
                H
              </span>
            </span>


            <span>
              Sim Date:{" "}

              <span
                className="
                  text-amber-500
                "
              >
                {currentSimTime
                  .toISOString()
                  .substring(
                    0,
                    16
                  )
                  .replace(
                    "T",
                    " "
                  )}
                Z
              </span>
            </span>

          </div>


          {/* ==================================================
              CONTROLS + TIMELINE
              ================================================== */}

          <div
            className="
              flex
              items-center
              gap-4
            "
          >

            {/* -----------------------------------------------
                PLAYBACK BUTTONS
                ----------------------------------------------- */}

            <div
              className="
                flex
                items-center
                bg-[#05080f]
                border
                border-slate-700
                rounded-md
                overflow-hidden
                shrink-0
              "
            >

              {/* RESET */}

              <button
                onClick={() => {

                  setIsPlaying(
                    false
                  );

                  setPlaybackHour(
                    -24
                  );

                }}

                className="
                  p-2
                  hover:bg-slate-800
                  text-slate-400
                  hover:text-white
                  transition
                  border-r
                  border-slate-700
                "
                title="Reset playback"
              >

                <RotateCcw
                  className="
                    w-4
                    h-4
                  "
                />

              </button>


              {/* PLAY / PAUSE */}

              <button
                onClick={() => {

                  if (
                    playbackHour === 0
                  ) {

                    setPlaybackHour(
                      -24
                    );

                  }

                  setIsPlaying(
                    !isPlaying
                  );

                }}

                className={`
                  flex
                  items-center
                  gap-1.5
                  px-4
                  py-2
                  font-mono
                  text-[10px]
                  font-bold
                  tracking-widest
                  transition

                  ${
                    isPlaying
                      ? "bg-amber-900/40 text-amber-500 hover:bg-amber-900/60"
                      : "hover:bg-slate-800 text-sky-400"
                  }
                `}
              >

                {isPlaying ? (
                  <Pause
                    className="
                      w-4
                      h-4
                    "
                  />
                ) : (
                  <Play
                    className="
                      w-4
                      h-4
                    "
                  />
                )}

                {isPlaying
                  ? "PAUSE"
                  : "PLAY"}

              </button>

            </div>


            {/* -----------------------------------------------
                TIMELINE
                ----------------------------------------------- */}

            <div
              className="
                relative
                flex-1
                h-12
                bg-[#05080f]
                border
                border-slate-700
                rounded-md
                flex
                items-end
                group
                shadow-inner
              "
            >

              {/* Progress fill */}

              <div
                className="
                  absolute
                  top-0
                  bottom-0
                  left-[6px]
                  right-[6px]
                  pointer-events-none
                "
              >

                <div
                  className="
                    absolute
                    top-0
                    left-0
                    h-full
                    bg-sky-900/20
                    border-r
                    border-sky-500/50
                  "

                  style={{
                    width:
                      `${
                        (
                          (
                            24 +
                            playbackHour
                          ) /
                          24
                        ) *
                        100
                      }%`,
                  }}
                />

              </div>


              {/* Tick marks */}

              <div
                className="
                  absolute
                  inset-0
                  flex
                  justify-between
                  items-end
                  px-[6px]
                  pb-1
                  pointer-events-none
                "
              >

                {Array.from({
                  length: 25,
                }).map(
                  (_, index) => {

                    const hour =
                      -24 +
                      index;

                    const isMajor =
                      hour %
                        6 ===
                      0;

                    return (
                      <div
                        key={
                          hour
                        }

                        className="
                          flex
                          flex-col
                          items-center
                          justify-end
                          h-full
                        "
                      >

                        {isMajor && (

                          <span
                            className={`
                              text-[9px]
                              font-mono
                              mb-1

                              ${
                                hour === 0
                                  ? "text-sky-400 font-bold"
                                  : hour === -24
                                  ? "text-amber-500 font-bold"
                                  : "text-slate-500"
                              }
                            `}
                          >
                            {hour === 0
                              ? "T-0"
                              : `T${hour}H`}
                          </span>

                        )}


                        <div
                          className={`
                            w-[1px]

                            ${
                              isMajor
                                ? "bg-slate-400 h-2.5"
                                : "bg-slate-700 h-1"
                            }
                          `}
                        />

                      </div>
                    );
                  }
                )}

              </div>


              {/* Current playback marker */}

              <div
                className="
                  absolute
                  top-0
                  bottom-0
                  left-[6px]
                  right-[6px]
                  pointer-events-none
                "
              >

                <div
                  className="
                    absolute
                    top-0
                    bottom-0
                    w-[1px]
                    bg-sky-400
                    z-20
                    pointer-events-none
                  "

                  style={{
                    left:
                      `${
                        (
                          (
                            24 +
                            playbackHour
                          ) /
                          24
                        ) *
                        100
                      }%`,
                  }}
                >

                  <div
                    className="
                      absolute
                      -top-0
                      -translate-x-1/2
                      w-3
                      h-2.5
                      bg-sky-400
                      rounded-sm
                      shadow-[0_0_8px_rgba(56,189,248,0.8)]
                    "
                  >

                    <div
                      className="
                        absolute
                        -bottom-1
                        left-1/2
                        -translate-x-1/2
                        w-0
                        h-0
                        border-l-[4px]
                        border-r-[4px]
                        border-t-[4px]
                        border-l-transparent
                        border-r-transparent
                        border-t-sky-400
                      "
                    />

                  </div>

                </div>

              </div>


              {/* Invisible range control */}

              <input
                type="range"

                min="-24"

                max="0"

                step="1"

                value={
                  playbackHour
                }

                onChange={(
                  event
                ) => {

                  setIsPlaying(
                    false
                  );

                  setPlaybackHour(
                    Number(
                      event.target.value
                    )
                  );

                }}

                className="
                  absolute
                  inset-0
                  w-full
                  h-full
                  opacity-0
                  cursor-ew-resize
                  z-30
                "
              />

            </div>

          </div>


          {/* ==================================================
              LEGEND
              ================================================== */}

          <div
            className="
              flex
              flex-wrap
              items-center
              justify-center
              gap-x-5
              gap-y-2
              pt-2
              border-t
              border-slate-800
              font-mono
              text-[8px]
              uppercase
              tracking-wider
            "
          >

            {/* Primary AIS */}

            <div
              className="
                flex
                items-center
                gap-2
                text-slate-400
              "
            >

              <span
                className="
                  w-6
                  border-t-2
                  border-dotted
                  border-cyan-400
                "
              />

              PRIMARY AIS

            </div>


            {/* Secondary AIS */}

            <div
              className="
                flex
                items-center
                gap-2
                text-slate-400
              "
            >

              <span
                className="
                  w-6
                  border-t-2
                  border-dotted
                  border-blue-400
                "
              />

              SECONDARY AIS

            </div>


            {/* Other AIS */}

            <div
              className="
                flex
                items-center
                gap-2
                text-slate-400
              "
            >

              <span
                className="
                  w-6
                  border-t-2
                  border-dotted
                  border-slate-500
                "
              />

              AIS TRAJECTORY

            </div>


            {/* Primary gap */}

            <div
              className="
                flex
                items-center
                gap-2
                text-slate-400
              "
            >

              <span
                className="
                  w-6
                  border-t-2
                  border-dotted
                  border-red-500
                "
              />

              PRIMARY AIS GAP

            </div>


            {/* Secondary gap */}

            <div
              className="
                flex
                items-center
                gap-2
                text-slate-400
              "
            >

              <span
                className="
                  w-6
                  border-t-2
                  border-dotted
                  border-amber-500
                "
              />

              SECONDARY AIS GAP

            </div>


            {/* Hindcast */}

            <div
              className="
                flex
                items-center
                gap-2
                text-slate-400
              "
            >

              <span
                className="
                  w-6
                  border-t-2
                  border-dotted
                  border-indigo-400
                "
              />

              HINDCAST

            </div>


            {/* Spill */}

            <div
              className="
                flex
                items-center
                gap-2
                text-slate-400
              "
            >

              <span
                className="
                  w-3
                  h-3
                  rounded-sm
                  border
                  border-sky-400
                  bg-sky-500/30
                "
              />

              DETECTED SPILL

            </div>


            {/* Origin */}

            <div
              className="
                flex
                items-center
                gap-2
                text-slate-400
              "
            >

              <span
                className="
                  w-3
                  h-3
                  rounded-full
                  bg-amber-500
                "
              />

              ESTIMATED ORIGIN

            </div>

          </div>


          {/* ==================================================
              PLAYBACK FOOTER
              ================================================== */}

          <div
            className="
              flex
              items-center
              justify-center
              text-[8px]
              font-mono
              text-slate-600
              tracking-wider
            "
          >
            REAL TIMESTAMPED AIS PLAYBACK
            <span className="mx-2">
              •
            </span>
            OPENDRIFT HINDCAST
            <span className="mx-2">
              •
            </span>
            SPILL FOOTPRINT FIXED AT DETECTION
          </div>

        </div>

      )}

    </div>
  );
}