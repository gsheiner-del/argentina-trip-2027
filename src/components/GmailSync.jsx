import React, { useState } from 'react';
import '../styles/GmailSync.css';

export default function GmailSync() {
  const [status, setStatus] = useState('');
  const [copied, setCopied] = useState(false);

  const gmailScriptUrl = 'https://console.firebase.google.com/u/0/project/argentina-trip-2027/database';

  const copyInstructions = () => {
    const instructions = `
Google Apps Script to sync Gmail to Firebase:

1. Go to https://script.google.com
2. Create a New Project
3. Copy and paste the code from GMAIL_SYNC.md in the repository
4. Run the syncGmailToFirebase function
5. Grant permissions when prompted
6. Set up a trigger to run every hour (optional)

Your Gmail folder: Argentina 2027
Supported email services: Booking.com, Expedia, El Al, Aerolineas
    `;
    navigator.clipboard.writeText(instructions);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="gmail-sync-container">
      <h3>📧 Gmail Integration</h3>
      
      <div className="sync-card">
        <h4>Auto-sync Booking Emails</h4>
        <p>Connect your Gmail account to automatically extract booking information from your "Argentina 2027" email folder.</p>
        
        <div className="sync-steps">
          <div className="step">
            <span className="step-num">1</span>
            <p><strong>Set up Google Apps Script</strong> (one-time setup)</p>
          </div>
          <div className="step">
            <span className="step-num">2</span>
            <p><strong>Configure Firebase credentials</strong></p>
          </div>
          <div className="step">
            <span className="step-num">3</span>
            <p><strong>Run hourly syncs</strong> to pull booking data</p>
          </div>
        </div>

        <div className="sync-actions">
          <button 
            onClick={copyInstructions}
            className="sync-btn"
          >
            {copied ? '✓ Copied!' : '📋 Copy Setup Instructions'}
          </button>
          <a 
            href="https://github.com/gsheiner-del/argentina-trip-2027/blob/main/GMAIL_SYNC.md"
            target="_blank"
            rel="noopener noreferrer"
            className="docs-link"
          >
            📖 Full Documentation
          </a>
        </div>

        <div className="supported-services">
          <p><strong>Supported Services:</strong></p>
          <ul>
            <li>✅ Booking.com</li>
            <li>✅ Expedia</li>
            <li>✅ El Al Airlines</li>
            <li>✅ Aerolineas Argentinas</li>
            <li>✅ Hotel confirmation emails</li>
          </ul>
        </div>

        <div className="manual-alternative">
          <p><strong>Alternative:</strong> Manually add booking links in the Destinations tab</p>
        </div>
      </div>
    </div>
  );
}
