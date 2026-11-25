import Link from "next/link";
import { Mark } from "@/components/Nav";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <Link className="brand" href="/">
            <Mark />
            <span>smtools</span>
          </Link>
          <p>AI tools for posting, video, and speech — built for your business pages.</p>
        </div>
        <nav className="site-footer-col" aria-label="Product">
          <h3>Product</h3>
          <Link href="/#tools">Tools</Link>
          <Link href="/#pricing">Pricing</Link>
          <Link href="/#faq">FAQ</Link>
        </nav>
        <nav className="site-footer-col" aria-label="Account">
          <h3>Account</h3>
          <Link href="/login">Login</Link>
          <Link href="/register">Get Started</Link>
          <Link href="/support">Support</Link>
        </nav>
        <nav className="site-footer-col" aria-label="Tools">
          <h3>Tools</h3>
          <Link href="/#tools">Auto Posting</Link>
          <Link href="/#tools">Video Duplicate</Link>
          <Link href="/#tools">Text to Speech</Link>
        </nav>
      </div>
      <div className="site-footer-bottom">
        <p>© {year} smtools. All rights reserved.</p>
        <p className="site-footer-note">Posts go out as your Facebook Page or LinkedIn company — not your personal profile.</p>
      </div>
    </footer>
  );
}
