export const MODULE_NAME = "simulator";
export const MODULE_VERSION = "1.3.0";

export const MODULE_CHANGE_TYPES = [
  "added",
  "changed",
  "fixed",
  "removed",
  "deprecated",
  "security"
];

export const MODULE_CHANGELOG = {
  "1.3.0": {
    releasedAt: "2026-09-27T07:56:00+02:00",
    patch: "Simulator-public-distribution-ghcr-v1.patch",
    changes: [
      {
        type: "added",
        description: "Public GHCR multi-architecture image publication for linux/amd64 and linux/arm64"
      },
      {
        type: "added",
        description: "One-command public installer and update workflow preserving Simulator configuration and data"
      },
      {
        type: "changed",
        description: "Runtime Compose uses the published versioned image while docker-compose.dev.yml preserves local builds"
      }
    ]
  },
  "1.2.1": {
    releasedAt: "2026-08-29T11:21:00+02:00",
    patch: "Simulator-publication-log-table-scroll-v1.patch",
    changes: [
      {
        type: "fixed",
        description: "Publication Log vertical scrolling is contained inside the table with a sticky header"
      }
    ]
  },
  "1.2.0": {
    releasedAt: "2026-08-29T10:21:00+02:00",
    patch: "Simulator-state-backup-hardening-v1.patch",
    changes: [
      {
        type: "fixed",
        description: "Atomic Simulator state persistence and non-destructive startup recovery"
      },
      {
        type: "added",
        description: "Recovery backup and periodic configuration snapshots with retention"
      }
    ]
  },
  "1.1.0": {
    releasedAt: "2026-08-29T08:36:00+02:00",
    patch: "Simulator-ramp-decimal-precision-v1.patch",
    changes: [
      {
        type: "fixed",
        description: "Decimal precision artifacts in generated ramp values"
      },
      {
        type: "changed",
        description: "Shared decimal normalization for metric and scenario ramps"
      }
    ]
  },
  "1.0.1": {
    releasedAt: "2026-08-29T08:19:00+02:00",
    patch: "Simulator-module-versioning-footer-alignment-v3.patch",
    changes: [
      {
        type: "fixed",
        description: "Single Simulator version line in navigation footer"
      }
    ]
  },
  "1.0.0": {
    releasedAt: "2026-08-29T06:13:00+02:00",
    patch: "Simulator-module-versioning-foundation-v1.patch",
    changes: [
      {
        type: "added",
        description: "Simulator module versioning foundation"
      },
      {
        type: "added",
        description: "Structured Simulator changelog"
      },
      {
        type: "added",
        description: "Version and changelog view in the Simulator UI"
      }
    ]
  }
};
