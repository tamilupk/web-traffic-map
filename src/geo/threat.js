/**
 * LLM-powered Threat Analysis module
 * Analyzes request patterns using AI to identify malicious behavior
 * @module geo/threat
 */

const { GoogleGenAI } = require('@google/genai');
const { saveThreatIncident } = require('../db/queries');

// Initialize AI outside the handler to reuse connection
let genAI = null;

/**
 * Call Gemini API to analyze a batch of logs for a specific IP
 * @param {string} ip - IP address
 * @param {Array} requests - List of request objects
 * @param {number} timestamp - Representative timestamp for the batch
 * @returns {Promise<boolean>} True if a threat was found and saved
 */
async function analyzeIpBehavior(ip, requests, timestamp) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return runHeuristicAnalysis(ip, requests, timestamp);
  }

  // Initialize SDK if not already done
  if (!genAI) {
    genAI = new GoogleGenAI({ apiKey });
  }

  const prompt = `
    Analyze the following web server traffic logs for IP address ${ip}.
    Identify potential malicious behavior such as:
    - Path traversal attempts (e.g., ../, /etc/passwd)
    - SQL injection patterns
    - Excessive scanning/crawling for sensitive files (.env, .git, config.php, etc.)
    - Suspicious User-Agents or exploit attempts
    
    Requests (last 50 in this 5-min window):
    ${JSON.stringify(requests.slice(-50), null, 2)}
    
    If the behavior is safe/normal (e.g. standard health checks, simple home page hits), return: {"threat_found": false}
    
    If the behavior is suspicious or malicious, provide your analysis in JSON format:
    {
      "threat_found": true,
      "risk_score": (integer 0-100, where 0 is safe and 100 is critical threat),
      "threat_level": (string: "low", "medium", "high", or "critical"),
      "summary": (string: concise summary of findings),
      "findings": (array of strings: specific suspicious activities found)
    }
  `;

  try {
    const config = {
      thinkingConfig: {
        thinkingLevel: 'HIGH',
      },
    };
    
    const model = 'gemini-3-flash-preview';
    const contents = [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ];

    const response = await genAI.models.generateContentStream({
      model,
      config,
      contents,
    });

    let fullText = '';
    for await (const chunk of response) {
      if (chunk.text) {
        fullText += chunk.text;
      }
    }

    let content;
    try {
      // Handle cases where the model wraps JSON in markdown blocks
      const jsonMatch = fullText.match(/\{[\s\S]*\}/);
      const cleanText = jsonMatch ? jsonMatch[0] : fullText;
      content = JSON.parse(cleanText);
    } catch (parseError) {
      console.error(`LLM Parse error for ${ip}:`, parseError.message);
      return runHeuristicAnalysis(ip, requests, timestamp);
    }

    if (content.threat_found) {
      saveThreatIncident({
        ip,
        incident_date: new Date(timestamp * 1000).toISOString(),
        incident_unix: timestamp,
        risk_score: content.risk_score,
        threat_level: content.threat_level,
        summary: content.summary,
        findings: content.findings,
        request_count: requests.length
      });
      return true;
    }
  } catch (error) {
    console.error(`LLM Analysis failed for ${ip}:`, error.message);
    return runHeuristicAnalysis(ip, requests, timestamp);
  }
  return false;
}

/**
 * Fallback Heuristic Analysis
 */
function runHeuristicAnalysis(ip, requests, timestamp) {
  let score = 0;
  const findings = [];
  
  const sensitivePaths = [
    '.env', '.git', 'config.php', 'config', '.php', '.sql', '.sh', '.bak', 
    'admin', 'backup', 'passwd', 'etc/', 'win.ini', 'eval(', 'base64_',
    'example', 'sample', 'install', 'uninstall', 'remove', 'deploy', 'init'
  ];

  requests.forEach(req => {
    sensitivePaths.forEach(p => {
      if (req.path && req.path.toLowerCase().includes(p.toLowerCase())) {
        score += 15;
        if (!findings.includes(`Accessed sensitive path: ${req.path}`)) {
          findings.push(`Accessed sensitive path: ${req.path}`);
        }
      }
    });
    if (req.status >= 400) score += 2;
  });

  if (score >= 15) {
    const level = score > 80 ? 'critical' : (score > 50 ? 'high' : (score > 25 ? 'medium' : 'low'));
    saveThreatIncident({
      ip,
      incident_date: new Date(timestamp * 1000).toISOString(),
      incident_unix: timestamp,
      risk_score: Math.min(score, 100),
      threat_level: level,
      summary: `Pattern Match: ${findings.length} suspicious request(s) detected.`,
      findings,
      request_count: requests.length
    });
    return true;
  }
  return false;
}

module.exports = { analyzeIpBehavior };
