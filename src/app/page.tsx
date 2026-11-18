import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { Pricing } from "@/components/Pricing";
import { current } from "@/server/accounts";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (await current()) redirect("/dashboard");
  return (
    <>
      <Nav />
      <main className="home">
        <section className="hero">
          <div>
            <h1>All-in-One AI Tools for Your <em>Business</em></h1>
            <p>Automate your content, create amazing videos, and handle calls with AI. All in one powerful platform.</p>
            <ul className="chips">
              <li><i className="ico posting" /> Auto Posting <small>Social Media</small></li>
              <li><i className="ico video" /> Video Duplicate <small>AI Video</small></li>
              <li><i className="ico call" /> AI Call Agent <small>Answer & Talk</small></li>
            </ul>
            <div className="row">
              <Link className="btn solid" href="/register">Start Free Trial →</Link>
              <a className="btn ghost" href="#tools">Watch Demo ▶</a>
            </div>
          </div>
          <div className="mascot">
            <span className="float cal" aria-hidden="true" />
            <span className="float play" aria-hidden="true" />
            <span className="float phone" aria-hidden="true" />
            <img src="/smtools-robot.jpg" alt="smtools robot giving a thumbs up" />
          </div>
        </section>

        <section className="tool-row" id="tools">
          <article>
            <i className="ico posting" />
            <h2>Auto Posting</h2>
            <p>Give a topic and a time. smtools writes the caption, makes the picture, and publishes it as your Facebook page.</p>
          </article>
          <article>
            <i className="ico video" />
            <h2>Video Duplicate</h2>
            <p>Upload a video, say what should change, and smtools makes a new short clip.</p>
          </article>
          <article>
            <i className="ico call" />
            <h2>AI Call Agent</h2>
            <p>Set up a calling agent for answers and reports. The screen is open. It is not connected to a phone line yet.</p>
          </article>
        </section>

        <Pricing />

        <section className="faq-board" id="faq">
          <h2>FAQ</h2>
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
            <p>Starter, Pro, and Business list auto posting, video duplicate, and call-agent minutes. Opening an account does not charge a card. PayHere checkout is not switched on yet.</p>
          </details>
          <details>
            <summary>Can video duplicate and the call agent run today?</summary>
            <p>The screens are in the desk. Auto posting is the tool that publishes. Video generation and phone calls are not connected yet.</p>
          </details>
        </section>
      </main>
    </>
  );
}
