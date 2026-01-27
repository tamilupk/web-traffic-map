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
        // Process IPs sequentially to respect LLM rate limits
        for (const group of groupedLogs) {
          await analyzeIpBehavior(group.ip, group.requests, startTime, group.host);
        }
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

  console.log('[ThreatWorker] Starting...');

  // Immediate catch-up loop
  const catchUp = async () => {
    let lastScan = getLastThreatScanTime();
    const now = Math.floor(Date.now() / 1000);
    
    // If we are more than 5 mins behind, catch up
    while (lastScan + 300 < now) {
      try {
        const nextTime = await scanWindow(lastScan);
        if (nextTime === lastScan) break; 
        lastScan = nextTime;
      } catch (err) {
        console.error(`[ThreatWorker] Error scanning window at ${lastScan}:`, err);
        lastScan += 300;
      }
      // Small pause to prevent CPU pegging
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };

  // Run catch-up initially
  await catchUp();

  // Then poll every 5 minutes
  setInterval(async () => {
    await catchUp();
  }, 5 * 60 * 1000);
}

module.exports = { startThreatWorker, resetThreatAnalysis };
