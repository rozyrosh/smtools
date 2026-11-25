import { AppShell } from "@/components/AppShell";
import { AudioDesk } from "@/components/AudioDesk";
import { requireUser } from "@/server/accounts";
import { listSpeechHistory } from "@/server/audioJob";
import { readSession } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function AudioPage({
  searchParams,
}: {
  searchParams: Promise<{ text?: string }>;
}) {
  const user = await requireUser();
  const session = await readSession();
  const { text } = await searchParams;
  const history = listSpeechHistory(user.id);
  return (
    <AppShell name={user.name} active="audio" admin={user.admin}>
      <AudioDesk csrf={session.csrf} starter={text || ""} history={history} />
    </AppShell>
  );
}
