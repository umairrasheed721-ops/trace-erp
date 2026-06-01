const { runNightlyAuditService } = require('../backend/engines/audit_service');

async function main() {
  console.log("🚀 Running manual audit test...");
  await runNightlyAuditService();
  console.log("🎉 Manual audit test complete!");
}

main().catch(err => {
  console.error("❌ Test failed:", err);
});
