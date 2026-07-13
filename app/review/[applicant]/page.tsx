'use client';

import { useRouter } from 'next/navigation';

export default function ReviewPage({ params }: { params: { applicant: string } }) {
  const router = useRouter();
  const applicant = decodeURIComponent(params.applicant);

  return (
    <div className="page-shell">
      <div className="page-inner">
        <button
          onClick={() => router.push('/dashboard')}
          style={{
            background: 'transparent',
            color: 'var(--text-secondary)',
            padding: 0,
            marginBottom: '1.5rem',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <i className="ti ti-arrow-left" aria-hidden="true" />
          Back to queue
        </button>

        <div
          style={{
            background: 'var(--surface-1)',
            border: '0.5px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '1.5rem',
          }}
        >
          <p style={{ fontWeight: 500, fontSize: 18, margin: '0 0 4px' }}>{applicant}</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 1.5rem' }}>
            Document review
          </p>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            This is a placeholder review screen. Wire this up to your real
            document viewer, extracted fields, and approve/reject actions.
          </p>
        </div>
      </div>
    </div>
  );
}
