import { NextResponse } from "next/server";
import { getPublicFacilities } from "@/app/facilities-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const facilities = await getPublicFacilities();
  return NextResponse.json(facilities, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
    },
  });
}
