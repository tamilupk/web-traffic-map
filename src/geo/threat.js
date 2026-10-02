/**
 * LLM-powered Threat Analysis module
 * Analyzes request patterns using AI to identify malicious behavior
 * @module geo/threat
 */

const { saveThreatIncident } = require('../db/queries');
const { redactSecrets } = require('./redact');

/**
 * Call an OpenAI-compatible API to analyze logs for a specific IP and domain
 * @param {string} ip - IP address
 * @param {Array} requests - List of request objects
 * @param {number} timestamp - Representative timestamp for the batch
 * @param {string} host - Target domain
 * @returns {Promise<boolean>} True if a threat was found and saved
 */
async function analyzeIpBehavior(ip, requests, timestamp, host) {
  const apiUrl = process.env.OPEN_AI_API_URL || 'https://openrouter.ai/api/v1/chat/completions';
  const apiKey = process.env.OPEN_AI_API_KEY;
  const modelName = process.env.OPEN_AI_API_MODEL;

  if (!apiUrl || !apiKey || !modelName) {
    return runHeuristicAnalysis(ip, requests, timestamp, host);
  }

  const prompt = `
    Analyze the following web server traffic logs for IP address ${ip} targeting domain ${host}.
    Identify potential malicious behavior such as:
    - Path traversal attempts (e.g., ../, /etc/passwd)
    - SQL injection patterns
    - Excessive scanning/crawling for sensitive files (.env, .git, config.php, etc.)
    - Suspicious User-Agents or exploit attempts

    Requests (all entries in this 1-hour window):
    ${JSON.stringify(redactSecrets(requests), null, 2)}

    If the behavior is safe/normal (e.g. standard health checks, simple home page hits), return: {"threat_found": false}

    If the behavior is suspicious or malicious, provide your analysis in JSON format:
    {
      "threat_found": true,
      "risk_score": (integer 0-100, where 0 is safe and 100 is critical threat),
      "threat_level": (string: "low", "medium", "high", or "critical"),
      "summary": (string: concise summary of findings),
      "explanation": (string: a detailed explanation of why this behavior is considered a threat and what the potential impact could be),
      "findings": (array of strings: specific suspicious activities found)
    }
  `;

  try {
    const response = await fetch(apiUrl, {
      signal: AbortSignal.timeout(30000),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/tamilupk/web-traffic-map',
        'X-Title': 'Web Traffic Map'
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      throw new Error(`API returned status: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const fullText = data.choices?.[0]?.message?.content || '';

    let content;
    try {
      // Handle cases where the model wraps JSON in markdown blocks
      const jsonMatch = fullText.match(/\{[\s\S]*\}/);
      const cleanText = jsonMatch ? jsonMatch[0] : fullText;
      content = JSON.parse(cleanText);
    } catch (parseError) {
      console.error(`LLM Parse error for ${ip}:`, parseError.message);
      return runHeuristicAnalysis(ip, requests, timestamp, host);
    }

    if (content.threat_found) {
      console.log(`\n    🚩 [AI] Threat Detected: ${ip} -> ${host} (Level: ${content.threat_level.toUpperCase()})`);
      saveThreatIncident({
        ip,
        host,
        incident_date: new Date(timestamp * 1000).toISOString(),
        incident_unix: timestamp,
        risk_score: content.risk_score,
        threat_level: content.threat_level,
        summary: content.summary,
        explanation: content.explanation || content.summary,
        findings: content.findings,
        request_count: requests.length
      });
      return true;
    }
  } catch (error) {
    console.error(`\n    ⚠️ [AI] Analysis failed for ${ip}:`, error.message);
    return runHeuristicAnalysis(ip, requests, timestamp, host);
  }
  return false;
}

/**
 * Fallback Heuristic Analysis
 */
function runHeuristicAnalysis(ip, requests, timestamp, host) {
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
    console.log(`\n    🔍 [Heuristic] Pattern Match: ${ip} -> ${host} (Score: ${score})`);

    const explanation = `This IP triggered a heuristic match by attempting to access ${findings.length} sensitive system files or configuration templates. This behavior is highly characteristic of automated vulnerability scanning tools looking for misconfigured servers or exposed secrets.`;

    saveThreatIncident({
      ip,
      host,
      incident_date: new Date(timestamp * 1000).toISOString(),
      incident_unix: timestamp,
      risk_score: Math.min(score, 100),
      threat_level: level,
      summary: `Pattern Match: ${findings.length} suspicious request(s) detected.`,
      explanation,
      findings,
      request_count: requests.length
    });
    return true;
  }
  return false;
}

module.exports = { analyzeIpBehavior };
