"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const MapClientDynamic = dynamic(
  () => import("./map-client").then((m) => m.MapClient),
  {
    ssr: false,
    loading: () => (
      <div style={{ minHeight: "calc(100dvh - 65px)", background: "#f7f8fa" }} />
    ),
  },
);

type MapClientLazyProps = Omit<
  React.ComponentProps<typeof MapClientDynamic>,
  "initialFacilityId" | "routeRequested"
>;

function MapClientWithSearchParams(props: MapClientLazyProps) {
  const searchParams = useSearchParams();

  return (
    <MapClientDynamic
      {...props}
      initialFacilityId={searchParams.get("facility")}
      routeRequested={searchParams.get("route") === "1"}
    />
  );
}

export function MapClientLazy(props: MapClientLazyProps) {
  return (
    <Suspense>
      <MapClientWithSearchParams {...props} />
    </Suspense>
  );
}
