import React from 'react'
import OrderTable from '../../OrderTable'

/**
 * CommandCenterTable
 *
 * Thin shell that owns the <OrderTable> mount point.
 * All data, state, and action callbacks flow in as props from SearchTool.
 * Keeping the table isolated here makes SearchTool's JSX return dramatically
 * shorter and lets OrderTable be swapped / tested independently.
 */
export default function CommandCenterTable({
  // ── Data ──────────────────────────────────────────────────────────────
  loading,
  filteredOrders,
  allOrders,
  totalCount,
  debugWhere,
  // ── Column config ─────────────────────────────────────────────────────
  cols,
  colFilters,
  setColFilters,
  // ── Selection ─────────────────────────────────────────────────────────
  selectedIds,
  setSelectedIds,
  // ── Drag & drop (column reorder) ──────────────────────────────────────
  onDragStart,
  onDragOver,
  onDrop,
  // ── Sorting ───────────────────────────────────────────────────────────
  handleHeaderSort,
  sortKey,
  sortDir,
  // ── Row-level actions ─────────────────────────────────────────────────
  formatCustomerName,
  fetchOrderDetails,
  bookingId,
  statusUpdatingId,
  handleConfirmOrder,
  handleRevertConfirm,
  handleBookPostEx,
  handleCancelBooking,
  onForceResync,
  handleBookInstaworld,
  handleManualStatusChange,
  updateOrderField,
  setCustomerHistoryPhone,
  setShowNameDialog,
  setKeyword,
  setStatus,
  // ── Pagination ────────────────────────────────────────────────────────
  page,
  setPage,
  limit,
  setLimit,
  // ── Misc ──────────────────────────────────────────────────────────────
  onViewHistory,
  clearAllFilters,
}) {
  return (
    <OrderTable
      loading={loading}
      filteredOrders={filteredOrders}
      allOrders={allOrders}
      totalCount={totalCount}
      debugWhere={debugWhere}
      cols={cols}
      selectedIds={selectedIds}
      setSelectedIds={setSelectedIds}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      handleHeaderSort={handleHeaderSort}
      sortKey={sortKey}
      sortDir={sortDir}
      colFilters={colFilters}
      setColFilters={setColFilters}
      formatCustomerName={formatCustomerName}
      fetchOrderDetails={fetchOrderDetails}
      bookingId={bookingId}
      statusUpdatingId={statusUpdatingId}
      handleConfirmOrder={handleConfirmOrder}
      handleRevertConfirm={handleRevertConfirm}
      handleBookPostEx={handleBookPostEx}
      handleCancelBooking={handleCancelBooking}
      onForceResync={onForceResync}
      handleBookInstaworld={handleBookInstaworld}
      handleManualStatusChange={handleManualStatusChange}
      updateOrderField={updateOrderField}
      setCustomerHistoryPhone={setCustomerHistoryPhone}
      setShowNameDialog={setShowNameDialog}
      setKeyword={setKeyword}
      setStatus={setStatus}
      page={page}
      setPage={setPage}
      limit={limit}
      setLimit={setLimit}
      onViewHistory={onViewHistory}
      clearAllFilters={clearAllFilters}
    />
  )
}
