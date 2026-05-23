const fs = require('fs');
const file = '/Users/umairrasheed/Desktop/antigravity/trace-erp/frontend/src/components/OrderTable.jsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('const OrderRow = React.memo(')) {
  const rowStart = content.indexOf('<tr key={o.id}');
  const rowEnd = content.indexOf('</tr>\n              )\n            })');
  if (rowStart !== -1 && rowEnd !== -1) {
    const rowContent = content.substring(rowStart, rowEnd + 5);
    
    const memoComponent = `
const OrderRow = React.memo(({ 
  o, cols, isSelected, currentIndex, lastSelectedIndex, setSelectedIds, setLastSelectedIndex, filteredOrdersLength,
  filteredOrdersIds, fetchOrderDetails, onViewHistory, bookingId, handleConfirmOrder, handleRevertConfirm, handleBookPostEx,
  handleCancelBooking, handleBookInstaworld, formatCustomerName, waTemplates, allOrdersCount, getPhoneOrderCount,
  setCustomerHistoryPhone, updateOrderField, canSeeFinancials, activeTooltipOrderId, setActiveTooltipOrderId,
  fetchBreakdown, user, statusUpdatingId, handleManualStatusChange, ERP_STATUSES, getStatusColor,
  activeShopDomain
}) => {
  const diff = (parseFloat(o.price)||0) - (parseFloat(o.paid_amount)||0);
  const isClear = Math.abs(diff) <= 1;
  const { bg, color } = getStatusColor(o.delivery_status);
  const s = (o.delivery_status||'').toLowerCase();
  const orderDate = o.order_date ? new Date(o.order_date) : null;
  const today = new Date(); today.setHours(0,0,0,0);
  const daysOld = orderDate ? Math.floor((today-orderDate)/86400000) : 0;
  const isPending = !s.includes('delivered') && !s.includes('return') && !s.includes('cancel');
  const dateAged = isPending && daysOld >= 5;

  return (
    ${rowContent.replace(/selectedIds\.includes\(o\.id\)/g, 'isSelected')
                .replace(/filteredOrders\.findIndex[^\n]+/g, 'currentIndex;')
                .replace(/const start = Math\.min\(currentIndex, lastSelectedIndex\)/, 'const start = Math.min(currentIndex, lastSelectedIndex)')
                .replace(/filteredOrders\.slice\(start, end \+ 1\)\.map\(order => order\.id\)/, 'filteredOrdersIds.slice(start, end + 1)')
                .replace(/const count = allOrders\.filter[^\n]+/, 'const count = getPhoneOrderCount(o.phone)')
                .replace(/localStorage\.getItem\('trace_active_shop'\)/g, 'activeShopDomain')
    }
  );
}, (prev, next) => {
  // Custom equality check for fast rendering
  return prev.o.id === next.o.id &&
         prev.o.delivery_status === next.o.delivery_status &&
         prev.o.tracking_number === next.o.tracking_number &&
         prev.isSelected === next.isSelected &&
         prev.statusUpdatingId === next.statusUpdatingId &&
         prev.bookingId === next.bookingId &&
         prev.activeTooltipOrderId === next.activeTooltipOrderId &&
         prev.cols === next.cols;
});
`;
    const mapBody = `
              return (
                <OrderRow 
                  key={o.id} o={o} cols={cols}
                  isSelected={selectedIds.includes(o.id)}
                  currentIndex={index}
                  lastSelectedIndex={lastSelectedIndex} setSelectedIds={setSelectedIds} setLastSelectedIndex={setLastSelectedIndex}
                  filteredOrdersLength={filteredOrders.length}
                  filteredOrdersIds={filteredOrders.map(x=>x.id)}
                  fetchOrderDetails={fetchOrderDetails} onViewHistory={onViewHistory} bookingId={bookingId}
                  handleConfirmOrder={handleConfirmOrder} handleRevertConfirm={handleRevertConfirm}
                  handleBookPostEx={handleBookPostEx} handleCancelBooking={handleCancelBooking} handleBookInstaworld={handleBookInstaworld}
                  formatCustomerName={formatCustomerName} waTemplates={waTemplates} allOrdersCount={allOrders.length}
                  getPhoneOrderCount={(phone) => allOrders.filter(order => order.phone === phone).length}
                  setCustomerHistoryPhone={setCustomerHistoryPhone} updateOrderField={updateOrderField}
                  canSeeFinancials={canSeeFinancials} activeTooltipOrderId={activeTooltipOrderId}
                  setActiveTooltipOrderId={setActiveTooltipOrderId} fetchBreakdown={fetchBreakdown}
                  user={user} statusUpdatingId={statusUpdatingId} handleManualStatusChange={handleManualStatusChange}
                  ERP_STATUSES={ERP_STATUSES} getStatusColor={getStatusColor}
                  activeShopDomain={localStorage.getItem('trace_active_shop')}
                />
              )
    `;
    
    const blockStart = content.indexOf('const diff = (parseFloat(o.price)||0)');
    const blockEnd = content.indexOf('</tr>\n              )\n            })');
    
    if (blockStart !== -1 && blockEnd !== -1) {
      const startOfMap = content.lastIndexOf('{filteredOrders.map(o => {', blockStart);
      const newContent = content.substring(0, startOfMap) + 
                         `{filteredOrders.map((o, index) => {` + mapBody + 
                         content.substring(blockEnd + 10);
                         
      const injectPoint = newContent.indexOf('export default function OrderTable');
      const finalContent = newContent.substring(0, injectPoint) + memoComponent + newContent.substring(injectPoint);
      
      fs.writeFileSync(file, finalContent);
      console.log('Successfully patched OrderTable.jsx');
    } else {
      console.log('Block not found');
    }
  } else {
    console.log('Rows not found');
  }
} else {
  console.log('Already patched');
}
