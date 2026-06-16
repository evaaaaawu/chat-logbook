import { describe, it, expect, beforeEach } from "vitest";
import {
  defaultPreference,
  isDefaultSort,
  loadSortPreference,
  saveSortPreference,
  selectField,
  toggleDirection,
  type SortConfig,
} from "./sortPreference";

type Field = "title" | "createdAt" | "updatedAt";

const config: SortConfig<Field> = {
  storageKey: "test.sort",
  defaultField: "updatedAt",
  typeDefaults: { title: "asc", createdAt: "desc", updatedAt: "desc" },
};

beforeEach(() => {
  localStorage.clear();
});

describe("loadSortPreference", () => {
  it("returns the config default when nothing is stored", () => {
    const pref = loadSortPreference(config);

    expect(pref.field).toBe("updatedAt");
    expect(pref.directions.updatedAt).toBe("desc");
  });

  it("round-trips a saved preference", () => {
    saveSortPreference(config, {
      field: "title",
      directions: { title: "desc", createdAt: "desc", updatedAt: "asc" },
    });

    const pref = loadSortPreference(config);

    expect(pref.field).toBe("title");
    expect(pref.directions.title).toBe("desc");
    expect(pref.directions.updatedAt).toBe("asc");
  });

  it("falls back to default when the stored version is unknown", () => {
    localStorage.setItem(
      config.storageKey,
      JSON.stringify({ version: 99, field: "title", directions: {} })
    );

    const pref = loadSortPreference(config);

    expect(pref.field).toBe("updatedAt");
    expect(pref.directions.updatedAt).toBe("desc");
  });

  it("falls back to default when the stored value is malformed JSON", () => {
    localStorage.setItem(config.storageKey, "{not json");

    const pref = loadSortPreference(config);

    expect(pref.field).toBe("updatedAt");
  });
});

describe("per-field direction memory", () => {
  it("uses each axis's type default on first selection", () => {
    const start = defaultPreference(config);

    const onTitle = selectField(start, "title");

    expect(onTitle.field).toBe("title");
    expect(onTitle.directions.title).toBe("asc"); // title type default
  });

  it("remembers each axis's last direction across switches", () => {
    let pref = defaultPreference(config);

    pref = toggleDirection(pref); // updatedAt: desc -> asc
    expect(pref.directions.updatedAt).toBe("asc");

    pref = selectField(pref, "title"); // switch axis, memory preserved
    pref = toggleDirection(pref); // title: asc -> desc
    expect(pref.directions.title).toBe("desc");

    pref = selectField(pref, "updatedAt"); // back to updatedAt
    expect(pref.field).toBe("updatedAt");
    expect(pref.directions.updatedAt).toBe("asc"); // remembered

    pref = selectField(pref, "title"); // back to title
    expect(pref.directions.title).toBe("desc"); // remembered
  });

  it("toggleDirection only flips the active axis", () => {
    const start = defaultPreference(config);

    const flipped = toggleDirection(start);

    expect(flipped.directions.updatedAt).toBe("asc");
    expect(flipped.directions.title).toBe("asc"); // untouched
    expect(flipped.directions.createdAt).toBe("desc"); // untouched
  });

  it("does not mutate the input preference", () => {
    const start = defaultPreference(config);

    selectField(start, "title");
    toggleDirection(start);

    expect(start.field).toBe("updatedAt");
    expect(start.directions.updatedAt).toBe("desc");
  });
});

describe("isDefaultSort", () => {
  it("is true for the config default field and direction", () => {
    expect(isDefaultSort(defaultPreference(config), config)).toBe(true);
  });

  it("is false when sorting by a non-default field", () => {
    const pref = selectField(defaultPreference(config), "title");

    expect(isDefaultSort(pref, config)).toBe(false);
  });

  it("is false when the default field is flipped away from its type default", () => {
    const pref = toggleDirection(defaultPreference(config)); // updatedAt asc

    expect(isDefaultSort(pref, config)).toBe(false);
  });
});
