/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react';
import { Search, Info, AlertTriangle } from 'lucide-react';
import { apiJson } from './api';

export default function MergeModal({ isOpen, onClose, onMerge, currentPartnerId, currentPartnerName }) {
  const [partners, setPartners] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPartnerId, setSelectedPartnerId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSelectedPartnerId(null);
      setLoading(true);
      apiJson('/partners')
        .then(data => {
          // Filter out the current partner from the list of merge targets
          setPartners(data.filter(p => p.id !== currentPartnerId));
          setLoading(false);
        });
    }
  }, [isOpen, currentPartnerId]);

  if (!isOpen) return null;

  const filteredPartners = partners.filter(p => 
    p.organizationName && p.organizationName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedPartner = partners.find(p => p.id === selectedPartnerId);

  const handleMerge = () => {
    if (!selectedPartnerId) return;
    onMerge(selectedPartnerId);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h2>מיזוג שותף חופף</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
        </div>
        
        <div className="modal-body">
          <div style={{ background: 'var(--neutral-bg)', padding: '16px', borderRadius: 'var(--radius-md)', marginBottom: '24px', display: 'flex', gap: '12px' }}>
            <Info size={24} color="var(--primary-color)" style={{ flexShrink: 0 }} />
            <div>
              <p style={{ margin: 0 }}>
                מיזוג יעביר את <strong>כל אנשי הקשר</strong> ו<strong>תיעוד השיחות</strong> מ- <strong>{currentPartnerName}</strong> לארגון שתבחר מהרשימה מטה. לאחר המיזוג, הארגון הנוכחי יימחק.
              </p>
            </div>
          </div>

          <div style={{ position: 'relative', marginBottom: '16px' }}>
            <Search size={18} color="var(--text-secondary)" style={{ position: 'absolute', right: '12px', top: '12px' }} />
            <input 
              type="text" 
              className="form-control" 
              placeholder="חפש את ארגון היעד שאליו תרצה למזג..." 
              style={{ paddingRight: '40px' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div style={{ 
            maxHeight: '250px', 
            overflowY: 'auto', 
            border: '1px solid var(--border-color)', 
            borderRadius: 'var(--radius-sm)',
            marginBottom: '24px'
          }}>
            {loading ? (
              <div style={{ padding: '16px', textAlign: 'center' }}>טוען רשימת שותפים...</div>
            ) : filteredPartners.length > 0 ? (
              filteredPartners.map(p => (
                <div 
                  key={p.id}
                  onClick={() => setSelectedPartnerId(p.id)}
                  style={{ 
                    padding: '12px 16px', 
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border-color)',
                    background: selectedPartnerId === p.id ? 'var(--economic-bg)' : 'transparent',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <span style={{ fontWeight: selectedPartnerId === p.id ? 'bold' : 'normal' }}>{p.organizationName}</span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    מקורות: {(p.sourceFiles || []).join(', ')}
                  </span>
                </div>
              ))
            ) : (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)' }}>לא נמצאו שותפים התואמים לחיפוש.</div>
            )}
          </div>

          {selectedPartner && (
            <div style={{ background: 'var(--danger-bg)', color: 'var(--danger-text)', padding: '16px', borderRadius: 'var(--radius-md)', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <AlertTriangle size={24} style={{ flexShrink: 0 }} />
              <div>
                <strong>אזהרה:</strong> פעולה זו אינה הפיכה! אתה עומד למזג את <strong>{currentPartnerName}</strong> לתוך <strong>{selectedPartner.organizationName}</strong>.
              </div>
            </div>
          )}

        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>ביטול</button>
          <button 
            className="btn btn-primary" 
            onClick={handleMerge}
            disabled={!selectedPartnerId}
            style={{ background: !selectedPartnerId ? 'var(--neutral-color)' : 'var(--danger-color)', borderColor: 'transparent' }}
          >
            אשר ומזג כעת
          </button>
        </div>
      </div>
    </div>
  );
}
