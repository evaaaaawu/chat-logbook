import { describe, it, expect } from "vitest";
import { defaultPreference } from "./sortPreference";
import {
  TRASH_SORT_AXES,
  TRASH_SORT_CONFIG,
  TRASH_DIRECTION_LABELS,
} from "./sortConfig";

describe("TRASH_SORT_CONFIG", () => {
  it("persists under the chatlogbook.sort.trash key", () => {
    expect(TRASH_SORT_CONFIG.storageKey).toBe("chatlogbook.sort.trash");
  });

  it("defaults to Deleted time, newest first", () => {
    const pref = defaultPreference(TRASH_SORT_CONFIG);
    expect(pref.field).toBe("deletedAt");
    expect(pref.directions.deletedAt).toBe("desc");
  });
});

describe("TRASH_SORT_AXES", () => {
  it("offers Title, Created, Updated, and Deleted time with Deleted last", () => {
    expect(TRASH_SORT_AXES.map((a) => a.field)).toEqual([
      "title",
      "createdAt",
      "updatedAt",
      "deletedAt",
    ]);
    expect(TRASH_SORT_AXES.at(-1)?.label).toBe("Deleted time");
  });

  it("labels the deletedAt direction as oldest/newest first", () => {
    expect(TRASH_DIRECTION_LABELS.deletedAt).toEqual({
      asc: "Oldest first",
      desc: "Newest first",
    });
  });
});
