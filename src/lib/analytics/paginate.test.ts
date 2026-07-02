import { describe, expect, it } from "vitest";
import { paginate, pageCount, PAGE_SIZE } from "./paginate";

describe("paginate", () => {
  const items = Array.from({ length: 23 }, (_, i) => i);

  it("defaults to a page size of 10", () => {
    expect(PAGE_SIZE).toBe(10);
  });

  it("slices the requested page", () => {
    expect(paginate(items, 0)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(paginate(items, 2)).toEqual([20, 21, 22]);
  });

  it("clamps out-of-range pages to empty without throwing", () => {
    expect(paginate(items, 99)).toEqual([]);
    expect(paginate(items, -1)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("counts pages, with a floor of 1", () => {
    expect(pageCount(23)).toBe(3);
    expect(pageCount(10)).toBe(1);
    expect(pageCount(0)).toBe(1);
  });
});
