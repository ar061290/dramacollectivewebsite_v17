# Remind Aadi: how the reminder reaches him

The **Remind Aadi** button on the unlisted IA tracker (`ia.html`, `src/pages/ia.js`, data in
`content/ia.json`) asks the visitor for their name and sends Aadi one reminder. It works in one of two
ways, chosen by `content/ia.json` → `remind`:

| `remind` has | What happens | Who can read or post reminders |
| --- | --- | --- |
| `ntfyTopic` only (as now) | The page posts straight to ntfy.sh, a free push service: a notification on Aadi's phone. No email: ntfy.sh stopped forwarding email for anonymous senders in March 2026. | Anyone who opens the page: the topic is in its source. |
| `relayUrl` | The page posts the name to the relay below (a Google Apps Script in the owner's account), which sends the push **and** an email to Aadi. The page carries no topic. | Only the relay. |

Either way, if the reminder cannot be sent the visitor is offered an email link instead, and one browser
can send at most one reminder a minute.

## Aadi's phone (once, two minutes)

1. Install **ntfy** (Play Store, F-Droid, or the App Store).
2. Tap **+** (Subscribe to topic) and enter the topic exactly as it is in `content/ia.json` →
   `remind.ntfyTopic` (or, with the relay, the relay's `NTFY_TOPIC`). Leave the server as ntfy.sh. Allow
   notifications.
3. Send one reminder from the page and check it arrives.

ntfy answers "sent" whether or not anyone is subscribed, so step 3 is the only proof it reaches him.

## The relay: an email copy, and a topic nobody else sees (optional, about five minutes)

1. Go to script.google.com → **New project**. Replace its contents with `remind-relay.gs` from this
   folder, and save.
2. **Project Settings → Script properties**: add
   - `NTFY_TOPIC`: a **new** random topic (letters, digits and dashes, e.g. `dc-ia-` plus 16 random
     characters). Do not reuse the one in `content/ia.json`: that one has been in the public page.
   - `EMAIL`: Aadi's address.
   - `PAGE_URL`: `https://ar061290.github.io/dramacollectivewebsite_v17/ia`
   - `DAILY_CAP` (optional): the most reminders a day from everyone together; 30 if unset.
3. **Deploy → New deployment**, type **Web app**: *Execute as* **Me**, *Who has access* **Anyone**. Deploy,
   allow what it asks (to send email as you and to call ntfy.sh), and copy the **Web app URL**.
4. In `content/ia.json` → `remind`: set `"relayUrl"` to that URL and delete `"ntfyTopic"`. Push.
5. On Aadi's phone, unsubscribe from the old topic and subscribe to the new `NTFY_TOPIC`. Send a test.

Emails go out from the owner's Gmail (Google allows about 100 a day on a free account).

## If someone misuses it

Without the relay: put a new random topic in `content/ia.json` → `remind.ntfyTopic`, push, and resubscribe
Aadi's phone to it. With the relay: change `NTFY_TOPIC` in the script's properties (nothing to push), or
lower `DAILY_CAP`; to stop it altogether, archive the deployment.
