"use client";

import Link from "next/link";
import { FormEvent, MouseEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChipSelect } from "@/components/ChipSelect";
import { ACTION_COSTS, creditLabel } from "@/shared/creditCosts";

type PostLink = { id: string; name: string; url: string };

type ScheduleRun = {
  id: string;
  caption: string;
  status: string;
  error: string;
  fb_url: string;
  fb_posts?: PostLink[];
  li_posts?: PostLink[];
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
  quality: string;
  ratio: string;
  status: string;
  caption: string;
  image_url: string;
  error: string;
  fb_url: string;
  fb_posts?: PostLink[];
  li_url?: string;
  li_posts?: PostLink[];
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

function facebookLinks(item: { fb_url?: string; fb_posts?: PostLink[] }): PostLink[] {
  if (item.fb_posts?.length) return item.fb_posts.filter((link) => link.url);
  if (item.fb_url) return [{ id: "", name: "", url: item.fb_url }];
  return [];
}

function linkedInLinks(item: { li_url?: string; li_posts?: PostLink[] }): PostLink[] {
  if (item.li_posts?.length) return item.li_posts.filter((link) => link.url);
  if (item.li_url) return [{ id: "", name: "", url: item.li_url }];
  return [];
}

function openLinkLabel(network: "Facebook" | "LinkedIn", links: PostLink[], link: PostLink) {
  if (links.length <= 1 || !link.name) return `Open on ${network}`;
  return `Open on ${network} · ${link.name}`;
}

type TargetPage = { id: string; name: string; active: boolean; picture?: string };

type DeskState = {
  ok?: boolean;
  error?: string;
  flash?: string;
  gemini?: { ready: boolean };
  facebook?: {
    app_id: string;
    page_id: string;
    page_name: string;
    connected: boolean;
    pages?: TargetPage[];
    redirect_uri: string;
  };
  linkedin?: {
    client_id: string;
    org_id: string;
    org_name: string;
    connected: boolean;
    orgs?: TargetPage[];
  };
  targets?: { facebook: boolean; linkedin: boolean; fb_page_ids?: string[]; li_org_ids?: string[] };
  page_voice?: string;
  defaults?: { language: string; tone: string; style: string; quality: string; ratio: string };
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
  const [toast, setToast] = useState({ text: "", open: false });
  const [busy, setBusy] = useState(false);
  const [schedule, setSchedule] = useState("once");
  const [editing, setEditing] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const [openPosts, setOpenPosts] = useState("");
  const [autopilot, setAutopilot] = useState(false);
  const [deskView, setDeskView] = useState<"compose" | "queue">("compose");
  const [peekId, setPeekId] = useState("");
  const [peekEdit, setPeekEdit] = useState(false);
  const [captionNote, setCaptionNote] = useState("");
  const [imageNote, setImageNote] = useState("");
  const [imageTick, setImageTick] = useState(0);
  const [targets, setTargets] = useState<{ facebook: boolean; linkedin: boolean; fb_page_ids: string[]; li_org_ids: string[] }>({
    facebook: true,
    linkedin: true,
    fb_page_ids: [],
    li_org_ids: [],
  });
  const [openNet, setOpenNet] = useState<"facebook" | "linkedin" | null>(null);
  const netMenuRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [press, setPress] = useState<{ kind: "write" | "post"; post?: boolean; id?: string } | null>(null);
  const [step, setStep] = useState("caption");
  const [titleLen, setTitleLen] = useState(0);
  const [aboutLen, setAboutLen] = useState(0);
  const primed = useRef(false);
  const peekRef = useRef<HTMLDialogElement>(null);
  const stateRef = useRef<DeskState | null>(null);
  const busyRef = useRef(false);
  const composerRef = useRef<HTMLFormElement>(null);
  const schedulesRef = useRef<HTMLDivElement>(null);
  const draft = useRef<Topic | null>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const toastHide = useRef(0);
  const toastClear = useRef(0);

  const topic = useMemo(() => state?.topics?.find((item) => item.id === selected) || null, [state, selected]);
  const peek = useMemo(() => state?.topics?.find((item) => item.id === peekId) || null, [state, peekId]);
  const peekIndex = useMemo(() => (state?.topics || []).findIndex((item) => item.id === peekId), [state, peekId]);
  const peekPrev = peekIndex > 0 ? state?.topics?.[peekIndex - 1] || null : null;
  const peekNext = peekIndex >= 0 && state?.topics ? state.topics[peekIndex + 1] || null : null;
  stateRef.current = state;
  busyRef.current = busy;

  useEffect(() => {
    if (peekId && !peek) {
      setPeekId("");
      setPeekEdit(false);
      setCaptionNote("");
      setImageNote("");
    }
  }, [peekId, peek]);

  useLayoutEffect(() => {
    document.querySelectorAll("dialog.queue-peek").forEach((node) => {
      const sheet = node as HTMLDialogElement;
      if (sheet.open) sheet.close();
    });
  }, []);

  useEffect(() => {
    const sheet = peekRef.current;
    if (!sheet) return;
    if (peek) {
      if (!sheet.open) sheet.showModal();
      return;
    }
    if (sheet.open) sheet.close();
  }, [peek]);

  useEffect(() => {
    if (!peek) return;
    function onKey(event: KeyboardEvent) {
      if (busyRef.current) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable)) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepPeek(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        stepPeek(1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [peek, peekId]);

  useEffect(() => {
    if (!openNet) return;
    function onPointer(event: Event) {
      if (!netMenuRef.current?.contains(event.target as Node)) setOpenNet(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenNet(null);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [openNet]);

  function closePeek() {
    setPeekId("");
    setPeekEdit(false);
    setCaptionNote("");
    setImageNote("");
  }

  function openPeek(id: string, edit = false) {
    setSelected(id);
    setPeekEdit(edit);
    setCaptionNote("");
    setImageNote("");
    setImageTick((tick) => tick + 1);
    setPeekId(id);
  }

  async function downloadTopicImage(item: Topic) {
    if (!item.image_url) return;
    await withBusy("Downloading the picture…", async () => {
      try {
        const response = await fetch(item.image_url);
        if (!response.ok) throw new Error("The picture could not be downloaded.");
        const blob = await response.blob();
        const type = blob.type || "image/png";
        const ext = type.includes("jpeg") || type.includes("jpg") ? "jpg" : type.includes("webp") ? "webp" : "png";
        const safe = (item.title || "post").replace(/[^\w\-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "post";
        const href = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = href;
        link.download = `${safe}.${ext}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(href);
        setStatus("Picture downloaded.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "The picture could not be downloaded.");
        return false;
      }
    });
  }

  function postTopic(item: Topic) {
    const needsWrite = !(item.image_url && item.caption);
    withBusy("Posting to the page…", async () => {
      try {
        if (item.image_url && item.caption) apply(await call("publish", { id: item.id }));
        else apply(await call("generate", { id: item.id, post: true }));
        setStatus("Posted.");
      } catch (error) {
        const desk = error as Error & { state?: DeskState };
        if (desk.state) apply(desk.state);
        setStatus(desk.message);
        return false;
      }
    }, needsWrite ? { kind: "write", post: true, id: item.id } : { kind: "post", id: item.id });
  }

  function writeTopic(item: Topic) {
    withBusy("Writing the caption and the picture. This usually takes about half a minute.", async () => {
      try {
        apply(await call("generate", { id: item.id, post: false }));
        setStatus("The post is ready.");
      } catch (error) {
        const desk = error as Error & { state?: DeskState };
        if (desk.state) apply(desk.state);
        setStatus(desk.message);
        return false;
      }
    }, { kind: "write", post: false, id: item.id });
  }

  function removeTopic(item: Topic) {
    withBusy("Removing…", async () => {
      apply(await call("topic_delete", { id: item.id }));
      if (selected === item.id) setSelected("");
      if (peekId === item.id) closePeek();
      setStatus("Removed.");
    });
  }

  function stepPeek(direction: -1 | 1) {
    const list = stateRef.current?.topics || [];
    const index = list.findIndex((item) => item.id === peekId);
    if (index < 0) return;
    const next = list[index + direction];
    if (!next) return;
    openPeek(next.id);
  }

  function setStatus(message: string) {
    window.clearTimeout(toastHide.current);
    window.clearTimeout(toastClear.current);
    if (!message) {
      setToast({ text: "", open: false });
      return;
    }
    setToast({ text: message, open: true });
    toastHide.current = window.setTimeout(() => {
      setToast((current) => ({ ...current, open: false }));
      toastClear.current = window.setTimeout(() => setToast({ text: "", open: false }), 380);
    }, 2000);
  }

  useEffect(() => () => {
    window.clearTimeout(toastHide.current);
    window.clearTimeout(toastClear.current);
  }, []);

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
    if (next.targets) {
      setTargets({
        facebook: next.targets.facebook !== false,
        linkedin: next.targets.linkedin !== false,
        fb_page_ids: next.targets.fb_page_ids || next.facebook?.pages?.filter((page) => page.active).map((page) => page.id) || [],
        li_org_ids: next.targets.li_org_ids || next.linkedin?.orgs?.filter((org) => org.active).map((org) => org.id) || [],
      });
    }
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
    (composer.elements.namedItem("quality") as HTMLSelectElement).value = state.defaults.quality || "1K";
    (composer.elements.namedItem("ratio") as HTMLSelectElement).value = state.defaults.ratio || "1:1";
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

  async function onComposer(event: FormEvent<HTMLFormElement>, postNow: boolean) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    const repeating = data.schedule !== "once";
    const editingId = editing;
    await withBusy(
      editingId
        ? "Saving the schedule."
        : repeating
          ? "Saving the schedule."
          : postNow
            ? "Writing the caption and the picture, then posting. This usually takes about half a minute."
            : "Writing the caption and the picture for the queue. This usually takes about half a minute.",
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
            setTitleLen(0);
            setAboutLen(0);
            setStatus(data.schedule === "once" ? "Saved in the queue." : "Schedule updated.");
            schedulesRef.current?.scrollIntoView({ block: "nearest" });
            return;
          }
          const next = await call("topic_add", {
            ...data,
            autopost: !repeating && postNow,
            post_now: postNow && !repeating,
          });
          apply(next);
          if (next.topic) setSelected(next.topic.id);
          form.reset();
          setSchedule("once");
          setTitleLen(0);
          setAboutLen(0);
          setStatus(
            repeating
              ? "Schedule saved. It is in the list below."
              : postNow
                ? "Posted."
                : "Ready in the queue. Check the post below, then click Post to the page."
          );
          if (!repeating && !postNow) setDeskView("queue");
          if (repeating) schedulesRef.current?.scrollIntoView({ block: "nearest" });
        } catch (error) {
          const desk = error as Error & { state?: DeskState };
          if (desk.state?.topics) {
            apply(desk.state);
            if (desk.state.topic) setSelected(desk.state.topic.id);
            else if (desk.state.topics[0]) setSelected(desk.state.topics[0].id);
          }
          setStatus(desk.message);
          return false;
        }
      },
      !editingId && !repeating ? { kind: "write", post: postNow } : null
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
    }, 60000);
    return () => {
      window.clearInterval(pump);
      window.clearInterval(clock);
    };
  }, [autopilot]);

  const page = state?.facebook;
  const linked = state?.linkedin;
  const fbPages = page?.pages?.length
    ? page.pages
    : page?.connected && page.page_id
      ? [{ id: page.page_id, name: page.page_name || "Facebook page", active: targets.facebook }]
      : [];
  const liOrgs = linked?.orgs?.length
    ? linked.orgs
    : linked?.connected && linked.org_id
      ? [{ id: linked.org_id, name: linked.org_name || "LinkedIn", active: targets.linkedin }]
      : [];
  const pageReady = fbPages.length > 0 || liOrgs.length > 0;
  const activeLabels = [
    ...fbPages.filter((item) => targets.fb_page_ids.includes(item.id)).map((item) => item.name),
    ...liOrgs.filter((item) => targets.li_org_ids.includes(item.id)).map((item) => item.name),
  ];
  const pageLabel = activeLabels.length
    ? activeLabels.length === 1
      ? activeLabels[0]
      : `${activeLabels.length} pages`
    : pageReady
      ? "No page selected"
      : "";
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
      (form.elements.namedItem("quality") as HTMLSelectElement).value = item.quality || "1K";
      (form.elements.namedItem("ratio") as HTMLSelectElement).value = item.ratio || "1:1";
      setTitleLen(item.title.length);
      setAboutLen(item.about.length);
    }
    form?.scrollIntoView({ block: "nearest" });
  }

  function cancelEdit() {
    draft.current = null;
    setEditing("");
    composerRef.current?.reset();
    setSchedule("once");
    setTitleLen(0);
    setAboutLen(0);
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

  async function savePageTargets(next: { facebook: boolean; linkedin: boolean; fb_page_ids: string[]; li_org_ids: string[] }) {
    setTargets(next);
    await withBusy("Saving where posts go…", async () => {
      try {
        apply(await call("save_targets", next));
        const count = next.fb_page_ids.length + next.li_org_ids.length;
        if (count > 1) setStatus(`Posts go to ${count} selected pages.`);
        else if (count === 1) setStatus("Posts go to the selected page.");
        else setStatus("No connected page is turned on for posting.");
      } catch (error) {
        const desk = error as Error & { state?: DeskState };
        if (desk.state) apply(desk.state);
        setStatus(desk.message);
        return false;
      }
    });
  }

  async function toggleFbPage(pageId: string, on: boolean) {
    const fb_page_ids = on
      ? Array.from(new Set([...targets.fb_page_ids, pageId]))
      : targets.fb_page_ids.filter((id) => id !== pageId);
    await savePageTargets({
      ...targets,
      facebook: fb_page_ids.length > 0,
      fb_page_ids,
    });
  }

  async function toggleLiOrg(orgId: string, on: boolean) {
    const li_org_ids = on
      ? Array.from(new Set([...targets.li_org_ids, orgId]))
      : targets.li_org_ids.filter((id) => id !== orgId);
    await savePageTargets({
      ...targets,
      linkedin: li_org_ids.length > 0,
      li_org_ids,
    });
  }

  /** Main network control never turns itself on — only expands, or clears all page toggles. */
  async function onNetworkMain(network: "facebook" | "linkedin") {
    const hasPages = network === "facebook" ? fbPages.length > 0 : liOrgs.length > 0;
    if (!hasPages || busy) return;
    const activeIds = network === "facebook" ? targets.fb_page_ids : targets.li_org_ids;
    if (activeIds.length > 0) {
      if (network === "facebook") {
        await savePageTargets({ ...targets, facebook: false, fb_page_ids: [] });
      } else {
        await savePageTargets({ ...targets, linkedin: false, li_org_ids: [] });
      }
      setOpenNet(null);
      return;
    }
    setOpenNet((prev) => (prev === network ? null : network));
  }

  function toggleNetworkMenu(network: "facebook" | "linkedin", event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const hasPages = network === "facebook" ? fbPages.length > 0 : liOrgs.length > 0;
    if (!hasPages) return;
    setOpenNet((prev) => (prev === network ? null : network));
  }

  const fbOn = targets.fb_page_ids.length > 0;
  const liOn = targets.li_org_ids.length > 0;

  const pageStrip = (
    <div className="page-strip page-strip-head">
      <div className="page-strip-copy">
        <span className="page-strip-label">Pages</span>
        <span className={pageReady && activeLabels.length ? "page-chip on" : "page-chip"}>
          {pageReady ? (pageLabel || "Connected") : "Not connected"}
        </span>
      </div>
      <div className="network-targets" role="group" aria-label="Where to post" ref={netMenuRef}>
        <div className={["network-menu", fbPages.length ? "ready" : "idle", fbOn ? "on" : "", openNet === "facebook" ? "open" : ""].filter(Boolean).join(" ")}>
          <button
            type="button"
            className={["network-target", fbPages.length ? "ready" : "idle", fbOn ? "on" : ""].filter(Boolean).join(" ")}
            disabled={!fbPages.length || busy}
            aria-expanded={openNet === "facebook"}
            aria-haspopup="listbox"
            title={fbPages.length ? (fbOn ? "Turn off all Facebook pages" : "Choose Facebook pages") : "Connect Facebook first"}
            onClick={() => void onNetworkMain("facebook")}
          >
            <span className="network-target-mark facebook" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M14 8.2h2.4V5H14c-2.5 0-4.2 1.7-4.2 4.3V11H7.5v3.3h2.3V22h3.5v-7.7h2.6L16.5 11h-3.2V9.5c0-.8.3-1.3 1.2-1.3z" /></svg>
            </span>
            <span className="network-target-text">Facebook</span>
            {fbPages.length ? (
              <span
                className="network-chevron"
                role="presentation"
                onClick={(event) => toggleNetworkMenu("facebook", event)}
              >
                <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M7.4 9.6a1 1 0 0 1 1.4 0L12 12.8l3.2-3.2a1 1 0 1 1 1.4 1.4l-3.9 3.9a1 1 0 0 1-1.4 0L7.4 11a1 1 0 0 1 0-1.4z" /></svg>
              </span>
            ) : null}
          </button>
          {openNet === "facebook" && fbPages.length ? (
            <div className="network-menu-list" role="listbox" aria-label="Facebook pages">
              {fbPages.map((item) => {
                const on = targets.fb_page_ids.includes(item.id);
                return (
                  <label key={item.id} className={on ? "network-page-row on" : "network-page-row"}>
                    {item.picture ? (
                      <img className="page-avatar sm" src={item.picture} alt="" width={28} height={28} loading="lazy" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="page-avatar fallback sm" aria-hidden="true">{(item.name || "?").slice(0, 1).toUpperCase()}</span>
                    )}
                    <span className="network-page-name">{item.name}</span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={on}
                      disabled={busy}
                      aria-checked={on}
                      onChange={(event) => void toggleFbPage(item.id, event.target.checked)}
                    />
                    <span className="network-page-switch" aria-hidden="true" />
                  </label>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className={["network-menu", liOrgs.length ? "ready" : "idle", liOn ? "on" : "", openNet === "linkedin" ? "open" : ""].filter(Boolean).join(" ")}>
          <button
            type="button"
            className={["network-target", liOrgs.length ? "ready" : "idle", liOn ? "on" : ""].filter(Boolean).join(" ")}
            disabled={!liOrgs.length || busy}
            aria-expanded={openNet === "linkedin"}
            aria-haspopup="listbox"
            title={liOrgs.length ? (liOn ? "Turn off all LinkedIn companies" : "Choose LinkedIn companies") : "Connect LinkedIn first"}
            onClick={() => void onNetworkMain("linkedin")}
          >
            <span className="network-target-mark linkedin" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M6.3 9.2H3.1V21h3.2V9.2zM4.7 3C3.5 3 2.5 4 2.5 5.2S3.5 7.4 4.7 7.4 6.9 6.4 6.9 5.2 5.9 3 4.7 3zM20.9 21h-3.2v-6.2c0-1.5 0-3.4-2.1-3.4s-2.4 1.6-2.4 3.3V21H10V9.2h3.1v1.6h.1c.4-.8 1.5-1.7 3.1-1.7 3.3 0 3.9 2.2 3.9 5V21z" /></svg>
            </span>
            <span className="network-target-text">LinkedIn</span>
            {liOrgs.length ? (
              <span
                className="network-chevron"
                role="presentation"
                onClick={(event) => toggleNetworkMenu("linkedin", event)}
              >
                <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M7.4 9.6a1 1 0 0 1 1.4 0L12 12.8l3.2-3.2a1 1 0 1 1 1.4 1.4l-3.9 3.9a1 1 0 0 1-1.4 0L7.4 11a1 1 0 0 1 0-1.4z" /></svg>
              </span>
            ) : null}
          </button>
          {openNet === "linkedin" && liOrgs.length ? (
            <div className="network-menu-list" role="listbox" aria-label="LinkedIn companies">
              {liOrgs.map((item) => {
                const on = targets.li_org_ids.includes(item.id);
                return (
                  <label key={item.id} className={on ? "network-page-row on" : "network-page-row"}>
                    <span className="network-page-name">{item.name}</span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={on}
                      disabled={busy}
                      aria-checked={on}
                      onChange={(event) => void toggleLiOrg(item.id, event.target.checked)}
                    />
                    <span className="network-page-switch" aria-hidden="true" />
                  </label>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
      <Link className="btn ghost page-strip-action" href="/desk/connect">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M8.5 13.5a3.5 3.5 0 0 1 0-5l1.8-1.8a1 1 0 1 0-1.4-1.4L7.1 7.1a5.5 5.5 0 0 0 0 7.8l1.8 1.8a1 1 0 1 0 1.4-1.4zm7-3a3.5 3.5 0 0 1 0 5l-1.8 1.8a1 1 0 1 0 1.4 1.4l1.8-1.8a5.5 5.5 0 0 0 0-7.8l-1.8-1.8a1 1 0 1 0-1.4 1.4zM9.7 13.1a1 1 0 0 0 1.4 0l3.2-3.2a1 1 0 1 0-1.4-1.4l-3.2 3.2a1 1 0 0 0 0 1.4z" /></svg>
        {pageReady ? "Manage pages" : "Connect page"}
      </Link>
    </div>
  );

  function renderProgress(extraClass = "") {
    const steps = [
      { id: "caption", label: "Caption" },
      { id: "picture", label: "Picture" },
      { id: "page", label: "Posting" },
    ] as const;
    const activeIndex = step === "page" ? 2 : step === "picture" ? 1 : 0;
    const headline =
      step === "page"
        ? "Sending to your pages"
        : step === "picture"
          ? "Making the picture"
          : "Writing the caption";
    const value = Math.max(0, Math.min(100, Math.round(progress)));
    return (
      <div
        className={["progress", "progress-card", extraClass].filter(Boolean).join(" ")}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-label={headline}
      >
        <div className="progress-top">
          <div className="progress-copy">
            <span className="progress-pulse" aria-hidden="true" />
            <div>
              <strong>{headline}</strong>
              <small>{steps[activeIndex].label} · almost there</small>
            </div>
          </div>
          <span className="progress-pct">{value}%</span>
        </div>
        <div className="progress-track">
          <span className="progress-fill" style={{ width: `${value}%` }}>
            <i aria-hidden="true" />
          </span>
        </div>
        <ol className="progress-steps">
          {steps.map((item, index) => (
            <li
              key={item.id}
              className={index < activeIndex ? "done" : index === activeIndex ? "on" : ""}
            >
              <span className="progress-dot" aria-hidden="true" />
              {item.label}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  const composeTabs = (
    <nav className="compose-tabs" aria-label="Desk tools">
      <button
        className={deskView === "compose" ? "compose-tab on" : "compose-tab"}
        type="button"
        aria-current={deskView === "compose" ? "page" : undefined}
        onClick={() => setDeskView("compose")}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M4 20l4.2-1.1L19 8.1a2.1 2.1 0 0 0 0-3l-.1-.1a2.1 2.1 0 0 0-3 0L5.1 15.8 4 20z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M13.2 6.8l3.9 3.9" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg>
        Compose
      </button>
      <button
        className={deskView === "queue" ? "compose-tab on" : "compose-tab"}
        type="button"
        aria-current={deskView === "queue" ? "page" : undefined}
        onClick={() => setDeskView("queue")}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M12 8v4.2l2.6 1.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
        Queue
        <span className="compose-tab-count">{queue.length}</span>
      </button>
    </nav>
  );

  return (
    <main className="desk desk-solo desk-modern">
      <div className="desk-glow" aria-hidden="true" />
      <header className="desk-head">
        <div className="desk-head-copy">
          <h1>Auto Posting</h1>
          <p>Create and schedule your posts effortlessly.</p>
        </div>
        {pageStrip}
      </header>
      {composeTabs}
      {press ? renderProgress() : null}
      <section className="stage">
        <article className={pageReady ? "panel compose-card connected" : "panel compose-card"}>
          {deskView === "queue" ? (
            <div className="queue-panel">
              <div className="panel-head"><h2>Queue</h2><span className="pill quiet-pill">{queue.length}</span></div>
              {queue.length ? (
                <ul className="queue">
                  {queue.map((item) => (
                    <li key={item.id} className={item.id === peekId || item.id === selected ? "queue-row on" : "queue-row"}>
                      <button
                        className="ticket"
                        type="button"
                        onClick={() => openPeek(item.id)}
                      >
                        {item.image_url ? <img src={item.image_url} alt="" /> : <span className="blank" />}
                        <span><strong>{item.title}</strong><small>{labels[item.status] || item.status}</small></span>
                      </button>
                      <div className="queue-row-actions" role="group" aria-label={`Actions for ${item.title}`}>
                        {item.status !== "posted" ? (
                          <button
                            className="queue-icon-btn"
                            type="button"
                            title="Post to the page"
                            aria-label="Post to the page"
                            disabled={busy}
                            onClick={() => postTopic(item)}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.2 11.4 19.5 4.8a1 1 0 0 1 1.4 1.1L17 19.6a1 1 0 0 1-1.7.4l-3.7-4.4-4.5 2.1a.9.9 0 0 1-1.2-1l1-5.3-2.9-1.2a1 1 0 0 1 .2-1.8Z" fill="currentColor" /></svg>
                          </button>
                        ) : null}
                        {item.status !== "posted" ? (
                          <button
                            className="queue-icon-btn"
                            type="button"
                            title={item.caption ? "Write again" : "Write the post"}
                            aria-label={item.caption ? "Write again" : "Write the post"}
                            disabled={busy}
                            onClick={() => writeTopic(item)}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2v2.1M12 18.7v2.1M4.8 12H2.7M21.3 12h-2.1M6.4 6.4l-1.5-1.5M19.1 19.1l-1.5-1.5M17.6 6.4l1.5-1.5M4.9 19.1l1.5-1.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
                          </button>
                        ) : null}
                        {item.status !== "posted" ? (
                          <button
                            className="queue-icon-btn"
                            type="button"
                            title="Edit"
                            aria-label="Edit"
                            disabled={busy}
                            onClick={() => openPeek(item.id, true)}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4.1-1.1L18.8 8.2a2 2 0 0 0 0-2.8l-.2-.2a2 2 0 0 0-2.8 0L5.1 15.9 4 20z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M13.3 6.9l3.8 3.8" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg>
                          </button>
                        ) : null}
                        {item.image_url ? (
                          <button
                            className="queue-icon-btn"
                            type="button"
                            title="Download image"
                            aria-label="Download image"
                            disabled={busy}
                            onClick={() => downloadTopicImage(item)}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v10.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M8.2 11.4 12 15.2l3.8-3.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M5 19h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                          </button>
                        ) : null}
                        <button
                          className="queue-icon-btn danger"
                          type="button"
                          title="Remove"
                          aria-label="Remove"
                          disabled={busy}
                          onClick={() => removeTopic(item)}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7h8M9.2 7l.5 11.2a1.2 1.2 0 0 0 1.2 1.1h2.2a1.2 1.2 0 0 0 1.2-1.1L15 7M10 7l.4-1.3A1 1 0 0 1 11.4 5h1.2a1 1 0 0 1 1 .7L14 7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="quiet">{schedules.length ? "One-off posts show up here after you add them. Check each one, then post." : "The queue is empty. Add a topic to write a post you can check first."}</p>}
              <label className="check"><input type="checkbox" checked={autopilot} onChange={(event) => { setAutopilot(event.target.checked); localStorage.setItem("desk-autopilot", event.target.checked ? "1" : "0"); setStatus(event.target.checked ? "Marked queue items will post while this desk is open." : "The queue will wait for you to post."); }} /> Keep posting marked queue items while this desk is open</label>
              <details>
                <summary>If this computer is switched off</summary>
                <p className="quiet">A daily, weekly, or monthly topic posts by itself at the time you set, as long as smtools is running. If the computer is off at that time, it posts after smtools is running again. This address can also be called from another machine.</p>
                <button className="link" type="button" onClick={() => copy(state?.cron_url || "", "Address copied.")}>{state?.cron_url}</button>
              </details>
            </div>
          ) : (
            <>
              <form
                ref={composerRef}
                className="compose-form"
                onSubmit={(event) => onComposer(event, (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "post")}
              >
                {editing ? <p className="eyebrow">Edit schedule</p> : null}
                <div className="field-block">
                  <div className="field-top">
                    <span>Title</span>
                    <span className="field-count">{titleLen}/160</span>
                  </div>
                  <input
                    name="title"
                    required
                    maxLength={160}
                    placeholder="Sunday coconut roti"
                    onInput={(event) => setTitleLen(event.currentTarget.value.length)}
                  />
                </div>
                <div className="field-block">
                  <div className="field-top">
                    <span>Description</span>
                    <span className="field-count">{aboutLen}/10000</span>
                  </div>
                  <textarea
                    name="about"
                    required
                    rows={4}
                    maxLength={10000}
                    placeholder={"What the post is about.\n\nOptional — add your own picture brief on a new line:\nImage prompt: Create a neon cyberpunk poster with…"}
                    onInput={(event) => setAboutLen(event.currentTarget.value.length)}
                  />
                  <p className="quiet compose-hint">To control the picture exactly, add a line <strong>Image prompt:</strong> then paste your full visual brief. That brief is used as-is when the picture is made.</p>
                </div>
                <div className="compose-grid compose-grid-top">
                  <ChipSelect
                    name="language"
                    label="Language"
                    defaultValue="Sinhala"
                    options={[
                      { value: "Sinhala", label: "Sinhala" },
                      { value: "English", label: "English" },
                      { value: "Tamil", label: "Tamil" },
                      { value: "Singlish", label: "Singlish" },
                    ]}
                    icon={<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg>}
                  />
                  <ChipSelect
                    name="tone"
                    label="Tone"
                    defaultValue="Friendly"
                    options={[
                      { value: "Friendly", label: "Friendly" },
                      { value: "Warm", label: "Warm" },
                      { value: "Plain", label: "Plain" },
                      { value: "Professional", label: "Professional" },
                      { value: "Bold", label: "Bold" },
                    ]}
                    icon={<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M8.5 10.2c.4-.5 1-.8 1.7-.8.8 0 1.4.4 1.7 1 .3-.6.9-1 1.7-1 .7 0 1.3.3 1.7.8M9 14.2c.8.8 1.8 1.2 3 1.2s2.2-.4 3-1.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>}
                  />
                  <ChipSelect
                    className="picture-chip"
                    name="style"
                    label="Picture"
                    defaultValue="Photograph"
                    options={[
                      { value: "Photograph", label: "Photograph" },
                      { value: "Illustration", label: "Illustration" },
                      { value: "Flat colour poster", label: "Flat colour poster" },
                      { value: "Product photo", label: "Product photo" },
                      { value: "Cinematic", label: "Cinematic" },
                    ]}
                    icon={<svg viewBox="0 0 24 24" width="16" height="16"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" /><circle cx="9" cy="10" r="1.6" fill="currentColor" /><path d="M3.8 16.5l4.4-4.2 3.1 2.8 3.4-3.6 5.5 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  />
                </div>
                <div className="compose-grid compose-grid-bottom">
                  <ChipSelect
                    name="quality"
                    label="Image quality"
                    defaultValue="1K"
                    options={[
                      { value: "1K", label: "Standard (1K)" },
                      { value: "2K", label: "High (2K)" },
                      { value: "4K", label: "Ultra (4K)" },
                    ]}
                    icon={<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 3l2.2 4.5L19 8.3l-3.5 3.4.8 4.8L12 14.2 7.7 16.5l.8-4.8L5 8.3l4.8-.8L12 3z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>}
                  />
                  <ChipSelect
                    name="ratio"
                    label="Image ratio"
                    defaultValue="1:1"
                    options={[
                      { value: "1:1", label: "Square 1:1" },
                      { value: "4:5", label: "Portrait 4:5" },
                      { value: "9:16", label: "Story 9:16" },
                      { value: "16:9", label: "Landscape 16:9" },
                      { value: "4:3", label: "Classic 4:3" },
                      { value: "3:2", label: "Photo 3:2" },
                    ]}
                    icon={<svg viewBox="0 0 24 24" width="16" height="16"><path d="M7 4h4v4H7zM13 4h4v4h-4zM7 10h4v4H7zM13 10h4v4h-4zM7 16h10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>}
                  />
                  <ChipSelect
                    name="schedule"
                    label="Repeat"
                    value={schedule}
                    onChange={setSchedule}
                    options={[
                      { value: "once", label: "Once" },
                      { value: "daily", label: "Daily" },
                      { value: "weekly", label: "Weekly" },
                      { value: "monthly", label: "Monthly" },
                    ]}
                    icon={<svg viewBox="0 0 24 24" width="16" height="16"><path d="M20 12a8 8 0 1 1-2.2-5.5M20 4v5h-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  />
                </div>
                {repeating ? (
                  <div className="compose-grid compose-grid-schedule">
                    <label className="select-chip"><span className="select-chip-meta"><small>Time</small><input name="time" type="time" required /></span></label>
                    {schedule === "weekly" ? (
                      <ChipSelect
                        name="weekday"
                        label="Day"
                        defaultValue="1"
                        options={[
                          { value: "1", label: "Monday" },
                          { value: "2", label: "Tuesday" },
                          { value: "3", label: "Wednesday" },
                          { value: "4", label: "Thursday" },
                          { value: "5", label: "Friday" },
                          { value: "6", label: "Saturday" },
                          { value: "7", label: "Sunday" },
                        ]}
                      />
                    ) : null}
                    {schedule === "monthly" ? (
                      <label className="select-chip"><span className="select-chip-meta"><small>Day of the month</small><input name="monthday" type="number" min={1} max={28} defaultValue={1} required /></span></label>
                    ) : null}
                  </div>
                ) : null}
                {repeating ? <p className="quiet schedule-note">Sri Lanka time. When that time arrives, a new caption and picture are posted as the page. It repeats by itself, even if this tab is closed. Pause stops new posts. Activate again and the next post is the upcoming time. A time that already passed while paused is skipped.</p> : null}
                <div className="compose-foot">
                  <div className="compose-actions">
                    <button className="btn solid compose-primary" name="intent" value="post" disabled={busy}>
                      {!editing && !repeating ? (
                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4.2 11.4 20 4.2l-5.4 15.6-3.2-5.4-5.4-3.2z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M11.4 14.4 20 4.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
                      ) : null}
                      {editing ? "Save changes" : repeating ? "Save schedule" : "Write and Post"}
                      {!editing && !repeating ? <span className="credit-cost">{creditLabel(ACTION_COSTS.post)}</span> : null}
                    </button>
                    {editing ? <button className="btn ghost" type="button" disabled={busy} onClick={cancelEdit}>Cancel</button> : null}
                    {!editing && !repeating ? (
                      <button className="btn ghost compose-secondary" name="intent" value="queue" disabled={busy}>
                        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M12 8v4.2l2.6 1.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
                        Add to the queue
                      </button>
                    ) : null}
                  </div>
                  {!editing ? (
                    <aside className="compose-tip">
                      <span className="compose-tip-ico" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="16" height="16"><path d="M9.5 18h5M10 21h4M8.4 15.2A5.8 5.8 0 1 1 15.6 15.2c-.7.9-1.3 1.7-1.3 2.8h-4c0-1.1-.6-1.9-1.3-2.8z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </span>
                      <span><strong>Tip:</strong> You can schedule your posts from the Queue tab.</span>
                    </aside>
                  ) : null}
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
                                  {facebookLinks(run).map((link) => (
                                    <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
                                      {openLinkLabel("Facebook", facebookLinks(run), link)}
                                    </a>
                                  ))}
                                  {linkedInLinks(run).map((link) => (
                                    <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
                                      {openLinkLabel("LinkedIn", linkedInLinks(run), link)}
                                    </a>
                                  ))}
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
            </>
          )}
        </article>
        {deskView === "compose" ? (
          <article className="panel preview">
            <div className="preview-top">
              <p className="eyebrow">Proof</p>
              {topic?.image_url ? (
                <button
                  className="btn ghost compose-secondary preview-download"
                  type="button"
                  disabled={busy}
                  onClick={() => downloadTopicImage(topic)}
                >
                  Download image
                </button>
              ) : null}
            </div>
            {topic ? (
              <>
                <div className="preview-frame">
                  {topic.image_url ? (
                    <img className="preview-image" src={topic.image_url} alt={`Picture for ${topic.title}`} />
                  ) : (
                    <div className="preview-empty">The picture lands here.</div>
                  )}
                </div>
                <h2>{topic.title}</h2>
                <p className="quiet">{topic.language} · {topic.tone} · {topic.style} · {topic.ratio || "1:1"} · {topic.quality || "1K"}{topic.schedule !== "once" ? ` · ${topic.schedule_label}` : ""}</p>
                {topic.error ? <p className="error">{topic.error}</p> : null}
                <label>Caption <textarea ref={captionRef} defaultValue={topic.caption} key={topic.id + topic.caption} readOnly={topic.status === "posted" && topic.schedule === "once"} rows={8} /></label>
                <div className="row">
                  {!(topic.status === "posted" && topic.schedule === "once") ? <button className="btn ghost" type="button" disabled={busy} onClick={() => withBusy("Saving the caption…", async () => { apply(await call("topic_caption", { id: topic.id, caption: captionRef.current?.value || "" })); setStatus("Caption saved."); })}>Save caption</button> : null}
                  {!(topic.status === "posted" && topic.schedule === "once") ? (
                    <button className="btn ghost" type="button" disabled={busy} onClick={() => withBusy("Writing the caption and the picture. This usually takes about half a minute.", async () => { try { apply(await call("generate", { id: topic.id, post: false })); setStatus("The post is ready."); } catch (error) { const desk = error as Error & { state?: DeskState }; if (desk.state) apply(desk.state); setStatus(desk.message); return false; } }, { kind: "write", post: false, id: topic.id })}>
                      {topic.caption ? "Write again" : "Write the post"}
                      <span className="credit-cost muted">{creditLabel(ACTION_COSTS.post)}</span>
                    </button>
                  ) : null}
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
                  {facebookLinks(topic).map((link) => (
                    <a key={link.url} className="btn ghost" href={link.url} target="_blank" rel="noreferrer">
                      {topic.status === "posted"
                        ? openLinkLabel("Facebook", facebookLinks(topic), link)
                        : facebookLinks(topic).length > 1 && link.name
                          ? `Last post on Facebook · ${link.name}`
                          : "Last post on Facebook"}
                    </a>
                  ))}
                  {linkedInLinks(topic).map((link) => (
                    <a key={link.url} className="btn ghost" href={link.url} target="_blank" rel="noreferrer">
                      {openLinkLabel("LinkedIn", linkedInLinks(topic), link)}
                    </a>
                  ))}
                  <button className="text-btn" type="button" disabled={busy} onClick={() => withBusy("Removing…", async () => { apply(await call("topic_delete", { id: topic.id })); setSelected(""); setStatus("Removed."); })}>Remove</button>
                </div>
              </>
            ) : (
              <>
                <h2>The post will land here.</h2>
                <p className="quiet">Add a topic to the queue to write the caption and picture here. Check it, then post.</p>
              </>
            )}
          </article>
        ) : null}
      </section>
      {peek ? (
        <dialog
          className={`guide queue-peek${peekEdit ? " is-edit" : ""}`}
          ref={peekRef}
          onClose={closePeek}
          onClick={(event) => {
            if (event.target === peekRef.current) closePeek();
          }}
        >
          <div className="guide-bar">
            <div className="queue-peek-title">
              <div>
                <p className="eyebrow">{peekEdit ? "Edit post" : "Queue post"}</p>
                <h2>{peek.title}</h2>
              </div>
              <span className={peek.status === "posted" ? "page-chip on" : "page-chip"}>
                {labels[peek.status] || peek.status}
              </span>
            </div>
            <button className="btn ghost compose-secondary" type="button" onClick={closePeek}>Close</button>
          </div>
          <div className="queue-peek-scroll">
            <div className={`queue-peek-media-wrap${peekEdit ? " is-edit" : ""}`}>
              <button
                className="queue-peek-nav prev"
                type="button"
                aria-label="Previous post"
                title={peekPrev ? peekPrev.title : "No previous post"}
                disabled={busy || !peekPrev}
                onClick={() => stepPeek(-1)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M15.2 4.8a1.2 1.2 0 0 1 0 1.7L9.7 12l5.5 5.5a1.2 1.2 0 1 1-1.7 1.7l-6.3-6.35a1.2 1.2 0 0 1 0-1.7l6.3-6.35a1.2 1.2 0 0 1 1.7 0Z" />
                </svg>
              </button>
              <button
                className="queue-peek-nav next"
                type="button"
                aria-label="Next post"
                title={peekNext ? peekNext.title : "No next post"}
                disabled={busy || !peekNext}
                onClick={() => stepPeek(1)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8.8 4.8a1.2 1.2 0 0 1 1.7 0l6.3 6.35a1.2 1.2 0 0 1 0 1.7l-6.3 6.35a1.2 1.2 0 1 1-1.7-1.7L14.3 12 8.8 6.5a1.2 1.2 0 0 1 0-1.7Z" />
                </svg>
              </button>
              {peek.image_url ? (
                <button
                  className="btn ghost compose-secondary queue-peek-download"
                  type="button"
                  disabled={busy}
                  onClick={() => downloadTopicImage(peek)}
                >
                  Download image
                </button>
              ) : null}
              <div className={`queue-peek-media${peekEdit ? " is-edit" : ""}`}>
              <div className="queue-peek-frame">
                {peek.image_url ? (
                  <img
                    className="queue-peek-image"
                    src={`${peek.image_url}${peek.image_url.includes("?") ? "&" : "?"}t=${imageTick}`}
                    alt={`Picture for ${peek.title}`}
                  />
                ) : (
                  <div className="queue-peek-empty">No picture yet</div>
                )}
              </div>
              {peekEdit && peek.status !== "posted" ? (
                <div className="queue-peek-regen">
                  <label className="queue-peek-regen-label" htmlFor="peek-image-note">Change the picture</label>
                  <textarea
                    id="peek-image-note"
                    value={imageNote}
                    onChange={(event) => setImageNote(event.target.value)}
                    rows={3}
                    maxLength={800}
                    placeholder="What should change? e.g. brighter lights, no headphones, add a desk setup…"
                  />
                  <button
                    className="btn solid compose-primary"
                    type="button"
                    disabled={busy}
                    onClick={() => withBusy("Rewriting the picture…", async () => {
                      try {
                        apply(await call("regenerate_image", { id: peek.id, note: imageNote }));
                        setImageTick((tick) => tick + 1);
                        setImageNote("");
                        setStatus("Picture updated.");
                      } catch (error) {
                        const desk = error as Error & { state?: DeskState };
                        if (desk.state) apply(desk.state);
                        setStatus(desk.message);
                        return false;
                      }
                    }, { kind: "write", post: false, id: peek.id })}
                  >
                    Regenerate picture
                    <span className="credit-cost">{creditLabel(ACTION_COSTS.post)}</span>
                  </button>
                </div>
              ) : null}
              </div>
            </div>
            <p className="quiet">
              {peek.language} · {peek.tone} · {peek.style} · {peek.ratio || "1:1"} · {peek.quality || "1K"}
              {peek.created_at ? ` · ${when(peek.created_at)}` : ""}
            </p>
            {peek.error ? <p className="error">{peek.error}</p> : null}
            <div className="field-block">
              <div className="field-top"><span>Caption</span></div>
              <textarea
                ref={captionRef}
                key={`${peek.id}:${peek.caption}`}
                defaultValue={peek.caption}
                readOnly={peek.status === "posted" || peekEdit}
                rows={7}
                placeholder="The caption lands here after you write the post."
              />
            </div>
            {peekEdit && peek.status !== "posted" ? (
              <div className="queue-peek-regen">
                <label className="queue-peek-regen-label" htmlFor="peek-caption-note">Change the caption</label>
                <textarea
                  id="peek-caption-note"
                  value={captionNote}
                  onChange={(event) => setCaptionNote(event.target.value)}
                  rows={3}
                  maxLength={800}
                  placeholder="What should change? e.g. shorter, more playful, mention a discount…"
                />
                <button
                  className="btn solid compose-primary"
                  type="button"
                  disabled={busy}
                  onClick={() => withBusy("Rewriting the caption…", async () => {
                    try {
                      apply(await call("regenerate_caption", { id: peek.id, note: captionNote }));
                      setCaptionNote("");
                      setStatus("Caption updated.");
                    } catch (error) {
                      const desk = error as Error & { state?: DeskState };
                      if (desk.state) apply(desk.state);
                      setStatus(desk.message);
                      return false;
                    }
                  }, { kind: "write", post: false, id: peek.id })}
                >
                  Regenerate caption
                  <span className="credit-cost">{creditLabel(ACTION_COSTS.post)}</span>
                </button>
              </div>
            ) : null}
          </div>
          {press ? renderProgress("queue-peek-progress") : null}
          <div className="queue-peek-actions">
            {peek.status !== "posted" ? (
              peekEdit ? (
                <button
                  className="btn ghost compose-secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setPeekEdit(false);
                    setCaptionNote("");
                    setImageNote("");
                  }}
                >
                  Done editing
                </button>
              ) : (
                <>
                  <button
                    className="btn solid compose-primary"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const typed = captionRef.current?.value.trim() || "";
                      const needsWrite = !(peek.image_url && (peek.caption || typed));
                      withBusy("Posting to the page…", async () => {
                        try {
                          if (typed) await call("topic_caption", { id: peek.id, caption: typed });
                          if (peek.image_url && (peek.caption || typed)) apply(await call("publish", { id: peek.id }));
                          else apply(await call("generate", { id: peek.id, post: true }));
                          setStatus("Posted.");
                        } catch (error) {
                          const desk = error as Error & { state?: DeskState };
                          if (desk.state) apply(desk.state);
                          setStatus(desk.message);
                          return false;
                        }
                      }, needsWrite ? { kind: "write", post: true, id: peek.id } : { kind: "post", id: peek.id });
                    }}
                  >
                    Post to the page
                  </button>
                  <button
                    className="btn ghost compose-secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => withBusy("Saving the caption…", async () => {
                      apply(await call("topic_caption", { id: peek.id, caption: captionRef.current?.value || "" }));
                      setStatus("Caption saved.");
                    })}
                  >
                    Save caption
                  </button>
                  <button
                    className="btn ghost compose-secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setPeekEdit(true);
                      setCaptionNote("");
                      setImageNote("");
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="btn ghost compose-secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => withBusy("Writing the caption and the picture. This usually takes about half a minute.", async () => {
                      try {
                        apply(await call("generate", { id: peek.id, post: false }));
                        setImageTick((tick) => tick + 1);
                        setStatus("The post is ready.");
                      } catch (error) {
                        const desk = error as Error & { state?: DeskState };
                        if (desk.state) apply(desk.state);
                        setStatus(desk.message);
                        return false;
                      }
                    }, { kind: "write", post: false, id: peek.id })}
                  >
                    {peek.caption ? "Write again" : "Write the post"}
                    <span className="credit-cost muted">{creditLabel(ACTION_COSTS.post)}</span>
                  </button>
                </>
              )
            ) : null}
            {facebookLinks(peek).map((link) => (
              <a key={link.url} className="btn ghost compose-secondary" href={link.url} target="_blank" rel="noreferrer">
                {openLinkLabel("Facebook", facebookLinks(peek), link)}
              </a>
            ))}
            {linkedInLinks(peek).map((link) => (
              <a key={link.url} className="btn ghost compose-secondary" href={link.url} target="_blank" rel="noreferrer">
                {openLinkLabel("LinkedIn", linkedInLinks(peek), link)}
              </a>
            ))}
            <a
              className="btn ghost compose-secondary"
              href={`/audio?text=${encodeURIComponent((captionRef.current?.value || peek.caption || "").trim().slice(0, 4000))}`}
              onClick={(event) => {
                const spoken = (captionRef.current?.value || peek.caption || "").trim().slice(0, 4000);
                if (!spoken) {
                  event.preventDefault();
                  setStatus("Add a caption first.");
                  return;
                }
                event.currentTarget.href = `/audio?text=${encodeURIComponent(spoken)}`;
              }}
            >
              Speak caption
            </a>
            <button
              className="btn ghost queue-peek-remove"
              type="button"
              disabled={busy}
              onClick={() => withBusy("Removing…", async () => {
                apply(await call("topic_delete", { id: peek.id }));
                setSelected("");
                closePeek();
                setStatus("Removed.");
              })}
            >
              Remove
            </button>
          </div>
        </dialog>
      ) : null}
      {toast.text ? (
        <div className={toast.open ? "desk-toast on" : "desk-toast"} role="status" aria-live="polite">
          {toast.text}
        </div>
      ) : null}
    </main>
  );
}
