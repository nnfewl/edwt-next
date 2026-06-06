"use client";

import dynamic from "next/dynamic";

export const MapClientLazy = dynamic(
  () => import("./map-client").then((m) => m.MapClient),
  {
    ssr: false,
    loading: () => (
      <div style={{ minHeight: "calc(100dvh - 65px)", background: "#f7f8fa" }} />
    ),
  },
);
