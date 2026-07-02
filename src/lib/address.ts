// Split a raw upstream address into display parts.
// address      → raw as-is (desktop single line)
// addressStreet → "920 West 10th Ave"      (mobile line 1)
// addressCity   → "Vancouver, BC V5Z 1M9" (mobile line 2)
export function parseAddress(raw: string | null): {
  address: string;
  addressStreet: string;
  addressCity: string;
} {
  const fallback = { address: "Address not available", addressStreet: "Address not available", addressCity: "" };
  if (!raw) return fallback;

  const address = raw.trim();

  const bcIdx = raw.search(/\bBC\b/i);
  if (bcIdx === -1) {
    return { address, addressStreet: address, addressCity: "" };
  }

  // Normalize "BC, V1V 1V1" or "BC  V1V 1V1" → "BC V1V 1V1"
  const bcPart = raw.slice(bcIdx).replace(/^(BC)[,\s]+/i, "$1 ").trim();
  // Everything before BC, trailing separators stripped
  const beforeBC = raw.slice(0, bcIdx).replace(/[, ]+$/, "");

  const lastComma = beforeBC.lastIndexOf(",");
  let addressStreet: string;
  let cityName: string;

  if (lastComma === -1) {
    const lastSpace = beforeBC.lastIndexOf(" ");
    if (lastSpace === -1) return { address, addressStreet: address, addressCity: bcPart };
    addressStreet = beforeBC.slice(0, lastSpace).trim();
    cityName = beforeBC.slice(lastSpace + 1).trim();
  } else {
    addressStreet = beforeBC.slice(0, lastComma).trim();
    cityName = beforeBC.slice(lastComma + 1).trim();
  }

  return {
    address,
    addressStreet,
    addressCity: `${cityName}, ${bcPart}`,
  };
}
