import React, { useState } from 'react';
import '../styles/CostTracker.css';

export default function CostTracker({ destination, userRole, onUpdateCosts }) {
  const [costs, setCosts] = useState(destination?.costs || {
    groundTransport: [],
    meals: [],
    activities: [],
    other: []
  });
  const [editingCategory, setEditingCategory] = useState(null);
  const [newItem, setNewItem] = useState('');
  const [newCost, setNewCost] = useState('');

  const handleAddItem = (category) => {
    if (!newItem.trim()) return;
    const updated = {
      ...costs,
      [category]: [...(costs[category] || []), { item: newItem, estimatedCost: newCost || 'TBD' }]
    };
    setCosts(updated);
    onUpdateCosts?.(destination.id, updated);
    setNewItem('');
    setNewCost('');
    setEditingCategory(null);
  };

  const handleRemoveItem = (category, index) => {
    const updated = {
      ...costs,
      [category]: costs[category].filter((_, i) => i !== index)
    };
    setCosts(updated);
    onUpdateCosts?.(destination.id, updated);
  };

  const handleUpdateCost = (category, index, newCostValue) => {
    const updated = {
      ...costs,
      [category]: costs[category].map((item, i) => i === index ? { ...item, estimatedCost: newCostValue } : item)
    };
    setCosts(updated);
    onUpdateCosts?.(destination.id, updated);
  };

  const categories = [
    { key: 'groundTransport', label: '🚗 Ground Transportation' },
    { key: 'meals', label: '🍽️ Meals & Dining' },
    { key: 'activities', label: '🎭 Activities' },
    { key: 'other', label: '📋 Other' }
  ];

  return (
    <div className="cost-tracker">
      <p style={{ color: '#596c80', fontSize: 12, lineHeight: 1.5 }}>
        Amounts are USD unless you specify ARS or ILS (e.g. "ARS 5000").
        Unpriced entries may be marked TBD. Converted totals use the live rates shown on Budget.
      </p>
      {categories.map(cat => (
        <div key={cat.key} className="cost-category">
          <h4>{cat.label}</h4>
          <div className="cost-items">
            {costs[cat.key]?.map((item, idx) => (
              <div key={idx} className="cost-item">
                <span className="item-name">{item.item}</span>
                {userRole === 'edit' ? (
                  <input
                    type="text"
                    className="cost-input"
                    value={item.estimatedCost}
                    onChange={(e) => handleUpdateCost(cat.key, idx, e.target.value)}
                    placeholder="USD 0 / ARS 5000 / TBD"
                  />
                ) : (
                  <span className="cost-value">{item.estimatedCost}</span>
                )}
                {userRole === 'edit' && (
                  <button onClick={() => handleRemoveItem(cat.key, idx)} className="remove-btn">✕</button>
                )}
              </div>
            ))}
          </div>
          {userRole === 'edit' && (
            <div className="add-item">
              {editingCategory === cat.key ? (
                <div className="input-group">
                  <input
                    type="text"
                    placeholder="Item description"
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="USD 0 / ARS 5000 / TBD"
                    value={newCost}
                    onChange={(e) => setNewCost(e.target.value)}
                  />
                  <button onClick={() => handleAddItem(cat.key)}>Add</button>
                  <button onClick={() => setEditingCategory(null)}>Cancel</button>
                </div>
              ) : (
                <button onClick={() => setEditingCategory(cat.key)} className="add-btn">+ Add Item</button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
