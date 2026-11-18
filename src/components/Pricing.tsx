import Link from "next/link";

const plans = [
  {
    name: "Starter",
    who: "Perfect for individuals",
    price: "1,990",
    points: ["Auto Posting — 1 Account", "Video Duplicate — 10 videos/month", "AI Call Agent — 600 mins/month", "Basic Support"],
    cta: "Get Started",
    href: "/register",
  },
  {
    name: "Pro",
    who: "For growing businesses",
    price: "4,990",
    points: ["Auto Posting — 5 Accounts", "Video Duplicate — 50 videos/month", "AI Call Agent — 2,000 mins/month", "Priority Support"],
    cta: "Choose Pro",
    href: "/register",
    popular: true,
  },
  {
    name: "Business",
    who: "For large teams & agencies",
    price: "9,990",
    points: ["Auto Posting — Unlimited", "Video Duplicate — Unlimited", "AI Call Agent — 5,000 mins/month", "Dedicated Support"],
    cta: "Contact Us",
    href: "/support",
  },
];

export function Pricing() {
  return (
    <section className="price-board" id="pricing">
      <p className="board-kicker">Simple & Affordable Pricing</p>
      <h2>Choose the right plan for your needs</h2>
      <div className="plan-row">
        {plans.map((plan) => (
          <article key={plan.name} className={plan.popular ? "plan hot" : "plan"}>
            {plan.popular ? <span className="popular">Most Popular</span> : null}
            <h3>{plan.name}</h3>
            <p>{plan.who}</p>
            <p className="plan-price">LKR {plan.price}<small>/month</small></p>
            <ul>
              {plan.points.map((point) => <li key={point}>{point}</li>)}
            </ul>
            <Link className={plan.popular ? "btn solid" : "btn ghost"} href={plan.href}>{plan.cta}</Link>
          </article>
        ))}
      </div>
      <div className="payhere">
        <span>Secure Payments with PayHere</span>
        <strong>PayHere</strong>
      </div>
      <p className="pay-note">These are the plan prices. A card is not charged from this page.</p>
    </section>
  );
}
