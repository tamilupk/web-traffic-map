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

/**

 * Perform a single scan of a 5-minute window

 * @param {number} startTime - Unix timestamp

 * @returns {Promise<number>} New end time

 */

async function scanWindow(startTime) {

  const windowSize = 5 * 60; // 5 minutes

  const endTime = startTime + windowSize;

  const now = Math.floor(Date.now() / 1000);



  // Don't scan into the future

  if (endTime > now) return startTime;



  const groupedLogs = getLogsForAnalysis(startTime, endTime);

  

  if (groupedLogs.length > 0) {

    process.stdout.write(`  ├─ Window ${new Date(startTime * 1000).toLocaleTimeString()}: Analyzing ${groupedLogs.length} groups... `);

    

    let threatsFound = 0;

    // Process IPs sequentially to respect LLM rate limits

    for (const group of groupedLogs) {

      const isThreat = await analyzeIpBehavior(group.ip, group.requests, startTime, group.host);

      if (isThreat) threatsFound++;

    }

    console.log(`done (${threatsFound} threats)`);

  }



  setLastThreatScanTime(endTime);

  return endTime;

}



/**

 * Run the worker loop

 */

async function startThreatWorker() {

  if (isRunning) return;

  isRunning = true;



  console.log('\n' + '='.repeat(50));

  console.log('🛡️  Threat Analyzer Worker Started');

  console.log('='.repeat(50));



  // Immediate catch-up loop

  const catchUp = async () => {

    let lastScan = getLastThreatScanTime();

    const now = Math.floor(Date.now() / 1000);

    

    if (lastScan + 300 < now) {

      const totalMinutes = Math.floor((now - lastScan) / 60);

      console.log(`\n🕒 Catch-up: Scaning logs from ${new Date(lastScan * 1000).toLocaleString()} (${totalMinutes} mins behind)`);

      

      let windowsProcessed = 0;

      while (lastScan + 300 < now) {

        try {

          const nextTime = await scanWindow(lastScan);

          if (nextTime === lastScan) break; 

          lastScan = nextTime;

          windowsProcessed++;

        } catch (err) {

          console.error(`\n❌ Error scanning window at ${lastScan}:`, err.message);

          lastScan += 300;

        }

        // Small pause to prevent CPU pegging

        await new Promise(resolve => setTimeout(resolve, 50));

      }

      console.log(`✅ Catch-up complete. Processed ${windowsProcessed} windows.`);

    } else {

      console.log('✨ Threat scan is up to date.');

    }

  };



  // Run catch-up initially

  await catchUp();



  // Then poll every 5 minutes

  setInterval(async () => {

    console.log(`\n⚡ Running scheduled 5-minute threat scan...`);

    await catchUp();

  }, 5 * 60 * 1000);

}

module.exports = { startThreatWorker, resetThreatAnalysis };
