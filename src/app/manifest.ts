import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EDWT · Lower Mainland ED Wait Times",
    short_name: "EDWT",
    description: "Live wait times for emergency departments and urgent care centres in the Lower Mainland, BC.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f766e",
  };
}
