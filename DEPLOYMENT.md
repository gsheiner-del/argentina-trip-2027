# Argentina Trip 2027 - Deployment Guide

## Step 1: GitHub Setup

1. Create a GitHub account: https://github.com/signup
2. Create a new repository named: `argentina-trip-2027`
3. Clone the repository locally
4. Copy all the files from `src/`, `package.json`, `index.html`, `vite.config.js` to your repo
5. Run:
```bash
git add .
git commit -m "Initial Argentina trip app"
git push origin main
```

## Step 2: Vercel Deployment

1. Go to: https://vercel.com/signup
2. Sign up with GitHub
3. Click "New Project"
4. Select `argentina-trip-2027` repository
5. Environment Variables:
   - Add your Firebase config as environment variables
   - Or they're already in `firebase.js`
6. Click "Deploy"

## Step 3: Initialize Firebase Database

1. Go to Firebase Console: https://console.firebase.google.com/u/0/project/argentina-trip-2027/database
2. Click on Realtime Database
3. Import the initial data structure (see below)

## Initial Trip Data Structure

Click "Import JSON" in Firebase Realtime Database and paste:

```json
{
  "trip": {
    "destinations": [
      {
        "id": "ba1",
        "name": "Buenos Aires (Arrival)",
        "emoji": "🏙️",
        "dates": "March 8-9, 2027",
        "description": "1 night arrival",
        "hotels": [
          {
            "id": "ba1_gran",
            "name": "Gran Departamento",
            "description": "1 three-bedroom apartment",
            "status": "Pending selection"
          }
        ],
        "flights": [
          {
            "number": "LY41",
            "airline": "El Al",
            "from": "TLV",
            "to": "EZE",
            "departure": "Mar 7, 18:15",
            "arrival": "Mar 8, 05:40",
            "status": "Not booked"
          }
        ],
        "activities": [],
        "nearby": [
          {
            "icon": "🍴",
            "name": "Don Julio",
            "category": "Steakhouse",
            "distance": "1.2 km",
            "description": "Renowned steakhouse",
            "rating": "4.7"
          }
        ]
      }
    ],
    "budget": {
      "internationalFlights": "TBD",
      "domesticFlights": "USD 4,170",
      "hotels": "USD 2,408",
      "transport": "USD 710",
      "activities": "USD 2,900+",
      "meals": "USD 1,500",
      "other": "USD 300",
      "total": "USD 12,000 - 15,000"
    }
  }
}
```

## Step 4: Generate Sharing Links

Once deployed, share these links with your family:

- **You (Edit access):** `https://argentina-trip-2027.vercel.app/?user=you`
- **Marina (Edit access):** `https://argentina-trip-2027.vercel.app/?user=marina`
- **Michelle (View-only):** `https://argentina-trip-2027.vercel.app/?user=michelle`
- **Gilad (View-only):** `https://argentina-trip-2027.vercel.app/?user=gilad`
- **Ori (View-only):** `https://argentina-trip-2027.vercel.app/?user=ori`

## Step 5: Set Firebase Security Rules

In Firebase Console → Realtime Database → Rules:

```json
{
  "rules": {
    "trip": {
      ".read": true,
      ".write": "root.child('editors').child(auth.uid).val() === true"
    }
  }
}
```

## Features Included

✅ Route map with all destinations
✅ Destination detail pages with sub-tabs
✅ Budget tracker
✅ Real-time sync across all 5 users
✅ Edit/view access control
✅ Nearby recommendations
✅ Responsive mobile design
✅ Offline support

## Testing Locally

```bash
npm install
npm run dev
```

Then visit `http://localhost:3000/?user=you`

## Support

For Firebase issues: https://console.firebase.google.com
For Vercel issues: https://vercel.com/support
