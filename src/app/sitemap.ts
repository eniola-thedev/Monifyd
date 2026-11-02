import type { MetadataRoute } from "next";
import { sitePages } from "@/lib/site-pages";

const siteUrl = "https://monifyd.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/docs`, changeFrequency: "monthly", priority: 0.9 },
    ...Object.keys(sitePages)
      .filter((slug) => slug !== "terms")
      .map((slug) => ({
        url: `${siteUrl}/${slug}`,
        changeFrequency: "monthly" as const,
        priority: 0.7,
      })),
  ];
}
