/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useRef, useEffect } from 'react';
import { Edit2 } from 'lucide-react';

export default function InlineEdit({ 
  value, 
  onSave, 
  type = 'text', 
  options = [], 
  placeholder = 'לא הוגדר',
  renderValue = null
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState('');
  const inputRef = useRef(null);

  // Format number with commas
  const formatCurrency = (val) => {
    if (!val) return '';
    const num = val.toString().replace(/,/g, '');
    if (isNaN(num)) return val;
    return Number(num).toLocaleString('en-US');
  };

  useEffect(() => {
    if (type === 'currency') {
      setTempValue(formatCurrency(value));
    } else {
      setTempValue(value || '');
    }
  }, [value, type]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleSave = () => {
    let finalValue = tempValue;
    if (type === 'currency') {
      finalValue = tempValue.toString().replace(/,/g, '');
    }
    
    // Only save if changed
    const originalComparable = type === 'currency' ? (value || '').toString() : (value || '');
    if (finalValue !== originalComparable) {
      onSave(finalValue);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && type !== 'textarea') {
      inputRef.current?.blur(); // Triggers handleSave via onBlur
    }
    if (e.key === 'Escape') {
      // Revert
      if (type === 'currency') {
        setTempValue(formatCurrency(value));
      } else {
        setTempValue(value || '');
      }
      setIsEditing(false);
    }
  };

  const handleChange = (e) => {
    if (type === 'currency') {
      const raw = e.target.value.replace(/,/g, '');
      if (!isNaN(raw) || raw === '') {
        setTempValue(formatCurrency(raw));
      }
    } else {
      setTempValue(e.target.value);
    }
  };

  if (isEditing) {
    return (
      <div className="inline-edit-container">
        {type === 'select' ? (
          <select
            ref={inputRef}
            className="form-control"
            value={tempValue}
            onChange={(e) => {
              const next = e.target.value;
              setTempValue(next);
              if (next !== (value || '')) onSave(next);
              setIsEditing(false);
            }}
            onBlur={() => setIsEditing(false)}
            onKeyDown={handleKeyDown}
            style={{ padding: '6px 8px', fontSize: '0.95rem', height: 'auto', minHeight: '32px' }}
          >
            <option value="">לא מוגדר</option>
            {options.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        ) : type === 'textarea' ? (
          <textarea
            ref={inputRef}
            className="form-control" 
            value={tempValue} 
            onChange={handleChange}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            rows="3"
            style={{ padding: '6px 8px', fontSize: '0.95rem' }}
          />
        ) : (
          <input
            ref={inputRef}
            type={type === 'currency' ? 'text' : type}
            className="form-control"
            value={tempValue}
            onChange={handleChange}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            style={{ padding: '6px 8px', fontSize: '0.95rem', height: '32px' }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="inline-edit-view" onClick={() => setIsEditing(true)}>
      <span className="inline-edit-text">{renderValue ? renderValue(value) : (value || <span style={{ color: 'var(--text-secondary)' }}>{placeholder}</span>)}</span>
      <span className="edit-icon"><Edit2 size={14} /></span>
    </div>
  );
}
