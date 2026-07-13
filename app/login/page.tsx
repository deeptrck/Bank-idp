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
      <div style={{ width: '100%', maxWidth: 480 }}>
        <h1 className="sr-only">
          Login screen for a Kenyan bank&apos;s intelligent document processing
          system, showing staff email and password fields
        </h1>
        <div
          style={{
            background: 'var(--surface-1)',
            borderRadius: 12,
            padding: '3rem 1rem',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              background: 'var(--surface-2)',
              border: '0.5px solid var(--border)',
              borderRadius: 12,
              padding: '2rem 2rem 1.5rem',
              width: 320,
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 'var(--radius)',
                  background: 'var(--bg-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px',
                }}
              >
                <i
                  className="ti ti-building-bank"
                  style={{ fontSize: 20, color: 'var(--text-accent)' }}
                  aria-hidden="true"
                />
              </div>
              <p style={{ fontWeight: 500, fontSize: 16, margin: 0 }}>
                KYC document intake
              </p>
              <p
                style={{
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  margin: '4px 0 0',
                }}
              >
                Sentinel IDP, powered by Deeptrack
              </p>
            </div>

            <form onSubmit={handleSubmit}>
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

              <button
                type="submit"
                style={{
                  width: '100%',
                  height: 36,
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                Sign in
              </button>
            </form>

            <p
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                textAlign: 'center',
                margin: '16px 0 0',
              }}
            >
              Branch and compliance staff only
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
