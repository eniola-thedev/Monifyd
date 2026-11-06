import type { MetadataRoute } from "next";
import { sitePages } from "@/lib/site-pages";
import { blogArticles } from "@/lib/blog";

const siteUrl = "https://monifyd.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/docs`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${siteUrl}/blog`, changeFrequency: "monthly", priority: 0.8 },
    ...blogArticles.map(({ slug }) => ({
      url: `${siteUrl}/blog/${slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...Object.keys(sitePages)
      .filter((slug) => slug !== "terms")
      .map((slug) => ({
        url: `${siteUrl}/${slug}`,
        changeFrequency: "monthly" as const,
        priority: 0.7,
      })),
  ];
}
