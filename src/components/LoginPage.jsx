import React, { useState } from 'react';
import { signInWithPopup, googleProvider } from '../firebase';
import '../styles/LoginPage.css';

export default function LoginPage({ auth, onLoginSuccess }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      onLoginSuccess(user);
    } catch (err) {
      setError('Sign-in failed: ' + err.message);
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <h1>🇦🇷 Argentina Trip 2027</h1>
        <p className="subtitle">Collaborative Trip Planner</p>

        <div className="login-card">
          <h2>Sign In</h2>
          <p className="welcome">Welcome! Sign in with your Google account to access the trip planner.</p>

          <button
            className="google-signin-btn"
            onClick={handleGoogleSignIn}
            disabled={loading}
          >
            {loading ? '⏳ Signing in...' : '🔐 Sign in with Google'}
          </button>

          {error && <div className="error-message">{error}</div>}

          <div className="info">
            <p>✅ Only authorized family members can access this app</p>
            <p>📍 Changes sync in real-time across all devices</p>
            <p>🔒 Your data is secure with Firebase</p>
          </div>
        </div>

        <footer className="login-footer">
          <p>Argentina Trip Planner • For family use only</p>
        </footer>
      </div>
    </div>
  );
}
