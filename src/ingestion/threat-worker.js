/**
 * Background worker for threat analysis
 * Scans logs in 5-minute intervals and runs AI analysis
 * @module ingestion/threat-worker
 */

const { 
  getLastThreatScanTime, 
  setLastThreatScanTime, 
  getLogsForAnalysis,
  resetThreatAnalysis
} = require('../db/queries');
const { analyzeIpBehavior } = require('../geo/threat');

let isRunning = false;

let isCatchingUp = false;



/**

 * Perform a single scan of a 1-hour window

 * @param {number} startTime - Unix timestamp

 * @returns {Promise<number>} New end time

 */

async function scanWindow(startTime) {

  const windowSize = 60 * 60; // 1 hour

  const endTime = startTime + windowSize;

  const now = Math.floor(Date.now() / 1000);



  // Don't scan into the future

  if (endTime > now) return startTime;



  const groupedLogs = getLogsForAnalysis(startTime, endTime);

  

  if (groupedLogs.length > 0) {

    process.stdout.write(`  ├─ Window ${new Date(startTime * 1000).toLocaleString()}: Analyzing ${groupedLogs.length} groups... `);

    

    let threatsFound = 0;

    const concurrencyLimit = 5;

    

    // Process in batches to avoid overwhelming LLM rate limits

    for (let i = 0; i < groupedLogs.length; i += concurrencyLimit) {

      const batch = groupedLogs.slice(i, i + concurrencyLimit);

      const results = await Promise.all(batch.map(group => 

        analyzeIpBehavior(group.ip, group.requests, startTime, group.host)

      ));

      threatsFound += results.filter(Boolean).length;

    }

    

    console.log(`done (${threatsFound} threats)`);

  }



  setLastThreatScanTime(endTime);

  return endTime;

}



/**

 * Immediate catch-up loop

 */

const catchUp = async () => {

  if (isCatchingUp) return;

  isCatchingUp = true;



  let lastScan = getLastThreatScanTime();

  const now = Math.floor(Date.now() / 1000);

  const windowSize = 60 * 60; // 1 hour

  

  if (lastScan + windowSize < now) {

    const totalHours = Math.floor((now - lastScan) / 3600);

    console.log(`\n🕒 Catch-up: Scaning logs from ${new Date(lastScan * 1000).toLocaleString()} (${totalHours} hours behind)`);

    

    let windowsProcessed = 0;

    while (lastScan + windowSize < now) {

      try {

        const nextTime = await scanWindow(lastScan);

        if (nextTime === lastScan) break; 

        lastScan = nextTime;

        windowsProcessed++;

      } catch (err) {

        console.error(`\n❌ Error scanning window at ${lastScan}:`, err.message);

        lastScan += windowSize;

      }

      // Small pause to prevent CPU pegging

      await new Promise(resolve => setTimeout(resolve, 50));

    }

    console.log(`✅ Catch-up complete. Processed ${windowsProcessed} hours.`);

  } else {

    console.log('✨ Threat scan is up to date.');

  }

  

  isCatchingUp = false;

};



/**

 * Run the worker loop

 */

async function startThreatWorker() {

  if (isRunning) return;

  isRunning = true;



  console.log('\n' + '='.repeat(50));

  console.log('🛡️  Threat Analyzer Worker Started');

  console.log('='.repeat(50));



  // Run catch-up initially

  await catchUp();



  // Then poll every 5 minutes

  setInterval(async () => {

    console.log(`\n⚡ Running scheduled 5-minute threat scan...`);

    await catchUp();

  }, 5 * 60 * 1000);

}



module.exports = { startThreatWorker, resetThreatAnalysis, triggerThreatScan: catchUp };
