import React from 'react';

const CSUpdateForm = React.memo(({
  mode = 'all',
  localDiscount,
  setLocalDiscount,
  shippingFee,
  setShippingFee,
  courierFee,
  setCourierFee,
  localNotes,
  setLocalNotes
}) => {
  const renderInputs = () => (
    <>
      <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8', alignItems: 'center' }}>
        <span>CS Discount</span>
        <input 
          type="number"
          className="cs-update-input"
          value={localDiscount}
          onChange={e => setLocalDiscount(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8', alignItems: 'center' }}>
        <span title="Shipping fee charged to the customer (adds to Revenue)">Shipping Fee (Customer)</span>
        <input 
          type="number"
          className="cs-update-input"
          value={shippingFee}
          onChange={e => setShippingFee(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8', alignItems: 'center' }}>
        <span title="Actual cost billed by the courier service (subtracts from Profit)">
          Courier Expense 📦
        </span>
        <input 
          type="number"
          className="cs-update-input-blue"
          value={courierFee}
          onChange={e => setCourierFee(e.target.value)}
        />
      </div>
    </>
  );

  const renderNotes = () => (
    <div style={{ borderTop: '1px solid #334155', paddingTop: 16, marginTop: 4 }}>
      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>INTERNAL CS NOTES (ERP ONLY)</label>
      <textarea 
        rows={3}
        className="cs-update-notes-textarea"
        value={localNotes}
        onChange={e => setLocalNotes(e.target.value)}
        placeholder="Why was this order edited? e.g. Customer changed size, or item was out of stock."
      />
    </div>
  );

  if (mode === 'inputs') return renderInputs();
  if (mode === 'notes') return renderNotes();

  return (
    <>
      {renderInputs()}
      {renderNotes()}
    </>
  );
});

CSUpdateForm.displayName = 'CSUpdateForm';

export default CSUpdateForm;
