# App Store Connect metadata

Copy for the TestFlight and App Store fields, written to be pasted as-is. Character
limits are Apple's and are noted where they bite.

Two rules shaped all of it:

**No medical claims.** Guidelines 1.4.1 and 5.1.1 treat "recover safely", "heal faster",
"prevent injury" as claims that need substantiation Vela does not have. Everything below
describes what the software *does* — carries a prescription, records how it felt — and
never what it achieves clinically. The app's own copy already holds this line; the store
listing has to as well, because the listing is what gets read first.

**Say plainly that it needs a physiotherapist.** An app that opens onto a login nobody
can pass reads as broken to a reviewer, and as a bait-and-switch to anyone who downloads
it. Better to state the precondition in the first line of the description.

---

## App information

| Field | Value |
|---|---|
| Name (30) | `Vela` |
| Subtitle (30) | `Your physio's plan, tracked` |
| Bundle ID | `io.velas.app` |
| Primary category | Health & Fitness |
| Secondary category | Medical |
| Privacy Policy URL | `https://www.vela-coaching.com/privacy` |
| Support URL | `https://www.vela-coaching.com` |

Age rating: answer **No** to every content question. The one that matters is
*Medical/Treatment Information* — answer **No**. Vela carries a plan a clinician wrote;
it does not itself give medical advice, and answering Yes invites a 17+ rating and extra
scrutiny for no benefit.

---

## Keywords (100 characters, commas, no spaces)

```
physiotherapy,physio,postpartum,rehab,strength,running,pelvic,recovery,exercise,plan
```

83 characters. Deliberately omits "Vela" and words already in the subtitle — Apple
indexes the name and subtitle separately, so repeating them wastes the budget.

---

## Promotional text (170)

Editable later without review, so it is the field to change seasonally.

```
Your physiotherapist builds the plan. Vela shows you today's session, records how it
felt, and keeps her in the loop between appointments.
```

---

## Description

```
Vela is for people working through a training plan with their physiotherapist.

You need an invitation from a practice that uses Vela — your physiotherapist sends it
to your email address, and you enter the six-digit code to get started.

WHAT YOU SEE

Today. The session you are due, laid out exercise by exercise, with the sets, reps and
tempo your physiotherapist prescribed and the cues she wants you thinking about.

How it felt. Score your symptoms before and after each session. This is the part your
physiotherapist reads most closely — it is how she knows whether to progress you, hold
you, or ease off, without waiting for your next appointment.

Progress. Sessions completed, and your measurements over time.

Apple Health. Optional. Connect it and Vela reads six measurements — body weight, body
fat percentage, resting heart rate, heart rate variability, steps and VO2 max — so your
physiotherapist can see how training is landing alongside how you say it felt. Vela
never writes anything back to Apple Health.

Food. Log meals against the targets your physiotherapist sets, by search or by scanning
a barcode. Your diary is hers to read and yours alone to edit.

PRIVACY

Your physiotherapist sees your data. Nobody else does. Clients cannot see one another,
and a physiotherapist only ever sees the people she invited — enforced by the database
itself, not merely by the app.

Health data is stored on the basis of your explicit consent, given separately for each
type and withdrawable at any time. You can export everything held about you, or delete
your account outright, from your profile.

Vela does not use advertising networks. It does not sell or share your data.

Vela supports your treatment. It is not a medical device, it does not diagnose, and it
does not replace your physiotherapist's judgement.
```

---

## TestFlight — Test Information

Beta App Review will not proceed without these filled in.

**Beta App Description**

```
Vela carries a physiotherapy training plan to the client it was written for. The
physiotherapist builds a programme in a web portal and invites her client by email; the
client sees each session, records symptom scores before and after, optionally connects
Apple Health, and logs food against targets the physiotherapist sets.

This build is for the practice and a small number of its own clients.
```

**What to Test**

```
1. Accepting an invitation. Enter the email your invitation was sent to and the
   six-digit code from it. The code both verifies your address and signs you in.

2. Consent. Each data type is agreed separately on first run. Declining should leave the
   app usable, minus that feature.

3. Today. Open the session you are due. Check the exercises, sets and reps match what
   your physiotherapist prescribed, and record symptom scores before and after.

4. Apple Health. Connect it from Today. Vela reads six measurements and imports one
   figure per day — a step count should read as a plausible daily total, not a fragment.
   Confirm nothing is ever written back to Apple Health.

5. Food. Log a meal by search and one by scanning a barcode.

6. Your data. Export it, and confirm the file contains what you expect.

Please report anything that reads as clinical advice rather than as your
physiotherapist's plan — that wording is deliberate and we want to know if it slips.
```

**Feedback email**: an address that is actually monitored — `hello@vela-coaching.com`
once its forwarding is live.

---

## App Review Information — the part that needs a decision

Sign-in is required, so Apple's guideline 2.1 obliges us to supply working credentials.
Vela signs in with a six-digit code emailed to the client, and **a reviewer cannot
receive that email.** Handing over an address whose inbox they cannot open is the single
most common cause of a rejection for apps built this way.

It has to be solved before submitting, and there are two honest routes:

1. **A fixed code for one review-only account.** Supabase can pin a chosen address to a
   constant OTP, so `review@vela-coaching.com` with code `123456` always works and no
   email is involved. Cheapest by far if this CLI version supports it for email as it
   does for SMS — needs checking, not assuming.

2. **A password option for that one account.** Supabase supports email and password
   alongside the code. The sign-in screen would need a password field, which is a real
   if small change to the app, and another build.

Either way the review account needs a **programme, some sessions and a few measurements
already on it** — a reviewer landing on an empty Today has nothing to review and may
reject for incomplete functionality. The demo seed builds exactly that shape of account.

**Notes for the reviewer**, once an account exists:

```
Vela requires an invitation from a physiotherapy practice, so a demo client has been
prepared with a programme, completed sessions and measurements already on it.

Sign in with the address and code above. On the sign-in screen enter the email, then the
six-digit code — for this account the code is fixed and no email is sent.

Apple Health is optional and the app is fully usable without it. Vela only ever reads,
and only the six measurements named in the permission sheet.
```

---

## The app icon needs no upload

App Store Connect takes the 1024×1024 marketing icon from the binary's asset catalog, so
there is no field to fill. It is at
`apps/mobile/ios/Vela/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png` —
1024×1024, RGB, no alpha channel, which is what Apple requires.

The proof it is already working: builds 5 and 6 show the coral mark beside them in Build
Uploads, while the failed build 4 shows a grey placeholder because processing never got
far enough to extract it.

## Screenshots, which are not optional

Required for App Store release (not for TestFlight): 6.7" and 6.5" iPhone, at least
three each. These have to come from a real device or simulator — nothing in the repo can
generate them. Worth capturing Today, a session, Progress and Nutrition.
