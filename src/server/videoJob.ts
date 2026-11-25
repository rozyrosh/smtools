import { spawn } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { consumeCredit, requireCredit } from "./accounts";
import { makeSimilarVideo, VIDEO_RATIOS, VIDEO_RESOLUTIONS, type VideoRatio, type VideoResolution } from "./gemini";
import { DeskError, limitText, randomId, videoDir } from "./paths";
import { currentScope } from "./store";

const MAX_BYTES = 80 * 1024 * 1024;

function run(cmd: string, args: string[], timeoutMs: number) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("timeout"));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      out += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      err += chunk.toString();
      if (err.length > 4000) err = err.slice(-4000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(err.slice(-300) || `${cmd} failed`));
    });
  });
}

async function clipDuration(file: string) {
  let seconds = 0;
  try {
    const raw = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file], 20000);
    seconds = Number(raw);
  } catch {
    seconds = 0;
  }
  const rounded = Math.round(seconds * 10) / 10;
  if (!Number.isFinite(rounded) || rounded < 1) throw new DeskError("That video is too short.");
  const label = rounded.toFixed(1).replace(/\.0$/, "");
  return `${label}s`;
}

async function clipShape(file: string): Promise<"16:9" | "9:16"> {
  try {
    const raw = await run(
      "ffprobe",
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", file],
      20000
    );
    const [width, height] = raw.split("x").map((part) => Number(part));
    if (width > 0 && height > width) return "9:16";
  } catch {
    return "16:9";
  }
  return "16:9";
}

function chosenResolution(value: string): VideoResolution {
  const picked = value.trim() as VideoResolution;
  if ((VIDEO_RESOLUTIONS as readonly string[]).includes(picked)) return picked;
  throw new DeskError("Choose a resolution: 360p, 720p, 1080p, or 4K.");
}

function chosenRatio(value: string): VideoRatio {
  const picked = value.trim() as VideoRatio;
  if ((VIDEO_RATIOS as readonly string[]).includes(picked)) return picked;
  throw new DeskError("Choose a ratio: 16:9 or 9:16.");
}

export async function createSimilarVideo(upload: unknown, changes: string, resolutionRaw: string, ratioRaw: string) {
  const userId = currentScope();
  requireCredit("video", userId);
  if (!(upload instanceof File) || upload.size < 1) throw new DeskError("Choose a video first.");
  if (upload.size > MAX_BYTES) throw new DeskError("That video is too large. Use a file under 80MB.");
  const name = upload.name.toLowerCase();
  const allowed = upload.type === "video/mp4" || upload.type === "video/quicktime" || upload.type === "video/x-m4v" || /\.(mp4|mov|m4v)$/.test(name);
  if (!allowed) throw new DeskError("Use an MP4 or MOV video.");
  const asked = limitText(changes, 2000);
  if (asked.length < 2) throw new DeskError("Say what should change in the new video.");
  const resolution = chosenResolution(resolutionRaw);
  const ratio = chosenRatio(ratioRaw);

  const scratch = mkdtempSync(path.join(tmpdir(), "smvideo-"));
  const source = path.join(scratch, "source.bin");
  const clip = path.join(scratch, "clip.mp4");
  try {
    writeFileSync(source, Buffer.from(await upload.arrayBuffer()));
    const aspect = await clipShape(source);
    const wide = aspect === "16:9";
    const frame = wide ? "1280:720" : "720:1280";
    const filter = `scale=${frame}:force_original_aspect_ratio=decrease,pad=${frame}:(ow-iw)/2:(oh-ih)/2:black,fps=12,tpad=stop_mode=clone:stop_duration=6,trim=duration=6`;
    try {
      await run(
        "ffmpeg",
        ["-y", "-i", source, "-vf", filter, "-frames:v", "72", "-r", "12", "-c:v", "libx264", "-preset", "veryfast", "-crf", "30", "-an", "-movflags", "+faststart", clip],
        120000
      );
    } catch {
      throw new DeskError("That video could not be prepared. Use an MP4 or MOV.");
    }
    const prepared = readFileSync(clip);
    if (prepared.length < 1000) throw new DeskError("That video could not be prepared. Use an MP4 or MOV.");
    const duration = await clipDuration(clip);
    if (duration !== "6s") throw new DeskError("That video could not be prepared. Use an MP4 or MOV.");
    const made = await makeSimilarVideo(prepared, asked, ratio, duration, resolution);
    const id = randomId("vid");
    writeFileSync(path.join(videoDir(), `${id}.mp4`), made);
    consumeCredit("video", userId);
    return { id, url: `/api/video/${id}` };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
