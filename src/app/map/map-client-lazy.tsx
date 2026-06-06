"use client";

import dynamic from "next/dynamic";
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

export function MapClientLazy(props: React.ComponentProps<typeof MapClientDynamic>) {
  return (
    <Suspense>
      <MapClientDynamic {...props} />
    </Suspense>
  );
}
