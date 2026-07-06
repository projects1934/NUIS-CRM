import { useState, useEffect, useRef } from 'react';
import { apiJson } from '../api';

const TAG_COLORS = ['#1a56db', '#057a55', '#c81e1e', '#5521b5', '#b45309', '#0694a2', '#374151'];

export default function TagInput({ value = [], onChange }) {
  const [inputVal, setInputVal] = useState('');
  const [allTags, setAllTags] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    apiJson('/tags').then(setAllTags).catch(() => {});
  }, []);

  useEffect(() => {
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectedIds = new Set(value.map((t) => t.id));

  const filtered = allTags.filter(
    (t) => !selectedIds.has(t.id) && t.label.includes(inputVal)
  );

  const addTag = async (tag) => {
    if (selectedIds.has(tag.id)) return;
    onChange([...value, tag]);
    setInputVal('');
    setShowDropdown(false);
  };

  const createAndAdd = async () => {
    const label = inputVal.trim();
    if (!label) return;
    const existing = allTags.find((t) => t.label === label);
    if (existing) { addTag(existing); return; }
    const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
    try {
      const newTag = await apiJson('/tags', {
        method: 'POST',
        body: JSON.stringify({ label, color }),
      });
      setAllTags((prev) => [...prev, newTag]);
      addTag(newTag);
    } catch {
      addTag({ id: `tmp-${Date.now()}`, label, color });
    }
  };

  const removeTag = (id) => onChange(value.filter((t) => t.id !== id));

  return (
    <div ref={wrapperRef} className="tag-input-wrapper">
      <div className="tag-chips" style={{ marginBottom: value.length ? '8px' : 0 }}>
        {value.map((tag) => (
          <span key={tag.id} className="tag-chip" style={{ background: tag.color || '#1a56db' }}>
            {tag.label}
            <button
              type="button"
              className="tag-chip-remove"
              onClick={() => removeTag(tag.id)}
              aria-label={`הסר תגית ${tag.label}`}
            >×</button>
          </span>
        ))}
      </div>
      <input
        className="form-control"
        type="text"
        placeholder="הוסף תגית..."
        value={inputVal}
        onChange={(e) => { setInputVal(e.target.value); setShowDropdown(true); }}
        onFocus={() => setShowDropdown(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); createAndAdd(); }
          if (e.key === 'Escape') setShowDropdown(false);
        }}
      />
      {showDropdown && (filtered.length > 0 || inputVal.trim()) && (
        <div className="tag-autocomplete">
          {filtered.map((tag) => (
            <div
              key={tag.id}
              className="tag-autocomplete-item"
              onMouseDown={() => addTag(tag)}
            >
              <span className="tag-color-dot" style={{ background: tag.color || '#1a56db' }} />
              {tag.label}
            </div>
          ))}
          {inputVal.trim() && !allTags.find((t) => t.label === inputVal.trim()) && (
            <div
              className="tag-autocomplete-item"
              style={{ color: 'var(--primary-color)', fontWeight: 600 }}
              onMouseDown={createAndAdd}
            >
              + צור תגית "{inputVal.trim()}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}
