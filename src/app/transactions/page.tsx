import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/server/accounts";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const user = await requireUser();
  return (
    <AppShell name={user.name} active="transactions">
      <header className="tool-head">
        <div>
          <h1>Transactions</h1>
          <p>Payments for this account.</p>
        </div>
      </header>
      <article className="dash-card narrow">
        <p>No payments yet. PayHere checkout is not switched on, so nothing has been charged.</p>
      </article>
    </AppShell>
  );
}
