import { ImageResponse } from "next/og";
import { getBlogArticle } from "@/lib/blog";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getBlogArticle(slug);
  const title = article?.title ?? "Crypto payment guides";

  return new ImageResponse(
    <div style={{
      width: "100%", height: "100%", padding: "64px 72px", display: "flex", flexDirection: "column",
      justifyContent: "space-between", background: "#0d100e", color: "#f3f6f4", fontFamily: "Arial, sans-serif",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 32, fontWeight: 700 }}>
        <div style={{ width: 48, height: 48, borderRadius: 13, background: "#5be37d", color: "#052112", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>M</div>
        Monifyd
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ width: 76, height: 8, background: "#5be37d" }} />
        <div style={{ maxWidth: 1000, fontSize: title.length > 28 ? 64 : 82, lineHeight: 1.05, fontWeight: 700, letterSpacing: -2 }}>{title}</div>
        <div style={{ fontSize: 28, color: "#a9b4ae" }}>Guides to crypto payments and non-custodial checkout</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, color: "#a9b4ae" }}>
        <span>monifyd.com/blog</span>
        <span>Payment links · Invoices · API</span>
      </div>
    </div>,
    size,
  );
}
