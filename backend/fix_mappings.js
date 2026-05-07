const db = require('./db');

const mappings = [
    { courier: 'all', status: 'returned to shipper', erp: 'Returned' },
    { courier: 'all', status: 'return received at insta hub', erp: 'Returned' },
    { courier: 'all', status: 'pickup done', erp: 'Booked' },
    { courier: 'all', status: 'arrival at insta-hub', erp: 'Booked' },
    { courier: 'all', status: 'handover to courier', erp: 'In Transit' },
    { courier: 'all', status: 'at origin warehouse', erp: 'In Transit' },
    { courier: 'all', status: 'at destination warehouse', erp: 'In Transit' },
    { courier: 'all', status: 'at warehouse', erp: 'In Transit' },
    { courier: 'all', status: 'in transit', erp: 'In Transit' },
    { courier: 'all', status: 'shipper advice', erp: 'Shipper Advice' },
    { courier: 'all', status: 'delivery unsuccessful', erp: 'Shipper Advice' }
];

async function run() {
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO status_mappings (courier, courier_status, erp_status, is_active)
        VALUES (?, ?, ?, 1)
    `);

    for (const m of mappings) {
        try {
            stmt.run(m.courier, m.status, m.erp);
            console.log(`✅ Mapped ${m.courier}:${m.status} -> ${m.erp}`);
        } catch (e) {
            console.error(`❌ Failed ${m.courier}:${m.status}: ${e.message}`);
        }
    }
}

run();
