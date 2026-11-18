import { Nav } from "@/components/Nav";
import { AppShell } from "@/components/AppShell";
import { current } from "@/server/accounts";

export const dynamic = "force-dynamic";

function Body() {
  return (
    <>
      <header className="tool-head">
        <div>
          <h1>Support</h1>
          <p>Business plans and setup questions go to the person who runs this smtools computer.</p>
        </div>
      </header>
      <article className="dash-card narrow">
        <p>This page does not send a ticket and it does not charge a card.</p>
      </article>
    </>
  );
}

export default async function SupportPage() {
  const user = await current();
  if (!user) {
    return (
      <>
        <Nav />
        <main className="home"><Body /></main>
      </>
    );
  }
  return (
    <AppShell name={user.name} active="support">
      <Body />
    </AppShell>
  );
}
