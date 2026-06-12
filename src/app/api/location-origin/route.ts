import { NextResponse } from "next/server";
import { getApproximateLocationOrigin } from "@/app/location-origin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const origin = await getApproximateLocationOrigin();

  return NextResponse.json(origin, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
