# Remind him: how a reminder reaches Aadi

On the unlisted IA tracker (`ia.html`, `src/pages/ia.js`, data in `content/ia.json`) every unfinished
subject has a **Remind him** button. The first press opens a popup for the visitor's name; their browser
remembers it, so every later press sends straight away (the note that confirms it offers "Not you?" to
change the name). Each reminder names the subject and goes three ways at once, all set in
`content/ia.json` → `remind`, and all public in the page:

| Way | Service | Set-up | Limit |
| --- | --- | --- | --- |
| Push to Aadi's phone | [ntfy.sh](https://ntfy.sh), free, open source | Once, below | 250 a day from each visitor (ntfy.sh's own) |
| Email to `remind.email` | [FormSubmit](https://formsubmit.co), free | Once, below | None stated |
| WhatsApp to `remind.whatsapp` | One of three, below: GREEN-API (free), InOut.bot (20 free, then paid) or CallMeBot (free, when it has room) | Once, below | GREEN-API: none on messages; InOut: what is paid for |

The site sets no limits of its own: a second press of the same button while the first is still going is
ignored, nothing more. If nothing goes through, the visitor is offered WhatsApp and an email link instead.

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

## WhatsApp

The page sends each reminder on WhatsApp itself once `content/ia.json` → `remind` has the key of one of
the services below (if more than one is filled in, the first in this list is used). Until then, or when a
send fails, the note after each reminder has an **Also send on WhatsApp** button instead: it opens the
visitor's own WhatsApp with the reminder written out to `remind.whatsapp`, for them to send.

WhatsApp does not ring a phone for a message sent from its own account to itself, so the reminder has to
come from someone else: a second number of yours (GREEN-API), or a service's own bot (InOut, CallMeBot).
Compared in October 2026 (Meta's own API, Whapi, TextMeBot, UltraMsg, Twilio and the automation services
were ruled out: a browser cannot call them, or they cost more for less).

### GREEN-API: free, no limit on messages (needs a second WhatsApp number)

[GREEN-API](https://green-api.com)'s Developer plan is $0 with no time limit; it sends without limit, to at
most 3 chats a month (Aadi's is one). It works by linking a WhatsApp account, like WhatsApp Web, and that
account writes to `remind.whatsapp`.

1. A second WhatsApp number: on a dual-SIM phone, the **WhatsApp Business** app on the second SIM, beside
   the usual WhatsApp, is enough. Register it, save the two numbers in each other's contacts, send it a
   message from `remind.whatsapp`, and leave it a day before linking it (a brand-new number that starts
   sending at once is the likeliest to be banned).
2. Sign up at [console.green-api.com](https://console.green-api.com) (an email address), **Create an
   instance** on the **Developer** plan, wait for it (up to 2 minutes), then **Get QR**, and on the second
   number's app: Linked devices → Link a device → scan it.
3. From the console, copy `apiUrl`, `idInstance` and `apiTokenInstance` into `remind.greenApi` (`apiUrl`,
   `idInstance`, `apiToken`). Push, press Remind him once, and check the phone rings.

Then open the second number's WhatsApp at least every 10 days, or the link may drop (scan the QR again),
and keep its SIM recharged. The token in the page lets whoever copies it use that second account (send
from it, read its chats, log it out, change the token), so keep nothing private on that number; if it is
misused, change the token in the console and paste the new one in. GREEN-API's docs do not say whether a
browser may call it (the evidence is that it can): if the note never says "WhatsApp", look in the browser's
console for a CORS error and use InOut instead.

### InOut.bot: one message to set up, 20 free, then from $1 a month

[InOut.bot](https://inout.bot/whatsapp-api/)'s bot writes to the number that asked for the key, through
Meta's official API, so no second number is needed, and the key cannot message anyone else.

1. From `remind.whatsapp`'s phone, send `Create APIKey` on WhatsApp to the InOut bot, **+1 234 332 2110**.
2. It answers with your key: put it in `remind.inoutKey` and push.

The first 20 messages are free (in all, not a month); then a plan: $1 a month for 20, $2 for 60, $5 for
200 ([prices](https://inout.bot/whatsapp-price/)). Anyone who copies the key can use them up.

### CallMeBot: free, when it has room

[CallMeBot](https://www.callmebot.com/blog/free-api-whatsapp-messages/)'s bot works like InOut's, free for
personal use, but in October 2026 it said it was full, with no number shown: check back every few days.
Then save the number it shows, send it `I allow callmebot to send me messages` from `remind.whatsapp`'s
phone, and put the key it answers with in `remind.callmebotKey`.

InOut's and CallMeBot's answers cannot be read from a page (they send no CORS headers), so with them the
note says "WhatsApp" once the request has gone; GREEN-API's can, so with it the note says so only once
GREEN-API has taken the message.

## If someone misuses it

Everything here is in the public page. For the push: put a new random topic in `remind.ntfyTopic`,
push, and resubscribe the phone. For WhatsApp: a new token or key from the service (GREEN-API's console;
InOut's or CallMeBot's bot), or empty it to go back to the button. For the email there is no key to
change: a mail filter on the subject line ("IA reminder from") is the quickest stop.
