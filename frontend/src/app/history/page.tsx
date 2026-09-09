"use client";

import { useState } from "react";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface SpillRecord {
  id: string;
  spillCode: string;
  imageUrl: string;
  location: string;
  latitude: number;
  longitude: number;
  area: number;
  confidence: number;
  severity: Severity;
  detectedAt: string;
  status: "ACTIVE" | "RESOLVED";
  avoidanceZone: number;
  nearbyVessels: number;
}

const historyData: SpillRecord[] = [
  {
    id: "1",
    spillCode: "OS-20260908-A31F2C",
    imageUrl: "/history/spill-01.jpg",
    location: "Mumbai Offshore",
    latitude: 18.92,
    longitude: 72.81,
    area: 18.42,
    confidence: 94.7,
    severity: "HIGH",
    detectedAt: "08 Sep 2026, 14:32",
    status: "ACTIVE",
    avoidanceZone: 8,
    nearbyVessels: 7,
  },
  {
    id: "2",
    spillCode: "OS-20260907-B72D91",
    imageUrl: "/history/spill-02.jpg",
    location: "Arabian Sea",
    latitude: 19.41,
    longitude: 70.92,
    area: 7.83,
    confidence: 91.2,
    severity: "MEDIUM",
    detectedAt: "07 Sep 2026, 09:18",
    status: "RESOLVED",
    avoidanceZone: 5,
    nearbyVessels: 3,
  },
  {
    id: "3",
    spillCode: "OS-20260905-C91A44",
    imageUrl: "/history/spill-03.jpg",
    location: "Western Arabian Sea",
    latitude: 18.37,
    longitude: 69.84,
    area: 31.64,
    confidence: 97.1,
    severity: "CRITICAL",
    detectedAt: "05 Sep 2026, 18:47",
    status: "ACTIVE",
    avoidanceZone: 12,
    nearbyVessels: 12,
  },
];

function severityClass(severity: Severity) {
  switch (severity) {
    case "LOW":
      return "severity-low";
    case "MEDIUM":
      return "severity-medium";
    case "HIGH":
      return "severity-high";
    case "CRITICAL":
      return "severity-critical";
  }
}

export default function HistoryPage() {
  const [selectedSpill, setSelectedSpill] =
    useState<SpillRecord | null>(null);

  const [filter, setFilter] = useState<"ALL" | Severity>("ALL");

  const filteredSpills =
    filter === "ALL"
      ? historyData
      : historyData.filter((spill) => spill.severity === filter);

  return (
    <main className="history-page">
      <header className="history-header">
        <div>
          <div className="eyebrow">SLICKTRACE // ARCHIVE</div>

          <h1>Oil Spill History</h1>

          <p>
            Historical record of detected maritime oil spill events,
            associated satellite imagery and vessel activity.
          </p>
        </div>

        <div className="header-stats">
          <div className="stat">
            <span>Total Events</span>
            <strong>{historyData.length}</strong>
          </div>

          <div className="stat">
            <span>Active</span>
            <strong>
              {historyData.filter((s) => s.status === "ACTIVE").length}
            </strong>
          </div>

          <div className="stat">
            <span>Critical</span>
            <strong>
              {
                historyData.filter(
                  (s) => s.severity === "CRITICAL"
                ).length
              }
            </strong>
          </div>
        </div>
      </header>

      <section className="history-toolbar">
        <div className="filter-group">
          {(["ALL", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const).map(
            (option) => (
              <button
                key={option}
                onClick={() => setFilter(option)}
                className={filter === option ? "filter active" : "filter"}
              >
                {option}
              </button>
            )
          )}
        </div>

        <div className="result-count">
          {filteredSpills.length} EVENT
          {filteredSpills.length !== 1 ? "S" : ""}
        </div>
      </section>

      <section className="history-grid">
        {filteredSpills.map((spill) => (
          <article
            key={spill.id}
            className="spill-card"
            onClick={() => setSelectedSpill(spill)}
          >
            <div className="image-container">
              <img
                src={spill.imageUrl}
                alt={`Satellite imagery for ${spill.spillCode}`}
              />

              <div className="image-overlay">
                <span className={`severity ${severityClass(spill.severity)}`}>
                  {spill.severity}
                </span>

                <span
                  className={
                    spill.status === "ACTIVE"
                      ? "status active-status"
                      : "status resolved-status"
                  }
                >
                  ● {spill.status}
                </span>
              </div>
            </div>

            <div className="spill-content">
              <div className="spill-title">
                <div>
                  <span className="spill-label">DETECTION ID</span>
                  <h2>{spill.spillCode}</h2>
                </div>

                <span className="arrow">→</span>
              </div>

              <div className="location">
                <span className="icon">⌖</span>
                <span>{spill.location}</span>
              </div>

              <div className="data-grid">
                <div className="data-item">
                  <span>AREA</span>
                  <strong>{spill.area} km²</strong>
                </div>

                <div className="data-item">
                  <span>CONFIDENCE</span>
                  <strong>{spill.confidence}%</strong>
                </div>

                <div className="data-item">
                  <span>AVOIDANCE</span>
                  <strong>{spill.avoidanceZone} km</strong>
                </div>

                <div className="data-item">
                  <span>VESSELS</span>
                  <strong>{spill.nearbyVessels}</strong>
                </div>
              </div>

              <div className="timestamp">
                DETECTED {spill.detectedAt}
              </div>
            </div>
          </article>
        ))}
      </section>

      {filteredSpills.length === 0 && (
        <div className="empty-state">
          <h2>No records found</h2>
          <p>No oil spill events match the selected severity.</p>
        </div>
      )}

      {selectedSpill && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedSpill(null)}
        >
          <div
            className="spill-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="close-button"
              onClick={() => setSelectedSpill(null)}
            >
              ×
            </button>

            <div className="modal-image">
              <img
                src={selectedSpill.imageUrl}
                alt={selectedSpill.spillCode}
              />
            </div>

            <div className="modal-content">
              <span
                className={`severity ${severityClass(
                  selectedSpill.severity
                )}`}
              >
                {selectedSpill.severity}
              </span>

              <h2>{selectedSpill.spillCode}</h2>

              <p className="modal-location">
                ⌖ {selectedSpill.location}
              </p>

              <div className="modal-data">
                <div>
                  <span>Latitude</span>
                  <strong>{selectedSpill.latitude}</strong>
                </div>

                <div>
                  <span>Longitude</span>
                  <strong>{selectedSpill.longitude}</strong>
                </div>

                <div>
                  <span>Spill Area</span>
                  <strong>{selectedSpill.area} km²</strong>
                </div>

                <div>
                  <span>Confidence</span>
                  <strong>{selectedSpill.confidence}%</strong>
                </div>

                <div>
                  <span>Avoidance Zone</span>
                  <strong>{selectedSpill.avoidanceZone} km</strong>
                </div>

                <div>
                  <span>Nearby Vessels</span>
                  <strong>{selectedSpill.nearbyVessels}</strong>
                </div>
              </div>

              <div className="modal-footer">
                <span>Detected</span>
                <strong>{selectedSpill.detectedAt}</strong>
              </div>

              <button className="map-button">
                VIEW ON TACTICAL MAP →
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .history-page {
          min-height: 100vh;
          padding: 42px 52px;
          background: #071014;
          color: #e8f0f2;
          font-family: Arial, Helvetica, sans-serif;
        }

        .history-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 40px;
          padding-bottom: 32px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.09);
        }

        .eyebrow {
          font-size: 11px;
          letter-spacing: 3px;
          color: #5f9ca4;
          margin-bottom: 12px;
        }

        h1 {
          margin: 0;
          font-size: 38px;
          font-weight: 500;
          letter-spacing: -1px;
        }

        .history-header p {
          max-width: 650px;
          margin: 12px 0 0;
          color: #82969b;
          font-size: 14px;
          line-height: 1.6;
        }

        .header-stats {
          display: flex;
          gap: 30px;
        }

        .stat {
          min-width: 90px;
          padding-left: 18px;
          border-left: 1px solid rgba(255, 255, 255, 0.12);
        }

        .stat span {
          display: block;
          color: #70858a;
          font-size: 9px;
          letter-spacing: 1.5px;
          margin-bottom: 7px;
        }

        .stat strong {
          font-size: 22px;
          font-weight: 500;
        }

        .history-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 25px 0;
        }

        .filter-group {
          display: flex;
          gap: 7px;
        }

        .filter {
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: transparent;
          color: #71858a;
          padding: 8px 13px;
          font-size: 10px;
          letter-spacing: 1px;
          cursor: pointer;
          transition: 0.2s;
        }

        .filter:hover,
        .filter.active {
          color: #dce9eb;
          border-color: #5f9ca4;
          background: rgba(95, 156, 164, 0.08);
        }

        .result-count {
          color: #62777c;
          font-size: 10px;
          letter-spacing: 1.5px;
        }

        .history-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }

        .spill-card {
          overflow: hidden;
          background: #0b171b;
          border: 1px solid rgba(255, 255, 255, 0.08);
          cursor: pointer;
          transition: transform 0.2s, border-color 0.2s;
        }

        .spill-card:hover {
          transform: translateY(-3px);
          border-color: rgba(95, 156, 164, 0.55);
        }

        .image-container {
          height: 215px;
          position: relative;
          background: #111;
          overflow: hidden;
        }

        .image-container img,
        .modal-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          filter: grayscale(20%);
        }

        .image-overlay {
          position: absolute;
          top: 14px;
          left: 14px;
          right: 14px;
          display: flex;
          justify-content: space-between;
        }

        .severity,
        .status {
          padding: 5px 8px;
          font-size: 9px;
          letter-spacing: 1.2px;
          font-weight: 600;
        }

        .severity-low {
          background: #17352c;
          color: #74c7a3;
        }

        .severity-medium {
          background: #403617;
          color: #d7b65d;
        }

        .severity-high {
          background: #432a1b;
          color: #e29a61;
        }

        .severity-critical {
          background: #421e25;
          color: #e8737f;
        }

        .active-status {
          background: rgba(5, 18, 21, 0.9);
          color: #77c4b1;
        }

        .resolved-status {
          background: rgba(5, 18, 21, 0.9);
          color: #75868a;
        }

        .spill-content {
          padding: 19px;
        }

        .spill-title {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .spill-label {
          color: #536a70;
          font-size: 8px;
          letter-spacing: 1.4px;
        }

        .spill-title h2 {
          margin: 5px 0 0;
          font-size: 14px;
          font-weight: 500;
        }

        .arrow {
          color: #638f96;
          font-size: 19px;
        }

        .location {
          display: flex;
          align-items: center;
          gap: 7px;
          margin: 17px 0;
          color: #91a5aa;
          font-size: 12px;
        }

        .icon {
          color: #659ca4;
          font-size: 16px;
        }

        .data-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          border-top: 1px solid rgba(255, 255, 255, 0.07);
          border-bottom: 1px solid rgba(255, 255, 255, 0.07);
        }

        .data-item {
          padding: 12px 0;
        }

        .data-item:nth-child(odd) {
          border-right: 1px solid rgba(255, 255, 255, 0.07);
          padding-right: 15px;
        }

        .data-item:nth-child(even) {
          padding-left: 15px;
        }

        .data-item span {
          display: block;
          color: #52676c;
          font-size: 8px;
          letter-spacing: 1.3px;
          margin-bottom: 5px;
        }

        .data-item strong {
          font-size: 12px;
          font-weight: 500;
          color: #c8d4d6;
        }

        .timestamp {
          padding-top: 14px;
          color: #52666b;
          font-size: 8px;
          letter-spacing: 1px;
        }

        .empty-state {
          padding: 80px;
          text-align: center;
          border: 1px dashed rgba(255, 255, 255, 0.1);
          color: #64777c;
        }

        .empty-state h2 {
          color: #9aabad;
          font-size: 18px;
          font-weight: 400;
        }

        .empty-state p {
          font-size: 12px;
        }

        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 30px;
          background: rgba(0, 0, 0, 0.78);
          backdrop-filter: blur(5px);
        }

        .spill-modal {
          position: relative;
          width: min(900px, 100%);
          max-height: 90vh;
          overflow: auto;
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          background: #0b171b;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }

        .close-button {
          position: absolute;
          z-index: 2;
          right: 15px;
          top: 12px;
          border: none;
          background: rgba(0, 0, 0, 0.6);
          color: white;
          width: 30px;
          height: 30px;
          cursor: pointer;
          font-size: 20px;
        }

        .modal-image {
          min-height: 500px;
        }

        .modal-content {
          padding: 38px 30px;
        }

        .modal-content h2 {
          margin: 16px 0 8px;
          font-size: 20px;
          font-weight: 500;
        }

        .modal-location {
          color: #81969b;
          font-size: 12px;
          margin-bottom: 28px;
        }

        .modal-data {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .modal-data div {
          padding: 14px;
          background: #0b171b;
        }

        .modal-data span {
          display: block;
          color: #53696e;
          font-size: 8px;
          letter-spacing: 1px;
          margin-bottom: 5px;
        }

        .modal-data strong {
          font-size: 12px;
          font-weight: 500;
        }

        .modal-footer {
          display: flex;
          justify-content: space-between;
          margin: 25px 0;
          padding-top: 15px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          font-size: 10px;
        }

        .modal-footer span {
          color: #586e73;
        }

        .modal-footer strong {
          font-weight: 400;
          color: #9badb1;
        }

        .map-button {
          width: 100%;
          padding: 13px;
          border: 1px solid #527f86;
          background: transparent;
          color: #9fc3c8;
          font-size: 9px;
          letter-spacing: 1.5px;
          cursor: pointer;
        }

        .map-button:hover {
          background: rgba(95, 156, 164, 0.1);
        }

        @media (max-width: 1100px) {
          .history-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 750px) {
          .history-page {
            padding: 25px;
          }

          .history-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .header-stats {
            width: 100%;
          }

          .history-grid {
            grid-template-columns: 1fr;
          }

          .spill-modal {
            grid-template-columns: 1fr;
          }

          .modal-image {
            min-height: 280px;
          }
        }
      `}</style>
    </main>
  );
}