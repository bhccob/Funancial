# Delete fixes: card delete and Delete all data

A small update to the current app before the glassmorphism redesign, on branch `fix/card-and-data-delete` (from main 5f79821). Nothing was restyled: the redesign reworks cards and settings later. Each fix was test-first. Below: the owner's rulings, the calls made where nobody ruled, and what was checked on the phone.

## Bug 1: deleting a card failed

**Cause.** `deleteDebt` refused in two cases. It threw when any subscription had `cardId` on the card ("A subscription is paid with this card…"), and it threw when an expense or payment pointed at the card ("This card or loan has history…"). The owner met the subscription refusal first.

**Owner's rulings (2026-10-21):**

- Delete works. The confirmation says how many subscriptions are paid with the card, and that they switch to debit. They move, and the card goes, in one write.
- A card with history is **archived**, not refused. It is hidden from Debts, the card pickers, bills and reminders, and past expenses keep its name.
- What an archived card still owes **stops counting**: the confirmation names the amount, and from the archive day it leaves the debt total and net worth.

**Calls made here:**

- `Debt.archivedOn` is an optional `LocalDate`, so no schema version bump and no migration. Absent means in use. A date rather than a timestamp, so the net worth chart can count the card on days before it was archived and not from that day on. Cost if wrong: a migration later, when the redesign reshapes cards.
- A loan with payments is archived the same way, since the dialog and the action are shared. Cost if wrong: none, as a loan had no way to go before either.
- Every subscription paid with the card moves, cancelled ones too. A cancelled one that is turned back on must not renew onto a card that is gone or archived. The move is to `debit` with `cardId: null`, which keeps `cardMatchesMethod`.
- The ask is its own dialog, rendered beside the edit dialog rather than inside it, so Escape on the ask doesn't close both. Title and button read "Delete" or "Archive" depending on what will happen.
- Editing an old expense paid with an archived card still offers that card under "Paid with". A new expense never sees an archived card.
- The card sheet closes when its card is archived, as it does when one is deleted.
- Left as is: Settings → Data's summary line counts stored cards, archived ones included. There is no way to unarchive. The redesign's Cards scene is where both belong.

## Bug 2: "Delete all data" didn't work

**Reproduced.** The owner's report was "it erases and shows the welcome screen, but after I log in my data is back". The code matches: `deleteAllData` removes only the phone's database. The account's locked copy on the service is never touched, and logging in restores it. The dialog even said "log in afterwards to get your data back". So nothing was broken in the delete. The phone's delete and the account's copy disagreed with what the owner expects "all data" to mean.

**Owner's ruling (2026-10-21):** with an account, Delete all data is a fresh start that keeps the profile. The owner's words: "just keep the user profile but erase all the things user added to the app so its like a new start but they still have their profile". Confirmed in full:

- You stay logged in. The account, PIN, name, currency and settings stay.
- Everything added is erased: expenses, income, subscriptions, limits, goals, cards and loans, holdings and dividends, About you, and game progress.
- Setup opens again with the name and currency filled in, for today's cash, savings, salary and cards.
- The account's copy becomes the fresh start, so logging in on another phone gets it too.
- With no account, it erases the phone completely, as before.

**Calls made here:**

- `startOver()` restores a `freshStart` snapshot through the existing restore path. The account sync already uploads whatever a restore puts back, so no new sync code was needed.
- Game progress goes with the entries. The ledger is derived, so keeping it while the entries go would reverse every logging award anyway. Bought cosmetics stay equipped in settings, but they show as the defaults until bought again (`equippedCosmetics` checks ownership).
- Kept profile fields: name and currency. Cash, savings and salary reset (`openingDate` today, 0, none), and setup asks for them again.
- A phone whose account another phone has taken (`status: 'moved'`) no longer saves to that account, so it erases the phone as before.
- The lock screen's "forgot PIN" erase still erases the phone only. It can't read the account link while locked, and logging in afterwards to get the data back is the point there.
- Setup's last step shows "Your PIN stays" (or passphrase) when a lock exists, instead of offering "No lock", and finishing leaves the lock alone. Which lock to keep is read once, when setup opens, so a PIN chosen on that step in a first-run setup doesn't flip the screen mid-finish.
- Help → Privacy now says what Delete all data does to the account copy.
