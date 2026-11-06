import Link from "next/link";

export function BlogHeader() {
  return (
    <header className="blog-header">
      <Link className="blog-wordmark" href="/" aria-label="Monifyd home">Monifyd</Link>
      <nav aria-label="Blog navigation">
        <Link href="/blog">Blog</Link>
        <Link href="/pricing">Pricing</Link>
        <Link className="blog-header-action" href="/signup">Create account</Link>
      </nav>
    </header>
  );
}
