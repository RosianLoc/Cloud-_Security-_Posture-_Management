import json
import boto3
import os
from datetime import datetime, timezone, timedelta

cloudwatch = boto3.client('logs', region_name='ap-southeast-2')

def detect_spam_ips(log_group_name,threshold=5, window_seconds=60, limit=1000):
    now = int(datetime.now(timezone.utc).timestamp() * 1000)
    start_time = now - (window_seconds * 1000)

    response = cloudwatch.filter_log_events(
        logGroupName=log_group_name,
        startTime=start_time,
        endTime=now,
        filterPattern='IP=',
        limit=limit
    )

    ip_count = {}
    next_token = None

    while True:
        params = {
            "logGroupName": log_group_name,
            "startTime": start_time,
            "endTime": now,
            "filterPattern": "Request received IP="
        }

        if next_token:
            params["nextToken"] = next_token

        response = cloudwatch.filter_log_events(**params)

        for event in response.get("events", []):
            message = event["message"]

            if "IP=" in message:
                ip = message.split("IP=")[-1].strip()
                ip_count[ip] = ip_count.get(ip, 0) + 1

        next_token = response.get("nextToken")

        if not next_token:
            break

    spam_ips = [
        {"ip": ip, "count": count}
        for ip, count in ip_count.items()
        if count >= threshold
    ]

    return {
        "eventCount": len(response.get('events', [])),
        "spamIps": spam_ips,
    }

def lambda_handler(event, context):
    try:
        caller_ip = event["requestContext"]["http"]["sourceIp"]
    except KeyError:
        try:
            caller_ip = event["requestContext"]["identity"]["sourceIp"]
        except KeyError:
            caller_ip = event.get("sourceIp", "127.0.0.1")

    print(f"Request received IP={caller_ip}")

    log_group = '/aws/lambda/cspm-spam-ip-handler'
    threshold = 5
    window = 60

    try:
        result = detect_spam_ips(log_group, threshold, window)
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(result)
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"message": "Lỗi khi truy vấn CloudWatch", "error": str(e)})
        }