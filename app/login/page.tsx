'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Wire this up to your real auth flow (Clerk, NextAuth, etc).
    router.push('/dashboard');
  }

  return (
    <div className="page-shell">
      <div className="page-inner">
        <h1 className="sr-only">
          Login screen for a Kenyan bank&apos;s intelligent document processing
          system, showing staff email and password fields
        </h1>

        <div className="login-card">
          <div className="login-brand">
            <div className="brand-badge">
              <img src="/logo-light.ico" alt="Deeptrack logo" width={44} height={44} />
            </div>
            <p className="brand-title">Deeptrack Bank IDP</p>
            <p className="brand-subtitle">Secure KYC document intake</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <label
              style={{
                fontSize: 13,
                color: 'var(--text-secondary)',
                display: 'block',
                marginBottom: 4,
              }}
              htmlFor="email"
            >
              Staff email
            </label>
            <input
              id="email"
              type="email"
              placeholder="name@bank.co.ke"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', marginBottom: 12 }}
              required
            />

            <label
              style={{
                fontSize: 13,
                color: 'var(--text-secondary)',
                display: 'block',
                marginBottom: 4,
              }}
              htmlFor="password"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', marginBottom: 6 }}
              required
            />

            <div style={{ textAlign: 'right', marginBottom: 16 }}>
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--text-accent)',
                  cursor: 'pointer',
                }}
              >
                Forgot password
              </span>
            </div>

            <button type="submit" className="login-button">
              Sign in
            </button>
          </form>

          <p className="login-footnote">Branch and compliance staff only</p>
        </div>
      </div>
    </div>
  );
}
