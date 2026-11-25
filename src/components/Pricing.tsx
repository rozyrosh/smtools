import Link from "next/link";
import { ACTION_COSTS, creditLabel } from "@/shared/creditCosts";
import { planList, priceLabel } from "@/server/plans";

export function Pricing() {
  const plans = planList();
  return (
    <section className="price-board" id="pricing">
      <p className="board-kicker">Simple & Affordable Pricing</p>
      <h2>Choose the right plan for your needs</h2>
      <p className="quiet price-credit-note">
        Spend credits how you want — post {creditLabel(ACTION_COSTS.post)}, video {creditLabel(ACTION_COSTS.video)}, audio {creditLabel(ACTION_COSTS.audio)}.
      </p>
      <div className="plan-row plan-row-4">
        {plans.map((plan) => (
          <article key={plan.id} className={plan.popular ? "plan hot" : "plan"}>
            {plan.popular ? <span className="popular">Most Popular</span> : null}
            <h3>{plan.name}</h3>
            <p>{plan.who}</p>
            <p className="plan-price">{priceLabel(plan)}<small>/month</small></p>
            <p className="plan-credits">{plan.credits.toLocaleString()} credits / month</p>
            <ul>
              <li>{plan.features.posts ? "Post generation available" : "Post generation not included"}</li>
              <li>{plan.features.videos ? "Video generation available" : "Video generation not included"}</li>
              <li>{plan.features.audios ? "Audio generation available" : "Audio generation not included"}</li>
            </ul>
            <Link
              className={plan.popular ? "btn solid" : "btn ghost"}
              href={plan.id === "business" ? "/support" : "/register"}
            >
              {plan.id === "free" ? "Start Free" : plan.id === "business" ? "Contact Us" : `Choose ${plan.name}`}
            </Link>
          </article>
        ))}
      </div>
      <div className="payhere">
        <span>Secure Payments with PayHere</span>
        <strong>PayHere</strong>
      </div>
      <p className="pay-note">New accounts start on Free with a shared credit balance. An admin can change packages. Card checkout is not switched on yet.</p>
    </section>
  );
}
