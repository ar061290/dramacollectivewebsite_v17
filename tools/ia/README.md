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
| WhatsApp to `remind.whatsapp` | [CallMeBot](https://www.callmebot.com/blog/free-api-whatsapp-messages/), free for personal use | Once, below | None stated |

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

Until there is a CallMeBot key, the note after each reminder has an **Also send on WhatsApp** button: it
opens the visitor's own WhatsApp with the reminder written out to `remind.whatsapp`, for them to send.

To have every reminder sent on WhatsApp automatically, from the phone with that number:

1. Open the [CallMeBot WhatsApp page](https://www.callmebot.com/blog/free-api-whatsapp-messages/) and add
   the number it shows to your contacts. (In October 2026 it said the bot was full, with no number shown:
   check back every few days.)
2. Send that contact, on WhatsApp: `I allow callmebot to send me messages`
3. It answers with your API key. Put it in `content/ia.json` → `remind.callmebotKey` and push.

The page then sends each reminder to WhatsApp itself and the button goes. CallMeBot's answer cannot be
read from a page (it sends no CORS headers), so the note says "WhatsApp" once the request has gone.

## If someone misuses it

Everything here is in the public page. For the push: put a new random topic in `remind.ntfyTopic`,
push, and resubscribe the phone. For WhatsApp: ask CallMeBot for a new key (or empty
`remind.callmebotKey` to go back to the button). For the email there is no key to change: a mail filter on
the subject line ("IA reminder from") is the quickest stop.
