import React from 'react';

const CSUpdateForm = React.memo(({
  mode = 'all',
  localDiscount,
  setLocalDiscount,
  shippingFee,
  setShippingFee,
  courierFee,
  setCourierFee,
  onCourierFeeBlur,
  localNotes,
  setLocalNotes
}) => {
  const handleNumericChange = (setter) => (e) => {
    const val = e.target.value;
    if (val === '' || /^\d*\.?\d*$/.test(val)) {
      setter(val);
    }
  };

  const rowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '0.84rem',
    color: 'var(--text-secondary)'
  };

  const renderInputs = () => (
    <>
      <div style={rowStyle}>
        <span>CS Discount</span>
        <input
          type="text"
          inputMode="decimal"
          className="cs-update-input"
          value={localDiscount}
          onChange={handleNumericChange(setLocalDiscount)}
        />
      </div>

      <div style={rowStyle}>
        <span title="Shipping fee charged to the customer (adds to Revenue)">Shipping Fee (Customer)</span>
        <input
          type="text"
          inputMode="decimal"
          className="cs-update-input"
          value={shippingFee}
          onChange={handleNumericChange(setShippingFee)}
        />
      </div>

      <div style={rowStyle}>
        <span title="Actual cost billed by the courier service (subtracts from Net Profit)">
          Courier Expense 📦
        </span>
        <input
          type="text"
          inputMode="decimal"
          className="cs-update-input-blue"
          value={courierFee}
          onChange={handleNumericChange(setCourierFee)}
          onBlur={onCourierFeeBlur}
        />
      </div>
    </>
  );

  const renderNotes = () => (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 2 }}>
      <label className="eom-label">Internal CS Notes (ERP Only)</label>
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
