# Home, hotel choices and expense currency — release notes

This is a **draft** branch. No production Firebase content has been modified.

## Home

The interactive map appears at the top of **Home**, followed by **Trip overview**.
The former standalone **Map** and **Route** navigation tabs and the duplicate
route-stop list have been removed. Tapping a map marker can still take a
traveler directly to the destination's detail screen.

## Hotels & bookings

**Hotels & bookings** is the single place to manage lodging selections.
The destination's Stays section links into that same manager instead of
offering a separate, conflicting selection UI.

- Multiple confirmed, pending, optional or cancelled reservations can be shown.
- Only the two configured trip editors may import, add, edit or select hotels.
- One **active** confirmed option per city and overlapping-stay group (even when alternatives have different check-in dates); cancelled
  hotels remain in the list but cannot be activated. Editors may also clear
  a selection, including a selection inherited from the older itinerary.
- The data from the user's Booking.com screenshot should be imported from
  the privately supplied JSON transcription file, **not committed to this
  public GitHub repository**. The app's editor-only import control accepts an
  array of up to 100 hotel entries. It previews the count and skips exact
  name/city/date duplicates. Review spelling, dates and prices before
  choosing Confirm import.
- The screenshot file does not contain PINs, booking numbers, traveller names,
  or email bodies. Status is taken from the screenshot; *cancelled* reservations
  never become active automatically. Import also does not alter the itinerary
  or any cost-sharing allocation.
- For hotels imported in foreign currencies, conversion is fetched on import
  or when the price is edited, and its USD basis plus provider timestamp are
  recorded. Confirmed hotels are not automatically counted as paid expenses.

**Data**: `trip/hotelBookings` holds sanitized new booking options;
`trip/hotelSelections/<normalized-city>_<YYYY-MM-DD>` holds explicit active
IDs (or the sentinel `none` for an explicit clear). Older
`trip/destinations/*/hotels` continue to display as booking options.

Check Firebase **Realtime Database Rules** for these new nodes before publishing.
Hiding edit buttons in the React UI is not a substitute for a database rule
which actually limits writes to the approved editor accounts.

## Daily currency reference

This app uses the openly accessible
[ExchangeRate-API free endpoint](https://www.exchangerate-api.com/docs/free)
for a daily USD-base reference quote (the provider requires attribution).
It is **not** a continuously traded live FX quote and actual card conversion
rates may differ.

- When an editor **saves** a new ARS or ILS expense or hotel price,
  the app fetches the most recently published quote again, checks the
  provider timestamp is no more than 48 hours old, converts the amount
  to USD and stores the exact quote, fetch timestamp and USD basis with
  that expense. If the quote fails, saving the foreign-currency price is
  blocked, not mis-converted.
- Later budget viewing may refresh quotes for USD/ARS/ILS **display**,
  but never rewrites the saved historical USD basis of an expense.
  Older foreign-currency costs without a snapshot are explicitly labelled
  provisional and use the currently available reference rate.
- The single Budget currency selector applies to the **tracked expense
  breakdown**, **original planning breakdown**, **original estimated total**
  and **Michelle and Gilad's original planning estimate**. Historical
  planning estimates and tracked expenses are kept separate so that they
  are not double-counted.
- The old text about who pays for shared transfers has been removed.
  New participant expense-allocation rules are intentionally not assumed.

## Before releasing

The GitHub Actions workflow runs the Gmail parser, hotel import, FX,
budget and Home layout regression tests followed by a production build.
Additionally, verify the Home layout on mobile, Firebase read/write rules,
editor versus viewer roles, Gmail private review queue and hotel-selection
behavior against a test database. The PR should remain a draft until
production access rules and a Vercel preview are checked.
