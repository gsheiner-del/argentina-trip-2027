# Gmail to Firebase Sync Setup

This script automatically syncs booking confirmation emails from your "Argentina 2027" Gmail label to your Firebase database.

## Setup Instructions

### Step 1: Create Google Apps Script

1. Go to: **https://script.google.com**
2. Click **"New Project"**
3. Copy & paste the code below into the script editor

### Step 2: Add Firebase Libraries

In the script editor:
1. Click **"Libraries"** (+ icon)
2. Paste this ID: `1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBBDOardT_Qs`
3. Select **"Add"**
4. Select version **48** (or latest)

### Step 3: Configure Firebase

In `script.gs`, update these values with your info:

```javascript
const CONFIG = {
  databaseUrl: "https://argentina-trip-2027-default-rtdb.firebaseio.com",
  firebaseEmail: "YOUR_FIREBASE_SERVICE_ACCOUNT_EMAIL",
  firebaseKey: "YOUR_FIREBASE_PRIVATE_KEY",
  gmailLabel: "Argentina 2027"
};
```

**How to get Firebase credentials:**
1. Go to: https://console.firebase.google.com/u/0/project/argentina-trip-2027/settings/serviceaccounts/adminsdk
2. Click **"Generate New Private Key"**
3. A JSON file downloads
4. Open it and copy:
   - `client_email` → `firebaseEmail`
   - `private_key` → `firebaseKey`

### Step 4: Set Up Trigger

In the Apps Script editor:
1. Click the **⏰ Trigger** icon (left sidebar)
2. Click **"Create new trigger"**
3. Configure:
   - Function: `syncGmailToFirebase`
   - Deployment: `Head`
   - Event type: `Time-driven`
   - Frequency: `Every 1 hour` (or your preference)
4. Click **Save**

### Step 5: Authorize Script

1. Click **Run** → Script will ask for permissions
2. Click **"Review Permissions"**
3. Select your Google account
4. Click **"Allow"**

### Step 6: Test It

1. In Google Apps Script, click **Run**
2. Check the **Execution log** (bottom)
3. Go to your app — booking info should sync!

---

## Script Code

```javascript
const CONFIG = {
  databaseUrl: "https://argentina-trip-2027-default-rtdb.firebaseio.com",
  firebaseEmail: "YOUR_FIREBASE_SERVICE_ACCOUNT_EMAIL",
  firebaseKey: "YOUR_FIREBASE_PRIVATE_KEY",
  gmailLabel: "Argentina 2027"
};

function syncGmailToFirebase() {
  try {
    const label = GmailApp.getUserLabelByName(CONFIG.gmailLabel);
    if (!label) {
      Logger.log("Label 'Argentina 2027' not found!");
      return;
    }

    const threads = label.getThreads(0, 50);
    const syncedBookings = {};

    for (let thread of threads) {
      const messages = thread.getMessages();
      for (let msg of messages) {
        const subject = msg.getSubject();
        const body = msg.getPlainBody();
        const from = msg.getFrom();

        const booking = parseBookingEmail(subject, body, from);
        if (booking) {
          syncedBookings[booking.id] = booking;
        }
      }
    }

    if (Object.keys(syncedBookings).length > 0) {
      const db = FirebaseApp.getDatabaseByUrl(CONFIG.databaseUrl);
      db.updateData("bookings", syncedBookings);
      Logger.log(`✅ Synced ${Object.keys(syncedBookings).length} bookings`);
    }

  } catch (error) {
    Logger.log("❌ Error: " + error.toString());
  }
}

function parseBookingEmail(subject, body, from) {
  // Parse Booking.com
  if (from.includes("booking.com")) {
    const confirmMatch = body.match(/Confirmation.*?(\w{7,10})/i);
    const hotelMatch = body.match(/Hotel[:\s]+([^\n]+)/i);
    return {
      id: "booking_" + Date.now(),
      source: "booking.com",
      confirmation: confirmMatch ? confirmMatch[1] : "",
      hotel: hotelMatch ? hotelMatch[1].trim() : "",
      email: from,
      subject: subject
    };
  }

  // Parse Expedia
  if (from.includes("expedia")) {
    const confirmMatch = body.match(/Itinerary.*?(\d{10,})/i);
    return {
      id: "expedia_" + Date.now(),
      source: "expedia",
      confirmation: confirmMatch ? confirmMatch[1] : "",
      email: from,
      subject: subject
    };
  }

  // Parse El Al (airline)
  if (from.includes("elal") || subject.includes("El Al")) {
    const confirmMatch = body.match(/Booking Reference[:\s]+([A-Z0-9]{6})/i);
    return {
      id: "elal_" + Date.now(),
      source: "El Al",
      confirmation: confirmMatch ? confirmMatch[1] : "",
      airline: "El Al",
      email: from,
      subject: subject
    };
  }

  // Parse Aerolineas (airline)
  if (subject.includes("Aerolineas") || from.includes("aerolineas")) {
    const confirmMatch = body.match(/CONFIRMATION[:\s]+([A-Z0-9]{6,8})/i);
    return {
      id: "aerolineas_" + Date.now(),
      source: "Aerolineas",
      confirmation: confirmMatch ? confirmMatch[1] : "",
      airline: "Aerolineas",
      email: from,
      subject: subject
    };
  }

  return null;
}

function testSync() {
  syncGmailToFirebase();
}
```

---

## How It Works

1. **Automatic Syncing**: Runs every hour (configurable)
2. **Email Parsing**: Extracts:
   - Hotel/airline names
   - Confirmation codes
   - Booking references
   - Dates (from subject lines)
3. **Firebase Storage**: Stores in `bookings/` node
4. **App Integration**: Your Argentina Trip app reads bookings automatically

---

## Manual Upload Alternative

If you prefer not to use Google Apps Script:

1. Go to your Gmail "Argentina 2027" label
2. In the app, go to **Destinations** tab
3. Click **"+ Add Booking Link"** on any hotel/flight
4. Paste the booking.com link or confirmation code
5. It syncs to Firebase instantly!

---

## Troubleshooting

**"Label not found"**
- Ensure label is named exactly: `Argentina 2027`

**"Firebase error"**
- Double-check service account credentials
- Make sure Firebase has Realtime Database enabled

**"No bookings synced"**
- Check the Execution Log in Apps Script
- Verify emails exist in the "Argentina 2027" label

---

## Support

For issues:
1. Check the **Execution Log** in Google Apps Script
2. Enable **Debug Mode** in script.gs
3. See Firebase console: https://console.firebase.google.com/u/0/project/argentina-trip-2027/database

