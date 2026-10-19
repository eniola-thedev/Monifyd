import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { sitePages } from "@/lib/site-pages";
import { ApiStatus } from "@/components/ApiStatus";

export function generateStaticParams() {
  return Object.keys(sitePages).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = sitePages[slug];
  return page ? { title: `${page.title} | Monifyd`, description: page.intro } : {};
}

export default async function SitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = sitePages[slug];
  if (!page) notFound();
  return (
    <main className="site-page">
      <header className="site-page-header"><a className="site-footer-logo" href="/">Monifyd</a><a href="/signup">Create account</a></header>
      <article>
        <p className="site-page-eyebrow">Monifyd</p>
        <h1>{page.title}</h1>
        <p className="site-page-intro">{page.intro}</p>
        {slug === "status" && <ApiStatus />}
        {page.sections.map((section) => (
          <section className="site-page-section" key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {section.bullets && <ul>{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul>}
          </section>
        ))}
        {(slug === "developers" || slug === "api-reference") && <p className="site-page-action"><a className="btn btn-primary" href="/docs">Open API documentation</a></p>}
        {slug === "pricing" && <p className="site-page-action"><a className="btn btn-primary" href="/signup">Get started</a></p>}
      </article>
    </main>
  );
}
