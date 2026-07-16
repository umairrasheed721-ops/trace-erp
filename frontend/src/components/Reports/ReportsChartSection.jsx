import React from 'react';
import { useApp } from '../../context/AppContext';
import ProfitabilityCharts from '../ProfitabilityCharts';

export default function ReportsChartSection() {
  const { activeStoreId } = useApp();
  if (!activeStoreId) return null;
  return <ProfitabilityCharts storeId={activeStoreId} />;
}
