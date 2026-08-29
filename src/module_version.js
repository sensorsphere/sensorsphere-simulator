export const MODULE_NAME = "simulator";
export const MODULE_VERSION = "1.0.1";

export const MODULE_CHANGE_TYPES = [
  "added",
  "changed",
  "fixed",
  "removed",
  "deprecated",
  "security"
];

export const MODULE_CHANGELOG = {
  "1.0.1": {
    releasedAt: "2026-08-29T08:19:00+02:00",
    patch: "Simulator-module-versioning-footer-alignment-v1.patch",
    changes: [
      {
        type: "fixed",
        description: "Build footer value alignment"
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
