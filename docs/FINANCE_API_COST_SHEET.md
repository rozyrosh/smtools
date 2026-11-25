# smtools — AI API Cost Sheet (Finance Handover)

| Field | Value |
|---|---|
| Currency | **USD** |
| Prepared for | Finance / pricing / profit model |
| Product | smtools (Auto Posting, Video Duplicate, planned TTS) |
| Pricing source | [Google Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) |
| As of | **23 Nov 2026** |
| Important | Google can change rates. Re-check the link before annual budgets. |

---

## 1. How billing works (simple)

Google bills in **tokens**, not characters.

| Direction | What it is | Example in smtools |
|---|---|---|
| **INPUT** | Text we **send** to the AI | Title + description + instructions |
| **OUTPUT** | Text / image / video / audio the AI **returns** | Caption, picture, video clip, speech |

**Rule for finance:**

> **Cost = (Input tokens × Input rate) + (Output tokens × Output rate)**  
> Rates are usually quoted **per 1,000,000 tokens**.

### Character → token estimate (for planning)

| Content type | Planning rule |
|---|---|
| English / Latin | **~4 characters ≈ 1 token** |
| Sinhala / mixed | Use **~2–3 characters ≈ 1 token** (higher cost) |

Exact tokens appear on the Google Cloud / AI Studio usage bill. For quotes, use the English rule below, then add a **20% buffer** for Sinhala / thinking tokens / retries.

---

## 2. Official unit rates used by smtools

### A) Caption / text (Auto Posting)

Model used first: `gemini-3.8-flash` (fallbacks may apply).

| Item | Paid rate (until 31 Dec 2026) | From 1 Jan 2027 |
|---|---|---|
| Input | **$0.75 / 1M tokens** | **$1.50 / 1M tokens** |
| Output (includes thinking tokens) | **$3.75 / 1M tokens** | **$7.50 / 1M tokens** |

Free tier: text may be free within Google limits; **do not assume free for profit models**. Use **paid rates**.

### B) Image (Auto Posting picture)

App tries image models in order. Finance should budget the model that actually runs:

| Model ID | Quality | Official image output price |
|---|---|---|
| `gemini-2.5-flash-image` (current first choice) | ~1K | **$0.039 per image** |
| `gemini-3.1-flash-image` | 1K | **$0.067 per image** |
| `gemini-3.1-flash-image` | 2K | **$0.101 per image** |
| `gemini-3.1-flash-image` | 4K | **$0.151 per image** |
| `gemini-3.1-flash-lite-image` (future replacement) | 1K | **$0.0336 per image** |

Also: small input fee for the image prompt text (usually **&lt; $0.001**).

**Note:** `gemini-2.5-flash-image` is marked deprecated (shutdown **15 Mar 2027**). After migration, expect ~**$0.034–$0.067** per 1K image.

### C) Video (Video Duplicate)

Model: `gemini-omni-1.2-flash`  
App currently prepares about **6 seconds**; product talk often uses **10 seconds**.

| Resolution | Official approx. rate | 6s (app today) | 10s | 15s (max) |
|---|---|---|---|---|
| 360p | **$0.023 / sec** | $0.14 | $0.23 | $0.35 |
| 720p | **$0.07 / sec** | $0.42 | $0.70 | $1.05 |
| 1080p | **$0.104 / sec** | $0.62 | $1.04 | $1.56 |
| 4K | **$0.209 / sec** | $1.25 | $2.09 | $3.14 |

Plus small input cost for uploaded reference video + prompt (often a few cents).  
**Finance planning rate (720p):** use **$0.07 × seconds**.

### D) Audio / TTS (planned, not live in app yet)

Recommended for smtools: `gemini-3.8-flash-tts` (until 31 Dec 2026):

| Item | Rate |
|---|---|
| Text input | **$0.50 / 1M text tokens** |
| Audio output | **$9.00 / 1M audio tokens** |
| Audio token rule | **25 tokens per 1 second of audio** |
| Google’s published equivalent | **$0.00225 per 10 seconds of audio** |

Cheaper option: `gemini-3.8-flash-lite-tts` → **$0.0015 per 10 seconds**.

---

## 3. Worked example (exact case from product)

**User enters**
- Title = **100 characters**
- Description = **1,000 characters**

**AI returns**
- Caption = **1,000 characters**
- (+ short English image prompt text in the same text call)

### Step 1 — Convert to tokens (English planning)

| Item | Chars | Tokens (÷4) |
|---|---|---|
| Title (input) | 100 | 25 |
| Description (input) | 1,000 | 250 |
| System instructions (input, fixed) | — | 350 |
| **Total INPUT** | | **625** |
| Caption (output) | 1,000 | 250 |
| Image-prompt text (output) | ~600 | 150 |
| **Total OUTPUT (no extra thinking)** | | **400** |

### Step 2 — Text cost (`gemini-3.8-flash`, 2026 rates)

```
Input  = 625 / 1,000,000 × $0.75  = $0.000469
Output = 400 / 1,000,000 × $3.75 = $0.001500
Text total                         = $0.001969  ≈ $0.002
```

**With 20% buffer (Sinhala / thinking / retries):** **$0.0024**

### Step 3 — Image cost (1K, current first model)

```
Image = $0.039
Image prompt input ≈ $0.0002
Image total ≈ $0.0392
```

### Step 4 — Full auto post (this example)

| Component | Cost (USD) |
|---|---|
| Title + description + caption text call | **0.002** |
| Image 1K | **0.039** |
| **Total COGS per successful post** | **≈ 0.041** |
| Finance planning (with 20% buffer) | **≈ 0.050** |

---

## 4. Unit COGS to use in pricing / profit models

Use these as **standard cost per successful job** (paid tier, USD):

| Product action | Planning COGS | Notes |
|---|---|---|
| Caption only (regenerate caption) | **$0.003** | Buffered text-only |
| Image only (regenerate image, 1K) | **$0.040** | Current Flash Image |
| **Full auto post (caption + 1K image)** | **$0.05** | Recommended list COGS |
| Full auto post (2K image) | **$0.11** | If quality = 2K on 3.1 Flash Image |
| Full auto post (4K image) | **$0.16** | If quality = 4K |
| Video 6s @ 720p (current app length) | **$0.45** | Includes small input buffer |
| Video 10s @ 720p | **$0.75** | Includes small input buffer |
| TTS 10 seconds | **$0.003** | Flash TTS 2026 rate + tiny text input |
| TTS for ~1,000-char caption (~60–90s speech) | **$0.015 – $0.025** | Depends on speaking length |

### Monthly volume (using $0.05 per full post)

| Successful posts / month | Est. AI cost |
|---|---|
| 100 | $5 |
| 500 | $25 |
| 1,000 | $50 |
| 5,000 | $250 |
| 10,000 | $500 |

### Monthly volume (video, 10s @ 720p = $0.75)

| Successful videos / month | Est. AI cost |
|---|---|
| 100 | $75 |
| 500 | $375 |
| 1,000 | $750 |

---

## 5. Profit formula (for finance)

```
Gross profit per job = Selling price − AI COGS − other variable costs
                     (hosting, Facebook/LinkedIn, support, payment fees, etc.)

Contribution margin % = Gross profit / Selling price
```

**Example**

| Item | Amount |
|---|---|
| Sell 1 auto post to customer | $0.50 |
| AI COGS (buffered) | $0.05 |
| Gross before other costs | **$0.45** |
| Margin before other costs | **90%** |

| Item | Amount |
|---|---|
| Sell 1 video (10s) | $2.00 |
| AI COGS | $0.75 |
| Gross before other costs | **$1.25** |
| Margin before other costs | **62.5%** |

---

## 6. What increases cost (must disclose)

| Event | Effect |
|---|---|
| User clicks **Write again** / regenerate | Pays again (full or partial) |
| Failed then retried generation | May still incur charge depending on provider |
| Very long description (up to 10,000 chars) | Higher **input** text cost |
| Sinhala-heavy content | More tokens than English |
| Higher image quality (2K / 4K) | Higher image fee |
| Longer / higher-res video | Linear with seconds × resolution |
| Price change on 1 Jan 2027 (Flash text & TTS) | Roughly **2×** on those lines |

---

## 7. Recommended “finance lock” numbers (simple)

For quoting and P&amp;L until next price review:

| SKU | Lock COGS (USD) |
|---|---|
| Auto post — caption + 1K image | **$0.05** |
| Caption regenerate | **$0.003** |
| Image regenerate (1K) | **$0.04** |
| Video — per second @ 720p | **$0.08** (official $0.07 + buffer) |
| Video — 10 seconds @ 720p | **$0.80** |
| Audio TTS — per 10 seconds | **$0.003** |

**Review date:** re-check Google pricing every quarter, and before 1 Jan 2027 / 15 Mar 2027 image model migration.

---

## 8. Source links

1. Gemini API pricing: https://ai.google.dev/gemini-api/docs/pricing  
2. Google Cloud Text-to-Speech pricing: https://cloud.google.com/text-to-speech/pricing  

---

## 9. One-page summary

| Question | Answer |
|---|---|
| Do title & description cost money? | **Yes** — billed as **input** tokens |
| Does the caption cost money? | **Yes** — billed as **output** tokens |
| Which is expensive? | **Image and video**, not caption text |
| Cost for 100-char title + 1,000-char description → 1,000-char caption (text only) | **≈ $0.002** |
| Same + 1K image (full post) | **≈ $0.041** (plan **$0.05**) |
| 10-second video @ 720p | **≈ $0.70** (plan **$0.80**) |
| 10 seconds of TTS | **≈ $0.00225** (plan **$0.003**) |
