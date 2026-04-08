async function readJson(response) {
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || 'Request failed');
  }

  return payload;
}

// KHAI BÁO ĐƯỜNG LINK API GATEWAY THẬT TỪ AWS
// (Lưu ý: Không có chữ /api/findings ở cuối nhé, chỉ lấy phần domain gốc thôi)
const API_BASE_URL = 'https://c1zk7r650b.execute-api.ap-southeast-2.amazonaws.com';

export async function getDashboardSummary(signal) {
  const response = await fetch(`${API_BASE_URL}/api/dashboard-summary`, { signal });
  return readJson(response);
}
export async function getSpamIps(signal) {
  const response = await fetch('/api/cloudwatch/spam-ips', { signal });
  if (!response.ok) throw new Error('Unable to load spam IPs');
  return readJson(response);
}

export async function getFindings(signal) {
  const response = await fetch(`${API_BASE_URL}/api/findings`, { signal });
  return readJson(response);
}

export async function remediateFinding(findingId) {
  const response = await fetch(`${API_BASE_URL}/api/findings/${findingId}/remediate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  return readJson(response);
}