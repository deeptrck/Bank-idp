'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Status = 'passed' | 'review' | 'flagged';

interface DocRow {
  applicant: string;
  document: string;
  confidence: string;
  status: Status;
}

const initialRows: DocRow[] = [
  { applicant: 'J. Kariuki', document: 'National ID', confidence: '96%', status: 'passed' },
  { applicant: 'P. Mwangi', document: 'KRA PIN certificate', confidence: '88%', status: 'passed' },
  { applicant: 'S. Njeri', document: 'National ID', confidence: '61%', status: 'review' },
  { applicant: 'D. Otieno', document: 'Passport', confidence: '74%', status: 'review' },
  { applicant: 'A. Wambui', document: 'Utility bill', confidence: '95%', status: 'passed' },
  { applicant: 'M. Kiptoo', document: 'National ID', confidence: '52%', status: 'flagged' },
];

const statusStyles: Record<Status, { bg: string; text: string; label: string }> = {
  passed: { bg: 'var(--bg-success)', text: 'var(--text-success)', label: 'Passed' },
  review: { bg: 'var(--bg-warning)', text: 'var(--text-warning)', label: 'Needs review' },
  flagged: { bg: 'var(--bg-danger)', text: 'var(--text-danger)', label: 'Fraud risk' },
};

export default function DashboardPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState(initialRows);

  const summary = {
    passed: rows.filter((r) => r.status === 'passed').length,
    review: rows.filter((r) => r.status === 'review').length,
    flagged: rows.filter((r) => r.status === 'flagged').length,
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    const applicantName = selectedFile.name
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const documentLabel = selectedFile.type.startsWith('image/') ? 'Identity document image' : 'Uploaded document';

    const newRow: DocRow = {
      applicant: applicantName || 'New applicant',
      document: documentLabel,
      confidence: 'Pending',
      status: 'review',
    };

    setRows((currentRows) => [newRow, ...currentRows]);
    event.target.value = '';
  };

  return (
    <div className="page-shell">
      <div className="page-inner">
        <h1 className="sr-only">
          KYC document intake dashboard for a Kenyan bank showing uploaded
          onboarding documents with processing status
        </h1>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem',
          }}
        >
          <div>
            <p style={{ fontWeight: 500, fontSize: 18, margin: 0 }}>Onboarding queue</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
              Nairobi branch, {rows.length} documents today
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'var(--bg-accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--text-accent)',
              }}
            >
              BK
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              onChange={handleFileSelection}
              style={{ display: 'none' }}
            />
            <button type="button" onClick={handleUploadClick} style={{ height: 36, padding: '0 16px', fontSize: 14 }}>
              <i
                className="ti ti-upload"
                style={{ fontSize: 16, verticalAlign: -3, marginRight: 6 }}
                aria-hidden="true"
              />
              Upload
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12,
            marginBottom: '1.5rem',
          }}
        >
          <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius)', padding: '1rem' }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 4px' }}>Auto-passed</p>
            <p style={{ fontSize: 24, fontWeight: 500, margin: 0 }}>{summary.passed}</p>
          </div>
          <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius)', padding: '1rem' }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 4px' }}>Needs review</p>
            <p style={{ fontSize: 24, fontWeight: 500, margin: 0, color: 'var(--text-warning)' }}>
              {summary.review}
            </p>
          </div>
          <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius)', padding: '1rem' }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 4px' }}>Flagged fraud risk</p>
            <p style={{ fontSize: 24, fontWeight: 500, margin: 0, color: 'var(--text-danger)' }}>
              {summary.flagged}
            </p>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '8px 4px', color: 'var(--text-secondary)', fontWeight: 400, fontSize: 13, width: '22%' }}>
                Applicant
              </th>
              <th style={{ textAlign: 'left', padding: '8px 4px', color: 'var(--text-secondary)', fontWeight: 400, fontSize: 13, width: '24%' }}>
                Document
              </th>
              <th style={{ textAlign: 'left', padding: '8px 4px', color: 'var(--text-secondary)', fontWeight: 400, fontSize: 13, width: '16%' }}>
                Confidence
              </th>
              <th style={{ textAlign: 'left', padding: '8px 4px', color: 'var(--text-secondary)', fontWeight: 400, fontSize: 13, width: '26%' }}>
                Status
              </th>
              <th style={{ width: '12%' }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = statusStyles[r.status];
              return (
                <tr
                  key={r.applicant}
                  style={{ borderBottom: '0.5px solid var(--border)', cursor: 'pointer' }}
                  onClick={() => router.push(`/review/${encodeURIComponent(r.applicant)}`)}
                >
                  <td style={{ padding: '10px 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.applicant}
                  </td>
                  <td style={{ padding: '10px 4px', color: 'var(--text-secondary)' }}>{r.document}</td>
                  <td style={{ padding: '10px 4px' }}>{r.confidence}</td>
                  <td style={{ padding: '10px 4px' }}>
                    <span
                      style={{
                        background: s.bg,
                        color: s.text,
                        fontSize: 12,
                        padding: '3px 10px',
                        borderRadius: 'var(--radius)',
                      }}
                    >
                      {s.label}
                    </span>
                  </td>
                  <td style={{ padding: '10px 4px', textAlign: 'right' }}>
                    <i className="ti ti-chevron-right" style={{ fontSize: 16, color: 'var(--text-muted)' }} aria-hidden="true" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
