export const MODULE_NAME = "simulator";
export const MODULE_VERSION = "1.2.0";

export const MODULE_CHANGE_TYPES = [
  "added",
  "changed",
  "fixed",
  "removed",
  "deprecated",
  "security"
];

export const MODULE_CHANGELOG = {
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
