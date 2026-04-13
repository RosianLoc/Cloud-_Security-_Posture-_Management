import json
import boto3
import os
from datetime import datetime, timezone
from decimal import Decimal

cloudwatch = boto3.client('logs')
dynamodb = boto3.resource('dynamodb')

HISTORY_TABLE = os.environ.get('SPAM_HISTORY_TABLE', 'cspm-spam-ip-history')
BLOCKED_TABLE = os.environ.get('BLOCKED_IPS_TABLE', 'cspm-blocked-ips')
BAN_THRESHOLD = 20

def detect_spam_ips(log_group_name, threshold=5, window_seconds=60, limit=1000):
    now = int(datetime.now(timezone.utc).timestamp() * 1000)
    start_time = now - (window_seconds * 1000)

    ip_count = {}
    next_token = None
    total_events = 0

    while True:
        params = {
            "logGroupName": log_group_name,
            "startTime": start_time,
            "endTime": now,
            "filterPattern": "Request received IP=",
            "limit": limit
        }

        if next_token:
            params["nextToken"] = next_token

        response = cloudwatch.filter_log_events(**params)
        events = response.get("events", [])
        total_events += len(events)

        for event in events:
            message = event["message"]
            if "IP=" in message:
                ip = message.split("IP=")[-1].strip()
                ip_count[ip] = ip_count.get(ip, 0) + 1

        next_token = response.get("nextToken")
        if not next_token:
            break

    spam_ips = [
        {"ips": ip, "counts": count}
        for ip, count in ip_count.items()
        if count >= threshold
    ]

    return {
        "eventCount": total_events,
        "spamIps": spam_ips,
    }

def ban_ip(ip, count):
    table = dynamodb.Table(BLOCKED_TABLE)

    table.put_item(Item={
        "ip": ip,
        "blocked_at": datetime.now(timezone.utc).isoformat(),
        "reason": f"spam_detected_{count}",
        "ttl": int(datetime.now(timezone.utc).timestamp()) + 3600
    })

def save_snapshot(spam_ips, window_from, window_to):

    if not spam_ips:
        return
    
    
    table = dynamodb.Table(HISTORY_TABLE)
    for item in spam_ips:
        table.put_item(Item={
            "id":          f"{window_from}_{window_to}",
            "window_from": window_from,
            "window_to":   window_to,
            "ip":     item["ips"],
            "count":      item["counts"],
            "saved_at":    datetime.now(timezone.utc).isoformat()
    })


def load_history(limit=50):
    """Lấy toàn bộ lịch sử, sắp xếp mới nhất lên đầu"""
    table = dynamodb.Table(HISTORY_TABLE)
    items = table.scan().get('Items', [])
    items.sort(key=lambda x: x.get('window_to', ''), reverse=True)
    return items[:limit]

def convert_decimal(obj):
    if isinstance(obj, list):
        return [convert_decimal(i) for i in obj]
    elif isinstance(obj, dict):
        return {k: convert_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    else:
        return obj
    
def lambda_handler(event, context):

    try:
        caller_ip = event["requestContext"]["http"]["sourceIp"]
    except KeyError:
        try:
            caller_ip = event["requestContext"]["identity"]["sourceIp"]
        except KeyError:
            caller_ip = event.get("sourceIp", "127.0.0.1")

    print(f"Request received IP={caller_ip}")

    window_seconds = 60
    now_ts = int(datetime.now(timezone.utc).timestamp())

    window_to_ts = (now_ts // window_seconds) * window_seconds
    window_from_ts = window_to_ts - window_seconds

    window_to = datetime.fromtimestamp(window_to_ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    window_from = datetime.fromtimestamp(window_from_ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    log_group = '/aws/lambda/cspm-spam-ip-handler'
    threshold = 5

    try:
        result = detect_spam_ips(log_group, threshold, window_seconds)

        save_snapshot(result["spamIps"], window_from, window_to)

        history = convert_decimal(load_history())
        current = []
        for item in result["spamIps"]:
            ip = item["ips"]
            count = item["counts"]

            if count> BAN_THRESHOLD: 
                ban_ip(ip, count)

            else: 
                current.append({
                "window_from": window_from,
                "window_to":   window_to,
                "eventCount":  result["eventCount"],
                "ip":    ip,
                "count":  count
            })
        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Cache-Control": "no-cache"
            },
            "body": json.dumps({
                "current": current,
                "history": history
            })
        }

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"message": "Lỗi khi truy vấn CloudWatch", "error": str(e)})
        }