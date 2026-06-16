const FinanceAggregator = require('../backend/services/finance-aggregator');

async function run() {
  try {
    console.log("Testing getReturnsPending...");
    const pending = await FinanceAggregator.getReturnsPending(1);
    console.log(`Successfully fetched ${pending.length} pending returns.`);
    if (pending.length > 0) {
      console.log("First pending return properties:", Object.keys(pending[0]));
      console.log("Sample - Price:", pending[0].price, "Line Items:", pending[0].line_items, "Product Titles:", pending[0].product_titles);
    }

    console.log("\nTesting getReturnsHistory...");
    const history = await FinanceAggregator.getReturnsHistory(1, 30);
    console.log(`Successfully fetched ${history.length} history records.`);
    if (history.length > 0) {
      console.log("First history record properties:", Object.keys(history[0]));
      console.log("Sample - Price:", history[0].price, "Line Items:", history[0].line_items, "Product Titles:", history[0].product_titles);
    }
    
    console.log("\nAll queries ran successfully!");
  } catch (error) {
    console.error("Test failed with error:", error);
    process.exit(1);
  }
}

run();
