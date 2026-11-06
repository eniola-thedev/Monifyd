import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBlogArticle, headingId, blogArticles } from "@/lib/blog";
import { BlogHeader } from "../BlogHeader";
import { BlogPhoto } from "../BlogPhoto";
import { PaymentFlow } from "../PaymentFlow";

export function generateStaticParams() {
  return blogArticles.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = getBlogArticle(slug);
  if (!article) return {};
  const canonical = `https://monifyd.com/blog/${article.slug}`;
  const image = `/blog/${article.slug}/opengraph-image`;

  return {
    title: article.seoTitle,
    description: article.description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      title: article.seoTitle,
      description: article.description,
      url: canonical,
      images: [{ url: image, width: 1200, height: 630, alt: article.imageAlt }],
    },
    twitter: { card: "summary_large_image", title: article.seoTitle, description: article.description, images: [image] },
  };
}

export default async function BlogArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getBlogArticle(slug);
  if (!article) notFound();

  return (
    <main className="blog-page">
      <div className="blog-shell">
        <BlogHeader />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "BlogPosting",
              headline: article.seoTitle,
              description: article.description,
              image: `https://monifyd.com/blog/${article.slug}/opengraph-image`,
              mainEntityOfPage: `https://monifyd.com/blog/${article.slug}`,
              articleSection: article.category,
              inLanguage: "en",
              publisher: {
                "@type": "Organization",
                name: "Monifyd",
                url: "https://monifyd.com",
                logo: { "@type": "ImageObject", url: "https://monifyd.com/icon-512.png" },
              },
            }).replace(/</g, "\\u003c"),
          }}
        />
        <header className="blog-article-hero">
          <div className="blog-article-title">
            <p className="blog-category">{article.category}</p>
            <h1>{article.title}</h1>
            <p className="blog-article-intro">{article.excerpt}</p>
          </div>
          <div className="blog-article-visual">
            <BlogPhoto image={article.featureImage} priority />
            <PaymentFlow />
          </div>
        </header>
        <div className="blog-reader">
          <nav className="blog-toc" aria-label="In this guide">
            <h2>In this guide</h2>
            <ol>
              {article.sections.map((section) => (
                <li key={section.heading}><a href={`#${headingId(section.heading)}`}>{section.heading}</a></li>
              ))}
            </ol>
          </nav>
          <article className="blog-prose">
            {article.sections.map((section) => (
              <section key={section.heading} id={headingId(section.heading)}>
                <h2>{section.heading}</h2>
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph}>{renderLinkedParagraph(paragraph)}</p>
                ))}
                {section.bullets && <ul>{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul>}
              </section>
            ))}
            <section className="blog-related" aria-labelledby="blog-related-heading">
              <h2 id="blog-related-heading">Keep exploring</h2>
              <ul>
                {article.relatedLinks.map((link) => (
                  <li key={link.href}><Link href={link.href}>{link.label}</Link></li>
                ))}
                <li><Link href="/blog">All Monifyd guides</Link></li>
              </ul>
            </section>
          </article>
        </div>
        <section className="blog-more-guides" aria-labelledby="blog-more-guides-heading">
          <h2 id="blog-more-guides-heading">More on crypto payments</h2>
          <div>
            {blogArticles.filter((item) => item.slug !== article.slug).map((item) => (
              <article key={item.slug}>
                <BlogPhoto image={item.featureImage} />
                <h3><Link href={`/blog/${item.slug}`}>{item.title}</Link></h3>
                <p>{item.excerpt}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="blog-article-cta">
          <div>
            <h2>Put the guide into practice</h2>
            <p>Create a payment request with Monifyd, or review the plans before you begin.</p>
          </div>
          <div>
            <Link className="btn btn-primary" href="/signup">Create an account</Link>
            <Link className="blog-text-link" href="/pricing">View pricing</Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function renderLinkedParagraph(paragraph: string) {
  const parts = paragraph.split(/(\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, index) => {
    const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (!match) return part;
    return <Link key={`${match[2]}-${index}`} href={match[2]}>{match[1]}</Link>;
  });
}
