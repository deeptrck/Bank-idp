'use client';

import { useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type Status = 'passed' | 'review' | 'flagged' | 'processing';

interface DocRow {
  id: string;
  applicant: string;
  document: string;
  confidence: string;
  status: Status;
  processed_at?: string;
  raw: any;
}

const statusStyles: Record<Status, { bg: string; text: string; label: string }> = {
  passed: { bg: 'var(--bg-success)', text: 'var(--text-success)', label: 'Passed' },
  review: { bg: 'var(--bg-warning)', text: 'var(--text-warning)', label: 'Needs review' },
  flagged: { bg: 'var(--bg-danger)', text: 'var(--text-danger)', label: 'Fraud risk' },
  processing: { bg: 'var(--border)', text: 'var(--text-secondary)', label: 'Processing...' },
};

export default function DashboardPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Initialize and load queue from sessionStorage
  useEffect(() => {
    async function loadQueue() {
      try {
        setLoading(true);
        const cached = sessionStorage.getItem('bank_idp_queue');
        if (cached) {
          setRows(JSON.parse(cached));
        } else {
          // Fetch default seed documents from API
          const response = await fetch('/api/documents');
          if (response.ok) {
            const data = await response.json();
            setRows(data);
            sessionStorage.setItem('bank_idp_queue', JSON.stringify(data));
          }
        }
      } catch (error) {
        console.error('Error loading queue:', error);
      } finally {
        setLoading(false);
      }
    }
    loadQueue();
  }, []);

  const summary = {
    passed: rows.filter((r) => r.status === 'passed').length,
    review: rows.filter((r) => r.status === 'review').length,
    flagged: rows.filter((r) => r.status === 'flagged').length,
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    const applicantName = selectedFile.name
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const documentLabel = selectedFile.name.endsWith('.pdf') ? 'Invoice (PDF)' : 'Invoice (DOCX)';

    // Add temporary processing row to top of the table
    const tempId = `temp-${Date.now()}`;
    const processingRow: DocRow = {
      id: tempId,
      applicant: applicantName || 'New applicant',
      document: documentLabel,
      confidence: '...',
      status: 'processing',
      raw: null
    };

    setRows((currentRows) => [processingRow, ...currentRows]);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('category', 'financial');

      const response = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Processing failed');
      }

      const result = await response.json();
      
      // Update state and sessionStorage
      setRows((currentRows) => {
        const updated = currentRows.map(row => row.id === tempId ? result : row);
        sessionStorage.setItem('bank_idp_queue', JSON.stringify(updated));
        return updated;
      });
    } catch (err: any) {
      console.error('Upload and processing error:', err);
      // Update row to show flagged/error
      setRows((currentRows) => {
        const updated = currentRows.map(row => row.id === tempId ? {
          ...row,
          status: 'flagged' as Status,
          confidence: 'Error'
        } : row);
        sessionStorage.setItem('bank_idp_queue', JSON.stringify(updated));
        return updated;
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="page-shell">
      <div className="page-inner" style={{ flexDirection: 'column' }}>
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
            width: '100%'
          }}
        >
          <div>
            <p style={{ fontWeight: 600, fontSize: 20, margin: 0 }}>Onboarding Queue </p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
              Nairobi Branch • {rows.length} documents total
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: 'var(--bg-accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-accent)',
                border: '1px solid var(--border)'
              }}
            >
              BK
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx"
              onChange={handleFileSelection}
              style={{ display: 'none' }}
              disabled={uploading}
            />
            <button 
              type="button" 
              onClick={handleUploadClick} 
              disabled={uploading}
              style={{ 
                height: 38, 
                padding: '0 16px', 
                fontSize: 14,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              {uploading ? (
                <>
                  <div className="btn-spinner" />
                  Processing...
                </>
              ) : (
                <>
                  <i className="ti ti-upload" style={{ fontSize: 16 }} />
                  Upload Document
                </>
              )}
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 16,
            marginBottom: '1.5rem',
            width: '100%'
          }}
        >
          <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius)', padding: '1.25rem', border: '0.5px solid var(--border)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.01)' }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 4px', fontWeight: 500 }}>Auto-passed</p>
            <p style={{ fontSize: 28, fontWeight: 700, margin: 0, color: 'var(--text-success)' }}>
              {loading ? '...' : summary.passed}
            </p>
          </div>
          <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius)', padding: '1.25rem', border: '0.5px solid var(--border)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.01)' }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 4px', fontWeight: 500 }}>Needs review</p>
            <p style={{ fontSize: 28, fontWeight: 700, margin: 0, color: 'var(--text-warning)' }}>
              {loading ? '...' : summary.review}
            </p>
          </div>
          <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius)', padding: '1.25rem', border: '0.5px solid var(--border)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.01)' }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 4px', fontWeight: 500 }}>Flagged risk</p>
            <p style={{ fontSize: 28, fontWeight: 700, margin: 0, color: 'var(--text-danger)' }}>
              {loading ? '...' : summary.flagged}
            </p>
          </div>
        </div>

        {/* Documents Table */}
        <div style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius)', padding: '1rem', border: '0.5px solid var(--border)', width: '100%', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)' }}>
          {loading && rows.length === 0 ? (
            <div style={{ padding: '3rem 0', textAlign: 'center' }}>
              <div className="spinner" style={{ margin: '0 auto 1rem' }} />
              <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Loading onboarding documents...</p>
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: '4rem 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <i className="ti ti-folder-off" style={{ fontSize: 32, marginBottom: 12, display: 'block', color: 'var(--text-muted)' }} />
              <p style={{ fontWeight: 500, margin: 0 }}>No documents in queue</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>Upload a PDF or DOCX invoice to start</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: 13, width: '30%' }}>
                    Applicant
                  </th>
                  <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: 13, width: '25%' }}>
                    Document Type
                  </th>
                  <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: 13, width: '15%' }}>
                    Confidence
                  </th>
                  <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: 13, width: '20%' }}>
                    Status
                  </th>
                  <th style={{ width: '10%' }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const s = statusStyles[r.status] || statusStyles.review;
                  const isProcessing = r.status === 'processing';
                  return (
                    <tr
                      key={r.id}
                      className="table-row"
                      style={{ 
                        borderBottom: '0.5px solid var(--border)', 
                        cursor: isProcessing ? 'not-allowed' : 'pointer',
                        transition: 'background 150ms ease'
                      }}
                      onClick={() => !isProcessing && router.push(`/review/${encodeURIComponent(r.id)}`)}
                    >
                      <td style={{ padding: '14px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                        {r.applicant}
                      </td>
                      <td style={{ padding: '14px 8px', color: 'var(--text-secondary)' }}>{r.document}</td>
                      <td style={{ padding: '14px 8px', fontWeight: 600 }}>{r.confidence}</td>
                      <td style={{ padding: '14px 8px' }}>
                        <span
                          style={{
                            background: s.bg,
                            color: s.text,
                            fontSize: 12,
                            padding: '4px 10px',
                            borderRadius: 'var(--radius)',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          {isProcessing && <div className="btn-spinner" style={{ width: 10, height: 10, border: '2px solid var(--text-secondary)', borderTopColor: 'transparent' }} />}
                          {s.label}
                        </span>
                      </td>
                      <td style={{ padding: '14px 8px', textAlign: 'right' }}>
                        {!isProcessing && (
                          <i className="ti ti-chevron-right" style={{ fontSize: 16, color: 'var(--text-muted)' }} aria-hidden="true" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <style jsx global>{`
        .table-row:hover {
          background-color: var(--surface-2);
        }
        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid var(--border);
          border-top: 3px solid var(--text-accent);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        .btn-spinner {
          width: 14px;
          height: 14px;
          border: 2.5px solid rgba(255,255,255,0.3);
          border-top: 2.5px solid white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
