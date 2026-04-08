const AWS = require('aws-sdk');

const DEFAULT_REGION = process.env.AWS_REGION || 'ap-southeast-2';
const DEFAULT_LOG_GROUP_NAME = process.env.LOG_GROUP_NAME || '/aws/lambda/lambda_handler';
const DEFAULT_THRESHOLD = Number(process.env.SPAM_IP_THRESHOLD || 10);
const DEFAULT_WINDOW_SECONDS = Number(process.env.SPAM_IP_WINDOW_SECONDS || 86400);
const DEFAULT_LIMIT = Number(process.env.SPAM_IP_LIMIT || 1000);

const cloudwatchlogs = new AWS.CloudWatchLogs({ region: DEFAULT_REGION });

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,OPTIONS'
    },
    body: JSON.stringify(payload)
  };
}

function parseIntParam(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

async function detectSpamIps(logGroupName, threshold, windowSeconds, limit) {
  const now = Date.now();
  const startTime = now - windowSeconds * 1000;
  const response = await cloudwatchlogs.filterLogEvents({
    logGroupName,
    startTime,
    endTime: now,
    filterPattern: 'IP=',
    limit
  }).promise();

  const ipCount = {};
  for (const event of response.events || []) {
    const message = event.message || '';
    if (!message.includes('IP=')) {
      continue;
    }

    try {
      const ip = message.split('IP=')[1].split(/\s+/)[0];
      ipCount[ip] = (ipCount[ip] || 0) + 1;
    } catch (_) {
      // Skip malformed log messages and continue processing the rest.
    }
  }

  const spamIps = Object.entries(ipCount)
    .filter(([, count]) => count > threshold)
    .map(([ip, count]) => ({ ip, count }));

  return {
    logGroupName,
    threshold,
    windowSeconds,
    eventCount: response.events ? response.events.length : 0,
    spamIps,
    nextToken: response.nextToken
  };
}

exports.handler = async (event) => {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET,OPTIONS'
      }
    };
  }

  const query = event.queryStringParameters || {};
  const logGroupName = query.logGroupName || DEFAULT_LOG_GROUP_NAME;
  const threshold = parseIntParam(query.threshold, DEFAULT_THRESHOLD);
  const windowSeconds = parseIntParam(query.windowSeconds, DEFAULT_WINDOW_SECONDS);
  const limit = parseIntParam(query.limit, DEFAULT_LIMIT);

  try {
    const result = await detectSpamIps(logGroupName, threshold, windowSeconds, limit);
    return jsonResponse(200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return jsonResponse(500, {
      message: 'Unable to load CloudWatch spam IPs',
      error: message
    });
  }
};
