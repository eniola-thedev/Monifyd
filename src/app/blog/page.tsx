import type { Metadata } from "next";
import Link from "next/link";
import { BlogHeader } from "./BlogHeader";
import { PaymentFlow } from "./PaymentFlow";
import { BlogPhoto } from "./BlogPhoto";
import { blogArticles } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Crypto Payment Guides for Businesses | Monifyd Blog",
  description: "Practical guides to accepting crypto payments, non-custodial checkout and payment infrastructure for businesses and developers.",
  alternates: { canonical: "https://monifyd.com/blog" },
  openGraph: {
    type: "website",
    title: "Crypto Payment Guides for Businesses | Monifyd Blog",
    description: "Practical guides to accepting crypto payments, non-custodial checkout and payment infrastructure for businesses and developers.",
    url: "https://monifyd.com/blog",
    images: [{ url: "/social-preview.png", width: 1200, height: 630, alt: "Monifyd, non-custodial crypto payment links, invoices and checkout." }],
  },
  twitter: { card: "summary_large_image", title: "Crypto Payment Guides | Monifyd Blog", description: "Practical guides to crypto payments and non-custodial checkout.", images: ["/social-preview.png"] },
};

export default function BlogIndex() {
  const [featured, ...moreArticles] = blogArticles;

  return (
    <main className="blog-page">
      <div className="blog-shell">
        <BlogHeader />
        <section className="blog-index-hero">
          <div className="blog-index-copy">
            <h1>Crypto, explained</h1>
            <p>Clear answers on accepting crypto, tracking payments and keeping control of your funds.</p>
            <Link className="btn btn-primary" href={`/blog/${featured.slug}`}>Start with the basics</Link>
          </div>
          <PaymentFlow />
        </section>

        <section className="blog-index-list" aria-labelledby="blog-guides-heading">
          <div className="blog-list-intro">
            <h2 id="blog-guides-heading">Guides for the payment journey</h2>
            <p>From the first payment request to the wallet and the confirmation record.</p>
          </div>
          <div className="blog-article-list">
            {[featured, ...moreArticles].map((article, index) => (
              <article className={index === 0 ? "blog-list-item blog-list-featured" : "blog-list-item"} key={article.slug}>
                <BlogPhoto image={article.featureImage} />
                <div>
                  <p className="blog-category">{article.category}</p>
                  <h3><Link href={`/blog/${article.slug}`}>{article.title}</Link></h3>
                  <p>{article.excerpt}</p>
                </div>
                <Link className="blog-read-link" href={`/blog/${article.slug}`} aria-label={`Read ${article.title}`}>Read guide <span aria-hidden="true">→</span></Link>
              </article>
            ))}
          </div>
        </section>

        <section className="blog-index-cta">
          <p>Ready to request a payment?</p>
          <div>
            <Link className="btn btn-dark" href="/signup">Create a Monifyd account</Link>
            <Link className="blog-text-link" href="/pricing">Explore pricing</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
