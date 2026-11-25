import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { Pricing } from "@/components/Pricing";
import { SiteFooter } from "@/components/SiteFooter";
import { current } from "@/server/accounts";

export const dynamic = "force-dynamic";

const HEADLINE = ["All-in-One", "AI", "Tools", "for", "Your", "Business"];

function Headline() {
  let index = 0;
  return (
    <h1 className="sentence-loop" aria-label="All-in-One AI Tools for Your Business">
      {HEADLINE.map((word) => {
        const accent = word === "Business";
        const letters = word.split("").map((char) => {
          const delay = index * 0.045;
          index += 1;
          return (
            <span key={`${word}-${char}-${delay}`} className={accent ? "accent" : undefined} style={{ animationDelay: `${delay}s` }} aria-hidden="true">
              {char}
            </span>
          );
        });
        index += 1;
        return (
          <span className="word" key={word} aria-hidden="true">
            {letters}
          </span>
        );
      })}
    </h1>
  );
}

function ChipIcon({ kind }: { kind: "posting" | "video" | "audio" }) {
  if (kind === "posting") {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 4.5 20.5 11 10 21.5 3.5 15z" />
        <path d="M12.5 6.5 17.5 11.5" />
      </svg>
    );
  }
  if (kind === "video") {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
        <path d="M8.2 6.8v10.4L17.4 12z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 10v4" />
      <path d="M12 8v8" />
      <path d="M16 10.5v3" />
      <rect x="4.5" y="5.5" width="15" height="13" rx="3.5" />
    </svg>
  );
}

export default async function HomePage() {
  const signedIn = await current();
  if (signedIn) redirect(signedIn.admin ? "/admin" : "/dashboard");
  return (
    <>
      <Nav />
      <main className="home">
        <div className="home-aura" aria-hidden="true">
          <span className="orb orb-a" />
          <span className="orb orb-b" />
          <span className="orb orb-c" />
          <span className="sparkles" />
        </div>

        <section className="hero">
          <div className="hero-copy reveal">
            <p className="hero-badge">
              <span aria-hidden="true">✦</span> Next-Gen AI Toolkit <span aria-hidden="true">✦</span>
            </p>
            <Headline />
            <p className="hero-lead">
              Automate your content, create videos, and turn text into clear AI voice — all in one platform.
            </p>
            <ul className="chips">
              <li>
                <i className="chip-ico posting"><ChipIcon kind="posting" /></i>
                <span>Auto Posting <small>Social Media</small></span>
              </li>
              <li>
                <i className="chip-ico video"><ChipIcon kind="video" /></i>
                <span>Video Duplicate <small>AI Video</small></span>
              </li>
              <li>
                <i className="chip-ico audio"><ChipIcon kind="audio" /></i>
                <span>Text to Speech <small>AI Voice</small></span>
              </li>
            </ul>
            <div className="row hero-actions">
              <Link className="btn solid hero-primary" href="/register">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M11 3.5 13.2 9l5.8.4-4.5 3.7 1.5 5.6L11 15.8 5 18.7l1.5-5.6L2 9.4 7.8 9z" />
                </svg>
                Start Free Trial
                <span aria-hidden="true">→</span>
              </Link>
              <a className="btn ghost hero-secondary" href="#tools">
                <span className="play-dot" aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M9 7.2v9.6L17.5 12z" /></svg>
                </span>
                Watch Demo
              </a>
            </div>
          </div>

          <div className="mascot reveal">
            <div className="mascot-stage">
              <span className="energy-platform" aria-hidden="true" />
              <span className="energy-ring ring-a" aria-hidden="true" />
              <span className="energy-ring ring-b" aria-hidden="true" />
              <span className="energy-glow" aria-hidden="true" />
              <img className="float cal" src="/hero/icon-posting.png" alt="" aria-hidden="true" />
              <img className="float play" src="/hero/icon-video.png" alt="" aria-hidden="true" />
              <img className="float audio" src="/hero/icon-audio.png" alt="" aria-hidden="true" />
              <img className="float text" src="/hero/icon-text.png" alt="" aria-hidden="true" />
              <img className="mascot-img" src="/hero/smtools-robot.png" alt="smtools AI robot mascot" />
              <p className="mascot-tag">Smarter Tools. Greater Possibilities.</p>
            </div>
          </div>
        </section>

        <section className="tool-row" id="tools">
          <article className="tool-card tool-posting reveal">
            <div className="tool-card-top">
              <i className="tool-ico posting" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 4.5 20.5 11 10 21.5 3.5 15z" /><path d="M12.5 6.5 17.5 11.5" /></svg>
              </i>
              <Link className="tool-go" href="/register" aria-label="Try Auto Posting">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>
            </div>
            <h2>Auto Posting</h2>
            <p>Give a topic and a time. smtools writes the caption, makes the picture, and publishes it as your Facebook page.</p>
          </article>
          <article className="tool-card tool-video reveal">
            <div className="tool-card-top">
              <i className="tool-ico video" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M8.2 6.8v10.4L17.4 12z" /></svg>
              </i>
              <Link className="tool-go" href="/register" aria-label="Try Video Duplicate">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>
            </div>
            <h2>Video Duplicate</h2>
            <p>Upload a video, say what should change, and smtools makes a new short clip.</p>
          </article>
          <article className="tool-card tool-audio reveal">
            <div className="tool-card-top">
              <i className="tool-ico audio" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 10v4M12 8v8M16 10.5v3" /><rect x="4.5" y="5.5" width="15" height="13" rx="3.5" /></svg>
              </i>
              <Link className="tool-go" href="/register" aria-label="Try Text to Speech">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>
            </div>
            <h2>Text to Speech</h2>
            <p>Paste a caption or any script, pick a voice, and smtools creates a clear voice clip you can play or download.</p>
          </article>
        </section>

        <Pricing />

        <section className="faq-board" id="faq">
          <div className="faq-head">
            <p className="board-kicker">Answers</p>
            <h2>FAQ</h2>
          </div>
          <details open>
            <summary>Which Facebook account does a post use?</summary>
            <p>The connected Page. It does not go on the personal profile. Disconnect, then connect again, to pick another page.</p>
          </details>
          <details>
            <summary>Does a daily post go out by itself?</summary>
            <p>Yes, at the time you set, in Sri Lanka time, while smtools is running on this computer. If the computer is off, it posts after smtools is running again.</p>
          </details>
          <details>
            <summary>What is included in a plan?</summary>
            <p>New accounts start on Free with a shared monthly credit balance. Spend credits on posts, video, or audio as you like. Basic, Pro, and Business add more credits. An admin can change packages. Opening an account does not charge a card. PayHere checkout is not switched on yet.</p>
          </details>
          <details>
            <summary>Can video duplicate run today?</summary>
            <p>The screen is in the desk. Auto posting is the tool that publishes. Video generation may still need connection on your setup.</p>
          </details>
          <details>
            <summary>How does text to speech work?</summary>
            <p>Open Text to Speech in the desk, paste your caption or script, choose a voice, and create audio. You can also open a queue post and use Speak caption.</p>
          </details>
        </section>

        <section className="home-cta" aria-labelledby="home-cta-title">
          <div className="home-cta-inner">
            <p className="home-cta-brand">smtools</p>
            <h2 id="home-cta-title">Ready to post, clip, and speak with AI?</h2>
            <p>Open a free account and try Auto Posting, Video Duplicate, and Text to Speech in one desk.</p>
            <div className="home-cta-actions">
              <Link className="btn solid home-cta-primary" href="/register">Start Free Trial →</Link>
              <a className="btn ghost home-cta-secondary" href="#pricing">See pricing</a>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
