# Remind him: how a reminder reaches Aadi

On the unlisted IA tracker (`ia.html`, `src/pages/ia.js`, data in `content/ia.json`) every unfinished
subject has a **Remind him** button. The first press opens a popup for the visitor's name; their browser
remembers it, so every later press sends straight away (the note that confirms it offers "Not you?" to
change the name). Each reminder names the subject and goes two ways at once, both set in
`content/ia.json` → `remind`, and both public in the page:

| Way | Service | Set-up | Limit |
| --- | --- | --- | --- |
| Push to Aadi's phone | [ntfy.sh](https://ntfy.sh), free, open source | Once, below | 250 a day from each visitor (ntfy.sh's own) |
| Email to `remind.email` | [FormSubmit](https://formsubmit.co), free | Once, below | None stated |

The site sets no limits of its own: a second press of the same button while the first is still going is
ignored, nothing more. If neither goes through, the visitor is offered an email link instead.

## Aadi's phone: the push (two minutes)

1. Install **ntfy** (Play Store, F-Droid, or the App Store).
2. Tap **+** (Subscribe to topic) and enter the topic exactly as it is in `content/ia.json` →
   `remind.ntfyTopic`. Leave the server as ntfy.sh. Allow notifications.
3. Press Remind him once on the live page and check it arrives.

ntfy answers "sent" whether or not anyone is subscribed, so step 3 is the only proof it reaches him.

## The email (one click)

The first reminder after a new address is not delivered: FormSubmit emails `remind.email` a link to
activate the form instead. Click **Activate Form** in that email (look in spam too). Every reminder after
that arrives as an email. The visitor sees "Sent to Aadi's phone" until then, not "email".

## No WhatsApp

WhatsApp was tried and taken out (27 October 2026). A page can only send one through a service, and none
fitted: the free one with no limit (GREEN-API) has to send from a second WhatsApp number, since WhatsApp
does not ring for a message from an account to itself; the one with its own bot (InOut.bot) is free for 20
messages, then paid; CallMeBot, free with its own bot, was taking no one new; and Meta's own API, Whapi,
TextMeBot, UltraMsg and Twilio cannot be called from a browser or cost more for less.

## If someone misuses it

Everything here is in the public page. For the push: put a new random topic in `remind.ntfyTopic`,
push, and resubscribe the phone. For the email there is no key to change: a mail filter on the subject
line ("IA reminder from") is the quickest stop.
