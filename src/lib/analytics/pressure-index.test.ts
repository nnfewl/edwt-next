import { describe, expect, it } from "vitest";
import { pressureStatus, PRESSURE_STATUSES } from "./pressure-index";

describe("pressureStatus", () => {
  it("classifies each band by ratio", () => {
    expect(pressureStatus(0.5)).toBe("Calm");
    expect(pressureStatus(0.79)).toBe("Calm");
    expect(pressureStatus(0.8)).toBe("Typical");
    expect(pressureStatus(1.0)).toBe("Typical");
    expect(pressureStatus(1.15)).toBe("Elevated");
    expect(pressureStatus(1.59)).toBe("Elevated");
    expect(pressureStatus(1.6)).toBe("Severe");
    expect(pressureStatus(3)).toBe("Severe");
  });

  it("orders the status words calm→severe for the gauge", () => {
    expect(PRESSURE_STATUSES).toEqual(["Calm", "Typical", "Elevated", "Severe"]);
  });
});
