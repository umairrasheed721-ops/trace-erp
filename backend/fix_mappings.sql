
-- LCS (Leopards) Mappings
INSERT OR IGNORE INTO status_mappings (courier, courier_status, erp_status, is_active) VALUES ('LCS', 'return to origin', 'Returned', 1);
INSERT OR IGNORE INTO status_mappings (courier, courier_status, erp_status, is_active) VALUES ('LCS', 'returned to shipper', 'Returned', 1);
INSERT OR IGNORE INTO status_mappings (courier, courier_status, erp_status, is_active) VALUES ('LCS', 'handover to courier', 'In Transit', 1);
INSERT OR IGNORE INTO status_mappings (courier, courier_status, erp_status, is_active) VALUES ('LCS', 'in transit', 'In Transit', 1);
INSERT OR IGNORE INTO status_mappings (courier, courier_status, erp_status, is_active) VALUES ('LCS', 'out for delivery', 'Out for Delivery', 1);
INSERT OR IGNORE INTO status_mappings (courier, courier_status, erp_status, is_active) VALUES ('LCS', 'at destination warehouse', 'In Transit', 1);
INSERT OR IGNORE INTO status_mappings (courier, courier_status, erp_status, is_active) VALUES ('LCS', 'return in-transit', 'Returned', 1);
INSERT OR IGNORE INTO status_mappings (courier, courier_status, erp_status, is_active) VALUES ('LCS', 'delivered', 'Delivered', 1);
INSERT OR IGNORE INTO status_mappings (courier, courier_status, erp_status, is_active) VALUES ('LCS', 'attempted', 'Attempted', 1);

-- TCS Mappings
INSERT OR IGNORE INTO status_mappings (courier, courier_status, erp_status, is_active) VALUES ('TCS', 'at warehouse', 'In Transit', 1);
INSERT OR IGNORE INTO status_mappings (courier, courier_status, erp_status, is_active) VALUES ('TCS', 'delivery unsuccessful', 'Shipper Advice', 1);
INSERT OR IGNORE INTO status_mappings (courier, courier_status, erp_status, is_active) VALUES ('TCS', 'delivered', 'Delivered', 1);
INSERT OR IGNORE INTO status_mappings (courier, courier_status, erp_status, is_active) VALUES ('TCS', 'out for delivery', 'Out for Delivery', 1);

-- Missing PostEx Mappings
INSERT OR IGNORE INTO status_mappings (courier, courier_status, erp_status, is_active) VALUES ('PostEx', 'en-route to lahore warehouse', 'In Transit', 1);
INSERT OR IGNORE INTO status_mappings (courier, courier_status, erp_status, is_active) VALUES ('PostEx', 'en-route to islamabad warehouse', 'In Transit', 1);
INSERT OR IGNORE INTO status_mappings (courier, courier_status, erp_status, is_active) VALUES ('PostEx', 'en-route to faisalabad warehouse', 'In Transit', 1);
INSERT OR IGNORE INTO status_mappings (courier, courier_status, erp_status, is_active) VALUES ('PostEx', 'delivery under review', 'Shipper Advice', 1);
INSERT OR IGNORE INTO status_mappings (courier, courier_status, erp_status, is_active) VALUES ('PostEx', 'unbooked', 'Cancelled', 1);

-- Global Fallbacks (using 'all' keyword as per tracking.js logic)
INSERT OR IGNORE INTO status_mappings (courier, courier_status, erp_status, is_active) VALUES ('all', 'delivered', 'Delivered', 1);
INSERT OR IGNORE INTO status_mappings (courier, courier_status, erp_status, is_active) VALUES ('all', 'returned', 'Returned', 1);
INSERT OR IGNORE INTO status_mappings (courier, courier_status, erp_status, is_active) VALUES ('all', 'cancelled', 'Cancelled', 1);
INSERT OR IGNORE INTO status_mappings (courier, courier_status, erp_status, is_active) VALUES ('all', 'out for delivery', 'Out for Delivery', 1);
INSERT OR IGNORE INTO status_mappings (courier, courier_status, erp_status, is_active) VALUES ('all', 'attempted', 'Attempted', 1);
