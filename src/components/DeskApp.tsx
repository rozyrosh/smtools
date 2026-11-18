"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type ScheduleRun = {
  id: string;
  caption: string;
  status: string;
  error: string;
  fb_url: string;
  image_url: string;
  created_at: string;
  posted_at: string;
};

type Topic = {
  id: string;
  title: string;
  about: string;
  language: string;
  tone: string;
  style: string;
  status: string;
  caption: string;
  image_url: string;
  error: string;
  fb_url: string;
  autopost: boolean;
  active: boolean;
  schedule: string;
  time: string;
  weekday: number;
  monthday: number;
  schedule_label: string;
  due: boolean;
  created_at: string;
  posted_at: string;
  runs?: ScheduleRun[];
};

type DeskState = {
  ok?: boolean;
  error?: string;
  flash?: string;
  gemini?: { ready: boolean };
  facebook?: { app_id: string; page_id: string; page_name: string; connected: boolean; redirect_uri: string };
  page_voice?: string;
  defaults?: { language: string; tone: string; style: string };
  pending_pages?: { id: string; name: string }[];
  cron_url?: string;
  topics?: Topic[];
  topic?: Topic;
  ran?: boolean;
  paused?: boolean;
};

const labels: Record<string, string> = {
  queued: "Queued",
  writing: "Writing",
  ready: "Ready to post",
  posted: "On the page",
  scheduled: "Scheduled",
  failed: "Needs another try",
};

export default function DeskApp({ csrf }: { csrf: string }) {
  const [state, setState] = useState<DeskState | null>(null);
  const [selected, setSelected] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [schedule, setSchedule] = useState("once");
  const [editing, setEditing] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const [openPosts, setOpenPosts] = useState("");
  const [autopilot, setAutopilot] = useState(false);
  const [progress, setProgress] = useState(0);
  const [press, setPress] = useState<{ kind: "write" | "post"; post?: boolean; id?: string } | null>(null);
  const [step, setStep] = useState("caption");
  const shown = useRef("");
  const primed = useRef(false);
  const stateRef = useRef<DeskState | null>(null);
  const busyRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const schedulesRef = useRef<HTMLDivElement>(null);
  const draft = useRef<Topic | null>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const guideRef = useRef<HTMLDialogElement>(null);

  const topic = useMemo(() => state?.topics?.find((item) => item.id === selected) || null, [state, selected]);
  stateRef.current = state;
  busyRef.current = busy;

  async function call(action: string, body?: Record<string, unknown>) {
    const response = await fetch(action === "state" ? "/api/state" : "/api/desk", {
      method: body || action !== "state" ? "POST" : "GET",
      headers: { "Content-Type": "application/json", "X-CSRF": csrf },
      body: action === "state" ? undefined : JSON.stringify({ action, ...body }),
    });
    const data = (await response.json().catch(() => ({ ok: false, error: "The desk returned an unreadable answer." }))) as DeskState;
    if (!response.ok || data.ok === false) {
      if (data.topics) setState(data);
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
    setAutopilot(localStorage.getItem("desk-autopilot") === "1");
    call("state").then(apply).catch((error: Error) => setStatus(error.message));
    // The first load is the only call that should run on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!state || primed.current) return;
    const composer = composerRef.current;
    if (!composer || !state.defaults) return;
    (composer.elements.namedItem("language") as HTMLSelectElement).value = state.defaults.language || "Sinhala";
    (composer.elements.namedItem("tone") as HTMLSelectElement).value = state.defaults.tone || "Friendly";
    (composer.elements.namedItem("style") as HTMLSelectElement).value = state.defaults.style || "Photograph";
    primed.current = true;
  }, [state]);

  useEffect(() => {
    const item = draft.current;
    const form = composerRef.current;
    if (!editing || !item || item.id !== editing || !form) return;
    const set = (name: string, value: string) => {
      const field = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
      if (field) field.value = value;
    };
    set("time", item.time);
    set("weekday", String(item.weekday || 1));
    set("monthday", String(item.monthday || 1));
  }, [editing, schedule]);

  useEffect(() => {
    const form = formRef.current;
    if (!form || !state?.facebook) return;
    const key = [state.facebook.app_id, state.facebook.page_id, state.page_voice].join("|");
    const active = document.activeElement;
    const editing = active instanceof HTMLElement && active.closest("form") === form && (active as HTMLInputElement).type !== "submit";
    if (key !== shown.current && !editing) {
      (form.elements.namedItem("app_id") as HTMLInputElement).value = state.facebook.app_id || "";
      (form.elements.namedItem("page_id") as HTMLInputElement).value = state.facebook.page_id || "";
      (form.elements.namedItem("page_voice") as HTMLTextAreaElement).value = state.page_voice || "";
      shown.current = key;
    }
  }, [state]);

  useEffect(() => {
    if (!press) return;
    const timer = window.setInterval(async () => {
      let current = topic;
      if (press.kind === "write") {
        try {
          const next = await call("state");
          setState(next);
          current = next.topics?.find((item) => item.id === press.id) || next.topics?.find((item) => item.status === "writing") || null;
        } catch {
          current = null;
        }
      }
      const floor = press.kind === "post" ? 64 : current?.caption && current.image_url ? (press.post === false ? 78 : 72) : current?.caption ? 40 : 8;
      const cap = press.kind === "post" ? 92 : current?.caption && current.image_url ? 92 : current?.caption ? 68 : 36;
      const nextStep = press.kind === "post" ? "page" : current?.caption && current.image_url ? (press.post === false ? "picture" : "page") : current?.caption ? "picture" : "caption";
      setStep(nextStep);
      setProgress((value) => Math.min(cap, Math.max(value, floor) + 2));
      if (nextStep === "page") setStatus("Posting to the page.");
      else if (nextStep === "picture" && current?.image_url) setStatus("The picture is ready.");
      else if (nextStep === "picture") setStatus("Making the picture.");
      else setStatus("Writing the caption.");
    }, 700);
    return () => window.clearInterval(timer);
  }, [press]);

  async function withBusy(message: string, job: () => Promise<unknown>, mode: { kind: "write" | "post"; post?: boolean; id?: string } | null = null) {
    setBusy(true);
    setStatus(message);
    if (mode) {
      setPress(mode);
      setProgress(mode.kind === "post" ? 64 : 8);
      setStep(mode.kind === "post" ? "page" : "caption");
    }
    let ok = false;
    try {
      const result = await job();
      ok = result !== false;
      return result;
    } finally {
      if (ok && mode) setProgress(100);
      window.setTimeout(() => {
        setPress(null);
        setProgress(0);
      }, ok && mode ? 500 : 0);
      setBusy(false);
    }
  }

  async function onConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>;
    const pasted = (data.page_token || "").trim();
    await withBusy("Saving the app…", async () => {
      try {
        const next = await call("save_connection", data);
        apply(next);
        event.currentTarget.reset();
        shown.current = "";
        if (next.facebook?.connected) {
          setStatus("Page connected.");
          return;
        }
        if (!pasted) {
          setStatus("App details saved. Opening Facebook so you can choose the page.");
          window.location.href = "/api/facebook/start";
          return;
        }
        setStatus("The app details are saved. Add a Page token to finish connecting.");
      } catch (error) {
        const desk = error as Error & { state?: DeskState };
        if (desk.state) apply(desk.state);
        setStatus(desk.message);
      }
    });
  }

  async function onComposer(event: FormEvent<HTMLFormElement>, postNow: boolean) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    const repeating = data.schedule !== "once";
    const editingId = editing;
    await withBusy(
      editingId ? "Saving the schedule." : repeating ? "Saving the schedule." : postNow ? "Writing the caption and the picture, then posting. This usually takes about half a minute." : "Adding it to the queue.",
      async () => {
        try {
          if (editingId) {
            const next = await call("topic_update", { id: editingId, ...data });
            apply(next);
            if (next.topic) setSelected(next.topic.id);
            draft.current = null;
            setEditing("");
            form.reset();
            setSchedule("once");
            setStatus(data.schedule === "once" ? "Saved in the queue." : "Schedule updated.");
            schedulesRef.current?.scrollIntoView({ block: "nearest" });
            return;
          }
          const next = await call("topic_add", {
            ...data,
            autopost: !repeating && (form.elements.namedItem("autopost") as HTMLInputElement).checked,
            post_now: postNow && !repeating,
          });
          apply(next);
          if (next.topic) setSelected(next.topic.id);
          form.reset();
          setSchedule("once");
          setStatus(repeating ? "Schedule saved. It is in the list below." : postNow ? "Posted." : "Added to the queue.");
          if (repeating) schedulesRef.current?.scrollIntoView({ block: "nearest" });
        } catch (error) {
          const desk = error as Error & { state?: DeskState };
          if (desk.state?.topics) {
            apply(desk.state);
            if (desk.state.topics[0]) setSelected(desk.state.topics[0].id);
          }
          setStatus(desk.message);
          return false;
        }
      },
      postNow && !repeating ? { kind: "write", post: true } : null
    );
  }

  useEffect(() => {
    const pump = window.setInterval(async () => {
      const live = stateRef.current;
      if (!autopilot || busyRef.current || !live) return;
      const queued = live.topics?.find((item) => item.autopost && ["queued", "ready", "failed"].includes(item.status));
      if (!queued) return;
      await withBusy("Posting the next topic in the queue…", async () => {
        try {
          const next = await call("run_next", {});
          apply(next);
          if (next.topic) setSelected(next.topic.id);
          setStatus(next.ran ? "Queue moved forward." : "Nothing is waiting.");
        } catch (error) {
          const desk = error as Error & { state?: DeskState };
          if (desk.state) apply(desk.state);
          setStatus(desk.message);
          return false;
        }
      }, queued.caption && queued.image_url ? { kind: "post", id: queued.id } : { kind: "write", post: true, id: queued.id });
    }, 15000);
    const clock = window.setInterval(async () => {
      const live = stateRef.current;
      if (busyRef.current || !live) return;
      const due = live.topics?.find((item) => item.due);
      if (!due) return;
      await withBusy("A scheduled topic is due. Writing a new caption and picture, then posting as the page.", async () => {
        try {
          const next = await call("run_due", {});
          apply(next);
          if (next.topic) setSelected(next.topic.id);
          setStatus(next.ran ? "The scheduled post went out as the page." : next.paused ? "That schedule is paused." : "Nothing is due.");
        } catch (error) {
          const desk = error as Error & { state?: DeskState };
          if (desk.state) apply(desk.state);
          setStatus(desk.message);
          return false;
        }
      }, { kind: "write", post: true, id: due.id });
    }, 30000);
    return () => {
      window.clearInterval(pump);
      window.clearInterval(clock);
    };
  }, [autopilot]);

  const page = state?.facebook;
  const repeating = schedule !== "once";
  const topics = state?.topics || [];
  const schedules = topics.filter((item) => item.schedule !== "once");
  const queue = topics.filter((item) => item.schedule === "once");

  function when(iso: string) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Colombo",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date);
  }

  function runLabel(run: ScheduleRun) {
    if (run.status === "posted" || run.fb_url) return "On the page";
    if (run.status === "failed") return "Did not post";
    if (run.status === "ready") return "Ready, not posted";
    return "Writing";
  }

  function startEdit(item: Topic) {
    draft.current = item;
    setConfirmId("");
    setEditing(item.id);
    setSchedule(item.schedule);
    setSelected(item.id);
    const form = composerRef.current;
    if (form) {
      (form.elements.namedItem("title") as HTMLInputElement).value = item.title;
      (form.elements.namedItem("about") as HTMLTextAreaElement).value = item.about;
      (form.elements.namedItem("language") as HTMLSelectElement).value = item.language;
      (form.elements.namedItem("tone") as HTMLSelectElement).value = item.tone;
      (form.elements.namedItem("style") as HTMLSelectElement).value = item.style;
    }
    form?.scrollIntoView({ block: "nearest" });
  }

  function cancelEdit() {
    draft.current = null;
    setEditing("");
    composerRef.current?.reset();
    setSchedule("once");
  }

  async function setActive(item: Topic, active: boolean) {
    setConfirmId("");
    await withBusy(active ? "Activating the schedule." : "Pausing the schedule.", async () => {
      try {
        const next = await call("topic_active", { id: item.id, active });
        apply(next);
        setStatus(active
          ? "Active again. It posts at the next upcoming time. A time that passed while it was paused stays skipped."
          : "Paused. This schedule will not generate posts until you activate it.");
      } catch (error) {
        const desk = error as Error & { state?: DeskState };
        if (desk.state) apply(desk.state);
        setStatus(desk.message);
        return false;
      }
    });
  }

  async function removeSchedule(item: Topic) {
    if (confirmId !== item.id) {
      setConfirmId(item.id);
      return;
    }
    setConfirmId("");
    await withBusy("Removing the schedule.", async () => {
      try {
        apply(await call("topic_delete", { id: item.id }));
        if (selected === item.id) setSelected("");
        if (editing === item.id) cancelEdit();
        setStatus("Schedule deleted.");
      } catch (error) {
        const desk = error as Error & { state?: DeskState };
        if (desk.state) apply(desk.state);
        setStatus(desk.message);
        return false;
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

  return (
    <main className="desk">
      {press ? (
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
          <span style={{ width: `${progress}%` }} />
          <p>{step === "page" ? "Page" : step === "picture" ? "Picture" : "Caption"}</p>
        </div>
      ) : null}
      <section className="column">
        <article className="panel">
          <div className="panel-head">
            <div className="title-row">
              <h2>Page</h2>
              <button className="help" type="button" aria-label="How to get the App ID and App secret" onClick={() => guideRef.current?.showModal()}>?</button>
            </div>
            <span className={page?.connected ? "pill on" : "pill"}>{page?.connected ? "Connected" : "Not connected"}</span>
          </div>
          <p className="quiet">
            {page?.connected
              ? `Posts go out as the page ${page.page_name}, not on the personal profile. Disconnect, then connect again, to choose a different page.`
              : "Connect a Facebook page. Posts go out as that page, not on the personal profile."}
          </p>
          {state?.pending_pages?.length ? (
            <div className="picks">
              {state.pending_pages.map((item) => (
                <button key={item.id} className="btn ghost" type="button" disabled={busy} onClick={() => withBusy("Connecting the page…", async () => {
                  apply(await call("fb_pick", { page_id: item.id }));
                  setStatus("Page connected.");
                })}>Use {item.name}</button>
              ))}
            </div>
          ) : null}
          <form ref={formRef} onSubmit={onConnection}>
            <label>Meta app ID <input name="app_id" inputMode="numeric" autoComplete="off" /></label>
            <label>App secret <input name="app_secret" type="password" autoComplete="new-password" placeholder="Leave blank to keep the saved secret" /></label>
            <button className="btn solid" disabled={busy}>Save and connect</button>
            <p className="quiet">Saving the app details does not link the page. This opens Facebook so you can choose it.</p>
            <p className="or">or paste a Page token</p>
            <label>Page ID <input name="page_id" inputMode="numeric" autoComplete="off" /></label>
            <label>Page access token <input name="page_token" type="password" autoComplete="new-password" placeholder="Leave blank to keep the saved token" /></label>
            <label>How the page should sound <textarea name="page_voice" rows={3} placeholder="A calm Sinhala page about home cooking. Short sentences. No hard sell." /></label>
            <div className="row">
              <a className="btn ghost" href="/api/facebook/start">Connect with Facebook</a>
              {page?.connected ? <button className="text-btn" type="button" disabled={busy} onClick={() => withBusy("Disconnecting…", async () => { apply(await call("disconnect", {})); setStatus("Page disconnected."); })}>Disconnect this page</button> : null}
            </div>
          </form>
        </article>
        <article className="panel">
          <div className="panel-head"><h2>Queue</h2><span className="pill quiet-pill">{queue.length}</span></div>
          {queue.length ? (
            <ul className="queue">
              {queue.map((item) => (
                <li key={item.id}>
                  <button className={item.id === selected ? "ticket on" : "ticket"} type="button" onClick={() => setSelected(item.id)}>
                    {item.image_url ? <img src={item.image_url} alt="" /> : <span className="blank" />}
                    <span><strong>{item.title}</strong><small>{labels[item.status] || item.status}</small></span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="quiet">{schedules.length ? "One-off posts show up here. Repeating schedules are listed with the form." : "The queue is empty."}</p>}
          <label className="check"><input type="checkbox" checked={autopilot} onChange={(event) => { setAutopilot(event.target.checked); localStorage.setItem("desk-autopilot", event.target.checked ? "1" : "0"); setStatus(event.target.checked ? "The queue will keep posting while this desk is open." : "The queue will wait."); }} /> Keep posting the queue while this desk is open</label>
          <details>
            <summary>If this computer is switched off</summary>
            <p className="quiet">A daily, weekly, or monthly topic posts by itself at the time you set, as long as smtools is running. If the computer is off at that time, it posts after smtools is running again. This address can also be called from another machine.</p>
            <button className="link" type="button" onClick={() => copy(state?.cron_url || "", "Address copied.")}>{state?.cron_url}</button>
          </details>
        </article>
      </section>
      <section className="stage">
        <article className="panel composer">
        <form ref={composerRef} onSubmit={(event) => onComposer(event, (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "post")}>
          <p className="eyebrow">{editing ? "Edit schedule" : "New topic"}</p>
          <h2>{editing ? "Change this schedule" : "Title and what it is about"}</h2>
          <label>Title <input name="title" required maxLength={160} placeholder="Sunday coconut roti" /></label>
          <label>Description <textarea name="about" required rows={4} maxLength={2000} placeholder="A short post about the Sunday batch: griddle, coconut, and the first one off the pan." /></label>
          <div className="splits">
            <label>Language <select name="language"><option>Sinhala</option><option>English</option><option>Tamil</option><option>Singlish</option></select></label>
            <label>Tone <select name="tone"><option>Friendly</option><option>Warm</option><option>Plain</option><option>Professional</option><option>Bold</option></select></label>
            <label>Picture <select name="style"><option>Photograph</option><option>Illustration</option><option>Flat colour poster</option><option>Product photo</option><option>Cinematic</option></select></label>
          </div>
          <div className="splits">
            <label>Repeat
              <select name="schedule" value={schedule} onChange={(event) => setSchedule(event.target.value)}>
                <option value="once">Once</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            {repeating ? <label>Time <input name="time" type="time" required /></label> : null}
            {schedule === "weekly" ? <label>Day <select name="weekday"><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option><option value="7">Sunday</option></select></label> : null}
            {schedule === "monthly" ? <label>Day of the month <input name="monthday" type="number" min={1} max={28} defaultValue={1} required /></label> : null}
          </div>
          {repeating ? <p className="quiet">Sri Lanka time. When that time arrives, a new caption and picture are posted as the page. It repeats by itself, even if this tab is closed. Pause stops new posts. Activate again and the next post is the upcoming time. A time that already passed while paused is skipped.</p> : null}
          {!repeating && !editing ? <label className="check"><input name="autopost" type="checkbox" defaultChecked /> Include it when the queue runs</label> : null}
          <p className="quiet">{page?.connected ? `This publishes as the page ${page.page_name}, not on the personal profile.` : "Connect a page first. The personal profile is not used."}</p>
          <div className="row">
            <button className="btn solid" name="intent" value="post" disabled={busy}>{editing ? "Save changes" : repeating ? "Save schedule" : "Write and post"}</button>
            {editing ? <button className="btn ghost" type="button" disabled={busy} onClick={cancelEdit}>Cancel</button> : null}
            {!editing && !repeating ? <button className="btn ghost" name="intent" value="queue" disabled={busy}>Add to the queue</button> : null}
          </div>
        </form>
        <div className="schedules" ref={schedulesRef}>
          <div className="panel-head">
            <h3>Schedules</h3>
            <span className="pill quiet-pill">{schedules.length}</span>
          </div>
          {schedules.length ? (
            <ul className="queue">
              {schedules.map((item) => (
                <li key={item.id} className={item.id === selected ? "schedule on" : "schedule"}>
                  <button className="schedule-main" type="button" onClick={() => setSelected(item.id)}>
                    <span className="schedule-title">
                      <strong>{item.title}</strong>
                      <span className={item.active ? "pill on" : "pill pause"}>{item.active ? "Active" : "Paused"}</span>
                    </span>
                    <small>{item.active ? (item.due ? "Due now" : item.schedule_label) : `Paused · ${item.schedule_label}`}{item.runs?.length ? (item.runs[0].fb_url ? " · Last post is on the page" : " · Not on the page yet") : ""}</small>
                  </button>
                  {item.error ? <p className="error">{item.error}</p> : null}
                  <div className="schedule-actions">
                    <button className="btn ghost" type="button" disabled={busy} onClick={() => startEdit(item)}>Edit</button>
                    <button className="btn ghost" type="button" disabled={busy} onClick={() => setActive(item, !item.active)}>{item.active ? "Pause" : "Activate"}</button>
                    <button className="btn ghost" type="button" onClick={() => setOpenPosts(openPosts === item.id ? "" : item.id)}>{openPosts === item.id ? "Hide posts" : `See posts${item.runs?.length ? ` (${item.runs.length})` : ""}`}</button>
                    <button className="btn end" type="button" disabled={busy} onClick={() => removeSchedule(item)}>{confirmId === item.id ? "Confirm delete" : "Delete"}</button>
                  </div>
                  {openPosts === item.id ? (
                    <div className="run-list">
                      {item.runs?.length ? item.runs.map((run) => (
                        <article key={run.id} className="run">
                          {run.image_url ? <img src={run.image_url} alt="" /> : <span className="blank" />}
                          <div>
                            <strong>{runLabel(run)}</strong>
                            <small>{when(run.posted_at || run.created_at)}</small>
                            <p>{run.caption || "The caption is not ready yet."}</p>
                            {run.error ? <p className="error">{run.error}</p> : null}
                            {run.fb_url ? <a href={run.fb_url} target="_blank" rel="noreferrer">Open on Facebook</a> : null}
                          </div>
                        </article>
                      )) : <p className="quiet">No post from this schedule yet. The first one appears here after the scheduled time.</p>}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : <p className="quiet">Save a daily, weekly, or monthly topic and it shows up here.</p>}
        </div>
        </article>
        <article className="panel preview">
          <p className="eyebrow">Proof</p>
          {topic ? (
            <>
              {topic.image_url ? <img className="preview-image" src={topic.image_url} alt={`Picture for ${topic.title}`} /> : <div className="preview-empty">The picture lands here.</div>}
              <h2>{topic.title}</h2>
              <p className="quiet">{topic.language} · {topic.tone} · {topic.style}{topic.schedule !== "once" ? ` · ${topic.schedule_label}` : ""}</p>
              {topic.error ? <p className="error">{topic.error}</p> : null}
              <label>Caption <textarea ref={captionRef} defaultValue={topic.caption} key={topic.id + topic.caption} readOnly={topic.status === "posted" && topic.schedule === "once"} rows={8} /></label>
              <div className="row">
                {!(topic.status === "posted" && topic.schedule === "once") ? <button className="btn ghost" type="button" disabled={busy} onClick={() => withBusy("Saving the caption…", async () => { apply(await call("topic_caption", { id: topic.id, caption: captionRef.current?.value || "" })); setStatus("Caption saved."); })}>Save caption</button> : null}
                {!(topic.status === "posted" && topic.schedule === "once") ? <button className="btn ghost" type="button" disabled={busy} onClick={() => withBusy("Writing the caption and the picture. This usually takes about half a minute.", async () => { try { apply(await call("generate", { id: topic.id, post: false })); setStatus("The post is ready."); } catch (error) { const desk = error as Error & { state?: DeskState }; if (desk.state) apply(desk.state); setStatus(desk.message); return false; } }, { kind: "write", post: false, id: topic.id })}>{topic.caption ? "Write again" : "Write the post"}</button> : null}
                {!(topic.status === "posted" && topic.schedule === "once") ? <button className="btn solid" type="button" disabled={busy} onClick={() => {
                  const typed = captionRef.current?.value.trim() || "";
                  const needsWrite = !(topic.image_url && (topic.caption || typed));
                  withBusy("Posting to the page…", async () => {
                    try {
                      if (typed) await call("topic_caption", { id: topic.id, caption: typed });
                      if (topic.image_url && (topic.caption || typed)) apply(await call("publish", { id: topic.id }));
                      else apply(await call("generate", { id: topic.id, post: true }));
                      setStatus("Posted.");
                    } catch (error) {
                      const desk = error as Error & { state?: DeskState };
                      if (desk.state) apply(desk.state);
                      setStatus(desk.message);
                      return false;
                    }
                  }, needsWrite ? { kind: "write", post: true, id: topic.id } : { kind: "post", id: topic.id });
                }}>Post to the page</button> : null}
                {topic.fb_url ? <a className="btn ghost" href={topic.fb_url} target="_blank" rel="noreferrer">{topic.status === "posted" ? "Open on Facebook" : "Last post on Facebook"}</a> : null}
                <button className="text-btn" type="button" disabled={busy} onClick={() => withBusy("Removing…", async () => { apply(await call("topic_delete", { id: topic.id })); setSelected(""); setStatus("Removed."); })}>Remove</button>
              </div>
            </>
          ) : (
            <>
              <h2>The post will land here.</h2>
              <p className="quiet">Write a title, or choose one from the queue.</p>
            </>
          )}
        </article>
      </section>
      {status ? <p className="status" role="status">{status}</p> : null}
      <dialog className="guide" ref={guideRef} onClick={(event) => { if (event.target === guideRef.current) guideRef.current?.close(); }}>
        <div className="guide-bar">
          <div><p className="eyebrow">First time</p><h2>Get the two codes from Meta</h2></div>
          <button className="btn ghost" type="button" onClick={() => guideRef.current?.close()}>Close</button>
        </div>
        <div className="guide-body">
          <p>Facebook needs an App ID and an App secret before this desk can use your page. Meta gives you both. It takes a few minutes.</p>
          <a className="btn solid" href="https://developers.facebook.com/async/registration" target="_blank" rel="noreferrer">Create the app on Meta</a>
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
    </main>
  );
}
