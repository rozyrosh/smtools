"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type ConnectedTarget = { id: string; name: string; active: boolean; picture?: string };

type DeskState = {
  ok?: boolean;
  error?: string;
  flash?: string;
  facebook?: {
    app_id: string;
    page_id: string;
    page_name: string;
    connected: boolean;
    pages?: ConnectedTarget[];
    redirect_uri: string;
  };
  linkedin?: {
    client_id: string;
    org_id: string;
    org_name: string;
    connected: boolean;
    orgs?: ConnectedTarget[];
  };
  page_voice?: string;
  pending_pages?: { id: string; name: string; picture?: string }[];
};

type Network = "facebook" | "linkedin" | null;

function FacebookMark() {
  return (
    <svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true">
      <path fill="currentColor" d="M14 8.2h2.4V5H14c-2.5 0-4.2 1.7-4.2 4.3V11H7.5v3.3h2.3V22h3.5v-7.7h2.6L16.5 11h-3.2V9.5c0-.8.3-1.3 1.2-1.3z" />
    </svg>
  );
}

function LinkedInMark() {
  return (
    <svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true">
      <path fill="currentColor" d="M6.3 9.2H3.1V21h3.2V9.2zM4.7 3C3.5 3 2.5 4 2.5 5.2S3.5 7.4 4.7 7.4 6.9 6.4 6.9 5.2 5.9 3 4.7 3zM20.9 21h-3.2v-6.2c0-1.5 0-3.4-2.1-3.4s-2.4 1.6-2.4 3.3V21H10V9.2h3.1v1.6h.1c.4-.8 1.5-1.7 3.1-1.7 3.3 0 3.9 2.2 3.9 5V21z" />
    </svg>
  );
}

export default function PageConnect({ csrf }: { csrf: string }) {
  const [state, setState] = useState<DeskState | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Network>(null);
  const [pendingPick, setPendingPick] = useState<string[]>([]);
  const shown = useRef("");
  const formRef = useRef<HTMLFormElement>(null);
  const linkedRef = useRef<HTMLFormElement>(null);
  const guideRef = useRef<HTMLDialogElement>(null);
  const linkedGuideRef = useRef<HTMLDialogElement>(null);
  const sheetRef = useRef<HTMLDialogElement>(null);
  const openedForFlash = useRef(false);

  async function call(action: string, body?: Record<string, unknown>) {
    const response = await fetch(action === "state" ? "/api/state" : "/api/desk", {
      method: body || action !== "state" ? "POST" : "GET",
      headers: { "Content-Type": "application/json", "X-CSRF": csrf },
      body: action === "state" ? undefined : JSON.stringify({ action, ...body }),
    });
    const data = (await response.json().catch(() => ({ ok: false, error: "The desk returned an unreadable answer." }))) as DeskState;
    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || "That did not work.") as Error & { state?: DeskState };
      error.state = data;
      throw error;
    }
    return data;
  }

  function apply(next: DeskState) {
    setState(next);
    if (next.flash) setStatus(next.flash);
  }

  useEffect(() => {
    call("state").then(apply).catch((error: Error) => setStatus(error.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!state || openedForFlash.current) return;
    if (state.flash || state.pending_pages?.length) {
      openedForFlash.current = true;
      setOpen("facebook");
      const already = new Set(
        (state.facebook?.pages || [])
          .map((page) => page.id)
          .concat(state.facebook?.page_id ? [state.facebook.page_id] : [])
      );
      setPendingPick((state.pending_pages || []).map((page) => page.id).filter((id) => !already.has(id)));
    }
  }, [state]);

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    if (open) {
      if (!sheet.open) sheet.showModal();
    } else if (sheet.open) {
      sheet.close();
    }
  }, [open]);

  useEffect(() => {
    const form = formRef.current;
    if (!form || !state?.facebook || open !== "facebook") return;
    const key = [state.facebook.app_id, state.facebook.page_id, state.page_voice].join("|");
    const active = document.activeElement;
    const editing = active instanceof HTMLElement && active.closest("form") === form && (active as HTMLInputElement).type !== "submit";
    if (key !== shown.current && !editing) {
      (form.elements.namedItem("app_id") as HTMLInputElement).value = state.facebook.app_id || "";
      (form.elements.namedItem("page_id") as HTMLInputElement).value = state.facebook.page_id || "";
      (form.elements.namedItem("page_voice") as HTMLTextAreaElement).value = state.page_voice || "";
      shown.current = key;
    }
  }, [state, open]);

  useEffect(() => {
    const form = linkedRef.current;
    if (!form || !state?.linkedin || open !== "linkedin") return;
    (form.elements.namedItem("client_id") as HTMLInputElement).value = state.linkedin.client_id || "";
    (form.elements.namedItem("org_id") as HTMLInputElement).value = state.linkedin.org_id || "";
    (form.elements.namedItem("org_name") as HTMLInputElement).value = state.linkedin.org_name || "";
  }, [state, open]);

  async function withBusy(message: string, job: () => Promise<unknown>) {
    setBusy(true);
    setStatus(message);
    try {
      await job();
    } finally {
      setBusy(false);
    }
  }

  async function onConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>;
    const pasted = (data.page_token || "").trim();
    const appId = (data.app_id || "").trim();
    if (!appId) {
      setStatus("Add the Meta app ID first.");
      return;
    }
    await withBusy("Saving the app…", async () => {
      try {
        const next = await call("save_connection", data);
        apply(next);
        shown.current = "";
        // Pasted token: page was upserted in save_connection.
        if (pasted) {
          setStatus(next.facebook?.connected ? "Facebook page connected." : "The app details are saved. Add a Page token to finish connecting.");
          return;
        }
        // No token: always open Facebook OAuth so the user can add (or re-add) a page,
        // even when other pages are already connected.
        setStatus("App details saved. Opening Facebook so you can choose the page…");
        try {
          sheetRef.current?.close();
        } catch {
          /* ignore */
        }
        setOpen(null);
        window.location.assign("/api/facebook/start");
      } catch (error) {
        const desk = error as Error & { state?: DeskState };
        if (desk.state) apply(desk.state);
        setStatus(desk.message);
      }
    });
  }

  async function onLinkedIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>;
    await withBusy("Saving LinkedIn…", async () => {
      try {
        const next = await call("save_linkedin", data);
        apply(next);
        setStatus(next.linkedin?.connected ? "LinkedIn connected." : "LinkedIn details saved.");
      } catch (error) {
        const desk = error as Error & { state?: DeskState };
        if (desk.state) apply(desk.state);
        setStatus(desk.message);
      }
    });
  }

  async function copy(text: string, note: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(note);
    } catch {
      setStatus(text);
    }
  }

  const page = state?.facebook;
  const linked = state?.linkedin;
  const fbPages = page?.pages?.length
    ? page.pages
    : page?.connected && page.page_id
      ? [{ id: page.page_id, name: page.page_name || "Facebook page", active: true }]
      : [];
  const liOrgs = linked?.orgs?.length
    ? linked.orgs
    : linked?.connected && linked.org_id
      ? [{ id: linked.org_id, name: linked.org_name || "LinkedIn company", active: true }]
      : [];

  return (
    <main className="desk desk-solo desk-modern connect-desk">
      <div className="desk-glow" aria-hidden="true" />
      <section className="network-pick">
        <p className="eyebrow">Choose a network</p>
        <h2>Where should posts go?</h2>
        <p className="quiet">Connect more than one page. On Auto Posting you can turn pages on or off for each post.</p>
        <div className="network-row">
          <button className={fbPages.length ? "network-card on" : "network-card"} type="button" onClick={() => setOpen("facebook")}>
            <span className="network-mark facebook"><FacebookMark /></span>
            <strong>Facebook</strong>
            <small>
              {fbPages.length
                ? fbPages.length === 1
                  ? fbPages[0].name
                  : `${fbPages.length} pages connected`
                : "Not connected"}
            </small>
          </button>
          <button className={liOrgs.length ? "network-card on" : "network-card"} type="button" onClick={() => setOpen("linkedin")}>
            <span className="network-mark linkedin"><LinkedInMark /></span>
            <strong>LinkedIn</strong>
            <small>
              {liOrgs.length
                ? liOrgs.length === 1
                  ? liOrgs[0].name
                  : `${liOrgs.length} companies connected`
                : "Not connected"}
            </small>
          </button>
        </div>
      </section>
      {status ? <p className="status" role="status">{status}</p> : null}

      <dialog
        className="guide connect-sheet"
        ref={sheetRef}
        onClose={() => setOpen(null)}
        onClick={(event) => {
          if (event.target === sheetRef.current) setOpen(null);
        }}
      >
        {open === "facebook" ? (
          <>
            <div className="guide-bar">
              <div className="connect-sheet-title">
                <span className="connect-brand facebook" aria-hidden="true">
                  <FacebookMark />
                </span>
                <div>
                  <p className="eyebrow">Facebook</p>
                  <h2>Connect page</h2>
                </div>
                <button className="help" type="button" aria-label="How to get the App ID and App secret" onClick={() => guideRef.current?.showModal()}>?</button>
              </div>
              <div className="connect-sheet-actions">
                <span className={fbPages.length ? "page-chip on" : "page-chip"}>
                  {fbPages.length ? `${fbPages.length} connected` : "Not connected"}
                </span>
                <button className="btn ghost compose-secondary" type="button" onClick={() => setOpen(null)}>Close</button>
              </div>
            </div>
            <div className="guide-body">
              {status ? <p className="status" role="status">{status}</p> : null}
              <p className="quiet connect-lead">
                {fbPages.length
                  ? "You can keep several Facebook pages connected. Connect again to add another page without removing the ones you already have."
                  : "Connect a Facebook page. Posts go out as that page, not on the personal profile. You can add more pages later."}
              </p>
              {fbPages.length ? (
                <div className="connected-list">
                  <p className="eyebrow">Connected pages</p>
                  {fbPages.map((item) => (
                    <div key={item.id} className="connected-row">
                      <div className="connected-page">
                        {item.picture ? (
                          <img className="page-avatar" src={item.picture} alt="" width={40} height={40} loading="lazy" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="page-avatar fallback" aria-hidden="true">{(item.name || "?").slice(0, 1).toUpperCase()}</span>
                        )}
                        <div>
                          <strong>{item.name}</strong>
                          <small>{item.active ? "On for posting" : "Connected"}</small>
                        </div>
                      </div>
                      <button
                        className="text-btn"
                        type="button"
                        disabled={busy}
                        onClick={() => withBusy("Disconnecting…", async () => {
                          apply(await call("disconnect", { page_id: item.id }));
                          setStatus(`${item.name} disconnected.`);
                        })}
                      >
                        Disconnect
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {state?.pending_pages?.length ? (
                <div className="picks">
                  <p className="quiet">Select one or more pages to add. Already connected pages are grayed out.</p>
                  {state.pending_pages.map((item) => {
                    const already = fbPages.some((page) => page.id === item.id);
                    const checked = !already && pendingPick.includes(item.id);
                    return (
                      <label
                        key={item.id}
                        className={already ? "pick-option already" : checked ? "pick-option on" : "pick-option"}
                      >
                        <input
                          type="checkbox"
                          checked={already || checked}
                          disabled={busy || already}
                          onChange={(event) => {
                            if (already) return;
                            setPendingPick((prev) =>
                              event.target.checked
                                ? Array.from(new Set([...prev, item.id]))
                                : prev.filter((id) => id !== item.id)
                            );
                          }}
                        />
                        {item.picture ? (
                          <img className="page-avatar" src={item.picture} alt="" width={32} height={32} loading="lazy" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="page-avatar fallback sm" aria-hidden="true">{(item.name || "?").slice(0, 1).toUpperCase()}</span>
                        )}
                        <span>{item.name}</span>
                        {already ? <small className="pick-note">Already connected</small> : null}
                      </label>
                    );
                  })}
                  <button
                    className="btn solid compose-primary"
                    type="button"
                    disabled={busy || !pendingPick.length}
                    onClick={() => withBusy("Connecting pages…", async () => {
                      const ids = pendingPick.filter((id) => !fbPages.some((page) => page.id === id));
                      apply(await call("fb_pick_many", { page_ids: ids }));
                      setPendingPick([]);
                      setStatus("Pages connected.");
                    })}
                  >
                    Connect selected ({pendingPick.length})
                  </button>
                </div>
              ) : null}
              <form className="compose-form connect-form" ref={formRef} onSubmit={onConnection}>
                <div className="field-block">
                  <div className="field-top"><span>Meta app ID</span></div>
                  <input name="app_id" inputMode="numeric" autoComplete="off" placeholder="1234567890" />
                </div>
                <div className="field-block">
                  <div className="field-top"><span>App secret</span></div>
                  <input name="app_secret" type="password" autoComplete="new-password" placeholder="Leave blank to keep the saved secret" />
                </div>
                <button className="btn solid compose-primary" disabled={busy}>
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8.5 13.5a3.5 3.5 0 0 1 0-5l1.8-1.8a1 1 0 1 0-1.4-1.4L7.1 7.1a5.5 5.5 0 0 0 0 7.8l1.8 1.8a1 1 0 1 0 1.4-1.4zm7-3a3.5 3.5 0 0 1 0 5l-1.8 1.8a1 1 0 1 0 1.4 1.4l1.8-1.8a5.5 5.5 0 0 0 0-7.8l-1.8-1.8a1 1 0 1 0-1.4 1.4zM9.7 13.1a1 1 0 0 0 1.4 0l3.2-3.2a1 1 0 1 0-1.4-1.4l-3.2 3.2a1 1 0 0 0 0 1.4z" fill="currentColor" /></svg>
                  {fbPages.length ? "Save and connect another" : "Save and connect"}
                </button>
                <p className="quiet">
                  {fbPages.length
                    ? "This saves the app details, then opens Facebook so you can add another page. Existing pages stay connected."
                    : "Saving the app details does not link the page. This opens Facebook so you can choose it."}
                </p>
                <p className="or">or paste a Page token</p>
                <div className="field-block">
                  <div className="field-top"><span>Page ID</span></div>
                  <input name="page_id" inputMode="numeric" autoComplete="off" placeholder="Page ID" />
                </div>
                <div className="field-block">
                  <div className="field-top"><span>Page access token</span></div>
                  <input name="page_token" type="password" autoComplete="new-password" placeholder="Leave blank to keep the saved token" />
                </div>
                <div className="field-block">
                  <div className="field-top"><span>How the page should sound</span></div>
                  <textarea name="page_voice" rows={3} placeholder="A calm Sinhala page about home cooking. Short sentences. No hard sell." />
                </div>
                <div className="compose-foot connect-foot">
                  <div className="compose-actions">
                    <a className="btn ghost compose-secondary" href="/api/facebook/start">
                      {fbPages.length ? "Connect another Facebook page" : "Connect with Facebook"}
                    </a>
                    {fbPages.length ? (
                      <button className="text-btn" type="button" disabled={busy} onClick={() => withBusy("Disconnecting…", async () => { apply(await call("disconnect", {})); setStatus("All Facebook pages disconnected."); })}>
                        Disconnect all Facebook pages
                      </button>
                    ) : null}
                  </div>
                </div>
              </form>
            </div>
          </>
        ) : null}
        {open === "linkedin" ? (
          <>
            <div className="guide-bar">
              <div className="connect-sheet-title">
                <span className="connect-brand linkedin" aria-hidden="true">
                  <LinkedInMark />
                </span>
                <div>
                  <p className="eyebrow">LinkedIn</p>
                  <h2>Connect company</h2>
                </div>
                <button className="help" type="button" aria-label="How to connect LinkedIn" onClick={() => linkedGuideRef.current?.showModal()}>?</button>
              </div>
              <div className="connect-sheet-actions">
                <span className={liOrgs.length ? "page-chip on" : "page-chip"}>
                  {liOrgs.length ? `${liOrgs.length} connected` : "Not connected"}
                </span>
                <button className="btn ghost compose-secondary" type="button" onClick={() => setOpen(null)}>Close</button>
              </div>
            </div>
            <div className="guide-body">
              <p className="quiet connect-lead">
                {liOrgs.length
                  ? "You can keep several LinkedIn companies connected. Saving another company ID adds it without removing the ones you already have."
                  : "To connect LinkedIn you need two things: the company ID and an access token that can post as that company. Company name is only a label on the desk."}
              </p>
              {liOrgs.length ? (
                <div className="connected-list">
                  <p className="eyebrow">Connected companies</p>
                  {liOrgs.map((item) => (
                    <div key={item.id} className="connected-row">
                      <div>
                        <strong>{item.name}</strong>
                        <small>{item.active ? "On for posting" : "Connected"}</small>
                      </div>
                      <button
                        className="text-btn"
                        type="button"
                        disabled={busy}
                        onClick={() => withBusy("Disconnecting…", async () => {
                          apply(await call("disconnect_linkedin", { org_id: item.id }));
                          setStatus(`${item.name} disconnected.`);
                        })}
                      >
                        Disconnect
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <ul className="connect-need-list" aria-label="What you need">
                <li><strong>Required</strong> — Company / organization ID</li>
                <li><strong>Required</strong> — Access token</li>
                <li><strong>Recommended</strong> — Company name</li>
                <li><strong>Optional</strong> — Client ID and secret (kept for your LinkedIn app notes)</li>
              </ul>
              <form className="compose-form connect-form" ref={linkedRef} onSubmit={onLinkedIn}>
                <div className="field-block">
                  <div className="field-top"><span>Company / organization ID</span><span className="field-need">Required</span></div>
                  <input name="org_id" autoComplete="off" required placeholder="Numbers only, e.g. 123456789" />
                  <p className="field-hint">Admin company page number from LinkedIn. Posts publish as this company.</p>
                </div>
                <div className="field-block">
                  <div className="field-top"><span>Company name</span><span className="field-need soft">Recommended</span></div>
                  <input name="org_name" autoComplete="organization" placeholder="Shown on the desk" />
                  <p className="field-hint">Any clear name so you recognize the page on smtools.</p>
                </div>
                <div className="field-block">
                  <div className="field-top"><span>Access token</span><span className="field-need">Required</span></div>
                  <input name="access_token" type="password" autoComplete="new-password" placeholder={linked?.connected ? "Leave blank to keep the saved token" : "Paste the LinkedIn access token"} />
                  <p className="field-hint">Must allow posting as the company (for example w_organization_social).</p>
                </div>
                <details className="connect-extra">
                  <summary>App details (optional)</summary>
                  <div className="connect-extra-body">
                    <p className="quiet">Client ID and secret are not required to post. Save them if you want the app details kept with this desk.</p>
                    <div className="field-block">
                      <div className="field-top"><span>Client ID</span></div>
                      <input name="client_id" autoComplete="off" placeholder="From the LinkedIn app Auth tab" />
                    </div>
                    <div className="field-block">
                      <div className="field-top"><span>Client secret</span></div>
                      <input name="client_secret" type="password" autoComplete="new-password" placeholder="Leave blank to keep the saved secret" />
                    </div>
                  </div>
                </details>
                <div className="compose-foot connect-foot">
                  <div className="compose-actions">
                    <button className="btn solid compose-primary" disabled={busy}>
                      {liOrgs.length ? "Add LinkedIn company" : "Save LinkedIn"}
                    </button>
                    {liOrgs.length ? (
                      <button className="text-btn" type="button" disabled={busy} onClick={() => withBusy("Disconnecting…", async () => { apply(await call("disconnect_linkedin", {})); setStatus("All LinkedIn companies disconnected."); })}>
                        Disconnect all LinkedIn companies
                      </button>
                    ) : null}
                  </div>
                </div>
              </form>
            </div>
          </>
        ) : null}
      </dialog>

      <dialog className="guide connect-help" ref={guideRef} onClick={(event) => { if (event.target === guideRef.current) guideRef.current?.close(); }}>
        <div className="guide-bar">
          <div>
            <p className="eyebrow">First time</p>
            <h2>Get the two codes from Meta</h2>
          </div>
          <button className="btn ghost compose-secondary" type="button" onClick={() => guideRef.current?.close()}>Close</button>
        </div>
        <div className="guide-body">
          <p>Facebook needs an App ID and an App secret before this desk can use your page. Meta gives you both. It takes a few minutes.</p>
          <a className="btn solid compose-primary" href="https://developers.facebook.com/async/registration" target="_blank" rel="noreferrer">Create the app on Meta</a>
          <h3>New to Meta for Developers</h3>
          <ol>
            <li>Click the button above. Sign in with the Facebook account that manages the page. If the page is titled <strong>Social technologies</strong>, click <strong>Get Started</strong> at the top right.</li>
            <li>Meta opens <strong>Create a Meta for Developers account</strong>. On <strong>Register</strong>, click <strong>Continue</strong>.</li>
            <li>On <strong>Verify account</strong>, enter the code Meta sends to your phone or email.</li>
            <li>On <strong>Contact info</strong>, confirm the phone and email.</li>
            <li>On <strong>About you</strong>, pick the occupation that fits you, then finish.</li>
          </ol>
          <p className="quiet">Already registered on Meta for Developers? Skip the five steps above. Click the button and follow <strong>Create the app</strong> below.</p>
          <h3>Create the app</h3>
          <ol>
            <li>Name the app anything you like. When Meta asks what it is for, choose <strong>Manage everything on your Page</strong>.</li>
            <li>Open <strong>App settings</strong>, then <strong>Basic</strong>. Copy the <strong>App ID</strong>. Click <strong>Show</strong> beside <strong>App secret</strong> and copy that too. Paste both into the boxes below.</li>
            <li>In the left menu, open <strong>Facebook Login for Business</strong>, then <strong>Settings</strong>. Under <strong>Valid OAuth Redirect URIs</strong>, paste this address and save it. Leave <strong>Enforce HTTPS</strong> turned on.
              <button className="link" type="button" onClick={() => copy(page?.redirect_uri || "", "Redirect copied.")}>{page?.redirect_uri}</button>
            </li>
            <li>Open <strong>Use cases</strong>. Next to <strong>Manage everything on your Page</strong>, click <strong>Customize</strong>. Turn these three to <strong>Ready for testing</strong>: pages_show_list, pages_manage_posts, pages_read_engagement.</li>
            <li>Come back here and click <strong>Save and connect</strong>. Facebook asks which page to use. Pick the page. Posts go out as that page, not on your personal profile.</li>
          </ol>
        </div>
      </dialog>

      <dialog className="guide connect-help" ref={linkedGuideRef} onClick={(event) => { if (event.target === linkedGuideRef.current) linkedGuideRef.current?.close(); }}>
        <div className="guide-bar">
          <div>
            <p className="eyebrow">First time</p>
            <h2>Connect a LinkedIn company</h2>
          </div>
          <button className="btn ghost compose-secondary" type="button" onClick={() => linkedGuideRef.current?.close()}>Close</button>
        </div>
        <div className="guide-body">
          <p>To connect LinkedIn on this desk you only need <strong>Company / organization ID</strong> and an <strong>Access token</strong>. Company name is a label. Client ID and secret are optional.</p>
          <a className="btn solid compose-primary" href="https://www.linkedin.com/developers/apps" target="_blank" rel="noreferrer">Open LinkedIn Developers</a>
          <h3>1. Create a LinkedIn app (needed to make a token)</h3>
          <ol>
            <li>Click the button above. Sign in with a LinkedIn account that is an <strong>admin</strong> of the company page.</li>
            <li>Click <strong>Create app</strong>. Name the app, link it to your company page, accept the terms, then create it.</li>
            <li>Open <strong>Auth</strong>. Request products / scopes so the app can post as a company — especially <strong>w_organization_social</strong>.</li>
            <li>Client ID and Client Secret stay in LinkedIn. You can paste them under <strong>App details (optional)</strong> on this desk if you want them saved, but posting does not need them.</li>
          </ol>
          <h3>2. Company / organization ID (required)</h3>
          <ol>
            <li>Open your LinkedIn company page as an admin.</li>
            <li>Find the organization number LinkedIn uses for that company (often in admin tools or admin URLs).</li>
            <li>Paste only the number into <strong>Company / organization ID</strong>.</li>
            <li>Add a <strong>Company name</strong> so the desk shows a clear label.</li>
          </ol>
          <h3>3. Access token (required)</h3>
          <ol>
            <li>In your LinkedIn app, open <strong>Auth</strong> or the OAuth / token tools LinkedIn provides.</li>
            <li>Create an access token for the admin account with permission to post on the company page (<strong>w_organization_social</strong>).</li>
            <li>Paste the token into <strong>Access token</strong>, then click <strong>Save LinkedIn</strong>.</li>
          </ol>
          <p className="quiet">Tokens expire. If posting fails later, create a new access token and paste it again. Leave Access token blank only when you want to keep the token already saved.</p>
        </div>
      </dialog>
    </main>
  );
}
